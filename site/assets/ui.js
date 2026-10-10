/* Orchestration: left panel (search · colour · layers · filters · threads · index), selection + panel, threads, routing. */
(function () {
  const RM = (window.RM = window.RM || {});
  const { u } = RM;
  const h = u.h;
  const D = window.RM_DATA;
  const $ = (s, r) => (r || document).querySelector(s);
  const body = document.body;
  if (/[?&]embed\b/.test(location.search)) body.classList.add("embed");
  const mobile = () => window.matchMedia("(max-width: 820px)").matches;

  /* ------------------------------------------------------------------ indexes */
  const byId = new Map(D.nodes.map((n) => [n.id, n]));
  const topics = D.nodes.filter((n) => n.kind === "topic");
  const themes = D.nodes.filter((n) => n.kind === "theme");
  const tags = D.nodes.filter((n) => n.kind === "tag");
  const discs = D.nodes.filter((n) => n.kind === "discussion");
  const relLinks = D.links.filter((l) => l.kind === "rel");
  const relBy = new Map();
  for (const l of relLinks) for (const [self, other] of [[l.s, l.t], [l.t, l.s]]) (relBy.get(self) || relBy.set(self, []).get(self)).push({ other, link: l });
  for (const arr of relBy.values()) arr.sort((a, b) => (b.link.curated - a.link.curated) || (b.link.score - a.link.score));

  const S = {
    tab: "explore", mode: "pillar", sel: null, hist: [], thread: null, q: "",
    filters: { scale: new Set(), wg: new Set(), pillar: new Set(), value: new Set(), tags: new Set() },
    layers: { disc: true, tags: false, books: false, tagFacets: new Set(Object.keys(D.facets)) },
    minScore: D.defaultMinScore, curatedOnly: false, searchSet: null,
  };
  const FACET_COLOR = { tension: "#A04340", concept: "#48909F", barrier: "#7F8C64", domain: "#D9A441", method: "#8A8577" };

  /* ------------------------------------------------------------------ left panel scaffolding */
  const left = $("#left");
  const searchInput = h("input", { type: "search", id: "q", placeholder: "Search prompts, tags, discussions…", autocomplete: "off", "aria-label": "Search the map", spellcheck: "false" });
  const results = h("div", { class: "results", role: "listbox" });
  const clearBtn = h("button", { class: "clr", "aria-label": "Clear search", onclick: () => { searchInput.value = ""; onSearch(); searchInput.focus(); } }, "✕");
  const searchBox = h("div", { class: "search" },
    h("svg", { class: "ico", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.8", "stroke-linecap": "round", html: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>' }),
    searchInput, clearBtn, results);
  const panes = { explore: h("div", { id: "pane-explore" }), threads: h("div", { id: "pane-threads", hidden: true }), index: h("div", { id: "pane-index", hidden: true }) };
  const tabBtns = {};
  const tabsEl = h("div", { class: "tabs", role: "tablist" },
    ...[["explore", "Explore"], ["threads", "Threads"], ["index", "Index"]].map(([k, label]) =>
      (tabBtns[k] = h("button", { role: "tab", "aria-selected": k === "explore" ? "true" : "false", onclick: () => setTab(k) }, label))));
  left.append(
    h("div", { class: "title-block" },
      h("h1", null, "Provocation map"),
      h("p", null, "Nine themes, sixty prompts and the discussions behind them — all pointing back to one question. Click anything to open its notes."),
      h("div", { class: "stats" }, ...[[themes.length, "themes"], [topics.length, "prompts"], [discs.length, "discussions"], [tags.length, "tags"]].map(([n, l]) => h("span", null, h("b", null, n), " " + l)))),
    searchBox, tabsEl, panes.explore, panes.threads, panes.index);

  function setTab(k) {
    S.tab = k;
    for (const [key, el] of Object.entries(panes)) el.hidden = key !== k;
    for (const [key, el] of Object.entries(tabBtns)) el.setAttribute("aria-selected", key === k ? "true" : "false");
  }

  /* ------------------------------------------------------------------ view */
  const view = new RM.View($("#cv"), D, {
    onPick: (id) => {
      if (!id) { if (S.thread) return; deselect(); return; }
      if (S.thread && !S.thread.t.steps.some((s) => s.topic === id)) endThread();
      select(id);
    },
    onHover: (n, px, py) => showTip(n, px, py),
    onInteract: () => { S.touched = true; },   // once the visitor has moved the map themselves, stop re-fitting it on resize
  });

  const app = {
    D, byId, topics, view, S,
    colorOf: (id) => { const n = view.byId.get(id); return n ? n.colors[0] : "#9C978A"; },
    relOf: (id) => relBy.get(id) || [],
    select: (id, o) => select(id, o),
    filterBy: (lens, key) => { toggleFilter(lens, key, true); },
    filterByTag: (tid) => { S.filters.tags.add(tid); openLeft(); setTab("explore"); applyFilters(true); },
    startThread: (id) => startThread(id),
    themeReach: (n) => {
      const c = {};
      for (const l of relLinks) {
        if (!(l.curated || l.score >= S.minScore)) continue;
        const a = byId.get(l.s).theme, b = byId.get(l.t).theme;
        if (a === n && b !== n) c[b] = (c[b] || 0) + 1; else if (b === n && a !== n) c[a] = (c[a] || 0) + 1;
      }
      return Object.entries(c).map(([theme, count]) => ({ theme: +theme, count })).sort((x, y) => y.count - x.count);
    },
  };

  /* ------------------------------------------------------------------ explore pane */
  const sec = (title, ...kids) => h("section", { class: "sec" }, h("h3", null, title), ...kids);
  const chip = (label, o = {}) => h("button", Object.assign({ class: "chip" + (o.cls ? " " + o.cls : ""), "aria-pressed": o.pressed ? "true" : "false", style: o.color ? { "--c": o.color } : null, title: o.title, onclick: o.onclick },
    o.color ? { } : {}), o.color ? h("i", { class: "dot" }) : null, label, o.count != null ? h("span", { class: "n" }, o.count) : null);

  // colour-by
  const MODES = [["pillar", "Pillar"], ["scale", "Scale"], ["wg", "Working group"], ["value", "Value"], ["theme", "Theme"]];
  const modeBtns = {};
  const modeSeg = h("div", { class: "seg" }, MODES.map(([k, label]) => (modeBtns[k] = chip(label, { pressed: k === S.mode, onclick: () => setMode(k) }))));
  const modeHint = h("p", { class: "hint" });
  const legendEl = h("div", { class: "legend-inline", id: "legend", "aria-label": "Legend" });
  function setMode(k) {
    S.mode = k;
    for (const [key, el] of Object.entries(modeBtns)) el.setAttribute("aria-pressed", key === k ? "true" : "false");
    view.configure({ mode: k });
    modeHint.textContent = k === "theme" ? "Each theme takes its own colour." : D.lenses[k].question + " " + (k === "wg" ? "Dashed chips in a note mean the map proposed the group." : "");
    renderLegend(); refreshIndexColors();
  }

  // layers
  const tagFacetRow = h("div", { class: "seg", style: { margin: "4px 0 6px 0", display: "none" } },
    Object.entries(D.facets).map(([k, f]) => chip(f.label, { color: FACET_COLOR[k], pressed: true, title: f.question, onclick: (e) => {
      const el = e.currentTarget, on = el.getAttribute("aria-pressed") !== "true";
      el.setAttribute("aria-pressed", on ? "true" : "false");
      on ? S.layers.tagFacets.add(k) : S.layers.tagFacets.delete(k);
      pushLayers();
    } })));
  function layerRow(key, label, sub, checked) {
    const input = h("input", { type: "checkbox", id: "lay-" + key, onchange: () => { S.layers[key] = input.checked; if (key === "tags") tagFacetRow.style.display = input.checked ? "flex" : "none"; pushLayers(); } });
    input.checked = checked;
    return h("div", { class: "row" }, h("label", { for: "lay-" + key }, label, h("small", null, sub)), h("span", { class: "switch" }, input, h("i")));
  }
  function pushLayers() { view.configure({ layers: { disc: S.layers.disc, tags: S.layers.tags, books: S.layers.books, tagFacets: S.layers.tagFacets } }); updateLinkCount(); }

  // link strength
  const rangeMin = 2.6, rangeMax = 9;
  const slider = h("input", { type: "range", min: rangeMin, max: rangeMax, step: 0.2, value: S.minScore, "aria-label": "Link strength", oninput: () => { S.minScore = +slider.value; view.configure({ minScore: S.minScore }); updateLinkCount(); } });
  const linkCount = h("span");
  const curOnly = h("input", { type: "checkbox", id: "curonly", onchange: () => { S.curatedOnly = curOnly.checked; view.configure({ curatedOnly: S.curatedOnly }); updateLinkCount(); } });
  function updateLinkCount() {
    const n = relLinks.filter((l) => S.curatedOnly ? l.curated : (l.curated || l.score >= S.minScore)).length;
    linkCount.textContent = `${n} links between prompts`;
  }

  // filters
  const lensChipsEl = {}, tagChipsEl = {};
  function lensCount(lens, key) { return topics.filter((t) => t[lens].includes(key)).length; }
  const lensBlocks = ["scale", "pillar", "value", "wg"].map((lens) => {
    const L = D.lenses[lens];
    lensChipsEl[lens] = {};
    return h("div", { style: { marginBottom: "14px" } },
      h("div", { style: { fontSize: "13px", fontWeight: 500, marginBottom: "6px" } }, L.label, h("span", { style: { color: "var(--faint)", fontWeight: 400 } }, " — " + L.question.replace(/\?$/, ""))),
      h("div", { class: "seg" }, Object.entries(L.values).map(([k, v]) =>
        (lensChipsEl[lens][k] = chip(v.short || v.label, { color: v.color, count: lensCount(lens, k), title: v.def || v.q, onclick: () => toggleFilter(lens, k) })))));
  });
  const facetBlocks = Object.entries(D.facets).map(([fk, f]) => {
    const list = tags.filter((t) => t.facet === fk).sort((a, b) => b.topics.length - a.topics.length);
    tagChipsEl[fk] = {};
    return h("details", { class: "facet" }, h("summary", null, h("span", null, f.label), h("small", null, list.length + " tags")),
      h("p", { class: "q" }, f.question + " " + f.blurb),
      h("div", { class: "seg" }, list.map((t) => (tagChipsEl[fk][t.id] = chip(t.label, { color: FACET_COLOR[fk], count: t.topics.length, title: t.def, onclick: () => toggleTag(t.id) })))));
  });
  const matchLine = h("div", { class: "matchline" });
  panes.explore.append(
    sec("Colour by", modeSeg, modeHint, legendEl),
    sec("Layers",
      layerRow("disc", "Discussions", "Grey dots — each provocation as aired, with its notes", S.layers.disc),
      layerRow("tags", "Tags as nodes", "See what ties prompts together; switch off to declutter", S.layers.tags),
      tagFacetRow,
      layerRow("books", "Bookshelf", "Suggested reading from the group’s shelf", S.layers.books)),
    sec("Links", h("div", { class: "range-meta" }, h("span", null, "More"), linkCount, h("span", null, "Fewer")), slider,
      h("div", { class: "row", style: { paddingBottom: 0 } }, h("label", { for: "curonly" }, "Hand-written bridges only", h("small", null, "Each has a one-line reason")), h("span", { class: "switch" }, curOnly, h("i")))),
    sec("Filter by lens", ...lensBlocks, h("p", { class: "hint" }, "Within a lens: any of the selected. Across lenses and tag families: all. Everything else dims.")),
    sec("Filter by tag", h("div", null, facetBlocks)),
    matchLine,
    h("div", { style: { display: "flex", gap: "8px", marginTop: "14px", flexWrap: "wrap" } },
      h("button", { class: "btn", onclick: () => { clearFilters(); } }, "Clear filters"),
      h("button", { class: "btn ghost", onclick: () => view.fit(true) }, "Fit whole map"),
      h("button", { class: "btn ghost", onclick: () => view.sim.reheat(0.9) }, "Re-settle")));

  /* ------------------------------------------------------------------ filtering */
  function toggleFilter(lens, key, reveal) {
    const set = S.filters[lens];
    set.has(key) ? set.delete(key) : set.add(key);
    if (reveal) { openLeft(); setTab("explore"); }
    applyFilters(true);
  }
  function toggleTag(tid) { S.filters.tags.has(tid) ? S.filters.tags.delete(tid) : S.filters.tags.add(tid); applyFilters(true); }
  function clearFilters() { for (const s of Object.values(S.filters)) s.clear(); searchInput.value = ""; S.q = ""; S.searchSet = null; searchBox.classList.remove("has-text"); closeResults(); applyFilters(); if (!S.sel && !S.thread) view.fit(true); }
  function computeMatch() {
    const F = S.filters;
    const lensActive = ["scale", "wg", "pillar", "value"].filter((l) => F[l].size);
    const byFacet = {};
    for (const t of F.tags) (byFacet[byId.get(t).facet] = byFacet[byId.get(t).facet] || new Set()).add(t);
    const facetKeys = Object.keys(byFacet);
    if (!lensActive.length && !facetKeys.length && !S.searchSet) return null;
    const out = new Set();
    for (const t of topics) {
      if (S.searchSet && !S.searchSet.has(t.id)) continue;
      if (lensActive.some((l) => !t[l].some((v) => F[l].has(v)))) continue;
      if (facetKeys.some((f) => !t.tags.some((x) => byFacet[f].has(x)))) continue;
      out.add(t.id);
    }
    return out;
  }
  function applyFilters(move) {
    const set = computeMatch();
    view.setMatch(set);
    for (const lens of Object.keys(lensChipsEl)) for (const [k, el] of Object.entries(lensChipsEl[lens])) el.setAttribute("aria-pressed", S.filters[lens].has(k) ? "true" : "false");
    for (const fk of Object.keys(tagChipsEl)) {
      let any = false;
      for (const [tid, el] of Object.entries(tagChipsEl[fk])) { const on = S.filters.tags.has(tid); el.setAttribute("aria-pressed", on ? "true" : "false"); any = any || on; }
      if (any) tagChipsEl[fk][Object.keys(tagChipsEl[fk])[0]].closest("details").open = true;
    }
    matchLine.replaceChildren();
    if (set) {
      const real = [...set].filter((id) => id !== "__none__");
      matchLine.append(h("span", null, h("b", null, real.length), ` of ${topics.length} prompts match`));
      if (!real.length) matchLine.append(h("span", null, "Try removing a filter."));
      if (move && real.length) { S.touched = true; notice(`${real.length} prompt${real.length === 1 ? "" : "s"} match — the rest are dimmed`); view.flyToSet(real, 0.3, 1.1); }
    }
  }
  let noticeT;
  function notice(msg) {
    const el = $("#notice");
    el.textContent = msg; el.classList.add("show");
    clearTimeout(noticeT); noticeT = setTimeout(() => el.classList.remove("show"), 3600);
  }

  /* ------------------------------------------------------------------ search */
  const searchIndex = [];
  for (const n of D.nodes) {
    if (n.kind === "center") continue;
    const label = n.label + (n.kind === "theme" ? " " + n.title : "");
    const extra = n.kind === "topic" ? n.text : n.kind === "tag" ? n.def : n.kind === "theme" ? n.lead : n.kind === "discussion" ? (n.texts.map((t) => t.paras.join(" ")).join(" ") + " " + n.notes) : n.author || "";
    searchIndex.push({ id: n.id, kind: n.kind, label: n.label, hay1: label.toLowerCase(), hay2: extra.toLowerCase().replace(/[*_]/g, "") });
  }
  const KIND_LABEL = { topic: "Prompt", theme: "Theme", tag: "Tag", discussion: "Discussion", book: "Book" };
  let resIdx = -1, resList = [];
  function onSearch() {
    const q = searchInput.value.trim().toLowerCase();
    S.q = q;
    searchBox.classList.toggle("has-text", !!q);
    if (!q) { S.searchSet = null; closeResults(); applyFilters(); return; }
    const toks = q.split(/\s+/);
    const hits = [];
    for (const e of searchIndex) {
      let s = 0, ok = true;
      for (const t of toks) {
        if (e.hay1.includes(t)) s += e.hay1.startsWith(t) ? 6 : 4;
        else if (e.hay2.includes(t)) s += 1;
        else { ok = false; break; }
      }
      if (ok) hits.push({ e, s: s + ({ topic: 2, theme: 3, tag: 1, discussion: 0, book: 0 }[e.kind] || 0) });
    }
    hits.sort((a, b) => b.s - a.s);
    // graph highlight: topics directly matched, or linked to matched tags / discussions / books
    const set = new Set();
    for (const { e } of hits) {
      const n = byId.get(e.id);
      if (n.kind === "topic") set.add(n.id);
      else if (e.s >= 4 || n.kind !== "topic") for (const t of n.topics || []) if (hits.length < 40 || n.kind === "tag") set.add(t);
    }
    S.searchSet = set.size ? set : new Set(["__none__"]);
    applyFilters();
    resList = hits.slice(0, 9).map((x) => x.e);
    resIdx = resList.length ? 0 : -1;
    renderResults();
  }
  function renderResults() {
    results.replaceChildren();
    if (!resList.length) results.append(h("div", { class: "none" }, "Nothing matches — try a single word."));
    resList.forEach((e, i) => results.append(h("button", { role: "option", class: i === resIdx ? "active" : "", onmousedown: (ev) => { ev.preventDefault(); pickResult(e); } }, h("span", { class: "k" }, KIND_LABEL[e.kind]), h("span", null, e.label))));
    results.classList.add("open");
  }
  function closeResults() { results.classList.remove("open"); resList = []; resIdx = -1; }
  function pickResult(e) { closeResults(); select(e.id); if (mobile()) closeLeft(); }
  searchInput.addEventListener("input", onSearch);
  searchInput.addEventListener("keydown", (ev) => {
    if (ev.key === "ArrowDown" && resList.length) { ev.preventDefault(); resIdx = (resIdx + 1) % resList.length; renderResults(); }
    else if (ev.key === "ArrowUp" && resList.length) { ev.preventDefault(); resIdx = (resIdx - 1 + resList.length) % resList.length; renderResults(); }
    else if (ev.key === "Enter" && resList[resIdx]) { ev.preventDefault(); pickResult(resList[resIdx]); }
    else if (ev.key === "Escape") { if (searchInput.value) { searchInput.value = ""; onSearch(); } else searchInput.blur(); }
  });
  searchInput.addEventListener("blur", () => setTimeout(closeResults, 120));
  searchInput.addEventListener("focus", () => { if (S.q && resList.length) renderResults(); });

  /* ------------------------------------------------------------------ threads + index panes */
  panes.threads.append(
    h("p", { class: "hint", style: { margin: "0 0 14px", fontSize: "13.5px", lineHeight: 1.55 } }, "A thread is a guided path through the map: a handful of prompts, in order, each handing on to the next — and ending back at the question. Pick one."),
    ...D.threads.map((t) => h("button", { class: "thread-card", onclick: () => startThread(t.id) },
      h("h4", null, t.title), h("p", null, t.intro),
      h("div", { class: "meta" }, h("span", { class: "pips" }, t.steps.map((s) => h("i", { style: { "--c": app.colorOf(s.topic) }, "data-t": s.topic }))), h("span", null, `${t.steps.length} stops`)))));
  const indexEls = [];
  D.arcs.forEach((arc) => {
    panes.index.append(h("div", { class: "idx-arc" }, arc.label));
    for (const n of D.themeOrder.filter((x) => arc.themes.includes(x))) {
      const th = byId.get("th:" + n);
      const ul = h("ul", null, th.topics.map((id) => byId.get(id)).sort((a, b) => a.order - b.order).map((t) => {
        const b = h("button", { onclick: () => { select(t.id); if (mobile()) closeLeft(); } }, h("i", { class: "dot", style: { "--c": "#999" }, "data-id": t.id }), t.label);
        indexEls.push(b);
        return h("li", null, b);
      }));
      panes.index.append(h("div", { class: "idx-theme" }, h("button", { onclick: () => { select(th.id); if (mobile()) closeLeft(); } }, h("i", null, String(n).padStart(2, "0")), th.title), ul));
    }
  });
  function refreshIndexColors() {
    for (const b of indexEls) { const dot = $(".dot", b); dot.style.setProperty("--c", app.colorOf(dot.dataset.id)); }
    for (const el of document.querySelectorAll(".thread-card .pips i")) el.style.setProperty("--c", app.colorOf(el.dataset.t));
  }

  /* ------------------------------------------------------------------ legend + tooltip */
  function renderLegend() {
    const el = legendEl, L = D.lenses[S.mode];
    el.replaceChildren();
    if (S.mode === "theme") el.append(h("p", { style: { margin: 0, color: "var(--faint)", lineHeight: 1.4 } }, "Each theme takes a colour from the logo’s gradient, in ring order."));
    else el.append(h("ul", null, Object.values(L.values).map((v) => h("li", null, h("i", { style: { "--c": v.color } }), v.label)), S.mode === "value" ? h("li", { style: { color: "var(--faint)" } }, h("i", { style: { "--c": "#9C978A" } }), "none assigned") : null));
    el.append(h("div", { class: "keys" },
      h("span", { html: '<svg viewBox="0 0 22 12"><path d="M1 8 Q 11 0 21 6" fill="none" stroke="#22211C" stroke-opacity=".6" stroke-width="1.6" stroke-linecap="round"/></svg>Hand-written bridge' }),
      h("span", { html: '<svg viewBox="0 0 22 12"><path d="M1 8 Q 11 0 21 6" fill="none" stroke="#666" stroke-opacity=".6" stroke-width="1.2" stroke-dasharray="3 3" stroke-linecap="round"/></svg>Shared tags or discussion' }),
      h("span", { html: '<svg viewBox="0 0 22 12"><circle cx="11" cy="6" r="3.2" fill="#666" stroke="#FAF8F3" stroke-width="1.2"/></svg>Discussion (notes inside)' })));
  }
  const tip = $("#tip");
  function showTip(n, px, py) {
    if (!n || mobile()) { tip.classList.remove("show"); return; }
    let sub = "";
    if (n.kind === "topic") sub = `Theme ${n.d.theme} · ` + n.d.scale.map((s) => D.lenses.scale.values[s].label).join("/");
    else if (n.kind === "theme") sub = "Theme " + n.d.n + " · " + n.d.topics.length + " prompts";
    else if (n.kind === "tag") sub = D.facets[n.d.facet].label.replace(/s$/, "") + " tag · " + n.d.topics.length + " prompts";
    else if (n.kind === "discussion") sub = n.d.sessions.map((s) => D.sessions[s].label).join(", ");
    else if (n.kind === "book") sub = n.d.author;
    else sub = "Click for the question and how to read this map";
    tip.replaceChildren(h("b", null, n.kind === "center" ? D.center.label : n.d.label), h("small", null, sub));
    const stage = $("#stage").getBoundingClientRect();
    tip.style.left = Math.min(stage.width - 290, Math.max(8, px + 16)) + "px";
    tip.style.top = Math.max(8, py + 18) + "px";
    tip.classList.add("show");
  }

  /* ------------------------------------------------------------------ selection + right panel */
  const right = $("#right");
  function rightWidth() { return right.getBoundingClientRect().width || 456; }
  function setInsets(open) {
    const t = mobile() ? 56 : 92, bar = S.thread ? 190 : 0;   // room for the question caption (top) and the thread card (bottom)
    if (!open) view.setInsets({ r: 0, b: bar, t });
    else if (mobile()) view.setInsets({ r: 0, b: Math.max(bar, Math.round(view.h * 0.62)), t });
    else view.setInsets({ r: Math.round(parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--right-w")) || rightWidth()), b: bar, t });
  }
  function head(crumb) {
    const acts = h("div", { class: "acts" });
    if (S.hist.length) acts.append(h("button", { class: "icon-btn", "aria-label": "Back", title: "Back", onclick: back, html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>' }));
    acts.append(h("button", { class: "icon-btn", "aria-label": "Copy link to this note", title: "Copy link to this note", onclick: copyLink, html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>' }));
    acts.append(h("button", { class: "icon-btn", "aria-label": "Close note", title: "Close (Esc)", onclick: () => { endThread(); deselect(); }, html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>' }));
    return h("div", { class: "r-head" }, h("div", { class: "crumb" }, crumb), acts);
  }
  function copyLink() {
    const url = location.href;
    const done = () => notice("Link copied");
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, () => notice(url));
    else notice(url);
  }
  function select(id, o = {}) {
    const n = byId.get(id);
    if (!n) return;
    S.touched = true;
    if (S.sel && S.sel !== id && !o.noPush) { S.hist.push(S.sel); if (S.hist.length > 30) S.hist.shift(); }
    S.sel = id;
    view.setSelected(id);
    const r = RM.panels.render(app, id);
    right.replaceChildren(head(r.crumb), h("div", { class: "r-body" }, r.body));
    right.setAttribute("aria-label", n.label || "Note");
    body.classList.add("right-open");
    // on laptop-width windows give the map the room: tuck the left panel away while a note is open
    let collapsed = false;
    if (!mobile() && window.innerWidth < 1500 && !body.classList.contains("left-closed")) { body.classList.add("left-closed"); S.autoClosedLeft = true; collapsed = true; }
    setInsets(true);
    if (o.fly !== false) { flyTo(id); if (collapsed) setTimeout(() => { if (S.sel === id) flyTo(id); }, 420); }   // re-aim once the stage has finished widening
    try { history.replaceState(null, "", "#" + id); } catch (e) { /* file:// quirks */ }
    if (mobile() && !o.keepLeft) closeLeft();
  }
  function flyTo(id) {
    const vn = view.byId.get(id);
    if (!vn) return;
    if (vn.vis) view.flyTo(id, vn.kind === "theme" ? 0.75 : 1.0);
    else view.flyToSet(vn.topicIds, 0.5, 1.2);
  }
  function back() {
    const prev = S.hist.pop();
    if (prev) select(prev, { noPush: true });
  }
  function deselect() {
    S.sel = null; S.hist = [];
    view.setSelected(null);
    body.classList.remove("right-open");
    if (S.autoClosedLeft) { body.classList.remove("left-closed"); S.autoClosedLeft = false; setTimeout(() => { if (!S.sel && !S.thread) view.fit(true); }, 420); }
    setInsets(false);
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* ignore */ }
  }

  function openLeft() { S.autoClosedLeft = false; if (mobile()) body.classList.add("left-open"); else body.classList.remove("left-closed"); }
  function closeLeft() { if (mobile()) body.classList.remove("left-open"); }
  $("#btnPanel").addEventListener("click", () => {
    S.autoClosedLeft = false;
    if (mobile()) body.classList.toggle("left-open"); else body.classList.toggle("left-closed");
  });

  /* ------------------------------------------------------------------ threads */
  const bar = $("#threadbar");
  function startThread(id) {
    const t = D.threads.find((x) => x.id === id);
    if (!t) return;
    S.thread = { t, i: 0 };
    body.classList.add("thread-on");
    closeLeft();
    // a thread is map-first: the note panel stays closed until you open a stop from the card
    S.sel = null; S.hist = []; view.setSelected(null); body.classList.remove("right-open");
    setInsets(false);
    stepTo(0);
  }
  function stepTo(i) {
    const T = S.thread;
    if (!T) return;
    const t = T.t, n = t.steps.length;
    T.i = u.clamp(i, 0, n);
    const ids = t.steps.map((s) => s.topic);
    view.setThread(ids, Math.min(T.i, n - 1));
    if (T.i < n) {
      const id = ids[T.i];
      if (body.classList.contains("right-open") && !mobile()) select(id, { fly: false, noPush: true });   // keep reading along if a note is open
      else { S.sel = id; view.setSelected(id); setInsets(false); }
      view.flyToSet([ids[T.i - 1], ids[T.i], ids[T.i + 1]].filter(Boolean), 0.5, 1.15);
    } else {
      S.sel = null; view.setSelected(null); body.classList.remove("right-open"); setInsets(false);
      view.flyToSet(ids, 0.3, 1.0);
    }
    renderBar();
  }
  function renderBar() {
    const T = S.thread;
    if (!T) { bar.classList.remove("open"); return; }
    const t = T.t, n = t.steps.length, last = T.i >= n;
    bar.replaceChildren(
      h("div", { class: "t-top" }, h("span", { class: "t-title" }, t.title), h("button", { class: "btn ghost", onclick: endThread, "aria-label": "End thread" }, "End thread ✕")),
      last
        ? h("div", null, h("div", { class: "t-step" }, "Back to the question"), h("p", { class: "t-sowhat" }, t.soWhat), h("p", { class: "t-text", style: { minHeight: 0 } }, t.intro))
        : h("div", null,
          h("div", { class: "t-step" }, h("span", { class: "num" }, T.i + 1), `Stop ${T.i + 1} of ${n}`),
          h("div", { class: "t-topic", onclick: () => select(t.steps[T.i].topic, { noPush: true }) }, byId.get(t.steps[T.i].topic).label),
          h("p", { class: "t-text" }, t.steps[T.i].text)),
      h("div", { class: "t-nav" },
        h("button", { class: "btn", disabled: T.i === 0, onclick: () => stepTo(T.i - 1) }, "← Back"),
        h("div", { class: "t-dots" }, [...t.steps.map((s, k) => h("button", { class: k === T.i ? "on" : "", "aria-label": "Stop " + (k + 1), onclick: () => stepTo(k) })), h("button", { class: last ? "on" : "", "aria-label": "Summary", onclick: () => stepTo(n), style: { borderRadius: "2px" } })]),
        last ? h("button", { class: "btn solid", onclick: endThread }, "Done") : h("button", { class: "btn solid", onclick: () => stepTo(T.i + 1) }, T.i === n - 1 ? "Finish →" : "Next →")));
    bar.classList.add("open");
  }
  function endThread() {
    if (!S.thread) return;
    S.thread = null; view.setThread(null);
    body.classList.remove("thread-on");
    bar.classList.remove("open");
    setInsets(body.classList.contains("right-open"));
    if (!body.classList.contains("right-open")) { S.sel = null; view.setSelected(null); view.fit(true); }
  }

  /* ------------------------------------------------------------------ keyboard, resize, routing */
  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (e.key === "/" && !typing) { e.preventDefault(); openLeft(); setTab("explore"); searchInput.focus(); searchInput.select(); }
    else if (e.key === "Escape" && !typing) { if (S.thread) endThread(); else if (S.sel) deselect(); else if (mobile()) closeLeft(); }
    else if (S.thread && !typing && e.key === "ArrowRight") stepTo(S.thread.i + 1);
    else if (S.thread && !typing && e.key === "ArrowLeft") stepTo(S.thread.i - 1);
  });
  $("#zIn").onclick = () => { S.touched = true; view.zoomBy(1.4); };
  $("#zOut").onclick = () => { S.touched = true; view.zoomBy(1 / 1.4); };
  $("#zFit").onclick = () => { S.touched = false; view.fit(true); };
  let refitT;
  new ResizeObserver(() => {
    view.resize();
    setInsets(body.classList.contains("right-open"));
    // window resized / phone rotated / panel animation finished: re-fit the whole map unless the visitor has taken over the camera
    clearTimeout(refitT);
    refitT = setTimeout(() => { if (!S.touched && !S.sel && !S.thread) view.fit(false); }, 120);
  }).observe($("#stage"));
  window.addEventListener("hashchange", () => { const id = decodeURIComponent(location.hash.slice(1)); if (id && byId.has(id) && id !== S.sel) select(id); });

  /* ------------------------------------------------------------------ boot */
  setMode("pillar");
  updateLinkCount();
  applyFilters();
  renderLegend();
  refreshIndexColors();
  // settle the camera; the guide opens when the question (centre or caption) is clicked
  setInsets(false);
  view.fit(false);
  const hashId = decodeURIComponent(location.hash.slice(1));
  $("#qcap").addEventListener("click", () => select("c", { fly: false }));
  if (hashId && byId.has(hashId)) select(hashId);
  else notice(mobile() ? "Tap any circle to open its notes · pinch to zoom" : "Click any circle to open its notes · scroll to zoom · drag to pan");
  // web fonts change label widths — refit once they have loaded (unless the visitor has already started exploring)
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { view._lw = null; if (!S.sel && !S.thread) view.fit(false); view.dirty = true; });
  RM.app = app;
  document.documentElement.dataset.ready = "1";
})();
