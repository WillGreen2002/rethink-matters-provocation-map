/* Orchestration: the three levels (Landscape, Regime, Niche) and the switcher between them, the left panel (search, explore, guided
   walks, index), the note panel, guided walks, and the address bar. All wording comes from curation/copy.yaml through u.t(). */
(function () {
  const RM = (window.RM = window.RM || {});
  const { u, levels: LV } = RM;
  const h = u.h;
  const D = window.RM_DATA;
  const LEVELS = LV.LEVELS;

  /* ------------------------------------------------------------------ data: chapters and examples become nodes */
  // The Bookshelf's three shelves are the map's chapters: each gets a node so it can be pointed at, opened, searched and linked to.
  for (const a of D.arcs) {
    if (D.nodes.some((n) => n.id === "arc:" + a.id)) continue;
    const ths = a.themes.map((x) => D.nodes.find((n) => n.kind === "theme" && n.n === x)).filter(Boolean);
    D.nodes.push({ id: "arc:" + a.id, kind: "arc", label: a.label, arc: a.id, themes: a.themes, topics: ths.flatMap((t) => t.topics),
      books: D.nodes.filter((b) => b.kind === "book" && b.shelf === a.label).map((b) => b.id) });
  }
  // The Niche examples ship in their own file (site/examples-data.js); without it the level is simply empty.
  const topicIds = new Set(D.nodes.filter((n) => n.kind === "topic").map((n) => n.id));
  for (const e of ((window.RM_EXAMPLES || {}).examples || [])) {
    if (!e || !/^ex:/.test(e.id) || D.nodes.some((n) => n.id === e.id)) continue;
    const ts = (e.topics || []).filter((t) => topicIds.has(t));
    if (!ts.length) continue;
    D.nodes.push(Object.assign({}, e, { kind: "example", topics: ts }));
    for (const t of ts) D.links.push({ s: e.id, t, kind: "ex" });
  }

  const $ = (s, r) => (r || document).querySelector(s);
  const body = document.body;
  const embed = /[?&]embed\b/.test(location.search);
  if (embed) body.classList.add("embed");
  const mobile = () => window.matchMedia("(max-width: 820px)").matches;
  const reduced = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  for (const el of document.querySelectorAll("[data-t]")) { const v = u.t(el.dataset.t); if (v) el.textContent = v; }
  for (const el of document.querySelectorAll("[data-t-label]")) { const v = u.t(el.dataset.tLabel); if (v) { el.setAttribute("aria-label", v); if (el.title) el.title = v; } }

  /* ------------------------------------------------------------------ indexes */
  const byId = new Map(D.nodes.map((n) => [n.id, n]));
  const topics = D.nodes.filter((n) => n.kind === "topic");
  const themes = D.nodes.filter((n) => n.kind === "theme");
  const discs = D.nodes.filter((n) => n.kind === "discussion");
  const examples = D.nodes.filter((n) => n.kind === "example");
  const exByTopic = new Map();
  for (const e of examples) for (const t of e.topics) (exByTopic.get(t) || exByTopic.set(t, []).get(t)).push(e.id);
  const relLinks = D.links.filter((l) => l.kind === "rel");
  const relBy = new Map();
  for (const l of relLinks) for (const [self, other] of [[l.s, l.t], [l.t, l.s]]) (relBy.get(self) || relBy.set(self, []).get(self)).push({ other, link: l });
  for (const arr of relBy.values()) arr.sort((a, b) => (b.link.curated - a.link.curated) || (b.link.score - a.link.score));

  const S = {
    level: "landscape", focus: null, tab: "explore", mode: "pillar", sel: null, hist: [], thread: null, q: "",
    pillars: new Set(), layers: { disc: false, rest: "bridges" }, minScore: D.defaultMinScore, searchSet: null,
    touched: false, seenRegime: false,
  };

  /* ------------------------------------------------------------------ the provocations map (Regime and Niche share one canvas) */
  const cv = $("#cv"), landEl = $("#landscape");
  const view = new RM.View(cv, D, {
    onPick: (id) => {
      if (!id) { if (S.thread) return; deselect(); return; }
      if (S.thread && !S.thread.t.steps.some((s) => s.topic === id)) endThread();
      select(id);
    },
    onHover: (n, px, py) => showTip(n, px, py),
    onCamera: () => { S.touched = true; },   // once the visitor has panned or zoomed, stop re-framing the map for them
  });

  const app = {
    D, byId, topics, examples, view, S,
    level: () => S.level,
    themeColor: (n) => view.themeColor(n),
    colorOf: (id) => {
      const n = view.byId.get(id);
      if (!n) return "#9C978A";
      if (S.level === "landscape" && n.kind === "theme") return view.themeColor(n.d.n);
      return n.colors[0];
    },
    relOf: (id) => relBy.get(id) || [],
    exOf: (id) => exByTopic.get(id) || [],
    select: (id, o) => select(id, o),
    filterBy: (lens, key) => { if (lens === "pillar") togglePillar(key, true); },
    startThread: (id) => startThread(id),
    drill: (id) => drill(id),
    goLevel: (lv, o) => goLevel(lv, o),
    walksThrough: (n) => D.threads.filter((t) => t.steps.some((s) => (byId.get(s.topic) || {}).theme === n)),
    themeReach: (n) => {
      const c = {};
      for (const l of relLinks) {
        if (!(l.curated || l.score >= S.minScore)) continue;
        const a = byId.get(l.s).theme, b = byId.get(l.t).theme;
        if (a === n && b !== n) c[b] = (c[b] || 0) + 1; else if (b === n && a !== n) c[a] = (c[a] || 0) + 1;
      }
      return Object.entries(c).map(([theme, count]) => ({ theme: +theme, count })).sort((x, y) => y.count - x.count);
    },
    // links between prompts (at the map's default strength) that cross from one theme to another, per pair of themes
    themePairs: () => {
      const c = new Map();
      for (const l of relLinks) {
        if (!(l.curated || l.score >= D.defaultMinScore)) continue;
        const a = byId.get(l.s).theme, b = byId.get(l.t).theme;
        if (a === b) continue;
        const k = Math.min(a, b) + "-" + Math.max(a, b);
        const e = c.get(k) || c.set(k, { a: Math.min(a, b), b: Math.max(a, b), w: 0 }).get(k);
        e.w++;
      }
      return [...c.values()].sort((x, y) => y.w - x.w || x.a - y.a || x.b - y.b);
    },
    // links (at the current strength) inside a chapter, and from it to each of the others
    chapterReach: (arc) => {
      const c = {};
      let inside = 0;
      for (const l of relLinks) {
        if (!(l.curated || l.score >= S.minScore)) continue;
        const a = byId.get(l.s).arc, b = byId.get(l.t).arc;
        if (a === arc && b === arc) inside++;
        else if (a === arc) c[b] = (c[b] || 0) + 1;
        else if (b === arc) c[a] = (c[a] || 0) + 1;
      }
      return { inside, out: Object.entries(c).map(([id, count]) => ({ id, count })).sort((x, y) => y.count - x.count) };
    },
  };

  /* ------------------------------------------------------------------ the Landscape (the nine themes) */
  const land = new RM.Landscape(landEl, app, {
    select: (id) => select(id),
    drill: (id) => drill(id),
    hover: (id, rect) => showTipAt(id, rect),
  });

  /* ------------------------------------------------------------------ level switcher, peek tab, live region */
  const PLANE_Y = { landscape: 3, regime: 10, niche: 17 };
  function planesIcon(level, cls) {
    const shape = (y, on) => `<path d="M3 ${y + 3.2}L14 ${y}L25 ${y + 3.2}L14 ${y + 6.4}Z" fill="${on ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" opacity="${on ? 1 : 0.55}"/>`;
    return h("svg", { class: cls || "planes", viewBox: "0 0 28 27", "aria-hidden": "true", html: LEVELS.map((lv) => shape(PLANE_Y[lv], lv === level)).join("") });
  }
  const levelBtns = {};
  const levelCount = { landscape: themes.length, regime: topics.length, niche: examples.length };
  const levelbar = $("#levelbar");
  levelbar.setAttribute("aria-label", u.t("levels.nav_label"));
  LEVELS.forEach((lv, i) => {
    if (i) levelbar.append(h("i", { class: "lv-sep " + (i === 1 ? "dashed" : "solid"), "aria-hidden": "true" }));
    const b = (levelBtns[lv] = h("button", { type: "button", "data-level": lv, title: u.t("levels.key_hint", { key: i + 1 }), onclick: () => goLevel(lv) },
      planesIcon(lv, "lv-ico"),
      h("span", { class: "lv-name" }, u.t("levels." + lv + ".name")),
      h("span", { class: "lv-n" }, lv === "niche" && !examples.length ? u.t("levels.niche.soon") : String(levelCount[lv]))));
    levelbar.append(b);
  });
  const peek = $("#peek");
  peek.addEventListener("click", () => goLevel(S.level === "landscape" ? "regime" : "niche"));
  const live = $("#live");
  const focusChip = $("#focuschip");
  focusChip.addEventListener("click", () => setFocus(null));

  /* ------------------------------------------------------------------ left panel scaffolding */
  const left = $("#left");
  left.setAttribute("aria-label", u.t("left.label"));
  const searchInput = h("input", { type: "search", id: "q", placeholder: u.t("search.placeholder"), autocomplete: "off", "aria-label": u.t("search.label"), spellcheck: "false" });
  const results = h("div", { class: "results", role: "listbox" });
  const clearBtn = h("button", { class: "clr", "aria-label": u.t("search.clear"), onclick: () => { searchInput.value = ""; onSearch(); searchInput.focus(); } }, "✕");
  const searchBox = h("div", { class: "search" },
    h("svg", { class: "ico", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.8", "stroke-linecap": "round", html: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>' }),
    searchInput, clearBtn, results);
  const panes = { explore: h("div", { id: "pane-explore", role: "tabpanel" }), walks: h("div", { id: "pane-walks", role: "tabpanel", hidden: true }), index: h("div", { id: "pane-index", role: "tabpanel", hidden: true }) };
  const tabBtns = {};
  const tabsEl = h("div", { class: "tabs", role: "tablist" },
    ...[["explore", u.t("tabs.explore")], ["walks", u.t("tabs.walks", { n: D.threads.length })], ["index", u.t("tabs.index")]].map(([k, label]) =>
      (tabBtns[k] = h("button", { role: "tab", "aria-selected": k === "explore" ? "true" : "false", onclick: () => setTab(k) }, label))));
  const heroIcon = h("span", { class: "hero-ico" });
  const levelNote = h("div", { class: "level-note" });
  left.append(
    h("div", { class: "title-block" },
      heroIcon,
      h("h1", null, u.t("hero.title")),
      h("p", null, u.t("hero.lede")),
      h("div", { class: "stats" }, ...[[themes.length, u.t("hero.stat_themes")], [topics.length, u.t("hero.stat_prompts")], [discs.length, u.t("hero.stat_discussions")]].map(([n, l]) => h("span", null, h("b", null, n), " " + l))),
      h("button", { class: "btn solid walk-cta", type: "button", onclick: () => openWalks() },
        h("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.7", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", html: '<circle cx="5" cy="18" r="2"/><circle cx="19" cy="6" r="2"/><path d="M7 18h6a3 3 0 0 0 0-6h-2a3 3 0 0 1 0-6h6"/>' }),
        u.t("walks.cta"))),
    levelNote,
    searchBox, tabsEl, panes.explore, panes.walks, panes.index);

  function setTab(k) {
    S.tab = k;
    for (const [key, el] of Object.entries(panes)) el.hidden = key !== k;
    for (const [key, el] of Object.entries(tabBtns)) el.setAttribute("aria-selected", key === k ? "true" : "false");
  }
  function openWalks() { openLeft(); setTab("walks"); tabsEl.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" }); }
  $("#btnWalks").addEventListener("click", openWalks);

  // what each level is, in a line or two; the Regime names one of the agencies that shapes it (ARIA, with its opportunity spaces)
  function renderLevelNote() {
    const lv = S.level, A = u.t("aria_link");
    heroIcon.replaceChildren(planesIcon(lv));
    levelNote.replaceChildren(...[
      h("div", { class: "ln-head" }, h("b", null, u.t("levels." + lv + ".name")), h("span", null, u.t("levels." + lv + ".short"))),
      h("p", null, u.t("levels." + lv + ".explain")),
      lv === "regime" ? h("p", { class: "ln-aria" }, u.t("levels.regime.aria"), " ", h("a", { class: "ext", href: A.url, target: "_blank", rel: "noopener noreferrer" }, A.text)) : null,
      h("details", { class: "about-levels" },
        h("summary", null, u.t("about.summary")),
        u.md(u.t("about.body")),
        h("ul", { class: "refs" }, u.t("about.refs").map((r) => h("li", null, h("a", { href: r.url, target: "_blank", rel: "noopener noreferrer" }, r.text)))))].filter(Boolean));
  }

  /* ------------------------------------------------------------------ explore pane: show only, colour, more options */
  const sec = (title, ...kids) => h("section", { class: "sec" }, h("h3", null, title), ...kids);
  const chip = (label, o = {}) => h("button", { type: "button", class: "chip" + (o.cls ? " " + o.cls : ""), "aria-pressed": o.pressed ? "true" : "false", style: o.color ? { "--c": o.color } : null, title: o.title, onclick: o.onclick },
    o.color ? h("i", { class: "dot" }) : null, label, o.count != null ? h("span", { class: "n" }, o.count) : null);

  const focusChips = {};
  const chapterSeg = h("div", { class: "seg" }, D.arcs.map((a) => (focusChips["arc:" + a.id] = chip(a.label, { onclick: () => pickFocus("arc:" + a.id) }))));
  const themeSeg = h("div", { class: "seg" }, D.themeOrder.map((n) => {
    const th = byId.get("th:" + n);
    return (focusChips[th.id] = chip(h("span", null, h("b", { class: "num" }, n), " " + th.label), { title: th.title, onclick: () => pickFocus(th.id) }));
  }));
  const pillarChips = {};
  const PL = D.lenses.pillar;
  const pillarSeg = h("div", { class: "seg" }, Object.entries(PL.values).map(([k, v]) =>
    (pillarChips[k] = chip(v.short || v.label, { color: v.color, count: topics.filter((t) => t.pillar.includes(k)).length, title: v.def || v.q, onclick: () => togglePillar(k) }))));
  const matchLine = h("div", { class: "matchline", "aria-live": "polite" });
  const clearRow = h("div", { class: "clear-row" },
    h("button", { class: "btn", type: "button", onclick: () => clearFilters() }, u.t("explore.clear")),
    h("button", { class: "btn ghost", type: "button", onclick: () => { S.touched = false; view.fit(true); } }, u.t("explore.fit")));

  // colour by: pillar or theme
  const MODES = [["pillar", u.t("explore.colour_pillar")], ["theme", u.t("explore.colour_theme")]];
  const modeBtns = {};
  const modeSeg = h("div", { class: "seg" }, MODES.map(([k, label]) => (modeBtns[k] = chip(label, { pressed: k === S.mode, onclick: () => setMode(k) }))));
  const legendEl = h("div", { class: "legend-inline", id: "legend", "aria-label": u.t("explore.legend") });
  function setMode(k) {
    S.mode = k;
    for (const [key, el] of Object.entries(modeBtns)) el.setAttribute("aria-pressed", key === k ? "true" : "false");
    view.configure({ mode: k });
    renderLegend(); refreshIndexColors();
  }

  // more options: what shows at rest, link strength, the discussions, fitting the map
  const REST = [["none", u.t("explore.rest_none")], ["bridges", u.t("explore.rest_bridges")], ["all", u.t("explore.rest_all")]];
  const restBtns = {};
  const restSeg = h("div", { class: "seg" }, REST.map(([k, label]) => (restBtns[k] = chip(label, { pressed: k === S.layers.rest, onclick: () => setRest(k) }))));
  function setRest(k) {
    S.layers.rest = k;
    for (const [key, el] of Object.entries(restBtns)) el.setAttribute("aria-pressed", key === k ? "true" : "false");
    pushLayers();
  }
  function layerRow(key, label, sub, checked) {
    const input = h("input", { type: "checkbox", id: "lay-" + key, onchange: () => { S.layers[key] = input.checked; pushLayers(); } });
    input.checked = checked;
    return h("div", { class: "row" }, h("label", { for: "lay-" + key }, label, h("small", null, sub)), h("span", { class: "switch" }, input, h("i")));
  }
  function pushLayers() { view.configure({ layers: { disc: S.layers.disc, rest: S.layers.rest } }); updateLinkCount(); }
  const slider = h("input", { type: "range", min: 2.6, max: 9, step: 0.2, value: S.minScore, "aria-label": u.t("explore.strength"), oninput: () => { S.minScore = +slider.value; view.configure({ minScore: S.minScore }); updateLinkCount(); } });
  const linkCount = h("span");
  function updateLinkCount() { linkCount.textContent = u.t("explore.link_count", { n: relLinks.filter((l) => l.curated || l.score >= S.minScore).length }); }

  panes.explore.append(
    h("p", { class: "hint landscape-only" }, u.t("explore.landscape_hint")),
    sec(u.t("explore.show_title"),
      h("div", { class: "group-h" }, u.t("explore.chapters")), chapterSeg,
      h("div", { class: "group-h" }, u.t("explore.themes")), themeSeg,
      h("div", { class: "not-landscape" }, h("div", { class: "group-h" }, u.t("explore.pillar"), h("small", null, PL.question)), pillarSeg),
      h("div", { class: "not-landscape" }, matchLine, clearRow)),
    h("div", { class: "not-landscape" }, sec(u.t("explore.colour_title"), modeSeg, legendEl)),
    h("details", { class: "more-opts regime-only" },
      h("summary", null, u.t("explore.more")),
      h("div", { class: "group-h" }, u.t("explore.rest_title")), restSeg,
      h("p", { class: "hint" }, u.t("explore.rest_hint")),
      h("div", { class: "range-meta", style: { marginTop: "14px" } }, h("span", null, u.t("explore.more_links")), linkCount, h("span", null, u.t("explore.fewer_links"))), slider,
      layerRow("disc", u.t("explore.discussions"), u.t("explore.discussions_sub"), S.layers.disc)));

  /* ------------------------------------------------------------------ focus and filters */
  function pickFocus(id) {
    if (S.level === "landscape") { drill(id); return; }
    setFocus(S.focus === id ? null : id);
  }
  // show one theme or chapter on the provocations map; the rest dims but stays in view
  function setFocus(id, o = {}) {
    S.focus = id && byId.has(id) ? id : null;
    applyFilters();
    renderFocusChip();
    updateInsets();
    if (S.level !== "landscape") {
      if (mobile() && S.focus && !S.sel) { S.touched = true; view.fit(true, byId.get(S.focus).topics); }
      else if (!S.touched && !S.sel) view.fit(true);
    }
    if (o.sync !== false) syncURL(!!o.push);
  }
  function renderFocusChip() {
    const n = S.focus && byId.get(S.focus), on = !!n && S.level !== "landscape";
    focusChip.hidden = !on;
    body.classList.toggle("focus-on", on);
    if (!on) return;
    const what = n.kind === "theme" ? u.t("focus.theme", { n: n.n, label: n.label }) : u.t("focus.chapter", { label: n.label });
    focusChip.replaceChildren(h("span", { class: "fc-k" }, u.t("focus.prefix")), h("span", { class: "fc-v" }, what), h("span", { class: "fc-x", "aria-hidden": "true" }, "✕"));
    focusChip.setAttribute("aria-label", u.t("focus.clear_label", { what }));
    focusChip.style.setProperty("--c", n.kind === "theme" ? view.themeColor(n.n) : app.colorOf(n.id));
  }
  function togglePillar(k, reveal) {
    S.pillars.has(k) ? S.pillars.delete(k) : S.pillars.add(k);
    if (reveal) { openLeft(); setTab("explore"); }
    if (S.level === "landscape") goLevel("regime");
    applyFilters(true);
  }
  function clearFilters() {
    S.pillars.clear(); searchInput.value = ""; S.q = ""; S.searchSet = null; searchBox.classList.remove("has-text"); closeResults();
    setFocus(null);
    if (!S.sel && !S.thread) view.fit(true);
  }
  function computeMatch() {
    const focus = S.focus ? new Set(byId.get(S.focus).topics) : null;
    if (!focus && !S.pillars.size && !S.searchSet) return null;
    const out = new Set();
    for (const t of topics) {
      if (focus && !focus.has(t.id)) continue;
      if (S.searchSet && !S.searchSet.has(t.id)) continue;
      if (S.pillars.size && !t.pillar.some((v) => S.pillars.has(v))) continue;
      out.add(t.id);
    }
    return out;
  }
  function applyFilters(move) {
    const set = computeMatch();
    view.configure({ matchEdge: S.focus && !S.pillars.size && !S.searchSet ? "either" : "both" });
    view.setMatch(set);
    for (const [id, el] of Object.entries(focusChips)) el.setAttribute("aria-pressed", S.focus === id ? "true" : "false");
    for (const [k, el] of Object.entries(pillarChips)) el.setAttribute("aria-pressed", S.pillars.has(k) ? "true" : "false");
    matchLine.replaceChildren();
    if (set) {
      matchLine.append(h("span", null, u.t("explore.match", { n: set.size, total: topics.length })));
      if (!set.size) matchLine.append(h("span", null, u.t("explore.match_none")));
      if (move && set.size && S.level !== "landscape") {
        notice(u.t("explore.match_notice", { n: set.size }));
        if (mobile()) { S.touched = true; view.fit(true, [...set]); }   // on a phone, frame the matches; elsewhere the whole map stays in view
      }
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
    const extra = n.kind === "topic" ? n.text : n.kind === "tag" ? n.def : n.kind === "theme" ? n.lead
      : n.kind === "discussion" ? (n.texts.map((t) => t.paras.join(" ")).join(" ") + " " + n.notes)
      : n.kind === "example" ? [n.org, n.summary, n.year].filter(Boolean).join(" ") : n.author || "";
    searchIndex.push({ id: n.id, kind: n.kind, label: n.label, hay1: label.toLowerCase(), hay2: String(extra).toLowerCase().replace(/[*_]/g, "") });
  }
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
      if (ok) hits.push({ e, s: s + ({ topic: 2, theme: 3, tag: 1, example: 1 }[e.kind] || 0) });
    }
    hits.sort((a, b) => b.s - a.s);
    // map highlight: prompts matched directly, or linked to a matched tag, discussion, book or example
    const set = new Set();
    for (const { e } of hits) {
      const n = byId.get(e.id);
      if (n.kind === "topic") set.add(n.id);
      else if (e.s >= 4 || n.kind !== "topic") for (const t of n.topics || []) if (hits.length < 40 || n.kind === "tag") set.add(t);
    }
    S.searchSet = set;
    applyFilters();
    resList = hits.slice(0, 9).map((x) => x.e);
    resIdx = resList.length ? 0 : -1;
    renderResults();
  }
  function renderResults() {
    results.replaceChildren();
    if (!resList.length) results.append(h("div", { class: "none" }, u.t("search.none")));
    resList.forEach((e, i) => results.append(h("button", { role: "option", class: i === resIdx ? "active" : "", onmousedown: (ev) => { ev.preventDefault(); pickResult(e); } }, h("span", { class: "k" }, u.t("kinds")[e.kind] || ""), h("span", null, e.label))));
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

  /* ------------------------------------------------------------------ guided walks + index panes */
  panes.walks.append(
    h("p", { class: "hint pane-intro" }, u.t("walks.intro")),
    ...D.threads.map((t) => h("button", { class: "thread-card", type: "button", onclick: () => startThread(t.id) },
      h("h4", null, t.title), h("p", null, t.intro),
      h("div", { class: "meta" }, h("span", { class: "pips" }, t.steps.map((s) => h("i", { style: { "--c": app.colorOf(s.topic) }, "data-t": s.topic }))), h("span", null, u.t("walks.stops", { n: t.steps.length }))))));
  const indexEls = [];
  D.arcs.forEach((arc) => {
    panes.index.append(h("button", { class: "idx-arc", "data-arc": arc.id, onclick: () => { select("arc:" + arc.id); if (mobile()) closeLeft(); } }, arc.label));
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
    for (const el of document.querySelectorAll(".idx-arc")) el.style.setProperty("--c", app.colorOf("arc:" + el.dataset.arc));
  }

  /* ------------------------------------------------------------------ legend + tooltips */
  function renderLegend() {
    const el = legendEl, L = D.lenses[S.mode];
    el.replaceChildren();
    if (S.mode === "theme") el.append(h("p", { class: "legend-note" }, u.t("explore.colour_theme_hint")));
    else el.append(h("ul", null, Object.values(L.values).map((v) => h("li", null, h("i", { style: { "--c": v.color } }), v.label))));
    const line = (color, label, dash) => h("span", { html: `<svg viewBox="0 0 22 12"><path d="M1 8 Q 11 0 21 6" fill="none" stroke="${color}" stroke-width="${dash ? 1.3 : 1.8}"${dash ? ' stroke-dasharray="3 3"' : ""} stroke-linecap="round"/></svg>` }, label);
    const R = u.t("relations");
    el.append(h("div", { class: "keys" },
      h("span", { class: "keys-h" }, u.t("explore.legend_lines")),
      h("div", { class: "keys-grid" }, line("#2F6B63", R.echoes), line("#B65438", R.tension), line("#5B6B3C", R.enables), line("#9A6F1F", R.extends)),
      line("#6B675C", R.shared, true)));
  }
  const tip = $("#tip");
  function tipBody(id) {
    const n = byId.get(id);
    if (!n) return null;
    let sub = "", extra = null;
    if (n.kind === "topic") sub = u.t("tip.topic", { n: n.theme, label: byId.get("th:" + n.theme).label });
    else if (n.kind === "theme") {
      sub = S.level === "landscape" ? u.t("tip.theme_landscape", { n: n.topics.length }) : u.t("tip.theme", { n: n.n, count: n.topics.length });
      if (S.level === "landscape" && n.future) extra = h("span", { class: "tip-future" }, n.future.text, h("em", null, " " + u.t("future.badge_" + n.future.status.replace("-", "_"))));
    }
    else if (n.kind === "tag") sub = u.t("tip.tag", { facet: D.facets[n.facet].label.replace(/s$/, ""), n: n.topics.length });
    else if (n.kind === "discussion") sub = n.sessions.map((s) => D.sessions[s].label).join(", ");
    else if (n.kind === "book") sub = n.author;
    else if (n.kind === "arc") sub = u.t("tip.arc", { themes: n.themes.length, prompts: n.topics.length });
    else if (n.kind === "example") sub = [(D.exampleTypes[n.type] || {}).label, n.org, n.year].filter(Boolean).join(" · ");
    else sub = u.t("tip.center");
    return [h("b", null, n.kind === "center" ? D.center.label : n.kind === "theme" ? u.t("tip.theme_title", { n: n.n, label: n.label }) : n.label), h("small", null, sub), extra];
  }
  function showTip(n, px, py) {
    if (!n || mobile()) { tip.classList.remove("show"); return; }
    tip.replaceChildren(...tipBody(n.id).filter(Boolean));
    tip.classList.remove("wide");
    const stage = $("#stage").getBoundingClientRect();
    tip.style.left = Math.min(stage.width - 290, Math.max(8, px + 16)) + "px";
    tip.style.top = Math.max(8, py + 18) + "px";
    tip.classList.add("show");
  }
  function showTipAt(id, rect) {
    if (!id || mobile() || !rect) { tip.classList.remove("show"); return; }
    const kids = tipBody(id);
    if (!kids) return;
    tip.replaceChildren(...kids.filter(Boolean));
    tip.classList.toggle("wide", !!kids[2]);
    const st = $("#stage").getBoundingClientRect(), w = kids[2] ? 330 : 280;
    let x = rect.right - st.left + 10, y = rect.top - st.top + rect.height * 0.25;
    if (x + w > st.width - 8) x = rect.left - st.left - w - 10;
    tip.style.left = u.clamp(x, 8, st.width - w - 8) + "px";
    tip.style.top = u.clamp(y, 8, st.height - 120) + "px";
    tip.classList.add("show");
  }

  /* ------------------------------------------------------------------ levels: switching, planes, chrome */
  const PLANE = { landscape: landEl, regime: cv, niche: cv };
  let swapT = [];
  function settlePlanes(lv) {
    for (const t of swapT) clearTimeout(t);
    swapT = [];
    for (const el of [landEl, cv]) el.classList.remove("enter-down", "enter-up", "leave-down", "leave-up");
    landEl.classList.toggle("off", lv !== "landscape");
    cv.classList.toggle("off", lv === "landscape");
    if (lv === "landscape") view.pause();
  }
  // the canvas, set up for the level it is about to show (framed before it appears)
  function prepCanvas(lv) {
    view.configure({ niche: lv === "niche" });
    view.resume();
    if (!S.seenRegime) { S.seenRegime = true; view.replayIntro(); }
    updateInsets();
    view.relayout(false);
    if (mobile() && S.sel) frame(S.sel, false);
    else if (mobile() && S.focus) view.fit(false, byId.get(S.focus).topics);
    else if (!S.touched) view.fit(false);
  }
  /* the planes tilt past one another: going down, the one you leave lifts away and the next rises into place */
  function swapPlanes(from, to, instant) {
    settlePlanes(from);   // finish any swap still running
    const out = PLANE[from], inn = PLANE[to], dir = LEVELS.indexOf(to) > LEVELS.indexOf(from) ? "down" : "up";
    if (to !== "landscape" && inn !== out) prepCanvas(to);
    if (instant || reduced) {
      if (to !== "landscape" && inn === out) prepCanvas(to);
      settlePlanes(to); return;
    }
    const enter = (el) => { el.classList.add("enter-" + dir); el.classList.remove("off"); void el.offsetWidth; el.classList.remove("enter-" + dir); };
    if (inn !== out) {
      out.classList.add("leave-" + dir);
      enter(inn);
      swapT.push(setTimeout(() => settlePlanes(to), 560));
    } else {
      out.classList.add("leave-" + dir);
      swapT.push(setTimeout(() => { out.classList.remove("leave-" + dir); prepCanvas(to); enter(out); }, 240));
      swapT.push(setTimeout(() => settlePlanes(to), 800));
    }
  }
  // going up or down keeps your place where it can: a prompt's theme above it, an example's prompt above that
  function carryTo(id, lv) {
    if (!id || LV.shows(lv, id)) return id;
    const n = byId.get(id);
    if (!n) return null;
    if (lv === "landscape") return n.kind === "topic" ? "th:" + n.theme : n.kind === "example" && n.themes && n.themes.length ? "th:" + n.themes[0] : null;
    if (lv === "regime" && n.kind === "example") return n.topics[0];
    return null;
  }
  function goLevel(lv, o = {}) {
    if (!LEVELS.includes(lv)) return;
    const from = S.level;
    if (lv === from) return;
    if (S.thread && lv !== "regime") endThread(true);
    // (when a note is being opened on the new level, its caller takes care of the note)
    const carried = o.selecting ? S.sel : carryTo(S.sel, lv);
    if (lv === "landscape") S.focus = null;
    if (from === "landscape") S.touched = false;
    S.level = lv;
    body.dataset.level = lv;
    tip.classList.remove("show");
    renderLevelChrome();   // first, so the map is framed for the chrome it will sit under
    applyFilters();
    swapPlanes(from, lv, o.instant);
    if (carried !== S.sel) { if (carried) select(carried, { noPush: true, sync: false, fly: false }); else deselect({ sync: false }); }
    else if (S.sel && !o.selecting) renderNote();
    if (lv === "landscape") land.setSelected(S.sel);
    else view.setSelected(S.sel);
    live.textContent = u.t("levels.announce", { name: u.t("levels." + lv + ".name"), what: u.t("levels." + lv + ".short") });
    if (o.sync !== false) syncURL(o.push !== false);
  }
  // from a theme or chapter on the Landscape down to its provocations
  // (on the map itself, the same button just shows or clears the focus)
  function drill(id) {
    const down = S.level === "landscape";
    if (down && S.sel && mobile()) deselect({ sync: false });   // a phone's note would cover the map you came down to see
    S.focus = id || null;
    if (down) goLevel("regime", { sync: false });
    setFocus(S.focus, { sync: false });
    if (S.sel) renderNote();
    syncURL(down);
  }
  function renderLevelChrome() {
    const lv = S.level;
    for (const [k, b] of Object.entries(levelBtns)) { if (k === lv) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); }
    peek.hidden = lv === "niche";
    if (lv !== "niche") {
      const next = lv === "landscape" ? "regime" : "niche";
      peek.replaceChildren(planesIcon(next, "lv-ico"), h("span", null, lv === "landscape" ? u.t("peek.landscape", { n: topics.length })
        : examples.length ? u.t("peek.regime", { n: examples.length }) : u.t("peek.regime_none")), h("span", { "aria-hidden": "true" }, " ↓"));
    }
    renderNicheCard();
    renderLevelNote();
    renderFocusChip();
    updateInsets();
  }
  const nicheCard = $("#nichecard");
  function renderNicheCard() {
    nicheCard.hidden = S.level !== "niche";
    if (S.level !== "niche") return;
    const T = D.exampleTypes || {};
    const key = h("ul", { class: "type-key" }, Object.entries(T).map(([k, v]) => h("li", null, h("i", { class: "shape shape-" + v.shape }), v.plural || v.label)));
    if (examples.length) { nicheCard.className = "niche-card compact"; nicheCard.replaceChildren(key); return; }
    nicheCard.className = "niche-card";
    nicheCard.replaceChildren(
      h("h2", null, u.t("niche.empty_title")),
      h("p", null, u.t("niche.empty_body")),
      key,
      h("button", { class: "btn", type: "button", onclick: () => goLevel("regime") }, h("span", { "aria-hidden": "true" }, "↑ "), u.t("niche.back")));
  }

  /* ------------------------------------------------------------------ address bar */
  function stateHref(forCopy) {
    return LV.href({ level: S.level, focus: S.focus, walk: S.thread ? S.thread.t.id : null, id: S.sel, embed: embed && !forCopy });
  }
  function syncURL(push) {
    const url = location.pathname + stateHref();
    if (url === location.pathname + location.search + location.hash) return;
    try { (push && !embed ? history.pushState : history.replaceState).call(history, null, "", url); } catch (e) { /* file:// quirks */ }
  }
  // the address bar has changed under us (Back, Forward, an edited link): follow it
  function fromURL() {
    const st = LV.parse(location.search, location.hash);
    const walk = st.walk && D.threads.some((t) => t.id === st.walk) ? st.walk : null;
    if (S.thread && S.thread.t.id !== walk) endThread(true);
    if (st.level !== S.level) goLevel(st.level, { sync: false });
    const focus = st.focus && byId.has(st.focus) ? st.focus : null;
    if (focus !== S.focus) setFocus(focus, { sync: false });
    if (walk && !S.thread) startThread(walk, { sync: false });
    let id = st.id && byId.has(st.id) ? st.id : null;
    if (id) id = carryTo(id, S.level);
    if (id && id !== S.sel) select(id, { sync: false });
    else if (!id && S.sel && !S.thread) deselect({ sync: false });
  }
  window.addEventListener("popstate", fromURL);
  window.addEventListener("hashchange", fromURL);

  /* ------------------------------------------------------------------ selection + note panel */
  const right = $("#right");
  function rightWidth() { return Math.round(parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--right-w")) || right.getBoundingClientRect().width || 456); }
  function chromeTop() {
    if (mobile()) return 56;
    let t = 14 + (levelbar.offsetHeight || 42) + 10;
    if (!focusChip.hidden) t += (focusChip.offsetHeight || 32) + 8;
    return t;
  }
  function updateInsets() {
    const open = body.classList.contains("right-open"), m = mobile();
    const r = open && !m ? rightWidth() : 0;
    if (S.level === "landscape") {
      const q = $("#qcap");
      land.setInsets({ t: m ? 0 : chromeTop() + (q.offsetHeight || 56) + 4, r, b: m ? 0 : 58, l: 0 });
      return;
    }
    const card = S.thread ? Math.max(200, $("#threadbar").offsetHeight + 34) : 0, tabbar = m ? 62 : 0;
    if (open && m) view.setInsets({ r: 0, b: Math.max(card, Math.round(view.h * 0.62)), t: chromeTop() });
    else view.setInsets({ r, b: Math.max(card, tabbar), t: chromeTop() });
  }
  function head(crumb) {
    const acts = h("div", { class: "acts" });
    if (S.hist.length) acts.append(h("button", { class: "icon-btn", "aria-label": u.t("note.back"), title: u.t("note.back"), onclick: back, html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>' }));
    acts.append(h("button", { class: "icon-btn", "aria-label": u.t("note.copy"), title: u.t("note.copy"), onclick: copyLink, html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>' }));
    acts.append(h("button", { class: "icon-btn", "aria-label": u.t("note.close"), title: u.t("note.close_tip"), onclick: () => { endThread(); deselect(); }, html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>' }));
    return h("div", { class: "r-head" }, h("div", { class: "crumb" }, crumb), acts);
  }
  // the link to share leaves out the embed flag: it opens the full map
  function copyLink() {
    const url = location.href.split(/[?#]/)[0] + stateHref(true);
    const done = () => notice(u.t("note.copied"));
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, () => notice(url));
    else notice(url);
  }
  function renderNote() {
    const id = S.sel, n = byId.get(id);
    if (!n) return;
    const r = RM.panels.render(app, id);
    right.replaceChildren(head(r.crumb), h("div", { class: "r-body" }, r.body));
    right.setAttribute("aria-label", n.label || u.t("note.label"));
  }
  function select(id, o = {}) {
    const n = byId.get(id);
    if (!n) return;
    let pushed = false;
    if (!LV.shows(S.level, id)) { goLevel(LV.homeLevel(id), { sync: false, selecting: true }); pushed = true; }
    if (S.sel && S.sel !== id && !o.noPush) { S.hist.push(S.sel); if (S.hist.length > 30) S.hist.shift(); }
    S.sel = id;
    if (S.level === "landscape") land.setSelected(id); else view.setSelected(id);
    renderNote();
    body.classList.add("right-open");
    // on laptop-width windows give the map the room: tuck the left panel away while a note is open
    let collapsed = false;
    if (!mobile() && window.innerWidth < 1500 && !body.classList.contains("left-closed")) { body.classList.add("left-closed"); S.autoClosedLeft = true; collapsed = true; }
    updateInsets();
    if (S.level !== "landscape" && o.fly !== false) { frame(id); if (collapsed) setTimeout(() => { if (S.sel === id) frame(id); }, 420); }   // re-aim once the stage has widened
    if (o.sync !== false) syncURL(pushed);
    if (mobile() && !o.keepLeft) closeLeft();
  }
  /* Wide screens: keep the whole map in view beside the note, so every lit-up connection can be followed; the map only moves when
     the space around it changes. Phones: the note covers most of the screen, so frame the prompt and what it connects to. */
  function frame(id, animate = true) {
    view.relayout(animate);   // the room left beside an open note may call for a narrower orbit
    if (mobile()) { const ids = view.framingIds(id); if (ids && ids.length) view.fit(animate, ids); return; }
    if (S.touched) view.reveal(id); else view.fit(animate);
  }
  function back() {
    const prev = S.hist.pop();
    if (prev) select(prev, { noPush: true });
  }
  function deselect(o = {}) {
    S.sel = null; S.hist = [];
    view.setSelected(null); land.setSelected(null);
    body.classList.remove("right-open");
    updateInsets();
    if (S.level !== "landscape") view.relayout(true);
    if (S.autoClosedLeft) { body.classList.remove("left-closed"); S.autoClosedLeft = false; }   // the stage narrows again; the resize observer re-frames
    else if (S.level !== "landscape" && !S.touched && !S.thread) view.fit(true);
    if (o.sync !== false) syncURL(false);
  }

  function openLeft() { S.autoClosedLeft = false; if (mobile()) body.classList.add("left-open"); else body.classList.remove("left-closed"); }
  function closeLeft() { if (mobile()) body.classList.remove("left-open"); }
  $("#btnPanel").addEventListener("click", () => {
    S.autoClosedLeft = false;
    if (mobile()) body.classList.toggle("left-open"); else body.classList.toggle("left-closed");
  });

  /* ------------------------------------------------------------------ guided walks (they run on the Regime) */
  const bar = $("#threadbar");
  bar.setAttribute("aria-label", u.t("walks.region"));
  function startThread(id, o = {}) {
    const t = D.threads.find((x) => x.id === id);
    if (!t) return;
    const moved = S.level !== "regime";
    if (moved) goLevel("regime", { sync: false });
    if (S.focus) setFocus(null, { sync: false });   // a walk crosses themes: nothing should be dimmed along it
    S.thread = { t, i: 0 };
    body.classList.add("thread-on");
    closeLeft();
    // a walk is map-first: the note panel stays closed until you open a stop from the card
    S.sel = null; S.hist = []; view.setSelected(null); body.classList.remove("right-open");
    stepTo(0);
    if (o.sync !== false) syncURL(moved);
  }
  function stepTo(i) {
    const T = S.thread;
    if (!T) return;
    const t = T.t, n = t.steps.length;
    T.i = u.clamp(i, 0, n);
    const ids = t.steps.map((s) => s.topic);
    view.setThread(ids, Math.min(T.i, n - 1));
    renderBar();   // first, so the map can make room for the card at its real height
    if (T.i < n) {
      const id = ids[T.i];
      if (body.classList.contains("right-open") && !mobile()) select(id, { fly: false, noPush: true });   // keep reading along if a note is open
      else { S.sel = id; view.setSelected(id); updateInsets(); }
      if (mobile()) view.flyToSet([ids[T.i - 1], ids[T.i], ids[T.i + 1]].filter(Boolean), 0.5, 1.15);
      else if (S.touched) view.reveal(id); else view.fit(true);   // the whole path stays in view while you step along it
    } else {
      S.sel = null; view.setSelected(null); body.classList.remove("right-open"); updateInsets();
      if (mobile()) view.flyToSet(ids, 0.3, 1.0); else if (!S.touched) view.fit(true);
    }
  }
  function renderBar() {
    const T = S.thread;
    if (!T) { bar.classList.remove("open"); return; }
    const t = T.t, n = t.steps.length, last = T.i >= n;
    bar.replaceChildren(
      h("div", { class: "t-top" }, h("span", { class: "t-title" }, t.title), h("button", { class: "btn ghost", type: "button", onclick: () => endThread() }, u.t("walks.end"), " ✕")),
      last
        ? h("div", null, h("div", { class: "t-step" }, u.t("walks.summary")), h("p", { class: "t-sowhat" }, t.soWhat), h("p", { class: "t-text", style: { minHeight: 0 } }, t.intro))
        : h("div", null,
          h("div", { class: "t-step" }, h("span", { class: "num" }, T.i + 1), u.t("walks.stop_of", { i: T.i + 1, n })),
          h("button", { class: "t-topic", type: "button", onclick: () => select(t.steps[T.i].topic, { noPush: true }) }, byId.get(t.steps[T.i].topic).label),
          h("p", { class: "t-text" }, t.steps[T.i].text)),
      h("div", { class: "t-nav" },
        h("button", { class: "btn", type: "button", disabled: T.i === 0, onclick: () => stepTo(T.i - 1) }, "← ", u.t("walks.back")),
        h("div", { class: "t-dots" }, [...t.steps.map((s, k) => h("button", { type: "button", class: k === T.i ? "on" : "", "aria-label": u.t("walks.stop_n", { n: k + 1 }), onclick: () => stepTo(k) })),
          h("button", { type: "button", class: last ? "on" : "", "aria-label": u.t("walks.summary"), onclick: () => stepTo(n), style: { borderRadius: "2px" } })]),
        last ? h("button", { class: "btn solid", type: "button", onclick: () => { endThread(true); goLevel("landscape", { sync: false }); select("c", { sync: false }); syncURL(true); } }, u.t("walks.big_picture"), " ↑")
          : h("button", { class: "btn solid", type: "button", onclick: () => stepTo(T.i + 1) }, T.i === n - 1 ? u.t("walks.finish") : u.t("walks.next"), " →")));
    bar.classList.add("open");
  }
  function endThread(silent) {
    if (!S.thread) return;
    S.thread = null; view.setThread(null);
    body.classList.remove("thread-on");
    bar.classList.remove("open");
    updateInsets();
    if (!body.classList.contains("right-open")) { S.sel = null; view.setSelected(null); if (!S.touched) view.fit(true); }
    if (!silent) syncURL(false);
  }

  /* ------------------------------------------------------------------ keyboard, resize */
  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "/") { e.preventDefault(); openLeft(); setTab("explore"); searchInput.focus(); searchInput.select(); }
    else if (e.key === "Escape") { if (S.thread) endThread(); else if (S.sel) deselect(); else if (S.focus) setFocus(null); else if (mobile()) closeLeft(); }
    else if (/^[123]$/.test(e.key)) goLevel(LEVELS[+e.key - 1]);
    else if (S.thread && e.key === "ArrowRight") stepTo(S.thread.i + 1);
    else if (S.thread && e.key === "ArrowLeft") stepTo(S.thread.i - 1);
  });
  $("#zIn").onclick = () => { S.touched = true; view.zoomBy(1.4); };
  $("#zOut").onclick = () => { S.touched = true; view.zoomBy(1 / 1.4); };
  $("#zFit").onclick = () => { S.touched = false; view.fit(true); };
  let refitT;
  new ResizeObserver(() => {
    view.resize();
    updateInsets();
    // window resized / phone rotated / panel opened or closed: re-proportion the orbit if the shape changed a lot, then re-frame,
    // unless the visitor has taken over the camera
    clearTimeout(refitT);
    refitT = setTimeout(() => {
      updateInsets();
      if (S.level === "landscape") return;
      view.relayout(true);
      if (S.touched) return;
      if (mobile() && S.sel) frame(S.sel); else view.fit(true);
    }, 120);
  }).observe($("#stage"));

  /* ------------------------------------------------------------------ boot */
  const q = byId.get("c");
  $("#qcap").replaceChildren(h("span", { class: "q" }, q.question), h("span", { class: "c" }, u.t("qcap.cite")));
  $("#qcap").addEventListener("click", () => select("c"));
  setMode("pillar");
  updateLinkCount();
  renderLegend();
  refreshIndexColors();
  const st = LV.parse(location.search, location.hash);
  S.level = st.level;
  body.dataset.level = S.level;
  S.focus = st.focus && byId.has(st.focus) ? st.focus : null;
  if (S.level !== "landscape") S.seenRegime = true;   // the opening sweep is already playing
  view.configure({ niche: S.level === "niche" });
  settlePlanes(S.level);
  renderLevelChrome();
  applyFilters();
  updateInsets();
  view.relayout(false);
  if (S.level !== "landscape") { if (mobile() && S.focus) view.fit(false, byId.get(S.focus).topics); else view.fit(false); }
  land.layout(false);
  const walk = st.walk && D.threads.some((t) => t.id === st.walk) ? st.walk : null;
  if (walk) startThread(walk, { sync: false });
  const first = st.id && byId.has(st.id) ? carryTo(st.id, S.level) : null;
  if (first) select(first, { sync: false });
  else if (!walk) notice(u.t("hints." + S.level + (mobile() ? "_touch" : "")));
  // web fonts change label widths: refit once they have loaded (unless the visitor has already started exploring)
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => {
    view._lw = null; view.dirty = true;
    land.layout(false);
    updateInsets();
    if (S.level === "landscape") return;
    view.relayout(false);
    if (!S.touched && !S.thread && !(mobile() && S.sel)) view.fit(false);
  });
  RM.app = app;
  document.documentElement.dataset.ready = "1";
})();
