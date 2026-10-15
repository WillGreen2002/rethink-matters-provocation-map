/* The Landscape level: the nine themes round the question, in the same clockwise order as the map of prompts below it (theme 1
   at the top right), each chapter heading its run of themes, and dashed lines between themes whose prompts are linked.
   Built from real buttons over a decorative SVG, so it works with a keyboard and a screen reader and needs no second animation loop.
   On a phone the ring becomes a list of cards. */
(function () {
  const RM = (window.RM = window.RM || {});
  const { u } = RM;
  const h = u.h;
  const NS = "http://www.w3.org/2000/svg";
  const CHAPTER_TONE = [0.2, 0.6, 0.97];   // as on the map of prompts
  const GAP = 0.9;                         // the gap before each chapter, in theme slots (its caption sits there)
  const svg = (tag, attrs) => { const el = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v); return el; };
  const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
  // positions spaced evenly along an ellipse (equal angles would crowd the sides of a wide one): fraction of the way round,
  // clockwise from the top, to angle
  function alongEllipse(Rx, Ry) {
    const M = 720, s = [0];
    let px = 0, py = -Ry, L = 0;
    for (let j = 1; j <= M; j++) {
      const a = -Math.PI / 2 + (2 * Math.PI * j) / M, x = Rx * Math.cos(a), y = Ry * Math.sin(a);
      L += Math.hypot(x - px, y - py); s.push(L); px = x; py = y;
    }
    return (f) => {
      const want = (((f % 1) + 1) % 1) * L;
      let lo = 0, hi = M;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (s[mid] <= want) lo = mid; else hi = mid; }
      return -Math.PI / 2 + (2 * Math.PI * (lo + (want - s[lo]) / (s[lo + 1] - s[lo] || 1))) / M;
    };
  }

  class Landscape {
    constructor(el, app, cb) {
      this.el = el; this.app = app; this.cb = cb || {};
      this.sel = null; this.hover = null;
      this.insets = { l: 0, r: 0, t: 0, b: 0 };
      this.pos = null;
      this.reduced = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
      this.build();
      new ResizeObserver(() => this.layout(false)).observe(el);
    }

    /* ---------------------------------------------------------------- DOM */
    build() {
      const { D, byId } = this.app;
      this.themes = D.themeOrder.map((n) => byId.get("th:" + n));
      this.pairs = this.app.themePairs();
      // at rest each theme shows its strongest tie, and any tie of three or more links; pointing at a theme shows all of its ties
      const top = new Set();
      for (const th of this.themes) this.pairs.filter((p) => p.a === th.n || p.b === th.n).slice(0, 1).forEach((p) => top.add(p));
      for (const p of this.pairs) p.rest = top.has(p) || p.w >= 3;
      const maxW = Math.max(1, ...this.pairs.map((p) => p.w));

      this.svg = svg("svg", { class: "ls-lines", "aria-hidden": "true" });
      this.ring = svg("ellipse", { class: "ls-ring" });
      this.bands = D.arcs.map((a, i) => svg("path", { class: "ls-band", stroke: u.logoColor(CHAPTER_TONE[i % 3]), "data-arc": a.id }));
      this.links = this.pairs.map((p) => {
        const path = svg("path", { class: "ls-link", "stroke-width": (1.1 + 2.4 * (p.w / maxW)).toFixed(2) });
        const g = svg("g", { class: "ls-count" }), c = svg("circle", { r: 9 }), t = svg("text", { "text-anchor": "middle", dy: "0.35em" });
        t.textContent = p.w;
        g.append(c, t);
        return Object.assign(p, { path, g });
      });
      this.svg.append(this.ring, ...this.bands, ...this.links.map((p) => p.path), ...this.links.map((p) => p.g));

      const c = byId.get("c");
      this.center = h("button", { class: "ls-center", type: "button", "data-id": "c", onclick: () => this.cb.select && this.cb.select("c") },
        h("span", { class: "ls-q" }, c.label),
        h("span", { class: "ls-full" }, c.question),
        h("span", { class: "ls-sub" }, c.answer ? u.t("landscape.center_answer") : u.t("landscape.center_question")));
      this.bindHover(this.center, "c");

      this.chapters = [];
      this.items = new Map();
      const groups = D.arcs.map((a, i) => {
        const ths = this.themes.filter((t) => t.arc === a.id);
        const cap = h("button", { class: "ls-arc", type: "button", style: { "--c": u.logoColor(CHAPTER_TONE[i % 3]) }, "data-id": "arc:" + a.id,
          onclick: () => this.cb.select && this.cb.select("arc:" + a.id) }, a.label);
        this.bindHover(cap, "arc:" + a.id);
        this.chapters.push({ id: "arc:" + a.id, arc: a.id, el: cap, themes: ths.map((t) => t.n) });
        return h("div", { class: "ls-chapter", role: "group", "aria-label": a.label }, cap, ths.map((th) => this.themeItem(th)));
      });
      this.el.replaceChildren(this.svg, this.center, ...groups);
      this.el.classList.add("intro");
      setTimeout(() => this.el.classList.remove("intro"), 2000);
    }
    themeItem(th) {
      const app = this.app, n = th.topics.length, color = app.themeColor(th.n);
      const disc = h("button", { class: "ls-disc", type: "button", "data-id": th.id, onclick: () => this.cb.select && this.cb.select(th.id) },
        h("span", { class: "ls-num" }, u.t("landscape.theme_n", { n: th.n })),
        h("span", { class: "ls-label" }, th.label),
        h("span", { class: "ls-lead" }, th.lead));
      const down = h("button", { class: "ls-down", type: "button", "aria-label": u.t("landscape.down_label", { n, theme: th.n }),
        onclick: () => this.cb.drill && this.cb.drill(th.id) }, u.t("landscape.down", { n }), h("span", { "aria-hidden": "true" }, " ↓"));
      this.bindHover(disc, th.id);
      this.bindHover(down, th.id);
      const item = h("div", { class: "ls-theme", style: { "--c": color, "--i": this.themes.indexOf(th) }, "data-n": th.n }, disc, down);
      this.items.set(th.n, { th, item, disc, down });
      return item;
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
    setSelected(id) { this.sel = id; this.paint(); }
    setHover(id) { if (id !== this.hover) { this.hover = id; this.paint(); } }
    setInsets(i) {
      const before = JSON.stringify(this.insets);
      Object.assign(this.insets, i);
      if (JSON.stringify(this.insets) !== before) this.layout(true);
    }
    // which themes are in focus: the one pointed at (or open), or a chapter's themes
    focusSet() {
      const id = this.hover || this.sel;
      if (!id || id === "c") return null;
      if (id.startsWith("th:")) return new Set([+id.slice(3)]);
      const ch = this.chapters.find((c) => c.id === id);
      return ch ? new Set(ch.themes) : null;
    }
    paint() {
      const F = this.focusSet(), arcOn = (this.hover || this.sel || "").startsWith("arc:") ? (this.hover || this.sel).slice(4) : null;
      for (const { th, item } of this.items.values()) {
        item.classList.toggle("on", !!F && F.has(th.n));
        item.classList.toggle("dim", !!F && !F.has(th.n));
        item.classList.toggle("sel", this.sel === th.id);
      }
      this.center.classList.toggle("sel", this.sel === "c");
      for (const c of this.chapters) c.el.classList.toggle("on", arcOn === c.arc || (!!F && c.themes.some((n) => F.has(n)) && !arcOn));
      for (const b of this.bands) b.classList.toggle("on", !!F && this.chapters.find((c) => c.arc === b.dataset.arc).themes.some((n) => F.has(n)));
      this.el.classList.toggle("focused", !!F);
      for (const p of this.links) {
        const lit = !!F && (F.has(p.a) || F.has(p.b));
        p.path.setAttribute("class", "ls-link" + (lit ? " lit" : F ? (p.rest ? " faint" : "") : p.rest ? " rest" : ""));
        p.g.setAttribute("class", "ls-count" + (lit ? " lit" : ""));
      }
    }

    /* ---------------------------------------------------------------- layout */
    stacked() { return this.el.clientWidth < 620 || window.matchMedia("(max-width: 820px)").matches; }
    layout(animate) {
      const W = this.el.clientWidth, H = this.el.clientHeight;
      if (!W || !H) return;
      const stack = this.stacked();
      this.el.classList.toggle("stack", stack);
      if (stack) {
        for (const el of [this.center, ...this.chapters.map((c) => c.el), ...[...this.items.values()].map((x) => x.item)]) el.removeAttribute("style");
        for (const { th, item } of this.items.values()) { item.style.setProperty("--c", this.app.themeColor(th.n)); item.style.setProperty("--i", this.themes.indexOf(th)); }
        this.chapters.forEach((c, i) => c.el.style.setProperty("--c", u.logoColor(CHAPTER_TONE[i % 3])));
        this.pos = null;
        this.paint();
        return;
      }
      const I = this.insets, sw = Math.max(200, W - I.l - I.r), sh = Math.max(200, H - I.t - I.b);
      const cx = I.l + sw / 2, cy = I.t + sh / 2;
      const rd = u.clamp(Math.min(sw, sh) * 0.088, 36, 62), pill = 30, capW = 172;
      const Ry = Math.max(rd * 2.2, sh / 2 - rd - pill);
      const Rx = Math.max(Ry * 0.82, Math.min(sw / 2 - rd - 18, Ry * 1.45, sw / 2 - capW - 26));
      const rc = u.clamp(Math.min(Rx, Ry) * 0.46, 54, 112);
      // clockwise from the top: a gap before each chapter for its name, then one slot per theme, all of equal length round the ring
      const D = this.app.D, slot = 1 / (this.themes.length + GAP * D.arcs.length), at = alongEllipse(Rx, Ry);
      let cur = -(GAP * slot) / 2;
      const ang = new Map(), capAng = new Map(), bandAng = new Map();
      for (const a of D.arcs) {
        capAng.set(a.id, at(cur + (GAP * slot) / 2));
        cur += GAP * slot;
        const a0 = cur;
        for (const th of this.themes.filter((t) => t.arc === a.id)) { ang.set(th.n, at(cur + slot / 2)); cur += slot; }
        bandAng.set(a.id, [at(a0) + 0.05, at(cur) - 0.05]);
      }
      const P = (a, f = 1) => [cx + Rx * f * Math.cos(a), cy + Ry * f * Math.sin(a)];
      const target = { cx, cy, Rx, Ry, rd, rc, themes: new Map([...ang].map(([n, a]) => [n, P(a)])), caps: capAng, bands: bandAng };
      if (animate && this.pos && !this.reduced) {
        const from = this.pos, t0 = performance.now(), dur = 380;
        cancelAnimationFrame(this._raf);
        const step = (now) => {
          const p = ease(u.clamp((now - t0) / dur, 0, 1)), L = (a, b) => a + (b - a) * p;
          this.apply({
            cx: L(from.cx, target.cx), cy: L(from.cy, target.cy), Rx: L(from.Rx, target.Rx), Ry: L(from.Ry, target.Ry), rd: L(from.rd, target.rd), rc: L(from.rc, target.rc),
            themes: new Map([...target.themes].map(([n, [x, y]]) => { const f = from.themes.get(n) || [x, y]; return [n, [L(f[0], x), L(f[1], y)]]; })),
            caps: target.caps, bands: target.bands,
          });
          if (p < 1) this._raf = requestAnimationFrame(step);
        };
        this._raf = requestAnimationFrame(step);
      } else this.apply(target);
      this.pos = target;
      this.paint();
    }
    widest(label) {
      this._ww = this._ww || new Map();
      const key = label + (document.fonts ? document.fonts.status : "");
      if (!this._ww.has(key)) {
        const c = (this._ctx = this._ctx || document.createElement("canvas").getContext("2d"));
        c.font = "600 100px Inter, system-ui, sans-serif";
        this._ww.set(key, Math.max(...label.split(/\s+/).map((w) => c.measureText(w).width)) / 100);
      }
      return this._ww.get(key);
    }
    apply(g) {
      const { cx, cy, Rx, Ry, rd, rc } = g;
      this.el.style.setProperty("--rd", rd.toFixed(1) + "px");
      this.el.style.setProperty("--rc", rc.toFixed(1) + "px");
      const P = (a) => [cx + Rx * Math.cos(a), cy + Ry * Math.sin(a)];
      this.ring.setAttribute("cx", cx); this.ring.setAttribute("cy", cy); this.ring.setAttribute("rx", Rx); this.ring.setAttribute("ry", Ry);
      for (const b of this.bands) {
        const [a0, a1] = g.bands.get(b.dataset.arc), [x0, y0] = P(a0), [x1, y1] = P(a1);
        b.setAttribute("d", `M${x0.toFixed(1)},${y0.toFixed(1)} A${Rx.toFixed(1)},${Ry.toFixed(1)} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1.toFixed(1)},${y1.toFixed(1)}`);
      }
      Object.assign(this.center.style, { left: cx - rc + "px", top: cy - rc + "px", width: 2 * rc + "px", height: 2 * rc + "px" });
      for (const [n, { item, th }] of this.items) {
        const [x, y] = g.themes.get(n), d = Math.hypot(x - cx, y - cy) || 1;
        item.style.left = x - rd + "px"; item.style.top = y - rd + "px";
        // its "N prompts" pill points away from the question, so it never sits between two themes
        item.style.setProperty("--ux", ((x - cx) / d).toFixed(3));
        item.style.setProperty("--uy", ((y - cy) / d).toFixed(3));
        // the longest word has to fit across the disc ("biofabrication", "environments")
        item.style.setProperty("--fs", u.clamp(Math.min(rd * 0.232, (1.62 * rd - 6) / this.widest(th.label)), 9, 15.5).toFixed(2) + "px");
      }
      // a chapter's name sits in the gap before its first theme, outside the ring
      for (const c of this.chapters) {
        const a = g.caps.get(c.arc), [x, y] = P(a), co = Math.cos(a), el = c.el;
        el.classList.remove("cap-l", "cap-r", "cap-t", "cap-b");
        if (co > 0.35) { el.classList.add("cap-r"); Object.assign(el.style, { left: x + 14 + "px", top: y + "px" }); }
        else if (co < -0.35) { el.classList.add("cap-l"); Object.assign(el.style, { left: x - 14 + "px", top: y + "px" }); }
        else if (Math.sin(a) < 0) { el.classList.add("cap-t"); Object.assign(el.style, { left: x + "px", top: y - 12 + "px" }); }
        else { el.classList.add("cap-b"); Object.assign(el.style, { left: x + "px", top: y + 12 + "px" }); }
      }
      // the ties between themes bow towards the question
      for (const p of this.links) {
        const [ax, ay] = g.themes.get(p.a), [bx, by] = g.themes.get(p.b);
        const mx = (ax + bx) / 2, my = (ay + by) / 2, qx = cx + (mx - cx) * 0.3, qy = cy + (my - cy) * 0.3;
        p.path.setAttribute("d", `M${ax.toFixed(1)},${ay.toFixed(1)} Q${qx.toFixed(1)},${qy.toFixed(1)} ${bx.toFixed(1)},${by.toFixed(1)}`);
        p.g.setAttribute("transform", `translate(${(0.25 * ax + 0.5 * qx + 0.25 * bx).toFixed(1)},${(0.25 * ay + 0.5 * qy + 0.25 * by).toFixed(1)})`);
      }
    }
  }
  RM.Landscape = Landscape;
})();
