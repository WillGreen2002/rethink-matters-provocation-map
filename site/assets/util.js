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

  u.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  u.plural = (n, a, b) => `${n} ${n === 1 ? a : b || a + "s"}`;
  u.store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode etc. */ } },
  };
})();
