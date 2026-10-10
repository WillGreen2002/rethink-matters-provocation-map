/* Canvas renderer for the map. Visual grammar copied from the 'Map of shared aims' on rethinkmatters.org/about:
   paper-filled discs with a 10% accent tint and a 3px accent outline, #666 curved threads, a gradient hub ring. */
(function () {
  const RM = (window.RM = window.RM || {});
  const { u } = RM;
  const TAU = Math.PI * 2;
  const PAPER = "#FAF8F3", INK = "#22211C", FAINT = "#6B675C", THREAD = "#666666", NONE = "#9C978A";
  const FACET_COLOR = { tension: "#A04340", concept: "#48909F", barrier: "#7F8C64", domain: "#D9A441", method: "#8A8577" };
  const REL_COLOR = { echoes: "#2F6B63", tension: "#B65438", enables: "#5B6B3C", extends: "#9A6F1F" };
  const RANK = { tag: 0, book: 1, discussion: 2, topic: 3, theme: 4, center: 5 };

  class View {
    constructor(canvas, D, cb) {
      this.cv = canvas;
      this.ctx = canvas.getContext("2d");
      this.D = D;
      this.cb = cb || {};
      this.dpr = Math.min(2.5, window.devicePixelRatio || 1);
      this.w = 800; this.h = 600;
      this.t = { k: 0.7, x: 400, y: 300 };
      this.anim = null;
      this.mode = "pillar";
      this.layers = { disc: true, tags: false, tagFacets: new Set(Object.keys(D.facets)), books: false };
      this.minScore = D.defaultMinScore;
      this.curatedOnly = false;
      this.match = null;
      this.hover = null;
      this.sel = null;
      this.thread = null;
      this.insets = { l: 0, r: 0, t: 0, b: 0 };
      this.dirty = true;
      this.sim = new RM.Sim();
      this.touch = false;
      this.buildGraph();
      this.setMode("pillar");
      this.bind();
      this.resize();
      this.layout();
      this.rebuild(true);
      this.warm();
      this.fit(false);
      this.loop = this.loop.bind(this);
      requestAnimationFrame(this.loop);
    }

    /* ------------------------------------------------------------------ graph construction */
    buildGraph() {
      const D = this.D;
      this.byId = new Map();
      this.nodes = D.nodes.map((d) => {
        const base = { id: d.id, kind: d.kind, d, x: 0, y: 0, vx: 0, vy: 0, fixed: false, on: true, vis: true, alpha: 1, sc: 1, anchor: null, band: null, gravity: 0, deg: 0, colors: [NONE], topicIds: [] };
        const sizes = {
          center: { r: 82, m: 8, q: 8 }, theme: { r: 62, m: 4, q: 5 }, topic: { r: 9, m: 1, q: 1 },
          discussion: { r: 3.8, m: 0.4, q: 0.1 }, tag: { r: 5.5, m: 0.8, q: 0.6 }, book: { r: 5, m: 0.6, q: 0.35 },
        }[d.kind];
        return Object.assign(base, sizes);
      });
      for (const n of this.nodes) this.byId.set(n.id, n);
      this.center = this.byId.get("c");
      this.center.fixed = true;
      this.order = this.nodes.slice().sort((a, b) => RANK[a.kind] - RANK[b.kind]);

      this.links = [];
      for (const l of D.links) {
        const a = this.byId.get(l.s), b = this.byId.get(l.t);
        if (!a || !b) continue;
        const sgn = (u.hash(l.s + l.t) & 1) ? 1 : -1;
        const mag = l.kind === "hier" ? (a.kind === "center" ? 0.1 : 0.07) : l.kind === "rel" ? 0.14 + ((u.hash(l.t + l.s) % 7) / 100) : 0.05;
        this.links.push(Object.assign({}, l, { a, b, curve: sgn * mag, alpha: 0, vis: true }));
      }
      // which topics does each non-topic node belong to (for filter matching)
      for (const n of this.nodes) {
        if (n.kind === "theme") n.topicIds = n.d.topics;
        else if (n.kind === "discussion" || n.kind === "tag" || n.kind === "book") n.topicIds = n.d.topics;
        else if (n.kind === "topic") n.topicIds = [n.id];
      }
      // adjacency for focus (all data links; 'rel' filtered by threshold in rebuild)
      this.adj = new Map();
    }

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
      const col = best ? this.D.lenses[lens].values[best[0]].color : NONE;
      this._dom[key] = col;
      return col;
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
    layout() {
      const D = this.D, aspect = u.clamp(this.w / Math.max(1, this.h), 0.62, 1.9);
      const R = 292, sx = u.clamp(Math.pow(aspect, 0.85), 0.8, 1.7);
      this.ring = { R, sx, sy: aspect < 1 ? 1.0 / sx : 1 };
      const arcOf = (n) => D.nodes.find((x) => x.kind === "theme" && x.n === n).arc;
      const total = D.themeOrder.length, arcs = new Set(D.themeOrder.map(arcOf)).size;
      const slot = 360 / (total + arcs * 0.55), gap = slot * 0.55;
      let ang = -150, prev = null;
      this.theta = {};
      for (const n of D.themeOrder) {
        const a = arcOf(n);
        if (prev && a !== prev) ang += gap;
        this.theta[n] = ((ang + slot / 2) * Math.PI) / 180;
        ang += slot;
        prev = a;
      }
      for (const n of this.nodes) {
        if (n.kind !== "theme") continue;
        const th = this.theta[n.d.n];
        n.x = Math.cos(th) * R * this.ring.sx; n.y = Math.sin(th) * R * this.ring.sy;
        n.anchor = { x: n.x, y: n.y, k: 0.1 };
      }
      this.center.x = this.center.y = 0;
      // topics fan outwards from their theme, alternating two distances so neighbours never touch
      const byTheme = {};
      for (const n of this.nodes) if (n.kind === "topic") (byTheme[n.d.theme] = byTheme[n.d.theme] || []).push(n);
      for (const [tn, list] of Object.entries(byTheme)) {
        list.sort((a, b) => a.d.order - b.d.order);
        const th = this.byId.get("th:" + tn);
        const out = Math.atan2(th.y / this.ring.sy, th.x / this.ring.sx);
        const m = list.length, spread = Math.min(Math.PI * 0.98, 0.52 * (m - 1) + 0.2);
        list.forEach((t, i) => {
          const phi = out + (m === 1 ? 0 : (i / (m - 1) - 0.5) * spread);
          const dist = i % 2 ? 150 : 98;
          t.x = th.x + Math.cos(phi) * dist * Math.min(1.2, this.ring.sx);
          t.y = th.y + Math.sin(phi) * dist;
        });
      }
      this.placeSatellites();
    }
    placeSatellites() {
      // discussions / tags / books start near the (average of the) topics they belong to
      for (const n of this.nodes) {
        if (!["discussion", "tag", "book"].includes(n.kind)) continue;
        let sx = 0, sy = 0, c = 0;
        for (const id of n.topicIds) { const t = this.byId.get(id); if (t) { sx += t.x; sy += t.y; c++; } }
        const j = u.hash(n.id);
        const ang = ((j % 360) * Math.PI) / 180;
        n.x = (c ? sx / c : 0) + Math.cos(ang) * (n.kind === "tag" ? 40 : 26);
        n.y = (c ? sy / c : 0) + Math.sin(ang) * (n.kind === "tag" ? 40 : 26);
      }
    }
    warm() {
      // stage 1: themes pinned on their ring while the prompts settle around them; stage 2: release with a firm anchor
      const themes = this.nodes.filter((n) => n.kind === "theme");
      for (const t of themes) t.fixed = true;
      this.sim.alpha = 1;
      for (let i = 0; i < 360; i++) this.sim.tick();
      for (const t of themes) t.fixed = false;
      this.sim.alpha = 0.5;
      for (let i = 0; i < 160; i++) this.sim.tick();
      this.sim.alpha = 0;
      this.sim.alphaTarget = 0;
    }

    /* ------------------------------------------------------------------ visibility, springs, adjacency */
    configure(opts) {
      let rebuild = false;
      if ("mode" in opts && opts.mode !== this.mode) this.setMode(opts.mode);
      if ("layers" in opts) { Object.assign(this.layers, opts.layers); rebuild = true; }
      if ("minScore" in opts) { this.minScore = opts.minScore; rebuild = true; }
      if ("curatedOnly" in opts) { this.curatedOnly = opts.curatedOnly; rebuild = true; }
      if (rebuild) this.rebuild();
      this.dirty = true;
    }
    rebuild(initial) {
      const L = this.layers;
      for (const n of this.nodes) {
        const was = n.vis;
        n.vis = n.kind === "center" || n.kind === "theme" || n.kind === "topic" ||
          (n.kind === "discussion" && L.disc) || (n.kind === "tag" && L.tags && L.tagFacets.has(n.d.facet)) || (n.kind === "book" && L.books);
        n.on = n.vis;
        if (n.vis && !was && !initial) {
          // newly shown satellites appear next to their topics
          let sx = 0, sy = 0, c = 0;
          for (const id of n.topicIds) { const t = this.byId.get(id); if (t && t.vis) { sx += t.x; sy += t.y; c++; } }
          if (c) { n.x = sx / c + (Math.random() - 0.5) * 30; n.y = sy / c + (Math.random() - 0.5) * 30; n.vx = n.vy = 0; }
        }
        n.alpha = n.vis ? (was ? n.alpha : 0) : n.alpha;
      }
      const springs = [], adj = new Map();
      const link = (a, b) => { (adj.get(a.id) || adj.set(a.id, []).get(a.id)).push(b.id); (adj.get(b.id) || adj.set(b.id, []).get(b.id)).push(a.id); };
      for (const n of this.nodes) n.deg = 0;
      for (const l of this.links) {
        const { a, b } = l;
        let show = true;
        // while tags are shown as nodes they carry the 'shared tag' information, so derived topic–topic links step aside
        if (l.kind === "rel") show = this.curatedOnly ? !!l.curated : (l.curated || (l.score >= this.minScore && !L.tags));
        l.on = show;                         // part of the data model at current threshold
        l.vis = show && a.vis && b.vis;       // drawn
        if (show) link(a, b);
        if (l.vis && l.kind === "rel") { a.deg++; b.deg++; }
        if (!l.vis) continue;
        if (l.kind === "hier") {
          if (a.kind === "center") springs.push({ a, b, k: 0.004, len: 330 });
          else springs.push({ a, b, k: 0.085, len: 108 });
        } else if (l.kind === "rel") {
          const s = u.clamp(l.score / 9, 0.35, 1.15);
          const same = a.d.theme === b.d.theme;   // links inside a theme may draw prompts together; cross-theme links barely pull
          springs.push({ a, b, k: (l.curated ? 0.0042 : 0.002) * s * (same ? 2.4 : 0.12), len: same ? 150 : 300, slack: true });
        } else if (l.kind === "src") springs.push({ a, b, k: 0.22, len: 36 });
        else if (l.kind === "tag") springs.push({ a, b, k: 0.012, len: 150 });
        else if (l.kind === "read") springs.push({ a, b, k: 0.05, len: 70 });
      }
      for (const n of this.nodes) {
        if (n.kind === "topic") {
          n.r = 8.5 + Math.min(4.5, n.deg * 0.32);
          n.band = { rmin: this.ring.R + 66, k: 0.55, sx: this.ring.sx, sy: this.ring.sy };
        }
        if (n.kind === "tag") { n.gravity = 0.0016; n.band = { rmax: this.ring.R - 78, k: 0.5, sx: this.ring.sx, sy: this.ring.sy }; }
      }
      this.adj = adj;
      this.sim.set(this.nodes, springs);
      if (!initial) this.sim.reheat(0.55);
      this.dirty = true;
    }

    /* ------------------------------------------------------------------ state setters */
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
    focusSet() {
      const f = new Set();
      const addNb = (id) => { f.add(id); for (const nb of this.adj.get(id) || []) f.add(nb); };
      if (this.thread) { for (const s of this.thread.steps) f.add(s); return f; }
      if (this.sel) {
        addNb(this.sel);
        const s = this.byId.get(this.sel);
        if (s && s.kind === "topic") { f.add("th:" + s.d.theme); f.add("c"); }
        if (s && s.kind === "theme") f.add("c");
      }
      if (this.hover) addNb(this.hover);
      return f.size ? f : null;
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
    bounds(filter) {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, c = 0;
      for (const n of this.nodes) {
        if (!n.vis || (filter && !filter(n))) continue;
        x0 = Math.min(x0, n.x - n.r); x1 = Math.max(x1, n.x + n.r); y0 = Math.min(y0, n.y - n.r); y1 = Math.max(y1, n.y + n.r); c++;
      }
      return c ? { x0, y0, x1, y1 } : { x0: -300, y0: -300, x1: 300, y1: 300 };
    }
    get sparse() { return this.w < 700; }   // small screens: shapes first, labels fade in as you zoom
    labelWidth(n) {
      this._lw = this._lw || new Map();
      if (this._lw.has(n.id)) return this._lw.get(n.id);
      this._m = this._m || document.createElement("canvas").getContext("2d");
      this._m.font = "500 11.5px Inter, system-ui, sans-serif";
      const w = Math.min(170, this._m.measureText(n.d.label || "").width);
      this._lw.set(n.id, w);
      return w;
    }
    /* Largest zoom at which every visible node *and its outward label* fits inside the safe area. */
    fit(animate = true, filter) {
      const nodes = this.nodes.filter((n) => n.vis && (filter ? filter(n) : n.kind !== "tag" || this.layers.tags));
      if (!nodes.length) return;
      const s = this.safe(), mX = this.sparse ? 14 : 40, mY = this.sparse ? 20 : 44;
      const extents = (k) => {
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        const fs = u.clamp(11.5 * Math.pow(k, 0.3), 10.5, 14.5), fl = fs / 11.5;
        for (const n of nodes) {
          const x = n.x * k, y = n.y * k, r = n.r * k;
          x0 = Math.min(x0, x - r); x1 = Math.max(x1, x + r); y0 = Math.min(y0, y - r); y1 = Math.max(y1, y + r);
          if (n.kind === "topic" && !this.sparse) {
            const od = Math.hypot(n.x, n.y) || 1, ox = n.x / od, oy = n.y / od, w = this.labelWidth(n) * fl, g = r + 5, th = fs * 1.4;
            if (Math.abs(ox) > 0.42) { if (ox > 0) x1 = Math.max(x1, x + g + w); else x0 = Math.min(x0, x - g - w); y0 = Math.min(y0, y - th / 2); y1 = Math.max(y1, y + th / 2); }
            else if (oy > 0) y1 = Math.max(y1, y + g + th); else y0 = Math.min(y0, y - g - th);
          }
        }
        return { x0, x1, y0, y1 };
      };
      let lo = 0.12, hi = 2.4;
      for (let i = 0; i < 28; i++) {
        const k = (lo + hi) / 2, e = extents(k);
        if (e.x1 - e.x0 <= s.w - mX * 2 && e.y1 - e.y0 <= s.h - mY * 2) lo = k; else hi = k;
      }
      const k = lo, e = extents(k);
      this.goto({ k, x: s.x + s.w / 2 - (e.x0 + e.x1) / 2, y: s.y + s.h / 2 - (e.y0 + e.y1) / 2 }, animate);
    }
    flyTo(id, kMin = 1.05) {
      const n = this.byId.get(id);
      if (!n) return;
      const s = this.safe(), k = Math.max(this.t.k, kMin);
      this.goto({ k, x: s.x + s.w / 2 - n.x * k, y: s.y + s.h / 2 - n.y * k }, true);
    }
    flyToSet(ids, minK = 0.5, maxK = 1.4) {
      const ns = ids.map((i) => this.byId.get(i)).filter((n) => n && n.vis);
      if (!ns.length) return;
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const n of ns) { x0 = Math.min(x0, n.x); x1 = Math.max(x1, n.x); y0 = Math.min(y0, n.y); y1 = Math.max(y1, n.y); }
      const s = this.safe(), pad = 110;
      const k = u.clamp(Math.min(s.w / (x1 - x0 + pad * 2), s.h / (y1 - y0 + pad * 2)), minK, maxK);
      this.goto({ k, x: s.x + s.w / 2 - ((x0 + x1) / 2) * k, y: s.y + s.h / 2 - ((y0 + y1) / 2) * k }, true);
    }
    goto(to, animate) {
      if (!animate) { Object.assign(this.t, to); this.anim = null; this.dirty = true; return; }
      this.anim = { from: Object.assign({}, this.t), to, t0: performance.now(), dur: 620 };
    }
    zoomAt(px, py, f) {
      const k0 = this.t.k, k1 = u.clamp(k0 * f, 0.14, 4.5);
      this.t.x = px - ((px - this.t.x) / k0) * k1; this.t.y = py - ((py - this.t.y) / k0) * k1; this.t.k = k1;
      this.anim = null; this.dirty = true;
    }
    zoomBy(f) { this.zoomAt(this.w / 2, this.h / 2, f); }

    /* ------------------------------------------------------------------ input */
    hit(px, py) {
      const pad = this.touch ? 14 : 5;
      for (let i = this.order.length - 1; i >= 0; i--) {
        const n = this.order[i];
        if (!n.vis || n.alpha < 0.3) continue;
        const [sx, sy] = this.toScreen(n.x, n.y);
        const r = n.r * this.t.k * n.sc + pad + (n.kind === "discussion" ? 3 : 0);
        if ((sx - px) ** 2 + (sy - py) ** 2 <= r * r) return n;
      }
      return null;
    }
    bind() {
      const cv = this.cv, pts = new Map();
      let down = null, pinch = null;
      const pos = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
      cv.addEventListener("pointerdown", (e) => {
        cv.setPointerCapture(e.pointerId);
        this.touch = e.pointerType === "touch";
        this.cb.onInteract && this.cb.onInteract();
        const [px, py] = pos(e);
        pts.set(e.pointerId, [px, py]);
        this.anim = null;
        if (pts.size === 1) {
          const n = this.hit(px, py);
          down = { px, py, n, moved: false, ox: n ? n.x : 0, oy: n ? n.y : 0, t: performance.now() };
          cv.classList.add("dragging");
        } else if (pts.size === 2) {
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
          return;
        }
        if (down) {
          const dx = px - down.px, dy = py - down.py;
          if (!down.moved && Math.hypot(dx, dy) > 5) {
            down.moved = true;
            if (down.n && down.n.kind !== "center") { down.n.fixed = true; this.sim.alphaTarget = 0.18; this.sim.reheat(0.3); }
          }
          if (down.moved) {
            if (down.n && down.n.kind !== "center") {
              const [wx, wy] = this.toWorld(px, py);
              down.n.x = wx; down.n.y = wy;
              this.dirty = true;
            } else {
              this.t.x += px - (down.lx ?? down.px); this.t.y += py - (down.ly ?? down.py);
              this.dirty = true;
            }
          }
          down.lx = px; down.ly = py;
          return;
        }
        if (e.pointerType !== "touch") {
          const n = this.hit(px, py);
          cv.classList.toggle("hovering", !!n);
          const id = n ? n.id : null;
          if (id !== this.hover) { this.hover = id; this.dirty = true; }
          this.cb.onHover && this.cb.onHover(n, px, py);
        }
      });
      const end = (e) => {
        const [px, py] = pos(e);
        pts.delete(e.pointerId);
        if (pts.size < 2) pinch = null;
        if (pts.size === 0) cv.classList.remove("dragging");
        if (down && pts.size === 0) {
          if (!down.moved) {
            if (down.n) this.cb.onPick && this.cb.onPick(down.n.id, e);
            else this.cb.onPick && this.cb.onPick(null, e);
          } else if (down.n && down.n.kind !== "center") {
            down.n.fixed = false;
            if (down.n.kind === "theme" && down.n.anchor) { down.n.anchor.x = down.n.x; down.n.anchor.y = down.n.y; } // stays where it was dropped
            this.sim.alphaTarget = 0;
          }
          down = null;
        }
      };
      cv.addEventListener("pointerup", end);
      cv.addEventListener("pointercancel", end);
      cv.addEventListener("pointerleave", (e) => { if (e.pointerType !== "touch" && !down) { this.hover = null; this.dirty = true; this.cb.onHover && this.cb.onHover(null); } });
      cv.addEventListener("wheel", (e) => {
        e.preventDefault();
        this.cb.onInteract && this.cb.onInteract();
        const [px, py] = pos(e);
        const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : (e.deltaMode === 1 ? 0.05 : 0.0016)));
        this.zoomAt(px, py, f);
      }, { passive: false });
      cv.addEventListener("dblclick", (e) => {
        const [px, py] = pos(e);
        if (!this.hit(px, py)) { this.zoomAt(px, py, 1.7); }
      });
      window.addEventListener("resize", () => { this.resize(); });
    }

    /* ------------------------------------------------------------------ frame loop */
    loop(now) {
      requestAnimationFrame(this.loop);
      let busy = false;
      if (this.anim) {
        const a = this.anim, p = u.clamp((now - a.t0) / a.dur, 0, 1), e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
        for (const k of ["k", "x", "y"]) this.t[k] = a.from[k] + (a.to[k] - a.from[k]) * e;
        if (p >= 1) this.anim = null;
        busy = true;
      }
      if (this.sim.active) { this.sim.tick(); busy = true; }
      // target alphas
      const focus = this.focusSet();
      for (const n of this.nodes) {
        let ta = n.vis ? 1 : 0;
        if (n.vis) {
          if (focus && !focus.has(n.id)) ta = 0.13;
          if (this.match && !this.matchOf(n)) ta = Math.min(ta, 0.13);
        }
        const d = ta - n.alpha;
        if (Math.abs(d) > 0.004) { n.alpha += d * 0.22; busy = true; } else n.alpha = ta;
        const ts = n.id === this.sel ? 1.18 : n.id === this.hover ? 1.14 : 1;
        if (Math.abs(ts - n.sc) > 0.003) { n.sc += (ts - n.sc) * 0.28; busy = true; } else n.sc = ts;
      }
      for (const l of this.links) {
        let ta = l.vis ? 1 : 0;
        if (l.vis) {
          if (focus && !(focus.has(l.a.id) && focus.has(l.b.id))) ta = 0.07;
          else if (focus && this.sel && !this.thread && (l.a.id !== this.sel && l.b.id !== this.sel && l.a.id !== this.hover && l.b.id !== this.hover) && l.kind !== "hier") ta = 0.35;
          if (this.match && !(this.matchOf(l.a) && this.matchOf(l.b))) ta = Math.min(ta, 0.06);
        }
        const d = ta - l.alpha;
        if (Math.abs(d) > 0.004) { l.alpha += d * 0.2; busy = true; } else l.alpha = ta;
      }
      if (busy || this.dirty) { this.dirty = false; this.draw(); }
    }

    /* ------------------------------------------------------------------ drawing */
    draw() {
      const ctx = this.ctx, { k, x, y } = this.t, dpr = this.dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.cv.width, this.cv.height);
      ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * x, dpr * y);
      this.drawLinks(ctx);
      this.drawNodes(ctx);
      this.drawThreadPath(ctx);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.drawArcLabels(ctx);
      this.drawLabels(ctx);
    }
    curvePoint(l) {
      const { a, b } = l;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = b.x - a.x, dy = b.y - a.y;
      if (l.kind === "rel" && a.d.theme !== b.d.theme) {
        // bundle cross-theme links through the (empty) middle of the map, like a chord diagram:
        // the further apart the two themes, the harder the curve is pulled towards the centre
        const na = Math.hypot(a.x / this.ring.sx, a.y / this.ring.sy) || 1, nb = Math.hypot(b.x / this.ring.sx, b.y / this.ring.sy) || 1;
        const cos = u.clamp((a.x * b.x / (this.ring.sx ** 2) + a.y * b.y / (this.ring.sy ** 2)) / (na * nb), -1, 1);
        const beta = 0.42 + 0.46 * Math.sin(Math.acos(cos) / 2);
        return [mx * (1 - beta), my * (1 - beta)];
      }
      return [mx - dy * l.curve, my + dx * l.curve];
    }
    drawLinks(ctx) {
      const k = this.t.k, focus = this.focusSet();
      for (const l of this.links) {
        if (!l.vis || l.alpha < 0.012) continue;
        const [cx, cy] = this.curvePoint(l);
        ctx.beginPath();
        ctx.moveTo(l.a.x, l.a.y);
        ctx.quadraticCurveTo(cx, cy, l.b.x, l.b.y);
        let col, w, dash = null, al = l.alpha;
        const isFocus = focus && (l.a.id === this.sel || l.b.id === this.sel || l.a.id === this.hover || l.b.id === this.hover);
        switch (l.kind) {
          case "hier": col = THREAD; w = l.a.kind === "center" ? 2.3 : 1.35; al *= l.a.kind === "center" ? 0.5 : 0.36; break;
          case "rel":
            if (l.curated) { col = isFocus ? REL_COLOR[l.type] || INK : INK; w = isFocus ? 2.2 : 1.4; al *= isFocus ? 0.9 : 0.4; }
            else { col = isFocus ? FAINT : THREAD; w = isFocus ? 1.6 : 1; al *= isFocus ? 0.8 : 0.22; dash = [3.5, 4.5]; }
            break;
          case "src": col = THREAD; w = 0.9; al *= isFocus ? 0.8 : 0.32; break;
          case "tag": col = FACET_COLOR[l.b.d ? l.b.d.facet : l.a.d.facet] || FAINT; w = isFocus ? 1.3 : 0.8; al *= isFocus ? 0.85 : 0.17; break;
          default: col = FAINT; w = 0.9; al *= 0.3;
        }
        ctx.strokeStyle = u.rgba(col, Math.min(1, al));
        ctx.lineWidth = w / k;
        ctx.lineCap = "round";
        ctx.setLineDash(dash ? dash.map((d) => d / k) : []);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    ringSegments(ctx, n, r, lw, a) {
      const cs = n.colors, m = cs.length;
      if (m === 1) { ctx.strokeStyle = u.rgba(cs[0], 0.78 * a); ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, TAU); ctx.stroke(); return; }
      for (let i = 0; i < m; i++) {
        ctx.strokeStyle = u.rgba(cs[i], 0.82 * a);
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, -Math.PI / 2 + (i * TAU) / m + 0.02, -Math.PI / 2 + ((i + 1) * TAU) / m - 0.02);
        ctx.stroke();
      }
    }
    drawNodes(ctx) {
      const k = this.t.k;
      for (const n of this.order) {
        if (!n.vis || n.alpha < 0.012) continue;
        const a = n.alpha, r = n.r * n.sc;
        ctx.globalAlpha = 1;
        switch (n.kind) {
          case "center": {
            ctx.fillStyle = PAPER; ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, TAU); ctx.fill();
            const g = ctx.createLinearGradient(n.x - r, n.y - r, n.x + r, n.y + r);
            for (const [t, c] of u.LOGO) g.addColorStop(t, c);
            ctx.globalAlpha = 0.84 * a; ctx.strokeStyle = g; ctx.lineWidth = r * 0.15;
            ctx.beginPath(); ctx.arc(n.x, n.y, r - r * 0.075, 0, TAU); ctx.stroke();
            ctx.globalAlpha = 1;
            break;
          }
          case "theme": case "topic": {
            ctx.globalAlpha = a;
            ctx.fillStyle = PAPER; ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, TAU); ctx.fill();
            ctx.fillStyle = u.rgba(n.colors[0], 0.1 + (n.id === this.sel ? 0.08 : 0)); ctx.fill();
            ctx.lineWidth = (n.kind === "theme" ? 3 : 2.2 * (n.id === this.sel ? 1.25 : 1)) * (n.kind === "theme" ? 1 : 1);
            ctx.lineCap = "butt";
            this.ringSegments(ctx, n, r - ctx.lineWidth / 2, ctx.lineWidth, 1);
            if (n.id === this.sel) {
              ctx.lineWidth = 1.6 / k; ctx.strokeStyle = u.rgba(n.colors[0], 0.45 * a);
              ctx.beginPath(); ctx.arc(n.x, n.y, r + 5 / k * 1.2 + 3, 0, TAU); ctx.stroke();
            }
            break;
          }
          case "discussion": {
            ctx.globalAlpha = a;
            ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, TAU);
            if (n.d.proposed) { ctx.fillStyle = PAPER; ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = THREAD; ctx.stroke(); }
            else { ctx.fillStyle = THREAD; ctx.fill(); ctx.lineWidth = 1.3; ctx.strokeStyle = PAPER; ctx.stroke(); }
            if (n.id === this.sel) { ctx.lineWidth = 1.5 / k; ctx.strokeStyle = u.rgba(INK, 0.5 * a); ctx.beginPath(); ctx.arc(n.x, n.y, r + 4, 0, TAU); ctx.stroke(); }
            break;
          }
          case "tag": {
            ctx.globalAlpha = a;
            const s = r * (n.id === this.sel ? 1.35 : 1);
            ctx.beginPath(); ctx.moveTo(n.x, n.y - s * 1.2); ctx.lineTo(n.x + s * 1.2, n.y); ctx.lineTo(n.x, n.y + s * 1.2); ctx.lineTo(n.x - s * 1.2, n.y); ctx.closePath();
            ctx.fillStyle = u.rgba(n.colors[0], 0.9); ctx.fill(); ctx.lineWidth = 1.3; ctx.strokeStyle = PAPER; ctx.stroke();
            break;
          }
          case "book": {
            ctx.globalAlpha = a;
            const s = r * 0.95;
            ctx.fillStyle = FAINT; ctx.strokeStyle = PAPER; ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.rect(n.x - s * 0.8, n.y - s, s * 1.6, s * 2); ctx.fill(); ctx.stroke();
            break;
          }
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
        const a = ns[i], b = ns[i + 1];
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = b.x - a.x, dy = b.y - a.y, c = (i % 2 ? -1 : 1) * 0.16;
        const done = i < this.thread.idx;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(mx - dy * c, my + dx * c, b.x, b.y);
        ctx.strokeStyle = u.rgba("#C9963F", done ? 0.95 : 0.5); ctx.lineWidth = (done ? 4 : 3) / k;
        ctx.setLineDash(done ? [] : [6 / k, 6 / k]);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    /* ---- the Bookshelf's three story arcs, as quiet italic captions on the frame edge nearest each group of themes */
    drawArcLabels(ctx) {
      const s = this.safe(), [c0x, c0y] = this.toScreen(0, 0);
      const fs = 15.5;
      ctx.font = `italic 500 ${fs}px Spectral, Georgia, serif`; ctx.textBaseline = "middle"; ctx.textAlign = "center";
      for (const arc of this.D.arcs) {
        let mx = 0, my = 0, c = 0;
        for (const n of this.nodes) if (n.kind === "theme" && arc.themes.includes(n.d.n)) { const [x, y] = this.toScreen(n.x, n.y); mx += x; my += y; c++; }
        if (!c) continue;
        const dx = mx / c - c0x, dy = my / c - c0y;
        if (Math.hypot(dx, dy) < 4) continue;
        const sideways = Math.abs(dx) / (s.w / 2) > Math.abs(dy) / (s.h / 2);
        ctx.save();
        ctx.fillStyle = "rgba(107,103,92,0.9)";
        if (sideways) {
          const x = dx > 0 ? s.x + s.w - 15 : s.x + 15;
          const y = u.clamp(c0y + (dy / dx) * (x - c0x), s.y + 120, s.y + s.h - 170);
          ctx.translate(x, y); ctx.rotate(dx > 0 ? Math.PI / 2 : -Math.PI / 2);
        } else {
          const y = dy > 0 ? s.y + s.h - 14 : s.y + 20;
          const x = u.clamp(c0x + (dx / dy) * (y - c0y), s.x + 150, s.x + s.w - 150);
          ctx.translate(x, y);
        }
        ctx.fillText(arc.label, 0, 0);
        ctx.restore();
      }
    }

    /* ---- labels (screen space; greedy collision culling) */
    drawLabels(ctx) {
      const k = this.t.k, placed = [];
      const free = (r) => { for (const p of placed) if (r.x < p.x + p.w && r.x + r.w > p.x && r.y < p.y + p.h && r.y + r.h > p.y) return false; return true; };
      const focus = this.focusSet();
      const fs = u.clamp(11.5 * Math.pow(k, 0.3), 10.5, 14.5);
      ctx.textBaseline = "middle";

      // centre + themes (always)
      for (const n of this.order) {
        if (!n.vis || n.alpha < 0.2) continue;
        const [sx, sy] = this.toScreen(n.x, n.y), r = n.r * k * n.sc;
        if (n.kind === "center") {
          if (r >= 30) {
            const f = u.clamp(r * 0.27, 10, 24);
            ctx.font = `500 ${f}px Spectral, Georgia, serif`; ctx.fillStyle = INK; ctx.textAlign = "center";
            const lines = ["A world we", "want to", "live in"];
            lines.forEach((t, i) => ctx.fillText(t, sx, sy + (i - 1) * f * 1.18));
          }
          placed.push({ x: sx - r, y: sy - r, w: r * 2, h: r * 2 });
        } else if (n.kind === "theme" && r < 27) {
          // too small for words: just the theme number
          ctx.font = `700 ${u.clamp(r * 0.95, 9, 16)}px Inter, system-ui, sans-serif`; ctx.textAlign = "center";
          ctx.fillStyle = u.rgba(INK, n.alpha); ctx.fillText(String(n.d.n), sx, sy + 0.5);
          placed.push({ x: sx - r, y: sy - r, w: r * 2, h: r * 2 });
        } else if (n.kind === "theme") {
          const f = u.clamp(r * 0.235, 9, 15.5);
          ctx.font = `600 ${f}px Inter, system-ui, sans-serif`; ctx.textAlign = "center";
          const lines = u.wrap(ctx, n.d.label, r * 1.62);
          // one centred block: small 'THEME n' caption, then the title lines
          const lh = f * 1.22, capF = Math.max(7.5, f * 0.78), capH = capF * 1.25, gap = 2;
          const H = capH + gap + lines.length * lh, top = sy - H / 2;
          ctx.fillStyle = u.rgba(FAINT, 0.9 * n.alpha);
          ctx.font = `500 ${capF}px Inter, system-ui, sans-serif`;
          ctx.fillText("THEME " + n.d.n, sx, top + capH / 2);
          ctx.font = `600 ${f}px Inter, system-ui, sans-serif`;
          ctx.fillStyle = u.rgba(INK, n.alpha);
          lines.forEach((t, i) => ctx.fillText(t, sx, top + capH + gap + lh * (i + 0.5)));
          placed.push({ x: sx - r, y: sy - r, w: r * 2, h: r * 2 });
        }
      }

      // candidate satellite labels
      const cands = [];
      for (const n of this.nodes) {
        if (!n.vis || n.alpha < 0.2) continue;
        const forced = n.id === this.sel || n.id === this.hover || (this.thread && this.thread.steps.includes(n.id)) || (focus && focus.has(n.id) && n.kind !== "discussion");
        let show = false, pri = 0;
        if (n.kind === "topic") { show = !this.sparse || k > 0.85; pri = 10 + n.deg; }
        else if (n.kind === "tag") { show = k > 0.55 || forced; pri = 5; }
        else if (n.kind === "discussion") { show = (k > 1.5 && n.alpha > 0.6) || forced; pri = 2; }
        else if (n.kind === "book") { show = k > 0.9 || forced; pri = 3; }
        if (n.kind === "center" || n.kind === "theme") continue;
        if (!show && !forced) continue;
        cands.push({ n, forced, pri: forced ? 100 + pri : pri });
      }
      cands.sort((a, b) => b.pri - a.pri);
      for (const { n, forced } of cands) {
        const [sx, sy] = this.toScreen(n.x, n.y);
        const r = n.r * k * n.sc;
        const label = n.kind === "discussion" ? n.d.label : n.kind === "tag" ? n.d.label : n.kind === "book" ? n.d.label : n.d.label;
        const small = n.kind === "discussion" || n.kind === "tag" || n.kind === "book";
        const f = small ? fs * 0.92 : fs;
        ctx.font = n.kind === "tag" ? `italic 500 ${f}px Spectral, Georgia, serif` : `${n.id === this.sel || n.id === this.hover ? 600 : 500} ${f}px Inter, system-ui, sans-serif`;
        let text = label;
        const maxW = n.kind === "discussion" ? 190 : 170;
        if (ctx.measureText(text).width > maxW) { while (text.length > 8 && ctx.measureText(text + "…").width > maxW) text = text.slice(0, -1); text += "…"; }
        const tw = ctx.measureText(text).width, th = f * 1.35;
        // outward placement (relative to the centre), so labels fan away from the middle of the map
        const [cx0, cy0] = this.toScreen(0, 0);
        let ox = sx - cx0, oy = sy - cy0, od = Math.hypot(ox, oy) || 1;
        ox /= od; oy /= od;
        const gap = r + 5;
        let rect, align;
        if (Math.abs(ox) > 0.42) { align = ox > 0 ? "left" : "right"; rect = { x: ox > 0 ? sx + gap : sx - gap - tw, y: sy - th / 2, w: tw, h: th }; }
        else { align = "center"; rect = { x: sx - tw / 2, y: oy > 0 ? sy + gap - 1 : sy - gap - th + 1, w: tw, h: th }; }
        if (!forced && !free(rect)) {
          // try the other side before giving up
          const alt = align === "center" ? { x: sx - tw / 2, y: oy > 0 ? sy - gap - th + 1 : sy + gap - 1, w: tw, h: th }
            : { x: align === "left" ? sx - gap - tw : sx + gap, y: sy - th / 2, w: tw, h: th };
          if (!free(alt)) continue;
          rect = alt; align = align === "center" ? "center" : (align === "left" ? "right" : "left");
        }
        placed.push(rect);
        const al = u.clamp(n.alpha, 0, 1);
        ctx.textAlign = align === "center" ? "center" : "left";
        const tx = align === "center" ? rect.x + rect.w / 2 : rect.x, ty = rect.y + rect.h / 2 + 0.5;
        ctx.lineWidth = 3.6; ctx.lineJoin = "round";
        ctx.strokeStyle = u.rgba(PAPER, 0.92 * al); ctx.strokeText(text, tx, ty);
        ctx.fillStyle = u.rgba(n.kind === "tag" ? FACET_COLOR[n.d.facet] : n.kind === "discussion" || n.kind === "book" ? FAINT : INK, (small ? 0.85 : 0.94) * al);
        ctx.fillText(text, tx, ty);
      }

      // thread step badges
      if (this.thread) {
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        this.thread.steps.forEach((id, i) => {
          const n = this.byId.get(id);
          if (!n) return;
          const [sx, sy] = this.toScreen(n.x, n.y), r = n.r * k;
          const bx = sx + r * 0.75 + 7, by = sy - r * 0.75 - 7, cur = i === this.thread.idx;
          ctx.beginPath(); ctx.arc(bx, by, cur ? 11 : 9, 0, TAU);
          ctx.fillStyle = cur ? INK : "#C9963F"; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = PAPER; ctx.stroke();
          ctx.fillStyle = cur ? PAPER : INK; ctx.font = `700 ${cur ? 11.5 : 10.5}px Inter, sans-serif`; ctx.fillText(String(i + 1), bx, by + 0.5);
        });
      }
    }
  }
  RM.View = View;
})();
