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
        const node = h("button", { class: "fm-node", type: "button", "data-id": mb.id, onclick: () => cb.select && cb.select(mb.id) },
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
          onclick: () => cb.move && cb.move(nb.id) },
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
    // a list rather than a ring: on a phone, or when the room left (beside an open note, say) is too narrow for a ring to read
    stacked() {
      if (window.matchMedia("(max-width: 820px)").matches) return true;
      const I = this.insets, sw = this.el.clientWidth - I.l - I.r;
      return sw < (this.m && this.m.style === "niche" ? 700 : 600);
    }
    layout(cramped) {
      if (!this.m) return;
      const W = this.el.clientWidth, H = this.el.clientHeight;
      if (!W || !H) return;
      const stack = cramped || this.stacked();
      this.el.classList.toggle("stack", stack);
      if (stack) {
        for (const el of [this.centre, this.emptyEl, ...this.items.map((x) => x.item), ...this.nbs.map((x) => x.btn)].filter(Boolean)) {
          for (const k of ["left", "top", "width", "height"]) el.style[k] = "";
          el.classList.remove("side-l", "side-r");
        }
        const I = this.insets, phone = window.matchMedia("(max-width: 820px)").matches;
        this.el.style.padding = phone ? "" : `${I.t}px ${I.r + 12}px ${I.b + 24}px ${I.l + 12}px`;
        this.pos = null;
        this.paint();
        return;
      }
      this.el.style.padding = "";
      const I = this.insets, sw = Math.max(280, W - I.l - I.r), sh = Math.max(260, H - I.t - I.b);
      const cx = I.l + sw / 2, cy = I.t + sh / 2;
      const niche = this.m.style === "niche", M = this.items.length, N = this.nbs.length;
      const nbR = niche ? 6 : 19, labW = niche ? 172 : 150;
      // the outer ring holds the neighbours, with room for their names beside them
      const Ry2 = Math.max(80, sh / 2 - nbR - 24);
      // (when the stage is narrow the ring grows taller than wide rather than push the names out of view)
      const Rx2 = Math.min(Math.max(sw / 2 - nbR - labW - 8, 60), Ry2 * 1.9);
      // the inner ring holds the members: discs (prompts) on the Regime, cards (sources) on the Niche
      let Rx1, Ry1, rm = 0, cw = 0, ch = 0;
      if (!niche) {
        rm = u.clamp(sh * 0.08, 30, 56);
        Ry1 = N ? Ry2 - rm - nbR - 54 : sh / 2 - rm - 34;
        const room = Rx2 - rm - nbR - 22;   // the members stay clear of the neighbours, however narrow
        Rx1 = N ? u.clamp(Rx2 - rm - nbR - 86, Math.min(Ry1 * 0.7, room), room) : Math.min(sw / 2 - rm - 40, Ry1 * 1.6);
        rm = Math.min(rm, perimeter(Rx1, Ry1) / (Math.max(M, 3) * 2.5));
      } else {
        ch = 64;
        Ry1 = N ? Ry2 - ch / 2 - nbR - 34 : sh / 2 - ch / 2 - 18;
        cw = u.clamp(perimeter(Math.max(Ry1, Rx2 * 0.66), Ry1) / (Math.max(M, 3) * 1.2), 120, 196);
        if (N) cw = Math.max(108, Math.min(cw, 2 * (Rx2 - nbR - 60)));
        const room = Rx2 - cw / 2 - nbR - 16;
        Rx1 = N ? u.clamp(Rx2 - cw / 2 - nbR - 46, Math.min(Ry1 * 0.7, room), room) : Math.min(sw / 2 - cw / 2 - 18, Ry1 * 1.7);
      }
      // members: evenly round the ring from the top, clockwise (an even count starts half a step on, so it sits symmetrically;
      // two sit above and below the middle, where wide cards have the most room)
      const at1 = u.alongEllipse(Rx1, Ry1);
      const mAng = this.items.map((x, i) => at1(i / Math.max(1, M) + (M % 2 === 0 && M !== 2 ? 0.5 / M : 0)));
      let rc;
      if (niche) {
        // the middle may be as large as the room the cards leave it; narrow the cards first, and if that is not enough, use the list
        const gap = (w) => (M ? Math.min(...mAng.map((a) => Math.hypot(Math.max(Math.abs(Rx1 * Math.cos(a)) - w / 2, 0), Math.max(Math.abs(Ry1 * Math.sin(a)) - ch / 2, 0)))) : Math.min(Rx1, Ry1));
        while (M && gap(cw) - 14 < 56 && cw > 112) cw -= 8;
        if (gap(cw) - 14 < 44) return this.layout(true);
        rc = u.clamp(gap(cw) - 14, 44, 96);
      } else {
        if (Math.min(Rx1, Ry1) - rm - 20 < 40) return this.layout(true);
        rc = u.clamp(Math.min(Rx1, Ry1) - rm - 20, 42, 88);
      }
      // neighbours: on the Regime, towards the prompts that link to them; on the Niche, in the gaps between the sources
      const nAng = niche ? this.gapAngles(mAng, N) : this.towardAngles(mAng, Rx2, Ry2, nbR);
      this.pos = { cx, cy, Rx1, Ry1, Rx2, Ry2, rm, cw, ch, rc, nbR, niche,
        members: new Map(this.items.map((x, i) => [x.mb.id, [cx + Rx1 * Math.cos(mAng[i]), cy + Ry1 * Math.sin(mAng[i])]])),
        nbs: new Map(this.nbs.map((x, i) => [x.nb.id, [cx + Rx2 * Math.cos(nAng[i]), cy + Ry2 * Math.sin(nAng[i])]])) };
      this.apply(this.pos);
      this.paint();
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
      // the longest word of the label in the middle has to fit across it
      this.centre.style.setProperty("--fs", u.clamp(Math.min(rc * 0.2, (1.55 * rc - 8) / this.widest(this.m.centre.title, 500, "Spectral, Georgia, serif")), 10.5, 24).toFixed(1) + "px");
      this.centre.classList.toggle("tight", rc < 66);   // a small middle keeps only its kicker and title
      for (const { mb, item } of this.items) {
        const [x, y] = g.members.get(mb.id), d = Math.hypot(x - cx, y - cy) || 1;
        if (niche) Object.assign(item.style, { left: x + "px", top: y + "px", width: cw + "px", height: "" });
        else {
          Object.assign(item.style, { left: x - rm + "px", top: y - rm + "px", width: 2 * rm + "px", height: 2 * rm + "px" });
          item.style.setProperty("--fs", u.clamp(Math.min(rm * 0.27, (1.6 * rm - 6) / this.widest(mb.label, 600, "Inter, system-ui, sans-serif")), 9, 14).toFixed(2) + "px");
        }
        item.style.setProperty("--ux", ((x - cx) / d).toFixed(3));
        item.style.setProperty("--uy", ((y - cy) / d).toFixed(3));
      }
      for (const { nb, btn } of this.nbs) {
        const [x, y] = g.nbs.get(nb.id);
        Object.assign(btn.style, { left: x - nbR + "px", top: y - nbR + "px" });
        btn.classList.toggle("side-r", x >= cx);
        btn.classList.toggle("side-l", x < cx);
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
        this._ww.set(key, Math.max(...String(label).split(/\s+|(?<=-)/).map((w) => c.measureText(w).width)) / 100);   // a hyphen is a place to break
      }
      return this._ww.get(key);
    }
  }
  RM.FocusMap = FocusMap;
})();
