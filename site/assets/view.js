/* Canvas renderer for the map — the "orbit" layout.
   A fixed, radial composition rather than a force simulation: the question at the centre; the nine themes on an inner orbit; the
   sixty prompts on an outer orbit beside their theme, clockwise in the Bookshelf's reading order, every label horizontal and pointing
   outwards so all of them can be read at once; the connections between prompts drawn as curves that leave through their theme and
   arrive through the other — faint at rest, lit up when you point at or open a prompt.
   Visual grammar from the 'Map of shared aims' on rethinkmatters.org/about: paper discs with a light accent tint and an accent
   outline, #666 threads, the logo-gradient ring around the question. */
(function () {
  const RM = (window.RM = window.RM || {});
  const { u } = RM;
  const TAU = Math.PI * 2;
  const PAPER = "#FAF8F3", INK = "#22211C", FAINT = "#6B675C", THREAD = "#666666", NONE = "#9C978A", GOLD = "#C9963F";
  const FACET_COLOR = { tension: "#A04340", concept: "#48909F", barrier: "#7F8C64", domain: "#D9A441", method: "#8A8577" };
  const REL_COLOR = { echoes: "#2F6B63", tension: "#B65438", enables: "#5B6B3C", extends: "#9A6F1F" };
  const RANK = { tag: 0, book: 1, discussion: 2, topic: 3, theme: 4, center: 5 };

  /* geometry, in world units (1 unit = 1 CSS pixel at zoom 1) */
  const ROW = 17;                          // pitch between neighbouring prompts in a column
  const GAP_THEME = 0.85, GAP_ARC = 1.9;   // extra rows between two themes, and between two story arcs (room for the arc's caption)
  const SPAN = (62 * Math.PI) / 180;       // the two columns stop this far either side of the horizontal, so the top and bottom stay open
  const HUB_ORBIT = 0.6, DISC_ORBIT = 0.84;
  const RADIUS = { center: 66, theme: 44, topic: 5.4, discussion: 3.4, tag: 4, book: 4 };
  const LABEL_GAP = 8;                     // px between a prompt and its label
  const ROOM_MAX = 18.5, ROOM_MIN = 9.5;   // longest prompt label, in ems; on a cramped screen long labels are shortened (…) down to
                                           // ROOM_MIN rather than hidden
  const PITCH_MIN = 12;                    // px between two rows below which prompt labels give way (they come back as you zoom in)
  const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

  class View {
    constructor(canvas, D, cb) {
      this.cv = canvas;
      this.ctx = canvas.getContext("2d");
      this.D = D;
      this.cb = cb || {};
      this.dpr = Math.min(2.5, window.devicePixelRatio || 1);
      this.w = 800; this.h = 600;
      this.t = { k: 0.7, x: 400, y: 300 };
      this.anim = null;       // camera animation
      this.tween = null;      // node positions gliding to a new layout
      this.mode = "pillar";
      this.layers = { disc: false, rest: "bridges" };   // rest: connections drawn while nothing is in focus — "none" | "bridges" | "all"
      this.minScore = D.defaultMinScore;
      this.match = null;
      this.hover = null;
      this.sel = null;
      this.thread = null;
      this.insets = { l: 0, r: 0, t: 0, b: 0 };
      this.labelHits = [];
      this.room = ROOM_MAX;   // how wide (in ems) a prompt label may run before it is shortened with an ellipsis
      this.dirty = true;
      this.touch = false;
      this.reduced = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
      this.buildGraph();
      this.setMode("pillar");
      this.bind();
      this.resize();
      this.layout(false);
      this.introDelays();
      this.rebuild();
      this.fit(false);
      this.born = performance.now();
      this.loop = this.loop.bind(this);
      requestAnimationFrame(this.loop);
    }

    /* ------------------------------------------------------------------ graph */
    buildGraph() {
      const D = this.D;
      this.byId = new Map();
      this.nodes = D.nodes.map((d) => ({
        id: d.id, kind: d.kind, d, x: 0, y: 0, tx: 0, ty: 0, fx: 0, fy: 0, r: RADIUS[d.kind], base: RADIUS[d.kind],
        vis: d.kind === "center" || d.kind === "theme" || d.kind === "topic", alpha: 0, sc: 1, colors: [NONE], topicIds: [],
        side: 0, ang: 0, clock: 0, delay: 0, deg: 0,
      }));
      for (const n of this.nodes) this.byId.set(n.id, n);
      this.center = this.byId.get("c");
      this.order = this.nodes.slice().sort((a, b) => RANK[a.kind] - RANK[b.kind]);
      for (const n of this.nodes) {
        if (n.kind === "topic") n.topicIds = [n.id];
        else if (n.kind !== "center") n.topicIds = n.d.topics || [];
      }
      this.links = [];
      for (const l of D.links) {
        const a = this.byId.get(l.s), b = this.byId.get(l.t);
        if (a && b) this.links.push(Object.assign({}, l, { a, b, alpha: 0, on: false, vis: false, delay: 0 }));
      }
      this.adj = new Map();
    }
    hubOf(n) { return n && n.kind === "topic" ? this.byId.get("th:" + n.d.theme) : null; }

    /* ------------------------------------------------------------------ colour by lens */
    themeColor(n) {
      const order = this.D.themeOrder, i = order.indexOf(n);
      return u.logoColor(0.11 + 0.86 * (i / (order.length - 1)));
    }
    dominant(themeN, lens) {
      this._dom = this._dom || {};
      const key = themeN + lens;
      if (this._dom[key]) return this._dom[key];
      const c = {};
      for (const n of this.nodes) if (n.kind === "topic" && n.d.theme === themeN) { const v = (n.d[lens] || [])[0]; if (v) c[v] = (c[v] || 0) + 1; }
      const best = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
      return (this._dom[key] = best ? this.D.lenses[lens].values[best[0]].color : NONE);
    }
    setMode(mode) {
      this.mode = mode;
      const L = this.D.lenses;
      for (const n of this.nodes) {
        if (n.kind === "topic") {
          if (mode === "theme") n.colors = [this.themeColor(n.d.theme)];
          else { const cs = (n.d[mode] || []).map((v) => L[mode].values[v].color); n.colors = cs.length ? cs : [NONE]; }
        } else if (n.kind === "theme") n.colors = [mode === "theme" ? this.themeColor(n.d.n) : this.dominant(n.d.n, mode)];
        else if (n.kind === "tag") n.colors = [FACET_COLOR[n.d.facet] || FAINT];
        else if (n.kind === "discussion") n.colors = [THREAD];
        else if (n.kind === "book") n.colors = [FAINT];
        else n.colors = [INK];
      }
      this.dirty = true;
    }

    /* ------------------------------------------------------------------ layout */
    /* The height of the stage sets the zoom (the columns of prompts have to fit it); the width that is left — beside the panels —
       then sets the shape: the orbit is made as wide as it can be without its labels running out of room. Round on a laptop, taller
       on a phone or beside an open note, wider on a big screen. */
    stretch(H, Ry) {
      const w = Math.max(1, this.w - this.insets.l - this.insets.r), h = Math.max(1, this.h - this.insets.t);
      const kH = Math.max(0.05, (h - 48) / (H + 30)), fs = this.labelFont(kH);
      let lw = 0;
      for (const n of this.nodes) if (n.kind === "topic") lw = Math.max(lw, this.labelWidth(n));
      const room = 2 * (RADIUS.topic * 1.5 * kH + LABEL_GAP + Math.min(ROOM_MAX * fs, (lw * fs) / 11.5));
      return u.clamp((w - 60 - room) / (2 * kH) / Ry, 0.72, 1.3);
    }
    layout(animate) {
      const D = this.D;
      const themes = D.themeOrder.map((n) => this.byId.get("th:" + n));
      const topicsOf = new Map(themes.map((th) => [th, this.nodes.filter((n) => n.kind === "topic" && n.d.theme === th.d.n).sort((a, b) => a.d.order - b.d.order)]));
      // Each column reads top to bottom like a list, prompts in the sheet's order: a story-arc caption heads the column, and another
      // opens wherever the arc changes. The themes still go round clockwise: down the right-hand column, then up the left-hand one.
      const gap = (above, below) => (above.d.arc !== below.d.arc ? GAP_ARC : GAP_THEME);
      const rowsOf = (col) => col.reduce((s, th, i) => s + (i ? gap(col[i - 1], th) : GAP_ARC) + topicsOf.get(th).length, 0);
      let best = null;   // the split of the clockwise run that makes the two columns most even
      for (let k = 1; k < themes.length; k++) {
        const right = themes.slice(0, k), left = themes.slice(k).reverse();
        const rows = Math.max(rowsOf(right), rowsOf(left));
        if (!best || rows < best.rows) best = { right, left, rows };
      }
      const H = best.rows * ROW, Ry = H / 2 / Math.sin(SPAN), sx = this.stretch(H, Ry), Rx = Ry * sx;
      this._sx = sx;
      this.orbit = { Rx, Ry, H };
      const xAt = (y, side) => side * Rx * Math.sqrt(Math.max(0, 1 - (y / Ry) ** 2));
      const target = new Map([[this.center, [0, 0]]]);
      this.arcHeads = [];
      for (const [col, side] of [[best.right, 1], [best.left, -1]]) {
        const pitch = H / rowsOf(col), yOf = (p) => -H / 2 + p * pitch;   // the shorter column is spread to the same height
        let p = 0;
        col.forEach((th, i) => {
          const g = i ? gap(col[i - 1], th) : GAP_ARC;
          if (g === GAP_ARC) {
            const y = yOf(p + g / 2);
            this.arcHeads.push({ label: D.arcs.find((a) => a.id === th.d.arc).label, x: xAt(y, side), y, side });
          }
          p += g;
          let ss = 0, cs = 0;
          for (const t of topicsOf.get(th)) {
            const y = yOf(p + 0.5), x = xAt(y, side);
            target.set(t, [x, y]);
            t.side = side; t.ang = Math.atan2(y / Ry, x / Rx);
            ss += Math.sin(t.ang); cs += Math.cos(t.ang);
            p += 1;
          }
          th.side = side; th.ang = Math.atan2(ss, cs);
        });
      }
      // clockwise from twelve o'clock, for the opening sweep
      const around = (t) => { const [x, y] = target.get(t); return (Math.atan2(x, -y) + TAU) % TAU; };
      this.nodes.filter((n) => n.kind === "topic").sort((a, b) => around(a) - around(b)).forEach((t, i) => { t.clock = i; });
      // themes on the inner orbit, opposite the middle of their prompts, nudged apart where they would touch
      this.spread(themes, HUB_ORBIT, 2 * RADIUS.theme + 18);
      for (const th of themes) target.set(th, [HUB_ORBIT * Rx * Math.cos(th.ang), HUB_ORBIT * Ry * Math.sin(th.ang)]);
      // discussions (an optional layer) just inside the prompts they fed
      const discs = this.nodes.filter((n) => n.kind === "discussion");
      for (const d of discs) {
        let ss = 0, cs = 0;
        for (const id of d.topicIds) { const t = this.byId.get(id); if (t) { ss += Math.sin(t.ang); cs += Math.cos(t.ang); } }
        d.ang = Math.atan2(ss, cs);
      }
      this.spread(discs, DISC_ORBIT, 2 * RADIUS.discussion + 7);
      for (const d of discs) target.set(d, [DISC_ORBIT * Rx * Math.cos(d.ang), DISC_ORBIT * Ry * Math.sin(d.ang)]);
      // tags and books are not drawn; they sit at the middle of their prompts for framing
      for (const n of this.nodes) {
        if (target.has(n)) continue;
        let sx2 = 0, sy2 = 0, c = 0;
        for (const id of n.topicIds) { const t = target.get(this.byId.get(id)); if (t) { sx2 += t[0]; sy2 += t[1]; c++; } }
        target.set(n, c ? [sx2 / c, sy2 / c] : [0, 0]);
      }
      for (const [n, [x, y]] of target) { n.tx = x; n.ty = y; }
      if (animate && !this.reduced) {
        for (const n of this.nodes) { n.fx = n.x; n.fy = n.y; }
        this.tween = { t0: performance.now(), dur: 700 };
      } else {
        for (const n of this.nodes) { n.x = n.tx; n.y = n.ty; }
        this.tween = null;
      }
      this.dirty = true;
    }
    /* keep neighbours on an (elliptical) orbit at least minD apart, preserving their clockwise order */
    spread(list, f, minD) {
      if (list.length < 2) return;
      const { Rx, Ry } = this.orbit, rad = (f * (Rx + Ry)) / 2;
      const pos = (a) => [f * Rx * Math.cos(a), f * Ry * Math.sin(a)];
      const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
      for (let it = 0; it < 120; it++) {
        list.sort((a, b) => a.ang - b.ang);
        let moved = false;
        for (let i = 0; i < list.length; i++) {
          const a = list[i], b = list[(i + 1) % list.length];
          const [ax, ay] = pos(a.ang), [bx, by] = pos(b.ang), d = Math.hypot(bx - ax, by - ay);
          if (d < minD) {
            const da = Math.min(0.08, ((minD - d) / rad) * 0.55);
            a.ang = wrap(a.ang - da / 2); b.ang = wrap(b.ang + da / 2);
            moved = true;
          }
        }
        if (!moved) break;
      }
    }
    /* if the stage has changed shape enough, let the orbit re-proportion itself (animated) */
    relayout(animate = true) {
      if (Math.abs(this.stretch(this.orbit.H, this.orbit.Ry) - this._sx) < 0.03) return false;
      this.layout(animate);
      return true;
    }
    introDelays() {
      if (this.reduced) return;
      const themes = this.D.themeOrder.map((n) => this.byId.get("th:" + n));
      themes.forEach((th, i) => { th.delay = 160 + 70 * i; });
      for (const n of this.nodes) {
        if (n.kind === "topic") n.delay = 520 + 13 * n.clock;
        else if (n.kind === "discussion") n.delay = 1300;
      }
      for (const l of this.links) l.delay = Math.max(l.a.delay, l.b.delay) + 160;
    }

    /* ------------------------------------------------------------------ visibility + adjacency */
    configure(opts) {
      let rebuild = false;
      if ("mode" in opts && opts.mode !== this.mode) this.setMode(opts.mode);
      if ("layers" in opts) { Object.assign(this.layers, opts.layers); rebuild = true; }
      if ("minScore" in opts) { this.minScore = opts.minScore; rebuild = true; }
      if (rebuild) this.rebuild();
      this.dirty = true;
    }
    rebuild() {
      const L = this.layers, adj = new Map();
      const link = (a, b) => { (adj.get(a.id) || adj.set(a.id, []).get(a.id)).push(b.id); (adj.get(b.id) || adj.set(b.id, []).get(b.id)).push(a.id); };
      for (const n of this.nodes) { n.vis = n.kind === "center" || n.kind === "theme" || n.kind === "topic" || (n.kind === "discussion" && L.disc); n.deg = 0; }
      for (const l of this.links) {
        let on = false;
        if (l.kind === "hier") on = true;
        else if (l.kind === "rel") on = l.curated || l.score >= this.minScore;
        else if (l.kind === "src") on = L.disc;
        // tag → prompt and book → prompt links are never drawn: opening a tag or a book lights up its prompts instead
        l.on = on;
        l.vis = on && l.a.vis && l.b.vis;
        if (on) link(l.a, l.b);
        if (on && l.kind === "rel") { l.a.deg++; l.b.deg++; }
      }
      // better-connected prompts are a touch larger
      for (const n of this.nodes) if (n.kind === "topic") n.r = n.base + Math.min(2.4, n.deg * 0.2);
      this.adj = adj;
      this.dirty = true;
    }

    /* ------------------------------------------------------------------ state setters + focus */
    setSelected(id) { this.sel = id; this.dirty = true; }
    setHover(id) { if (id !== this.hover) { this.hover = id; this.dirty = true; } }
    setMatch(set) { this.match = set; this.dirty = true; }
    setThread(steps, idx) { this.thread = steps ? { steps, idx: idx || 0 } : null; this.dirty = true; }
    setInsets(i) { Object.assign(this.insets, i); }
    matchOf(n) {
      if (!this.match) return true;
      if (n.kind === "center") return true;
      if (n.kind === "topic") return this.match.has(n.id);
      for (const id of n.topicIds) if (this.match.has(id)) return true;
      return false;
    }
    /* What is in focus: `nodes` stay bright, `primary` are the prompts whose connections light up.
       A prompt lights its own links; a theme lights its prompts' links; a tag, book or discussion lights the links among its prompts. */
    focusInfo() {
      if (this.thread) {
        const nodes = new Set(["c"]);
        for (const id of this.thread.steps) { nodes.add(id); const n = this.byId.get(id); if (n) nodes.add("th:" + n.d.theme); }
        return { nodes, primary: new Set(this.thread.steps), both: true };
      }
      const nodes = new Set(), primary = new Set();
      let both = false;
      const add = (id) => {
        const n = this.byId.get(id);
        if (!n || n.kind === "center") return;   // the question touches everything: nothing dims
        nodes.add("c"); nodes.add(id);
        if (n.kind === "topic") {
          primary.add(id); nodes.add("th:" + n.d.theme);
          for (const nb of this.adj.get(id) || []) nodes.add(nb);
        } else if (n.kind === "theme") {
          for (const t of n.topicIds) {
            primary.add(t); nodes.add(t);
            for (const nb of this.adj.get(t) || []) { const m = this.byId.get(nb); if (m && m.kind === "topic") nodes.add(nb); }
          }
        } else {
          both = true;
          for (const t of n.topicIds) { primary.add(t); nodes.add(t); const m = this.byId.get(t); if (m) nodes.add("th:" + m.d.theme); }
        }
      };
      if (this.sel) add(this.sel);
      if (this.hover && this.hover !== this.sel) add(this.hover);
      return nodes.size ? { nodes, primary, both } : null;
    }
    framingIds(id) {
      const n = this.byId.get(id);
      if (!n) return [];
      if (n.kind === "center") return null;
      const out = new Set([id]);
      if (n.kind === "topic") { out.add("th:" + n.d.theme); for (const nb of this.adj.get(id) || []) { const m = this.byId.get(nb); if (m && m.vis) out.add(nb); } }
      else for (const t of n.topicIds) out.add(t);
      return [...out].filter((i) => { const m = this.byId.get(i); return m && m.vis; });
    }

    /* ------------------------------------------------------------------ geometry / camera */
    resize() {
      const r = this.cv.parentElement.getBoundingClientRect();
      const w = Math.max(200, r.width), h = Math.max(200, r.height);
      const dx = (w - this.w) / 2, dy = (h - this.h) / 2;
      this.w = w; this.h = h;
      this.cv.width = Math.round(w * this.dpr); this.cv.height = Math.round(h * this.dpr);
      if (this._sized) { this.t.x += dx; this.t.y += dy; }
      this._sized = true;
      this.dirty = true;
    }
    toScreen(x, y) { return [x * this.t.k + this.t.x, y * this.t.k + this.t.y]; }
    toWorld(px, py) { return [(px - this.t.x) / this.t.k, (py - this.t.y) / this.t.k]; }
    safe() { const i = this.insets; return { x: i.l, y: i.t, w: this.w - i.l - i.r, h: this.h - i.t - i.b }; }
    labelsOn(k) { return ROW * k >= PITCH_MIN; }
    labelFont(k) { return u.clamp(ROW * k * 0.76, 10.5, 13.5); }
    headFont(k) { return u.clamp(ROW * k * 0.84, 12, 15.5); }
    measure(text, font) {
      this._m = this._m || document.createElement("canvas").getContext("2d");
      this._m.font = font;
      return this._m.measureText(text).width;
    }
    labelWidth(n) {
      this._lw = this._lw || new Map();
      if (!this._lw.has(n.id)) this._lw.set(n.id, this.measure(n.d.label || "", "500 11.5px Inter, system-ui, sans-serif"));
      return this._lw.get(n.id);
    }
    /* screen-space bounding box of the given nodes at zoom k (relative to the world origin), including the prompt labels (each at most
       `room` ems wide) and the arc captions. Labels that will be drawn even when the rest give way (`keep`: what is in focus or matches
       a filter) are always counted. */
    extents(k, nodes, room = this.room, keep = null, strong = null) {
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      const lab = this.labelsOn(k), fs = this.labelFont(k);
      const grow = (ax, ay, bx, by) => { x0 = Math.min(x0, ax); x1 = Math.max(x1, bx); y0 = Math.min(y0, ay); y1 = Math.max(y1, by); };
      let topics = 0;
      for (const n of nodes) {
        const x = n.tx * k, y = n.ty * k, r = n.r * k;
        grow(x - r, y - r, x + r, y + r);
        if (n.kind === "topic" && (lab || (keep && keep.has(n.id)))) {
          topics++;
          // the prompt in focus is set in bold and never shortened
          const st = strong && strong.has(n.id), f = lab ? fs : 11.5;
          const w = r * 1.3 + LABEL_GAP + Math.min((st ? ROOM_MAX + 4 : room) * f, (this.labelWidth(n) * f * (st ? 1.06 : 1)) / 11.5);
          if (n.side > 0) grow(x, y - f * 0.75, x + w, y + f * 0.75); else grow(x - w, y - f * 0.75, x, y + f * 0.75);
        }
      }
      if (lab && topics > 20) {
        const hf = this.headFont(k);
        for (const a of this.arcHeads) {
          const x = a.x * k, y = a.y * k, w = LABEL_GAP + this.measure(a.label, `italic 500 ${hf}px Spectral, Georgia, serif`);
          if (a.side > 0) grow(x, y - hf * 0.7, x + w, y + hf * 0.7); else grow(x - w, y - hf * 0.7, x, y + hf * 0.7);
        }
      }
      return { x0, x1, y0, y1 };
    }
    /* Largest zoom at which the given nodes (default: everything visible) fit the safe area with their labels. Preference order:
       every label in full; a noticeably larger zoom with the longest labels shortened (…); and only if even that cannot fit, the shapes
       on their own, with the labels coming back as you zoom in. */
    fit(animate = true, ids) {
      const nodes = ids ? ids.map((i) => this.byId.get(i)).filter((n) => n && n.vis) : this.nodes.filter((n) => n.vis);
      if (!nodes.length) return;
      const s = this.safe(), small = s.w < 560, W = s.w - 2 * (small ? 12 : 30), Hh = s.h - 2 * (small ? 14 : 22);
      const F = this.focusInfo(), keep = new Set(F ? F.nodes : []), strong = new Set(F ? F.primary : []);
      if (this.match) for (const id of this.match) keep.add(id);
      if (this.sel) strong.add(this.sel);
      const fits = (k, room) => { const e = this.extents(k, nodes, room, keep, strong); return e.x1 - e.x0 <= W && e.y1 - e.y0 <= Hh; };
      const search = (lo, hi, room) => { for (let i = 0; i < 32; i++) { const m = (lo + hi) / 2; if (fits(m, room)) lo = m; else hi = m; } return lo; };
      const kT = PITCH_MIN / ROW, kMax = ids ? 1.5 : 1.7;
      const k1 = Math.min(kMax, search(kT, 2.6, ROOM_MAX)), ok1 = fits(k1, ROOM_MAX);
      const k2 = Math.min(kMax, search(kT, 2.6, ROOM_MIN)), ok2 = fits(k2, ROOM_MIN);
      let k, room = ROOM_MAX;
      if (ok1 && (!ok2 || k1 >= 0.93 * k2)) k = k1;
      else if (ok2) {
        k = k2;
        let lo = ROOM_MIN, hi = ROOM_MAX;
        for (let i = 0; i < 20; i++) { const m = (lo + hi) / 2; if (fits(k, m)) lo = m; else hi = m; }
        room = lo;
      } else k = Math.min(kT - 1e-4, search(0.05, kT, ROOM_MAX));
      this.room = room;
      const e = this.extents(k, nodes, room, keep, strong);
      this.goto({ k, x: s.x + s.w / 2 - (e.x0 + e.x1) / 2, y: s.y + s.h / 2 - (e.y0 + e.y1) / 2 }, animate);
    }
    /* keep the zoom, but bring a node back into the safe area if it has drifted out of it */
    reveal(id) {
      const n = this.byId.get(id);
      if (!n || !n.vis) return;
      const s = this.safe(), k = this.t.k, [sx, sy] = this.toScreen(n.tx, n.ty), m = 70;
      if (sx > s.x + m && sx < s.x + s.w - m && sy > s.y + m && sy < s.y + s.h - m) return;
      this.goto({ k, x: s.x + s.w / 2 - n.tx * k, y: s.y + s.h / 2 - n.ty * k }, true);
    }
    flyToSet(ids, minK = 0.5, maxK = 1.4) {
      const ns = ids.map((i) => this.byId.get(i)).filter((n) => n && n.vis);
      if (!ns.length) return;
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const n of ns) { x0 = Math.min(x0, n.tx); x1 = Math.max(x1, n.tx); y0 = Math.min(y0, n.ty); y1 = Math.max(y1, n.ty); }
      const s = this.safe(), pad = 120;
      const k = u.clamp(Math.min(s.w / (x1 - x0 + pad * 2), s.h / (y1 - y0 + pad * 2)), minK, maxK);
      this.goto({ k, x: s.x + s.w / 2 - ((x0 + x1) / 2) * k, y: s.y + s.h / 2 - ((y0 + y1) / 2) * k }, true);
    }
    goto(to, animate) {
      if (!animate || this.reduced) { Object.assign(this.t, to); this.anim = null; this.dirty = true; return; }
      this.anim = { from: Object.assign({}, this.t), to, t0: performance.now(), dur: 640 };
    }
    zoomAt(px, py, f) {
      const k0 = this.t.k, k1 = u.clamp(k0 * f, 0.12, 4.5);
      this.t.x = px - ((px - this.t.x) / k0) * k1; this.t.y = py - ((py - this.t.y) / k0) * k1; this.t.k = k1;
      this.anim = null; this.dirty = true;
    }
    zoomBy(f) { this.room = ROOM_MAX; this.zoomAt(this.w / 2, this.h / 2, f); }   // the zoom buttons

    /* ------------------------------------------------------------------ input (drag pans, nothing is dragged out of place) */
    hit(px, py) {
      const pad = this.touch ? 12 : 4, k = this.t.k;
      for (let i = this.order.length - 1; i >= 0; i--) {
        const n = this.order[i];
        if (!n.vis || n.alpha < 0.3) continue;
        const [sx, sy] = this.toScreen(n.x, n.y);
        const r = n.r * k * n.sc + pad + (n.kind === "topic" || n.kind === "discussion" ? 3 : 0);
        if ((sx - px) ** 2 + (sy - py) ** 2 <= r * r) return n;
      }
      for (const L of this.labelHits) if (px >= L.x - 3 && px <= L.x + L.w + 3 && py >= L.y && py <= L.y + L.h) return this.byId.get(L.id);
      return null;
    }
    bind() {
      const cv = this.cv, pts = new Map();
      let down = null, pinch = null;
      const pos = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
      // the visitor has moved the camera themselves: labels go back to full length (they may run off-screen; that is fine while exploring)
      const took = () => { this.room = ROOM_MAX; this.cb.onCamera && this.cb.onCamera(); };
      cv.addEventListener("pointerdown", (e) => {
        cv.setPointerCapture(e.pointerId);
        this.touch = e.pointerType === "touch";
        const [px, py] = pos(e);
        pts.set(e.pointerId, [px, py]);
        if (pts.size === 1) down = { px, py, n: this.hit(px, py), moved: false };
        else if (pts.size === 2) {
          const [a, b] = [...pts.values()];
          pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), cx: (a[0] + b[0]) / 2, cy: (a[1] + b[1]) / 2 };
          down = null;
        }
      });
      cv.addEventListener("pointermove", (e) => {
        const [px, py] = pos(e);
        if (pts.has(e.pointerId)) pts.set(e.pointerId, [px, py]);
        if (pinch && pts.size >= 2) {
          const [a, b] = [...pts.values()];
          const d = Math.hypot(a[0] - b[0], a[1] - b[1]), cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2;
          this.t.x += cx - pinch.cx; this.t.y += cy - pinch.cy;
          this.zoomAt(cx, cy, d / pinch.d);
          pinch.d = d; pinch.cx = cx; pinch.cy = cy;
          took();
          return;
        }
        if (down) {
          if (!down.moved && Math.hypot(px - down.px, py - down.py) > 5) { down.moved = true; this.anim = null; cv.classList.add("dragging"); took(); }
          if (down.moved) { this.t.x += px - (down.lx ?? down.px); this.t.y += py - (down.ly ?? down.py); this.dirty = true; }
          down.lx = px; down.ly = py;
          return;
        }
        if (e.pointerType !== "touch") {
          const n = this.hit(px, py);
          cv.classList.toggle("hovering", !!n);
          this.setHover(n ? n.id : null);
          this.cb.onHover && this.cb.onHover(n, px, py);
        }
      });
      const end = (e) => {
        pts.delete(e.pointerId);
        if (pts.size < 2) pinch = null;
        if (pts.size === 0) cv.classList.remove("dragging");
        if (down && pts.size === 0) {
          if (!down.moved) this.cb.onPick && this.cb.onPick(down.n ? down.n.id : null, e);
          down = null;
        }
      };
      cv.addEventListener("pointerup", end);
      cv.addEventListener("pointercancel", end);
      cv.addEventListener("pointerleave", (e) => { if (e.pointerType !== "touch" && !down) { this.setHover(null); this.cb.onHover && this.cb.onHover(null); } });
      cv.addEventListener("wheel", (e) => {
        e.preventDefault();
        took();
        const [px, py] = pos(e);
        const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : (e.deltaMode === 1 ? 0.05 : 0.0016)));
        this.zoomAt(px, py, f);
      }, { passive: false });
      cv.addEventListener("dblclick", (e) => {
        const [px, py] = pos(e);
        if (!this.hit(px, py)) { took(); this.zoomAt(px, py, 1.7); }
      });
      window.addEventListener("resize", () => { this.resize(); });
    }

    /* ------------------------------------------------------------------ frame loop */
    loop(now) {
      requestAnimationFrame(this.loop);
      let busy = false;
      if (this.anim) {
        const a = this.anim, p = u.clamp((now - a.t0) / a.dur, 0, 1), e = ease(p);
        for (const k of ["k", "x", "y"]) this.t[k] = a.from[k] + (a.to[k] - a.from[k]) * e;
        if (p >= 1) this.anim = null;
        busy = true;
      }
      if (this.tween) {
        const p = u.clamp((now - this.tween.t0) / this.tween.dur, 0, 1), e = ease(p);
        for (const n of this.nodes) { n.x = n.fx + (n.tx - n.fx) * e; n.y = n.fy + (n.ty - n.fy) * e; }
        if (p >= 1) this.tween = null;
        busy = true;
      }
      const age = now - this.born, settled = this.reduced || age > 3200;
      const intro = (d) => (settled ? 1 : ease(u.clamp((age - d) / 460, 0, 1)));
      if (!settled) busy = true;
      const F = (this._F = this.focusInfo());
      for (const n of this.nodes) {
        let ta = n.vis ? intro(n.delay) : 0;
        if (n.vis && F && !F.nodes.has(n.id)) ta = Math.min(ta, n.kind === "theme" ? 0.4 : 0.14);
        if (n.vis && this.match && !this.matchOf(n)) ta = Math.min(ta, n.kind === "theme" ? 0.4 : 0.13);
        const ts = n.id === this.sel ? 1.3 : n.id === this.hover ? 1.22 : 1;
        if (this.reduced) { busy = busy || n.alpha !== ta || n.sc !== ts; n.alpha = ta; n.sc = ts; continue; }   // no fades for reduced motion
        const d = ta - n.alpha;
        if (Math.abs(d) > 0.004) { n.alpha += d * 0.2; busy = true; } else n.alpha = ta;
        if (Math.abs(ts - n.sc) > 0.003) { n.sc += (ts - n.sc) * 0.26; busy = true; } else n.sc = ts;
      }
      for (const l of this.links) {
        let ta = l.vis ? this.linkTarget(l, F) * intro(l.delay) : 0;
        if (ta && this.match && !(this.matchOf(l.a) && this.matchOf(l.b))) ta = Math.min(ta, 0.12);
        if (this.reduced) { busy = busy || l.alpha !== ta; l.alpha = ta; continue; }
        const d = ta - l.alpha;
        if (Math.abs(d) > 0.004) { l.alpha += d * 0.2; busy = true; } else l.alpha = ta;
      }
      if (busy || this.dirty) { this.dirty = false; this.draw(); }
    }
    restShown(l) { return this.layers.rest === "all" || (this.layers.rest === "bridges" && !!l.curated); }
    hot(l, F) {
      if (!F) return false;
      const a = F.primary.has(l.a.id), b = F.primary.has(l.b.id);
      return F.both ? a && b : a || b;
    }
    /* how present a link is (0..1); its colour and weight are decided when it is drawn */
    linkTarget(l, F) {
      if (this.thread) return l.kind === "hier" ? 0.6 : 0;
      if (!F) return l.kind === "rel" ? (this.restShown(l) ? 1 : 0) : 1;
      if (l.kind === "rel") return this.hot(l, F) ? 1 : this.restShown(l) ? 0.3 : 0;
      if (l.kind === "hier") return F.nodes.has(l.a.id) && F.nodes.has(l.b.id) ? 1 : 0.45;
      return this.hot(l, F) ? 1 : 0.25;
    }

    /* ------------------------------------------------------------------ drawing */
    draw() {
      const ctx = this.ctx, { k, x, y } = this.t, dpr = this.dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.cv.width, this.cv.height);
      ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * x, dpr * y);
      this.drawOrbit(ctx);
      this.drawLinks(ctx);
      this.drawNodes(ctx);
      this.drawThreadPath(ctx);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.drawLabels(ctx);
    }
    drawOrbit(ctx) {
      const { Rx, Ry } = this.orbit, k = this.t.k, age = performance.now() - this.born;
      const a = this.reduced ? 1 : u.clamp((age - 300) / 900, 0, 1);
      ctx.save();
      ctx.lineWidth = 1 / k;
      ctx.setLineDash([1.5 / k, 5 / k]);
      ctx.strokeStyle = u.rgba(FAINT, 0.32 * a);
      ctx.beginPath(); ctx.ellipse(0, 0, Rx, Ry, 0, 0, TAU); ctx.stroke();
      ctx.restore();
    }
    fanPath(ctx, h, p) {
      const dh = Math.hypot(h.x, h.y) || 1, dp = Math.hypot(p.x, p.y) || 1, d = Math.hypot(p.x - h.x, p.y - h.y);
      ctx.moveTo(h.x, h.y);
      ctx.bezierCurveTo(h.x + (h.x / dh) * d * 0.5, h.y + (h.y / dh) * d * 0.5, p.x - (p.x / dp) * d * 0.42, p.y - (p.y / dp) * d * 0.42, p.x, p.y);
    }
    /* prompt-to-prompt: leave towards your own theme, cross over, arrive through the other one */
    relPath(ctx, a, b) {
      const ha = this.hubOf(a), hb = this.hubOf(b);
      ctx.moveTo(a.x, a.y);
      if (!ha || !hb) { ctx.lineTo(b.x, b.y); return; }
      if (ha === hb) {   // within one theme: a shallow bow towards it, not a loop all the way in
        const f = 0.32;
        ctx.bezierCurveTo(u.lerp(a.x, ha.x, f), u.lerp(a.y, ha.y, f), u.lerp(b.x, ha.x, f), u.lerp(b.y, ha.y, f), b.x, b.y);
        return;
      }
      const f = 0.78;
      ctx.bezierCurveTo(ha.x * f, ha.y * f, hb.x * f, hb.y * f, b.x, b.y);
    }
    drawLinks(ctx) {
      const k = this.t.k, F = this._F;
      const later = [];
      ctx.lineCap = "round";
      for (const l of this.links) {
        if (!l.vis || l.alpha < 0.01) continue;
        if (l.kind === "rel" && this.hot(l, F)) { later.push(l); continue; }
        ctx.beginPath();
        let col = THREAD, w = 1, al = l.alpha, dash = null;
        if (l.kind === "hier") {
          if (l.a.kind === "center") { ctx.moveTo(l.a.x, l.a.y); ctx.lineTo(l.b.x, l.b.y); w = 1.2; al *= 0.3; }
          else { this.fanPath(ctx, l.a, l.b); w = 1; al *= F && F.nodes.has(l.b.id) && F.nodes.has(l.a.id) ? 0.55 : 0.34; }
        } else if (l.kind === "rel") {
          this.relPath(ctx, l.a, l.b);
          if (l.curated) { w = 0.9; al *= 0.17; } else { w = 0.8; al *= 0.085; }
        } else if (l.kind === "src") {
          const d = l.a.kind === "discussion" ? l.a : l.b, t = d === l.a ? l.b : l.a;
          ctx.moveTo(d.x, d.y); ctx.lineTo(t.x, t.y); w = 0.8; al *= this.hot(l, F) ? 0.7 : 0.3;
        } else continue;
        ctx.strokeStyle = u.rgba(col, Math.min(1, al));
        ctx.lineWidth = w / k;
        ctx.setLineDash(dash ? dash.map((v) => v / k) : []);
        ctx.stroke();
      }
      // the connections of what is in focus, on top, in the colour of their relation
      for (const l of later) {
        ctx.beginPath();
        this.relPath(ctx, l.a, l.b);
        if (l.curated) { ctx.strokeStyle = u.rgba(REL_COLOR[l.type] || INK, 0.92 * l.alpha); ctx.lineWidth = 2 / k; ctx.setLineDash([]); }
        else { ctx.strokeStyle = u.rgba(FAINT, 0.75 * l.alpha); ctx.lineWidth = 1.3 / k; ctx.setLineDash([3.5 / k, 4 / k]); }
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    ringSegments(ctx, n, r, a) {
      const cs = n.colors, m = cs.length;
      if (m === 1) { ctx.strokeStyle = u.rgba(cs[0], 0.85 * a); ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, TAU); ctx.stroke(); return; }
      for (let i = 0; i < m; i++) {
        ctx.strokeStyle = u.rgba(cs[i], 0.88 * a);
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, -Math.PI / 2 + (i * TAU) / m + 0.05, -Math.PI / 2 + ((i + 1) * TAU) / m - 0.05);
        ctx.stroke();
      }
    }
    drawNodes(ctx) {
      const k = this.t.k;
      ctx.lineCap = "butt";
      for (const n of this.order) {
        if (!n.vis || n.alpha < 0.01) continue;
        const a = n.alpha, r = n.r * n.sc;
        ctx.globalAlpha = 1;
        if (n.kind === "center") {
          ctx.globalAlpha = a;
          ctx.fillStyle = PAPER; ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, TAU); ctx.fill();
          const g = ctx.createLinearGradient(n.x - r, n.y - r, n.x + r, n.y + r);
          for (const [t, c] of u.LOGO) g.addColorStop(t, c);
          ctx.globalAlpha = 0.84 * a; ctx.strokeStyle = g; ctx.lineWidth = r * 0.13;
          ctx.beginPath(); ctx.arc(n.x, n.y, r - r * 0.065, 0, TAU); ctx.stroke();
        } else if (n.kind === "theme") {
          // the paper stays (nearly) opaque when a theme is dimmed, so lit-up lines pass cleanly behind it rather than through its name
          ctx.globalAlpha = Math.min(1, a * 3);
          ctx.fillStyle = PAPER; ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, TAU); ctx.fill();
          ctx.globalAlpha = a;
          ctx.fillStyle = u.rgba(n.colors[0], n.id === this.sel ? 0.2 : 0.1); ctx.fill();
          ctx.lineWidth = 2.6; this.ringSegments(ctx, n, r - 1.3, 1);
          if (n.id === this.sel) { ctx.lineWidth = 1.4 / k; ctx.strokeStyle = u.rgba(n.colors[0], 0.5); ctx.beginPath(); ctx.arc(n.x, n.y, r + 5 / k, 0, TAU); ctx.stroke(); }
        } else if (n.kind === "topic") {
          ctx.globalAlpha = Math.min(1, a * 3);
          ctx.fillStyle = PAPER; ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, TAU); ctx.fill();
          ctx.globalAlpha = a;
          ctx.fillStyle = u.rgba(n.colors[0], n.id === this.sel || n.id === this.hover ? 0.32 : 0.16); ctx.fill();
          ctx.lineWidth = Math.max(1.7, r * 0.34); this.ringSegments(ctx, n, r - ctx.lineWidth / 2, 1);
          if (n.id === this.sel) { ctx.lineWidth = 1.4 / k; ctx.strokeStyle = u.rgba(n.colors[0], 0.55); ctx.beginPath(); ctx.arc(n.x, n.y, r + 4.5 / k, 0, TAU); ctx.stroke(); }
        } else if (n.kind === "discussion") {
          ctx.globalAlpha = a;
          ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, TAU);
          if (n.d.proposed) { ctx.fillStyle = PAPER; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = THREAD; ctx.stroke(); }
          else { ctx.fillStyle = THREAD; ctx.fill(); }
          if (n.id === this.sel) { ctx.lineWidth = 1.4 / k; ctx.strokeStyle = u.rgba(INK, 0.5); ctx.beginPath(); ctx.arc(n.x, n.y, r + 4 / k, 0, TAU); ctx.stroke(); }
        }
        ctx.globalAlpha = 1;
      }
    }
    drawThreadPath(ctx) {
      if (!this.thread) return;
      const ns = this.thread.steps.map((id) => this.byId.get(id)).filter(Boolean), k = this.t.k;
      if (ns.length < 2) return;
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      for (let i = 0; i < ns.length - 1; i++) {
        const done = i < this.thread.idx;
        ctx.beginPath(); this.relPath(ctx, ns[i], ns[i + 1]);
        ctx.strokeStyle = u.rgba(GOLD, done ? 0.95 : 0.55); ctx.lineWidth = (done ? 3.4 : 2.6) / k;
        ctx.setLineDash(done ? [] : [6 / k, 6 / k]);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    /* ---- labels (screen space) */
    drawLabels(ctx) {
      const k = this.t.k, F = this._F, placed = [];
      this.labelHits = [];
      const free = (r) => { for (const p of placed) if (r.x < p.x + p.w && r.x + r.w > p.x && r.y < p.y + p.h && r.y + r.h > p.y) return false; return true; };
      ctx.textBaseline = "middle";

      // the question and the themes, inside their discs
      for (const n of this.order) {
        if (!n.vis || n.alpha < 0.05 || (n.kind !== "center" && n.kind !== "theme")) continue;
        const [sx, sy] = this.toScreen(n.x, n.y), r = n.r * k * n.sc;
        ctx.textAlign = "center";
        if (n.kind === "center") {
          if (r >= 28) {
            const f = u.clamp(r * 0.26, 10, 24);
            ctx.font = `500 ${f}px Spectral, Georgia, serif`; ctx.fillStyle = u.rgba(INK, n.alpha);
            ["A world we", "want to", "live in"].forEach((t, i) => ctx.fillText(t, sx, sy + (i - 1) * f * 1.16));
          }
        } else if (r < 21) {
          ctx.font = `700 ${u.clamp(r * 0.9, 9, 15)}px Inter, system-ui, sans-serif`;
          ctx.fillStyle = u.rgba(INK, n.alpha); ctx.fillText(String(n.d.n), sx, sy + 0.5);
        } else {
          let f = u.clamp(r * 0.25, 9, 15.5);
          ctx.font = `600 ${f}px Inter, system-ui, sans-serif`;
          // the longest word has to fit inside the disc ("biofabrication", "environments")
          const widest = Math.max(...n.d.label.split(/\s+/).map((w) => ctx.measureText(w).width));
          if (widest > r * 1.56) { f = Math.max(7.5, (f * r * 1.56) / widest); ctx.font = `600 ${f}px Inter, system-ui, sans-serif`; }
          const lines = u.wrap(ctx, n.d.label, r * 1.6), lh = f * 1.2;
          const cap = r >= 34, capF = Math.max(7.5, f * 0.74), capH = cap ? capF * 1.3 : 0;
          const top = sy - (capH + lines.length * lh) / 2;
          if (cap) {
            ctx.font = `600 ${capF}px Inter, system-ui, sans-serif`; ctx.fillStyle = u.rgba(FAINT, 0.9 * n.alpha);
            ctx.fillText("THEME " + n.d.n, sx, top + capH / 2);
          }
          ctx.font = `600 ${f}px Inter, system-ui, sans-serif`; ctx.fillStyle = u.rgba(INK, n.alpha);
          lines.forEach((t, i) => ctx.fillText(t, sx, top + capH + lh * (i + 0.5)));
        }
        placed.push({ x: sx - r, y: sy - r, w: r * 2, h: r * 2 });
      }

      // story-arc captions, set like section headings in the columns
      const lab = this.labelsOn(k), fs = this.labelFont(k);
      if (lab && !this.thread) {
        const hf = this.headFont(k), al = F || this.match ? 0.45 : 0.9;
        ctx.font = `italic 500 ${hf}px Spectral, Georgia, serif`;
        for (const a of this.arcHeads) {
          const [sx, sy] = this.toScreen(a.x, a.y), tw = ctx.measureText(a.label).width;
          const x = a.side > 0 ? sx + LABEL_GAP : sx - LABEL_GAP;
          ctx.textAlign = a.side > 0 ? "left" : "right";
          ctx.fillStyle = u.rgba(FAINT, al * this.center.alpha);
          ctx.fillText(a.label, x, sy);
          placed.push({ x: a.side > 0 ? x : x - tw, y: sy - hf * 0.65, w: tw, h: hf * 1.3 });
        }
      }

      // prompts: one label each, always on the outward side
      const cands = [];
      for (const n of this.nodes) {
        if (n.kind !== "topic" || !n.vis || n.alpha < 0.05) continue;
        const strong = n.id === this.sel || n.id === this.hover || (F && F.primary.has(n.id));
        const forced = strong || (F && F.nodes.has(n.id)) || (this.match && this.matchOf(n));
        if (!lab && !forced) continue;
        cands.push({ n, strong, pri: (strong ? 300 : forced ? 200 : 0) + n.deg });
      }
      cands.sort((a, b) => b.pri - a.pri);
      for (const { n, strong } of cands) {
        const [sx, sy] = this.toScreen(n.x, n.y), r = n.r * k * n.sc;
        const f = lab ? fs : 11.5, room = (strong ? ROOM_MAX + 4 : this.room) * f;
        ctx.font = `${strong ? 600 : 500} ${f}px Inter, system-ui, sans-serif`;
        let text = n.d.label;
        if (ctx.measureText(text).width > room) { while (text.length > 6 && ctx.measureText(text + "…").width > room) text = text.slice(0, -1); text = text.trimEnd() + "…"; }
        const tw = ctx.measureText(text).width, th = f * 1.22;
        const x = n.side > 0 ? sx + r + LABEL_GAP : sx - r - LABEL_GAP;
        const rect = { x: n.side > 0 ? x : x - tw, y: sy - th / 2, w: tw, h: th };
        if (!strong && !free(rect)) continue;
        placed.push(rect);
        this.labelHits.push(Object.assign({ id: n.id }, rect));
        const al = u.clamp(n.alpha, 0, 1);
        ctx.textAlign = n.side > 0 ? "left" : "right";
        ctx.lineWidth = 3.4; ctx.lineJoin = "round";
        ctx.strokeStyle = u.rgba(PAPER, 0.9 * al); ctx.strokeText(text, x, sy + 0.5);
        ctx.fillStyle = u.rgba(INK, (strong ? 1 : 0.84) * al);
        ctx.fillText(text, x, sy + 0.5);
      }

      // discussions (when shown): named only when pointed at or in focus
      if (this.layers.disc) {
        ctx.font = `500 ${Math.max(10.5, fs - 0.5)}px Inter, system-ui, sans-serif`;
        for (const n of this.nodes) {
          if (n.kind !== "discussion" || !n.vis || n.alpha < 0.3) continue;
          if (!(n.id === this.hover || n.id === this.sel || (F && F.nodes.has(n.id) && k > 1.2))) continue;
          const [sx, sy] = this.toScreen(n.x, n.y), right = Math.cos(n.ang) >= 0;
          let text = n.d.label;
          if (ctx.measureText(text).width > 220) { while (text.length > 8 && ctx.measureText(text + "…").width > 220) text = text.slice(0, -1); text += "…"; }
          const tw = ctx.measureText(text).width, x = right ? sx - 8 - tw : sx + 8;   // inward, away from the prompt labels
          const rect = { x, y: sy - 8, w: tw, h: 16 };
          if (!free(rect) && n.id !== this.hover && n.id !== this.sel) continue;
          placed.push(rect);
          ctx.textAlign = "left";
          ctx.lineWidth = 3.4; ctx.strokeStyle = u.rgba(PAPER, 0.92); ctx.strokeText(text, x, sy);
          ctx.fillStyle = u.rgba(FAINT, n.alpha); ctx.fillText(text, x, sy);
        }
      }

      // thread step badges
      if (this.thread) {
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        this.thread.steps.forEach((id, i) => {
          const n = this.byId.get(id);
          if (!n) return;
          const [sx, sy] = this.toScreen(n.x, n.y), r = n.r * k * n.sc;
          const bx = sx - n.side * (r + 12), by = sy, cur = i === this.thread.idx;
          ctx.beginPath(); ctx.arc(bx, by, cur ? 10.5 : 8.5, 0, TAU);
          ctx.fillStyle = cur ? INK : GOLD; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = PAPER; ctx.stroke();
          ctx.fillStyle = cur ? PAPER : INK; ctx.font = `700 ${cur ? 11 : 10}px Inter, sans-serif`; ctx.fillText(String(i + 1), bx, by + 0.5);
        });
      }
    }
  }
  RM.View = View;
})();
