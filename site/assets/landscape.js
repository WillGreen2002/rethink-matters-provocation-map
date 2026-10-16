/* The Landscape level, the top of the descent: the nine themes round the question, clockwise from theme 1 at the top right, each
   chapter heading its run of themes, and dashed lines between themes whose prompts are linked. A theme's arrow goes down to it.
   Built from real buttons over a decorative SVG, so it works with a keyboard and a screen reader and needs no second animation loop.
   On a phone the ring becomes a list of cards. */
(function () {
  const RM = (window.RM = window.RM || {});
  const { u } = RM;
  const h = u.h;
  const NS = "http://www.w3.org/2000/svg";
  const CHAPTER_TONE = u.CHAPTER_TONE;
  const GAP = 0.9;                         // the gap before each chapter, in theme slots (its caption sits there)
  const svg = (tag, attrs) => { const el = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v); return el; };
  const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
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
      const disc = h("button", { class: "ls-disc", type: "button", "data-id": th.id, onclick: (e) => RM.press(e, () => this.cb.select && this.cb.select(th.id), () => this.cb.drill && this.cb.drill(th.id)) },
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
    // cards rather than the ring: on a phone, or when the room left beside an open note (and the left panel) is too narrow for it
    // (the width is the one the stage is heading for, insets.w, so a side panel still sliding does not flash the cards)
    stacked() { const I = this.insets || {}, W = I.w || this.el.clientWidth; return W < 620 || W - (I.l || 0) - (I.r || 0) < 520 || window.matchMedia("(max-width: 820px)").matches; }
    layout(animate, noRoom) {
      const W = this.insets.w || this.el.clientWidth, H = this.el.clientHeight;
      if (!W || !H) return;
      const stack = noRoom || this.stacked();
      this.el.classList.toggle("stack", stack);
      if (stack) {
        cancelAnimationFrame(this._raf);   // a ring still easing into place must not write over the cards
        for (const el of [this.center, ...this.chapters.map((c) => c.el), ...[...this.items.values()].map((x) => x.item)]) el.removeAttribute("style");
        for (const { th, item } of this.items.values()) { item.style.setProperty("--c", this.app.themeColor(th.n)); item.style.setProperty("--i", this.themes.indexOf(th)); }
        this.chapters.forEach((c, i) => c.el.style.setProperty("--c", u.logoColor(CHAPTER_TONE[i % 3])));
        const I = this.insets || {}, phone = window.matchMedia("(max-width: 820px)").matches;
        this.el.style.padding = phone ? "" : `${(I.tc != null ? I.tc : I.t || 0) + 4}px ${(I.r || 0) + 14}px ${(I.b || 0) + 24}px ${(I.l || 0) + 14}px`;
        this.pos = null;
        this.paint();
        return;
      }
      this.el.style.padding = "";
      const I = this.insets, sw = Math.max(200, W - I.l - I.r), sh = Math.max(200, H - I.t - I.b);
      const cx = I.l + sw / 2, cy = I.t + sh / 2;
      const need = this.labelFit();   // the smallest disc the names fit in
      const rd0 = Math.max(u.clamp(Math.min(sw, sh) * 0.088, 36, 62), need), pill = 30;
      // the chapters' names sit beside the ring (wrapping when room is short), and each theme's "N prompts" pill points outwards:
      // the ring is never wider than they allow, and in a narrow room it grows less tall rather than push them out of view
      const capW = Math.round(u.clamp(sw * 0.2, 112, 172));
      this.el.style.setProperty("--capw", capW + "px");
      const RxMax = Math.min(sw / 2 - rd0 - 102, sw / 2 - capW - 26);
      let Ry = Math.max(rd0 * 2.2, sh / 2 - rd0 - pill);
      if (Ry * 0.82 > RxMax) Ry = Math.max(rd0 * 2.2, RxMax / 0.82);
      let Rx = Math.max(Ry * 0.82, Math.min(sw / 2 - rd0 - 18, Ry * 1.45, RxMax));
      const D = this.app.D, slot = 1 / (this.themes.length + GAP * D.arcs.length);
      let at = u.alongEllipse(Rx, Ry);
      // a short window: the ring grows wider (up to twice as wide as tall) rather than shrink its discs below their names
      const RxTop = Math.min(RxMax, sw / 2 - rd0 - 18, Ry * 2);
      while ((at.total * slot) / 2.3 < need && Rx < RxTop - 0.5) { Rx = Math.min(Rx + 8, RxTop); at = u.alongEllipse(Rx, Ry); }
      // each theme's slot round the ring holds its disc with a little air between neighbours; and no smaller than the names need
      const rd = Math.max(26, Math.min(rd0, (at.total * slot) / 2.3));
      if (rd < need - 0.01) return this.layout(animate, true);
      const rc = u.clamp(Math.min(Rx, Ry) * 0.46, 54, 112);
      // clockwise from the top: a gap before each chapter for its name, then one slot per theme, all of equal length round the ring
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
          else this.fitText(target);
        };
        this._raf = requestAnimationFrame(step);
      } else { this.apply(target); this.fitText(target); }
      this.pos = target;
      this.paint();
    }
    widest(label) {
      this._ww = this._ww || new Map();
      const key = label + (document.fonts ? document.fonts.status : "");
      if (!this._ww.has(key)) {
        const c = (this._ctx = this._ctx || document.createElement("canvas").getContext("2d"));
        c.font = "600 100px Inter, system-ui, sans-serif";
        this._ww.set(key, Math.max(...label.split(/\s+|(?<=[-–])/).map((w) => c.measureText(w).width)) / 100);
      }
      return this._ww.get(key);
    }
    // the smallest disc radius at which every theme's name fits at 9px under its THEME N line (pieces break at spaces, hyphens and
    // en dashes): a ring with smaller discs would spill its names, so the Landscape shows cards instead
    labelFit() {
      const k = document.fonts ? document.fonts.status : "";
      if (this._fitK === k) return this._fit;
      const c = (this._ctx = this._ctx || document.createElement("canvas").getContext("2d"));
      c.font = "600 100px Inter, system-ui, sans-serif";
      const sp = c.measureText(" ").width / 100;
      const names = [...this.items.values()].map(({ th }) => String(th.label).split(/\s+/).flatMap((w) => w.split(/(?<=[-\u2013])/).map((p, i) => [c.measureText(p).width / 100, !i])));
      const fits = (ws, r) => {
        const inner = 1.62 * r - 6, fs = 8.5;
        if (Math.max(...ws.map(([w]) => w)) * fs > inner) return false;
        let lines = 1, line = 0;
        for (const [w, spaced] of ws) { const add = (line && spaced ? sp : 0) + w; if (line && (line + add) * fs > inner) { lines++; line = w; } else line += add; }
        return lines * fs * 1.15 + Math.max(8.5, r * 0.165) * 1.3 + 2 <= 1.5 * r;
      };
      let r = 26;
      while (r < 62 && !names.every((ws) => fits(ws, r))) r++;
      this._fitK = k; this._fit = r;
      return r;
    }
    // once the ring has settled: every theme's name in one size, stepped down until each sits inside its disc as the page draws it,
    // and the question in the middle likewise
    fitText(g) {
      const { rd, rc } = g;
      const fs0 = u.clamp(Math.min(rd * 0.232, ...[...this.items.values()].map(({ th }) => (1.62 * rd - 6) / this.widest(th.label))), 9, 15.5);
      const pairs = [...this.items.values()].map(({ disc }) => [disc, disc]);
      u.shrinkToFit(pairs, (fs) => this.el.style.setProperty("--fsl", fs.toFixed(2) + "px"), fs0, 8);
      this.center.classList.toggle("tight", rc < 70);
      u.shrinkToFit([[this.center, this.center]], (fs) => this.el.style.setProperty("--fsq", fs.toFixed(1) + "px"), Math.max(13, rc * 0.2), 10);
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
      }
      // a chapter's name sits in the gap before its first theme, outside the ring, and is eased further out if it would touch
      // a theme or a theme's "N prompts" pill (a compact ring, on a small screen or beside an open note)
      const pills = [];
      for (const [n, { item }] of this.items) {
        const d = item.querySelector(".ls-down");
        if (!d || !d.offsetWidth) continue;
        const [x, y] = g.themes.get(n), q = Math.hypot(x - cx, y - cy) || 1, ux = (x - cx) / q, uy = (y - cy) / q, w = d.offsetWidth, hh = d.offsetHeight;
        const px = x + ux * (rd + 6) + (ux * w) / 2, py = y + uy * (rd + 6) + (uy * hh) / 2;
        pills.push([px - w / 2, py - hh / 2, px + w / 2, py + hh / 2]);
      }
      const discs = [...g.themes.values()];
      for (const c of this.chapters) {
        const a = g.caps.get(c.arc), [x, y] = P(a), co = Math.cos(a), el = c.el;
        el.classList.remove("cap-l", "cap-r", "cap-t", "cap-b");
        const side = co > 0.35 ? "r" : co < -0.35 ? "l" : Math.sin(a) < 0 ? "t" : "b";
        el.classList.add("cap-" + side);
        const w = el.offsetWidth, hh = el.offsetHeight;
        // its box for a given push outwards, and the push that clears every pill it would touch
        const box = (k) => (side === "r" ? [x + 14 + k, y - hh / 2, x + 14 + k + w, y + hh / 2] : side === "l" ? [x - 14 - k - w, y - hh / 2, x - 14 - k, y + hh / 2]
          : side === "t" ? [x - w / 2, y - 12 - k - hh, x + w / 2, y - 12 - k] : [x - w / 2, y + 12 + k, x + w / 2, y + 12 + k + hh]);
        const hit = (B) => pills.some((p) => B[0] < p[2] + 4 && p[0] < B[2] + 4 && B[1] < p[3] + 3 && p[1] < B[3] + 3)
          || discs.some(([dx, dy]) => Math.hypot(Math.max(B[0] - dx, 0, dx - B[2]), Math.max(B[1] - dy, 0, dy - B[3])) < rd + 4);
        let k = 0;
        while (k < 120 && hit(box(k))) k += 3;
        if (side === "r") Object.assign(el.style, { left: x + 14 + k + "px", top: y + "px" });
        else if (side === "l") Object.assign(el.style, { left: x - 14 - k + "px", top: y + "px" });
        else if (side === "t") Object.assign(el.style, { left: x + "px", top: y - 12 - k + "px" });
        else Object.assign(el.style, { left: x + "px", top: y + 12 + k + "px" });
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
