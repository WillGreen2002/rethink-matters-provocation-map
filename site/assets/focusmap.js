/* The Regime and the Niche: one thing in focus at a time, drawn the same way as the Landscape so going down feels like stepping into
   the disc you chose. The thing in focus sits in the middle; its parts sit round it on a ring; what it connects to sits further out,
   one level of abstraction up, and choosing one of those moves you sideways.
     Regime: a theme in the middle, its prompts round it, and the other themes they link to outside.
     Niche:  a prompt in the middle, its discussions, examples and books round it, and the prompts it links to outside.
   Real buttons over a decorative SVG (keyboard and screen-reader friendly, no animation loop); a plain list on phones. */
(function () {
  const RM = (window.RM = window.RM || {});
  const { u } = RM;
  const h = u.h;
  const NS = "http://www.w3.org/2000/svg";
  const svg = (tag, attrs) => { const el = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v); return el; };
  const perimeter = (a, b) => Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
  const near = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  const f1 = (v) => v.toFixed(1);

  class FocusMap {
    constructor(el, cb) {
      this.el = el; this.cb = cb || {};
      this.m = null; this.sel = null; this.hover = null; this.walk = null;
      this.view = "map";   // "map" (the ring, the standard) or "list" (chosen by the visitor; always on a phone)
      this.insets = { l: 0, r: 0, t: 0, b: 0 };
      this.reduced = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
      new ResizeObserver(() => this.layout()).observe(el);
    }

    /* model: { key, style: "regime" | "niche",
         centre:     { id, kicker, title, sub?, color },
         members:    [{ id, kind, label, kicker?, color, color2?, shape?, down?: { label, aria } }],
         links:      [{ a, b, type, curated }]                      (between members)
         neighbours: [{ id, num?, label, sub?, aria, color, ties: [{ member (null: the centre), type, curated }] }],
         membersTitle, neighboursTitle, empty?: { title, body } }
       dir: where it comes from ("left", "right", "down", "up"), for a short entrance */
    show(m, dir) {
      const ae = document.activeElement, hadFocus = !!ae && this.el.contains(ae), fresh = !this.m || this.m.key.split("|")[0] !== m.key.split("|")[0];
      this.m = m; this.hover = null;
      if (this.sel && !this.has(this.sel)) this.sel = null;
      this.build();
      if (fresh) this.el.scrollTop = 0;   // a list (phone, or beside a note) starts again from the top for something new
      this.layout();
      // keyboard focus was on something that has just been replaced (a theme or prompt further out): it lands on the new centre
      if (hadFocus) this.centre.focus({ preventScroll: !this.el.classList.contains("stack") });
      clearTimeout(this._enterT);
      this.el.classList.remove("fm-enter");
      if (dir && !this.reduced) {
        this.el.style.setProperty("--dx", dir === "left" ? "-40px" : dir === "right" ? "40px" : "0px");
        this.el.style.setProperty("--dy", dir === "down" ? "26px" : dir === "up" ? "-26px" : "0px");
        void this.el.offsetWidth;
        this.el.classList.add("fm-enter");
        this._enterT = setTimeout(() => this.el.classList.remove("fm-enter"), 1100);
      }
    }
    has(id) { const m = this.m; return !!m && (this.holds(id) || m.neighbours.some((x) => x.id === id)); }
    // in the middle or on the ring (what a note can stay open on); the neighbours further out belong to another focus
    holds(id) { const m = this.m; return !!m && (m.centre.id === id || m.members.some((x) => x.id === id)); }

    /* ---------------------------------------------------------------- DOM */
    build() {
      const m = this.m, cb = this.cb;
      this.svgEl = svg("svg", { class: "fm-lines", "aria-hidden": "true" });
      this.ring = svg("ellipse", { class: "fm-ring" });
      this.ring2 = svg("ellipse", { class: "fm-ring fm-ring2" });
      this.gFan = svg("g"); this.gTies = svg("g"); this.gLinks = svg("g"); this.gWalk = svg("g", { class: "fm-walk" });
      this.svgEl.append(this.ring, this.ring2, this.gFan, this.gTies, this.gLinks, this.gWalk);
      const c = m.centre;
      this.centre = h("button", { class: "fm-centre", type: "button", style: { "--c": c.color }, "data-id": c.id, onclick: () => cb.select && cb.select(c.id) },
        c.kicker ? h("span", { class: "fm-kicker" }, c.kicker) : null, h("span", { class: "fm-title" }, c.title), c.sub ? h("span", { class: "fm-sub" }, c.sub) : null);
      this.bindHover(this.centre, c.id);
      this.items = m.members.map((mb, i) => {
        const node = h("button", { class: "fm-node", type: "button", "data-id": mb.id,
          onclick: (e) => (mb.down ? RM.press(e, () => cb.select && cb.select(mb.id), () => cb.drill && cb.drill(mb.id)) : cb.select && cb.select(mb.id)) },
          mb.shape ? h("i", { class: "shape shape-" + mb.shape, "aria-hidden": "true" }) : null,
          mb.kicker ? h("span", { class: "fm-kicker" }, mb.kicker) : null,
          h("span", { class: "fm-label" }, mb.label));
        const down = mb.down ? h("button", { class: "fm-down", type: "button", "aria-label": mb.down.aria, onclick: () => cb.drill && cb.drill(mb.id) },
          mb.down.label, h("span", { "aria-hidden": "true" }, " ↓")) : null;
        const badge = h("span", { class: "fm-badge", "aria-hidden": "true" });
        const item = h("div", { class: "fm-member k-" + mb.kind, style: { "--c": mb.color, "--c2": mb.color2 || "transparent", "--i": i + 1 }, "data-id": mb.id }, node, down, badge);
        this.bindHover(node, mb.id);
        if (down) this.bindHover(down, mb.id);
        return { mb, item, node, down, badge };
      });
      const ids = new Set(m.members.map((x) => x.id));
      this.fans = this.items.map(() => { const p = svg("path", { class: "fm-fan" }); this.gFan.append(p); return p; });
      this.links = m.links.filter((l) => ids.has(l.a) && ids.has(l.b)).map((l) => {
        const p = svg("path", { class: "fm-link " + (l.curated ? "curated t-" + l.type : "derived") });
        this.gLinks.append(p);
        return Object.assign({ p }, l);
      });
      this.ties = [];
      this.nbs = m.neighbours.map((nb, i) => {
        const btn = h("button", { class: "fm-nb", type: "button", style: { "--c": nb.color, "--i": i + 2 + m.members.length }, "data-id": nb.id, "aria-label": nb.aria || null,
          onclick: (e) => { if (!(e && e.detail > 1) && cb.move) cb.move(nb.id); } },
          h("span", { class: "fm-nbdot", "aria-hidden": "true" }, nb.num != null ? String(nb.num) : ""),
          h("span", { class: "fm-nblabel" }, h("span", { class: "fm-nbname" }, nb.label), nb.sub ? h("small", null, nb.sub) : null));
        this.bindHover(btn, nb.id);
        for (const t of nb.ties || []) {
          if (t.member && !ids.has(t.member)) continue;
          const p = svg("path", { class: "fm-tie " + (t.curated ? "curated t-" + t.type : "derived") });
          this.gTies.append(p);
          this.ties.push(Object.assign({ p, nb: nb.id }, t));
        }
        return { nb, btn };
      });
      const kids = [this.svgEl, this.centre];
      if (m.membersTitle && this.items.length) kids.push(h("h3", { class: "fm-h" }, m.membersTitle));
      kids.push(...this.items.map((x) => x.item));
      this.emptyEl = !this.items.length && m.empty ? h("div", { class: "fm-empty" }, h("b", null, m.empty.title), h("p", null, m.empty.body)) : null;
      if (this.emptyEl) kids.push(this.emptyEl);
      if (m.neighboursTitle && this.nbs.length) kids.push(h("h3", { class: "fm-h" }, m.neighboursTitle));
      kids.push(...this.nbs.map((x) => x.btn));
      this.el.replaceChildren(...kids);
      this.el.dataset.style = m.style;
      this.pos = null;
    }
    bindHover(el, id) {
      const on = () => { this.setHover(id); this.cb.hover && this.cb.hover(id, el.getBoundingClientRect()); };
      const off = () => { if (this.hover === id) { this.setHover(null); this.cb.hover && this.cb.hover(null); } };
      el.addEventListener("pointerenter", (e) => { if (e.pointerType !== "touch") on(); });
      el.addEventListener("pointerleave", off);
      el.addEventListener("focus", () => { if (el.matches(":focus-visible")) on(); });
      el.addEventListener("blur", off);
    }

    /* ---------------------------------------------------------------- state */
    setSelected(id) { this.sel = id && this.has(id) ? id : null; this.paint(); }
    setHover(id) { if (id !== this.hover) { this.hover = id; this.paint(); } }
    setWalk(w) { this.walk = w; this.paint(); if (this.pos) this.drawWalk(this.pos); }
    setView(v) { if (v !== this.view) { this.view = v; this.layout(); } }
    setInsets(i) {
      const before = JSON.stringify(this.insets);
      Object.assign(this.insets, i);
      if (JSON.stringify(this.insets) !== before) this.layout();
    }
    // what lights up: the member or neighbour pointed at (or chosen), and everything it touches
    focusOf() {
      const id = this.hover || this.sel, m = this.m;
      if (!id || !m || id === m.centre.id) return null;
      const members = new Set(), nbs = new Set();
      if (m.members.some((x) => x.id === id)) {
        members.add(id);
        for (const t of this.ties) if (t.member === id) nbs.add(t.nb);
        for (const l of this.links) if (l.a === id) members.add(l.b); else if (l.b === id) members.add(l.a);
      } else if (m.neighbours.some((x) => x.id === id)) {
        nbs.add(id);
        for (const t of this.ties) if (t.nb === id && t.member) members.add(t.member);
      } else return null;
      return { id, members, nbs };
    }
    paint() {
      if (!this.m) return;
      const F = this.focusOf(), W = this.walk;
      this.el.classList.toggle("focused", !!F);
      this.centre.classList.toggle("sel", this.sel === this.m.centre.id);
      for (const { mb, item, badge } of this.items) {
        item.classList.toggle("on", !!F && F.members.has(mb.id));
        item.classList.toggle("dim", !!F && !F.members.has(mb.id));
        item.classList.toggle("sel", this.sel === mb.id);
        item.classList.toggle("hot", mb.id === this.hover || mb.id === this.sel);
        item.classList.toggle("walk-cur", !!W && W.cur === mb.id);
        const stop = W && W.stops && W.stops.get(mb.id);
        badge.textContent = stop ? String(stop) : "";
        item.classList.toggle("walk-stop", !!stop);
      }
      for (const { nb, btn } of this.nbs) {
        btn.classList.toggle("on", !!F && F.nbs.has(nb.id));
        btn.classList.toggle("dim", !!F && !F.nbs.has(nb.id));
        btn.classList.toggle("walk-next", !!W && !!W.next && W.next.id === nb.id);
        btn.classList.toggle("walk-prev", !!W && !!W.prev && W.prev.id === nb.id);
      }
      for (const l of this.links) l.p.classList.toggle("lit", !!F && (l.a === F.id || l.b === F.id));
      for (const t of this.ties) t.p.classList.toggle("lit", !!F && (t.member === F.id || t.nb === F.id || (!t.member && F.nbs.has(t.nb) && F.id === t.nb)));
    }

    /* ---------------------------------------------------------------- layout */
    // a list rather than the ring: when the visitor asks for it, on a phone, or when there is truly no room for a ring. The width
    // is the one the stage is heading for (insets.w), so a side panel still sliding does not flash the list.
    stacked() {
      if (window.matchMedia("(max-width: 820px)").matches) return true;
      if (this.forceRing) return false;   // a guided walk reads best as a map: the visitor's List choice waits until it ends
      if (this.view === "list" || this.insets.cramp) return true;
      const I = this.insets;
      return (I.w || this.el.clientWidth) - I.l - I.r < 420;
    }
    // the smallest disc on which every prompt's name fits at the smallest type: its longest word across, its lines within
    labelFit() {
      const k = this.m.key + "|" + (document.fonts ? document.fonts.status : "");
      if (this._fitKey === k) return this._fit;
      const c = (this._ctx = this._ctx || document.createElement("canvas").getContext("2d"));
      c.font = "600 100px Inter, system-ui, sans-serif";
      const sp = c.measureText(" ").width / 100;
      // each name as pieces that can start a line: words, and the parts of a word joined by a hyphen or an en dash (no space)
      const words = this.items.map(({ mb }) => String(mb.label).split(/\s+/).flatMap((w) => w.split(/(?<=[-–])/).map((part, i) => [c.measureText(part).width / 100, !i])));
      const fits = (ws, r) => {
        const inner = 1.6 * r - 6, widest = Math.max(...ws.map(([w]) => w)), fs = u.clamp(Math.min(r * 0.27, inner / widest), 9, 14);
        if (widest * fs > inner + 0.5) return false;
        let lines = 1, line = 0;
        for (const [w, spaced] of ws) { const add = (line && spaced ? sp : 0) + w; if (line && (line + add) * fs > inner) { lines++; line = w; } else line += add; }
        return lines * fs * 1.15 <= 1.62 * r;
      };
      let r = 24;
      while (r < 56 && !words.every((ws) => fits(ws, r))) r++;
      this._fitKey = k; this._fit = r;
      return r;
    }
    layout(cramped) {
      if (!this.m) return;
      const W = this.insets.w || this.el.clientWidth, H = this.el.clientHeight;
      if (!W || !H) return;
      const phone = window.matchMedia("(max-width: 820px)").matches;
      const stack = cramped || this.stacked();
      this.el.classList.toggle("stack", stack);
      // the ring was wanted but had no room: the map/list switch says so rather than show Map as on
      this.fellBack = stack && this.view !== "list" && !phone;
      if (stack) {
        for (const el of [this.centre, this.emptyEl, ...this.items.map((x) => x.item), ...this.nbs.map((x) => x.btn)].filter(Boolean)) {
          for (const k of ["left", "top", "width", "height"]) el.style[k] = "";
          el.classList.remove("side-l", "side-r", "side-t", "side-b");
        }
        const I = this.insets;
        this.noArrows = false;
        this.el.style.padding = phone ? "" : `${I.t}px ${I.r + (I.side || 0) + 12}px ${I.b + 24}px ${I.l + (I.side || 0) + 12}px`;
        this.el.style.removeProperty("--labw");
        this.pos = null;
        this.paint();
        if (this.cb.laidOut) this.cb.laidOut(this);
        return;
      }
      this.el.style.padding = "";
      // (insets.side is the room the side arrows would like; they step aside when the ring needs it)
      const I = this.insets, side = I.side || 0, sh = Math.max(240, H - I.t - I.b);
      const cx = I.l + Math.max(280, W - I.l - I.r) / 2, cy = I.t + sh / 2;
      const niche = this.m.style === "niche", M = this.items.length, N = this.nbs.length;
      const nbR = niche ? 6 : 19;
      // members: evenly round the ring from the top, clockwise (an even count starts half a step on, so it sits symmetrically;
      // two sit above and below the middle, where wide cards have the most room)
      const placeOn = (rx, ry) => { const at1 = u.alongEllipse(rx, ry); return this.items.map((x, i) => at1(i / Math.max(1, M) + (M % 2 === 0 && M !== 2 ? 0.5 / M : 0))); };
      // Two ways to fit the rings: the neighbours' names beside their discs (the usual), or, where that leaves the rings too
      // little width, above and below them (narrower, so the rings can be wider). Each returns the sizes, or null if no ring fits.
      // tight: smaller gaps between the rings; s: the room left for each side arrow
      // the middle must hold its title's longest word at the smallest type it is set in (10.5px, see apply)
      const rcMin = Math.max(34, (10.5 * this.widest(this.m.centre.title, 500, "Spectral, Georgia, serif") + 8) / 1.55);
      const fit = (vert, s, tight, relax) => {
        const sw = Math.max(280, W - I.l - I.r - 2 * s);
        const labW = vert ? Math.round(u.clamp(sw * 0.17, 84, niche ? 140 : 124)) : Math.round(u.clamp(sw * (niche ? 0.2 : 0.17), niche ? 104 : 92, niche ? 172 : 150));   // names wrap when room is short
        const labH = vert && N ? Math.max(...this.labelSizes(labW, niche).map(([, h]) => h)) : 0;
        // how far a neighbour reaches towards the middle across the ring (its name points outwards beside it, or sits above or below)
        const inX = vert ? Math.max(nbR, labW / 2) : nbR;
        // the outer ring holds the neighbours, with room for their names (beside a disc, above and below the ring only the disc and
        // a line or two of name need room; above or below it, the whole name does)
        const Ry2 = Math.max(80, vert ? sh / 2 - nbR - 8 - labH : sh / 2 - nbR - (niche ? 24 : 12));
        // (when the stage is narrow the ring grows taller than wide rather than push the names out of view)
        const Rx2 = Math.min(Math.max(vert ? sw / 2 - inX - 6 : sw / 2 - nbR - labW - 8, 60), Ry2 * 2.2);
        let Rx1, Ry1, rm = 0, cw = 0, ch = 0, mAng, rc, hh = [];
        if (!niche) {
          // the gaps between the rings shrink with the room, so a short or narrow window still has a ring
          const gapV = tight ? 14 : u.clamp(sh * 0.07, 14, 54), gapH = tight ? 24 : u.clamp(sw * 0.08, 24, 86);
          const ring = (r) => {
            const ry = N ? Ry2 - r - nbR - gapV : sh / 2 - r - 34, room = Rx2 - r - inX - 22;   // clear of the neighbours, however narrow
            return [N ? u.clamp(Rx2 - r - inX - gapH, Math.min(ry * 0.7, room), room) : Math.min(sw / 2 - r - 40, ry * 1.6), ry];
          };
          // the discs are as large as the room allows: round the ring without touching, leaving the theme in the middle its room.
          // Each smaller disc gives the ring back a little room, so it is worked out again.
          const rmMin = relax ? 24 : this.labelFit();
          rm = Math.max(u.clamp(sh * 0.08, 30, 56), rmMin);   // never start below what the names need
          for (let k = 0; k < 40; k++) {
            [Rx1, Ry1] = ring(rm);
            const r = Math.min(rm, perimeter(Rx1, Ry1) / (Math.max(M, 3) * 2.5), Math.min(Rx1, Ry1) - 20 - Math.max(40, rcMin));
            if (r >= rm - 0.5 || rm <= rmMin) break;
            rm = Math.max(rmMin, r);
          }
          // no ring if a name would spill out of its disc, the discs would touch, or the theme in the middle would be squeezed
          if (rm < rmMin - 0.01 || perimeter(Rx1, Ry1) / Math.max(M, 3) < 2.2 * rm || Math.min(Rx1, Ry1) - rm - 20 < (relax ? 30 : rcMin)) return null;
          mAng = placeOn(Rx1, Ry1);
          rc = u.clamp(Math.min(Rx1, Ry1) - rm - 20, relax ? 30 : rcMin, 88);
        } else {
          ch = 64;   // a card's least height (most are taller: they are measured below)
          Ry1 = N ? Ry2 - ch / 2 - nbR - (tight ? 16 : 34) : sh / 2 - ch / 2 - 18;
          cw = u.clamp(perimeter(Math.max(Ry1, Rx2 * 0.66), Ry1) / (Math.max(M, 3) * 1.2), 120, 196);
          if (N) cw = Math.max(108, Math.min(cw, 2 * (Rx2 - inX - 60)));
          // the inner ring for the cards' present width (an empty prompt has no cards to keep clear of the neighbours)
          const cardRing = () => {
            const w = M ? cw : 0, room = Rx2 - w / 2 - inX - 16;
            Rx1 = N ? u.clamp(Rx2 - w / 2 - inX - (tight ? 20 : 46), Math.min(Ry1 * 0.7, room), room) : Math.min(sw / 2 - w / 2 - 18, Ry1 * 1.7);
          };
          // each card is as tall as its text at a given width
          const heights = (w) => this.items.map(({ item }) => { item.style.width = w + "px"; return Math.max(ch, item.offsetHeight); });
          const at = () => mAng.map((a) => [Rx1 * Math.cos(a), Ry1 * Math.sin(a)]);
          // how wide the cards may be: cards on one row must not touch
          const widthFor = (P) => {
            let w = cw;
            for (let i = 0; i < M; i++) for (let j = i + 1; j < M; j++)
              if (Math.abs(P[i][1] - P[j][1]) < (hh[i] + hh[j]) / 2 + 8) w = Math.min(w, Math.abs(P[i][0] - P[j][0]) - 14);
            return w;
          };
          // and the room the cards leave the prompt in the middle
          const gap = (P, w) => (M ? Math.min(...P.map(([x, y], i) => Math.hypot(Math.max(Math.abs(x) - w / 2, 0), Math.max(Math.abs(y) - hh[i] / 2, 0)))) : Math.min(Rx1, Ry1));
          cardRing(); mAng = placeOn(Rx1, Ry1); hh = heights(cw);
          // narrower cards (their text wraps) give the ring room back, so it is worked out again until it settles
          for (let pass = 0; pass < 5; pass++) {
            const P = at();
            let w = widthFor(P);
            while (M && gap(P, w) - 14 < Math.max(56, rcMin) && w > 96) w -= 8;
            w = Math.max(96, w);
            if (w >= cw - 0.5) break;
            cw = w; cardRing(); mAng = placeOn(Rx1, Ry1); hh = heights(cw);
          }
          const P = at(), g = gap(P, cw);
          // no ring if cards on one row would still touch, or the prompt in the middle would be squeezed
          if (widthFor(P) < cw - 0.5 || g - 14 < rcMin) return null;
          rc = u.clamp(g - 14, rcMin, 96);
        }
        return { vert, s, labW, Rx1, Ry1, Rx2, Ry2, rm, cw, ch, rc, mAng, hh };
      };
      // the usual first; then, while it still does not fit, tighter gaps, the names above and below, the side arrows stepping aside
      const tries = [[false, side, false], [false, side, true], [true, side, true], [false, 0, true], [true, 0, true]].filter((t, i) => side || i < 3);
      // during a walk, one last try with the smallest discs the page can still fit names into (the names are shrunk to fit below)
      if (this.forceRing) tries.push([false, 0, true, true], [true, 0, true, true]);
      // neighbours: on the Regime, towards the prompts that link to them; on the Niche, in the gaps between the sources
      // (the members are in the way too: a disc on the Regime, a card on the Niche, as tall as its text)
      const spread = (g) => {
        const hw = niche ? g.cw / 2 : g.rm;
        const obs = g.mAng.map((a, i) => {
          const x = cx + g.Rx1 * Math.cos(a), y = cy + g.Ry1 * Math.sin(a), v = niche ? g.hh[i] / 2 : g.rm;
          return { a, b: [x - hw, y - v, x + hw, y + v], c: [x, y], r: niche ? 0 : g.rm };
        });
        return this.untangle(niche ? this.gapAngles(g.mAng, N) : this.towardAngles(g.mAng, g.Rx2, g.Ry2, nbR), cx, cy, g.Rx2, g.Ry2, nbR, g.labW, niche, obs, g.vert);
      };
      // the first layout whose names all sit clear; failing that, the one with fewest touching
      let G = null, best = null;
      for (const [vert, s, tight, relax] of tries) {
        const g = fit(vert, s, tight, relax);
        if (!g) continue;
        g.nAng = spread(g);
        if (!g.nAng.clash) { G = g; break; }
        if (!best || g.nAng.clash < best.nAng.clash) best = g;
      }
      G = G || best;
      if (!G) return this.layout(true);   // no ring can hold this: the list, this once
      const { vert, labW, Rx1, Ry1, Rx2, Ry2, rm, cw, ch, rc, mAng, hh, nAng } = G;
      this.noArrows = side > 0 && G.s === 0;
      this.el.style.setProperty("--labw", labW + "px");
      this.pos = { cx, cy, Rx1, Ry1, Rx2, Ry2, rm, cw, ch, rc, nbR, niche, vert,
        members: new Map(this.items.map((x, i) => [x.mb.id, [cx + Rx1 * Math.cos(mAng[i]), cy + Ry1 * Math.sin(mAng[i])]])),
        nbs: new Map(this.nbs.map((x, i) => [x.nb.id, [cx + Rx2 * Math.cos(nAng[i]), cy + Ry2 * Math.sin(nAng[i])]])) };
      this.apply(this.pos);
      this.paint();
      if (this.cb.laidOut) this.cb.laidOut(this);
    }
    // the neighbour's place: the mean direction of the members tied to it, then nudged apart along the ring
    towardAngles(mAng, Rx2, Ry2, nbR) {
      const idx = new Map(this.items.map((x, i) => [x.mb.id, i]));
      const list = this.nbs.map((x, i) => {
        let sx = 0, sy = 0;
        for (const t of this.ties) if (t.nb === x.nb.id && t.member && idx.has(t.member)) { const a = mAng[idx.get(t.member)]; sx += Math.cos(a); sy += Math.sin(a); }
        return { i, a: sx || sy ? Math.atan2(sy, sx) : null };
      });
      // anything without ties (a walk's next stop in another theme) goes into the widest gap
      for (const n of list) if (n.a == null) n.a = this.gapAngles(list.filter((x) => x.a != null).map((x) => x.a).concat(mAng), 1)[0];
      const minD = 2 * nbR + 34, P = (a) => [Rx2 * Math.cos(a), Ry2 * Math.sin(a)], rad = (Rx2 + Ry2) / 2;
      for (let it = 0; it < 200 && list.length > 1; it++) {
        list.sort((p, q) => p.a - q.a);
        let moved = false;
        for (let k = 0; k < list.length; k++) {
          const p = list[k], q = list[(k + 1) % list.length], [ax, ay] = P(p.a), [bx, by] = P(q.a), d = Math.hypot(bx - ax, by - ay);
          if (d < minD) { const da = Math.min(0.06, ((minD - d) / rad) * 0.6); p.a -= da / 2; q.a += da / 2; moved = true; }
        }
        if (!moved) break;
      }
      const out = [];
      for (const n of list) out[n.i] = n.a;
      return out;
    }
    // the neighbours' names must not touch one another, another neighbour or a member: each takes the room its name needs (a box
    // beside its disc, on the outward side); any two that would overlap are eased apart along the ring, and one that would run into
    // a member is eased away from it
    // each neighbour's name as the page sets it at a given width: [widest line, height], wrapped at spaces, hyphens and en dashes
    labelSizes(labW, niche) {
      const c = (this._ctx = this._ctx || document.createElement("canvas").getContext("2d"));
      const wrap = (text, font, maxW) => {
        c.font = font;
        const sp = c.measureText(" ").width, parts = String(text).split(/\s+/).flatMap((w) => w.split(/(?<=[-–])/).map((p, i) => [c.measureText(p).width, !i]));
        let lines = 1, line = 0, widest = 0;
        for (const [pw, spaced] of parts) { const add = (line && spaced ? sp : 0) + pw; if (line && line + add > maxW) { widest = Math.max(widest, line); lines++; line = pw; } else line += add; }
        return [Math.max(widest, line), lines];
      };
      return this.nbs.map(({ nb }) => {
        const [w, lines] = wrap(nb.label, `600 ${niche ? 12.5 : 11.5}px Inter, system-ui, sans-serif`, labW);
        // (a Regime neighbour shows its link count under its name while lit: room is kept for it)
        const [sw2, sl] = nb.sub ? wrap(nb.sub, "400 11px Inter, system-ui, sans-serif", labW) : [0, 0];
        return [lines > 1 || sl > 1 ? Math.max(labW, w) : Math.max(w, sw2), lines * (niche ? 15 : 14) + sl * 14];
      });
    }
    untangle(angles, cx, cy, Rx2, Ry2, nbR, labW, niche, obs, vert) {
      const n = angles.length;
      if (!n) return angles;
      const size = this.labelSizes(labW, niche);
      const rr = nbR * 1.15;   // a lit disc grows a little
      const box = (i, a) => {
        const x = cx + Rx2 * Math.cos(a), y = cy + Ry2 * Math.sin(a), [lw, lh] = size[i], r = x >= cx;
        if (vert) { const up = y < cy, hx = Math.max(rr, lw / 2); return [x - hx, up ? y - nbR - 4 - lh : y - rr, x + hx, up ? y + rr : y + nbR + 4 + lh]; }
        return [r ? x - rr : x - nbR - 8 - lw, Math.min(y - rr, y - lh / 2), r ? x + nbR + 8 + lw : x + rr, Math.max(y + rr, y + lh / 2)];
      };
      const hit = (A, B) => A[0] < B[2] + 6 && B[0] < A[2] + 6 && A[1] < B[3] + 4 && B[1] < A[3] + 4;
      // what could not be eased apart (a real overlap, not just closer than the margin)
      const real = (A, B) => A[0] < B[2] - 1 && B[0] < A[2] - 1 && A[1] < B[3] - 1 && B[1] < A[3] - 1;
      const onDisc = (A, o) => Math.hypot(Math.max(A[0] - o.c[0], 0, o.c[0] - A[2]), Math.max(A[1] - o.c[1], 0, o.c[1] - A[3])) < o.r - 1;
      const clashes = (out) => {
        let c = 0;
        for (let k = 0; k < n; k++) for (let j = k + 1; j < n; j++) if (real(box(k, out[k]), box(j, out[j]))) c++;
        for (let k = 0; k < n; k++) for (const o of obs || []) if (o.r ? onDisc(box(k, out[k]), o) : real(box(k, out[k]), o.b)) c++;
        return c;
      };
      const ease = (start) => {
        const list = start.map((a, i) => ({ i, a: Math.atan2(Math.sin(a), Math.cos(a)) }));
        for (let it = 0; it < 800; it++) {
          list.sort((p, q) => p.a - q.a);
          let moved = false;
          // every pair, not only those next to each other round the ring: a name above or below its disc can reach a disc two along
          for (let k = 0; k < n; k++) for (let j = k + 1; j < n; j++) {
            const p = list[k], q = list[j];
            if (!hit(box(p.i, p.a), box(q.i, q.a))) continue;
            const d = Math.atan2(Math.sin(q.a - p.a), Math.cos(q.a - p.a)) >= 0 ? 0.012 : -0.012;   // apart the short way round
            p.a -= d; q.a += d; moved = true;
          }
          for (const p of list) for (const o of obs || []) {
            if (!hit(box(p.i, p.a), o.b)) continue;
            p.a += Math.atan2(Math.sin(p.a - o.a), Math.cos(p.a - o.a)) >= 0 ? 0.012 : -0.012; moved = true;
          }
          if (!moved) break;
        }
        const out = [];
        for (const x of list) out[x.i] = x.a;
        out.clash = clashes(out);
        return out;
      };
      let out = ease(angles);
      if (out.clash && n > 1) {
        // stuck (each push undoes another): start again from the same order spread evenly round the ring, turned to stay
        // as near as it can to where each one wanted to be, and keep whichever leaves fewer overlaps
        const order = out.map((a, i) => [a, i]).sort((p, q) => p[0] - q[0]).map(([, i]) => i);
        const at = u.alongEllipse(Rx2, Ry2), frac = (a) => { let best = 0, bd = Infinity; for (let f = 0; f < 1; f += 1 / 360) { const d = Math.abs(Math.atan2(Math.sin(at(f) - a), Math.cos(at(f) - a))); if (d < bd) { bd = d; best = f; } } return best; };
        const want = order.map((i) => frac(angles[i]));
        let bestOff = 0, bestCost = Infinity;
        for (let s = 0; s < 72; s++) {
          const off = s / 72;
          let cost = 0;
          order.forEach((i, k) => { const d = ((off + k / n - want[k]) % 1 + 1.5) % 1 - 0.5; cost += d * d; });
          if (cost < bestCost) { bestCost = cost; bestOff = off; }
        }
        const even = [];
        order.forEach((i, k) => { even[i] = at(bestOff + k / n); });
        const again = ease(even);
        if (again.clash < out.clash) out = again;
      }
      return out;
    }
    // evenly spaced, turned so as to sit as far as possible from the given angles
    gapAngles(taken, n) {
      if (!n) return [];
      let best = null;
      for (let r = 0; r < 72; r++) {
        const as = Array.from({ length: n }, (_, j) => -Math.PI / 2 + (2 * Math.PI * (j + r / 72)) / n);
        const score = taken.length ? Math.min(...as.map((a) => Math.min(...taken.map((b) => near(a, b))))) : 0;
        if (!best || score > best.score + 1e-9) best = { as, score };
      }
      return best.as;
    }
    apply(g) {
      const { cx, cy, Rx1, Ry1, Rx2, Ry2, rm, cw, rc, nbR, niche } = g;
      this.el.style.setProperty("--rm", f1(rm) + "px");
      this.el.style.setProperty("--rc", f1(rc) + "px");
      this.el.style.setProperty("--cw", f1(cw) + "px");
      for (const [e, rx, ry] of [[this.ring, Rx1, Ry1], [this.ring2, Rx2, Ry2]]) { e.setAttribute("cx", cx); e.setAttribute("cy", cy); e.setAttribute("rx", rx); e.setAttribute("ry", ry); }
      this.ring2.style.display = this.nbs.length ? "" : "none";
      Object.assign(this.centre.style, { left: cx - rc + "px", top: cy - rc + "px", width: 2 * rc + "px", height: 2 * rc + "px" });
      if (this.emptyEl) Object.assign(this.emptyEl.style, { left: cx + "px", top: cy + rc + 18 + "px" });
      // the longest word of the label in the middle has to fit across it (and then every line has to sit inside the circle)
      this.centre.classList.toggle("tight", rc < 66);   // a small middle keeps only its kicker and title
      this.centre.classList.remove("bare");
      const fsC = u.clamp(Math.min(rc * 0.2, (1.55 * rc - 8) / this.widest(this.m.centre.title, 500, "Spectral, Georgia, serif")), 10.5, 24);
      const setC = (fs) => this.centre.style.setProperty("--fs", fs.toFixed(1) + "px");
      u.shrinkToFit([[this.centre, this.centre]], setC, fsC, 9);
      // still too much for a small middle: the title alone (its kicker, "Prompt · Theme 5", is in the level bar and the note)
      if (!u.textInCircle(this.centre, this.centre)) { this.centre.classList.add("bare"); u.shrinkToFit([[this.centre, this.centre]], setC, fsC, 8.5); }
      for (const { mb, item } of this.items) {
        const [x, y] = g.members.get(mb.id), d = Math.hypot(x - cx, y - cy) || 1;
        if (niche) Object.assign(item.style, { left: x + "px", top: y + "px", width: cw + "px", height: "" });
        else Object.assign(item.style, { left: x - rm + "px", top: y - rm + "px", width: 2 * rm + "px", height: 2 * rm + "px" });
        item.style.setProperty("--ux", ((x - cx) / d).toFixed(3));
        item.style.setProperty("--uy", ((y - cy) / d).toFixed(3));
      }
      // every prompt's name in one size: the largest at which every name's longest word fits across its disc, then stepped down
      // until each name sits inside its circle as the page actually draws it
      if (!niche && this.items.length) {
        const fs0 = u.clamp(Math.min(rm * 0.27, ...this.items.map(({ mb }) => (1.6 * rm - 6) / this.widest(mb.label, 600, "Inter, system-ui, sans-serif"))), 9, 14);
        const pairs = this.items.map(({ item }) => [item.querySelector(".fm-node"), item.querySelector(".fm-label")]);
        u.shrinkToFit(pairs, (fs) => this.el.style.setProperty("--fsm", fs.toFixed(2) + "px"), fs0, 8);
      }
      for (const { nb, btn } of this.nbs) {
        const [x, y] = g.nbs.get(nb.id);
        Object.assign(btn.style, { left: x - nbR + "px", top: y - nbR + "px" });
        btn.classList.toggle("side-r", !g.vert && x >= cx);
        btn.classList.toggle("side-l", !g.vert && x < cx);
        btn.classList.toggle("side-t", !!g.vert && y < cy);   // (names above and below their discs, where width is short)
        btn.classList.toggle("side-b", !!g.vert && y >= cy);
      }
      // lines: from the middle out to each member (Regime), between members, and out to the neighbours
      const edge = (from, to, r) => { const dx = to[0] - from[0], dy = to[1] - from[1], d = Math.hypot(dx, dy) || 1; return [from[0] + (dx / d) * r, from[1] + (dy / d) * r]; };
      const mr = niche ? 0 : rm, C = [cx, cy];
      this.items.forEach(({ mb }, i) => {
        const p = g.members.get(mb.id), a = edge(C, p, rc), b = edge(p, C, mr);
        this.fans[i].setAttribute("d", `M${f1(a[0])},${f1(a[1])} L${f1(b[0])},${f1(b[1])}`);
      });
      for (const l of this.links) {
        const A = g.members.get(l.a), B = g.members.get(l.b), mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2;
        const q = [cx + (mx - cx) * 0.3, cy + (my - cy) * 0.3], a = edge(A, q, mr), b = edge(B, q, mr);
        l.p.setAttribute("d", `M${f1(a[0])},${f1(a[1])} Q${f1(q[0])},${f1(q[1])} ${f1(b[0])},${f1(b[1])}`);
      }
      for (const t of this.ties) {
        const A = t.member ? g.members.get(t.member) : C, B = g.nbs.get(t.nb), a = edge(A, B, t.member ? mr : rc), b = edge(B, A, nbR + 2);
        t.p.setAttribute("d", `M${f1(a[0])},${f1(a[1])} L${f1(b[0])},${f1(b[1])}`);
      }
      this.drawWalk(g);
    }
    // a guided walk: the way in to this stop and the way on, in gold
    drawWalk(g) {
      this.gWalk.replaceChildren();
      const W = this.walk;
      if (!W || !W.cur || !g) return;
      const at = (id) => g.members.get(id) || g.nbs.get(id);
      const cur = at(W.cur);
      if (!cur) return;
      for (const [end, cls] of [[W.prev, "done"], [W.next, "todo"]]) {
        const p = end && at(end.id);
        if (!p) continue;
        const mx = (p[0] + cur[0]) / 2, my = (p[1] + cur[1]) / 2, q = [g.cx + (mx - g.cx) * 0.55, g.cy + (my - g.cy) * 0.55];
        this.gWalk.append(svg("path", { class: "fm-walkpath " + cls, d: `M${f1(p[0])},${f1(p[1])} Q${f1(q[0])},${f1(q[1])} ${f1(cur[0])},${f1(cur[1])}` }));
      }
    }
    widest(label, weight, family) {
      this._ww = this._ww || new Map();
      const key = weight + label + (document.fonts ? document.fonts.status : "");
      if (!this._ww.has(key)) {
        const c = (this._ctx = this._ctx || document.createElement("canvas").getContext("2d"));
        c.font = `${weight} 100px ${family}`;
        this._ww.set(key, Math.max(...String(label).split(/\s+|(?<=[-–])/).map((w) => c.measureText(w).width)) / 100);   // a hyphen or an en dash is a place to break
      }
      return this._ww.get(key);
    }
  }
  RM.FocusMap = FocusMap;
})();
