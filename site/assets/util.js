/* Small helpers: DOM builder, colour maths (incl. the logo gradient), mini-Markdown, text wrapping. */
(function () {
  const RM = (window.RM = window.RM || {});
  const u = (RM.u = {});

  const SVG_TAGS = new Set(["svg", "path", "circle", "g", "line", "rect"]);
  u.h = function h(tag, attrs, ...kids) {
    const el = SVG_TAGS.has(tag) ? document.createElementNS("http://www.w3.org/2000/svg", tag) : document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === "class") el.setAttribute("class", v);
        else if (k === "style" && typeof v === "object") {
          for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith("--")) el.style.setProperty(sk, sv); else el.style[sk] = sv; }
        }
        else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
        else if (k === "html") el.innerHTML = v;
        else el.setAttribute(k, v === true ? "" : v);
      }
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  };

  u.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  u.lerp = (a, b, t) => a + (b - a) * t;
  u.hash = (s) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };

  u.rgb = (hex) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex);
    const n = parseInt(m ? m[1] : "666666", 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  u.rgba = (hex, a) => { const [r, g, b] = u.rgb(hex); return `rgba(${r},${g},${b},${a})`; };
  u.mix = (h1, h2, t) => {
    const a = u.rgb(h1), b = u.rgb(h2);
    return "#" + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, "0")).join("");
  };

  // the logo's gradient (same stops as the site's mark and its 'shared aims' hub ring)
  u.LOGO = [[0, "#e7cfab"], [0.2, "#eab55c"], [0.35, "#a04340"], [0.5, "#983836"], [0.65, "#aa6336"], [0.8, "#7f8c64"], [1, "#48909f"]];
  u.logoColor = (t) => {
    t = u.clamp(t, 0, 1);
    for (let i = 1; i < u.LOGO.length; i++) {
      if (t <= u.LOGO[i][0]) {
        const [t0, c0] = u.LOGO[i - 1], [t1, c1] = u.LOGO[i];
        return u.mix(c0, c1, (t - t0) / (t1 - t0));
      }
    }
    return u.LOGO[u.LOGO.length - 1][1];
  };

  // each theme takes a colour from the logo's gradient, in ring order (the same colours on every level)
  u.themeColor = (order, n) => u.logoColor(0.11 + 0.86 * (Math.max(0, order.indexOf(n)) / Math.max(1, order.length - 1)));
  u.CHAPTER_TONE = [0.2, 0.6, 0.97];   // the three chapters take three points of the same gradient

  // points spaced evenly along an ellipse (equal angles would crowd the sides of a wide one): fraction of the way round,
  // clockwise from the top, to the angle that puts a point there
  u.alongEllipse = function alongEllipse(Rx, Ry) {
    const M = 720, s = [0];
    let px = 0, py = -Ry, L = 0;
    for (let j = 1; j <= M; j++) {
      const a = -Math.PI / 2 + (2 * Math.PI * j) / M, x = Rx * Math.cos(a), y = Ry * Math.sin(a);
      L += Math.hypot(x - px, y - py); s.push(L); px = x; py = y;
    }
    const at = (f) => {
      const want = (((f % 1) + 1) % 1) * L;
      let lo = 0, hi = M;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (s[mid] <= want) lo = mid; else hi = mid; }
      return -Math.PI / 2 + (2 * Math.PI * (lo + (want - s[lo]) / (s[lo + 1] - s[lo] || 1))) / M;
    };
    at.total = L;   // the ellipse's length (a function's own .length cannot be set)
    return at;
  };

  u.MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  u.fmtDate = (iso) => {
    if (!iso) return "";
    const [y, m, d] = iso.split("-").map(Number);
    return `${d} ${u.MONTHS[m - 1]} ${y}`;
  };

  // ---- inline markdown: **bold**, *italic*, [text](https://…)
  u.inline = function inline(s) {
    const out = [];
    const re = /(\*\*[^*]+\*\*|\*[^*\n]+\*|\[[^\]]+\]\(https?:[^)]+\))/g;
    let last = 0, m;
    while ((m = re.exec(s))) {
      if (m.index > last) out.push(s.slice(last, m.index));
      const t = m[0];
      if (t.startsWith("**")) out.push(u.h("strong", null, t.slice(2, -2)));
      else if (t.startsWith("*")) out.push(u.h("em", null, t.slice(1, -1)));
      else {
        const mm = /\[([^\]]+)\]\((https?:[^)]+)\)/.exec(t);
        out.push(u.h("a", { href: mm[2], target: "_blank", rel: "noopener noreferrer" }, mm[1]));
      }
      last = m.index + t.length;
    }
    if (last < s.length) out.push(s.slice(last));
    return out;
  };

  // ---- block markdown: paragraphs + nested "- " bullets (2-space indent)
  u.md = function md(src) {
    const wrap = u.h("div", { class: "md" });
    const stack = [];
    for (const raw of (src || "").replace(/\r/g, "").split("\n")) {
      if (!raw.trim()) { stack.length = 0; continue; }
      const m = /^(\s*)- (.*)$/.exec(raw);
      if (m) {
        const indent = m[1].length;
        const li = u.h("li", null, ...u.inline(m[2]));
        while (stack.length && stack[stack.length - 1].indent > indent) stack.pop();
        if (!stack.length || stack[stack.length - 1].indent < indent) {
          const ul = u.h("ul");
          if (!stack.length) wrap.append(ul);
          else (stack[stack.length - 1].lastLi || wrap).append(ul);
          stack.push({ indent, ul, lastLi: null });
        }
        const top = stack[stack.length - 1];
        top.ul.append(li);
        top.lastLi = li;
      } else {
        stack.length = 0;
        wrap.append(u.h("p", null, ...u.inline(raw.trim())));
      }
    }
    return wrap;
  };

  u.wrap = function wrap(ctx, text, maxW) {
    const words = String(text).split(/\s+/);
    const lines = [];
    let cur = "";
    for (const w of words) {
      const t = cur ? cur + " " + w : w;
      if (!cur || ctx.measureText(t).width <= maxW) cur = t;
      else { lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    return lines;
  };

  // wording from curation/copy.yaml (published as RM_DATA.copy), by dotted key; {name} placeholders are filled from `vars`
  u.t = function t(key, vars) {
    let v = key.split(".").reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), (window.RM_DATA || {}).copy);
    if (v == null) { if (window.console) console.warn("copy: missing " + key); return ""; }
    if (typeof v === "string" && vars) v = v.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
    return v;
  };

  // one click opens, two go down: a mouse or touch click waits a moment to see whether a second one follows (a keyboard press,
  // which has no click count, acts at once). Shared by the Landscape's themes and the Regime's prompts. A third click does nothing.
  let pressT = null;
  RM.press = function press(e, one, two) {
    clearTimeout(pressT);
    if (!e || !e.detail) { pressT = null; one(); return; }
    if (e.detail === 2) { pressT = null; two(); return; }
    if (e.detail > 2) { pressT = null; return; }
    pressT = setTimeout(() => { pressT = null; one(); }, 260);
  };
  // anything else that moves the map (a key, Up, Back, the level bar) drops a single click still waiting to act
  RM.press.cancel = () => { clearTimeout(pressT); pressT = null; };
  // a double click counts only on what its first click hit. Opening a note (or moving across) shifts the map between the two
  // clicks, so a slow second click can land on another prompt or theme: it must not act there.
  const hitOf = (t) => (t && t.closest ? t.closest("button, a, summary, input, label, [role=button]") : null) || t;
  let firstHit = null;
  document.addEventListener("click", (e) => {
    if (e.detail <= 1) { firstHit = e.detail === 1 ? hitOf(e.target) : null; return; }
    if (hitOf(e.target) !== firstHit) { e.stopImmediatePropagation(); e.preventDefault(); }
  }, true);

  // ---- text inside a circle, checked on the page itself (fonts, zoom and hyphenation all change how wide words are drawn):
  // every line must sit within the circle at its own height, both ends, top and bottom
  u.textInCircle = function textInCircle(circle, text, pad) {
    const c = circle.getBoundingClientRect();
    if (!c.width) return true;
    const cx = c.left + c.width / 2, cy = c.top + c.height / 2, r = c.width / 2 - (pad == null ? 3 : pad);
    const range = document.createRange();
    range.selectNodeContents(text);
    for (const L of range.getClientRects()) {
      if (!L.width || !L.height) continue;
      const dy = Math.max(Math.abs(L.top - cy), Math.abs(L.bottom - cy));
      if (dy > r) return false;
      const half = Math.sqrt(r * r - dy * dy);
      if (L.left < cx - half - 0.5 || L.right > cx + half + 0.5) return false;
    }
    return true;
  };
  // one type size for a set of circles: start at fs, and step down (to a floor) until every text sits inside its circle
  u.shrinkToFit = function shrinkToFit(pairs, set, fs, min) {
    set(fs);
    while (fs > min && pairs.some(([c, t]) => !u.textInCircle(c, t))) { fs = Math.max(min, fs - 0.5); set(fs); }
    return fs;
  };

  u.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  u.plural = (n, a, b) => `${n} ${n === 1 ? a : b || a + "s"}`;
  u.store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode etc. */ } },
  };
})();
