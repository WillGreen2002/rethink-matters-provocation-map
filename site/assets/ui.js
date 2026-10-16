/* Orchestration. The map is a descent through three levels, each one closer to the ground:
     Landscape: the question and the nine themes;
     Regime:    one theme, its prompts and the other themes they reach;
     Niche:     one prompt, its discussions, examples and books, and the prompts it reaches.
   This file wires the three planes together, the breadcrumb level bar, the left panel (search, explore, guided walks, index), the
   note panel, the guided walks and the address bar. All wording comes from curation/copy.yaml through u.t(). */
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
  // The Niche examples ship in their own file (site/examples-data.js); without it there are simply none yet.
  const topicIds = new Set(D.nodes.filter((n) => n.kind === "topic").map((n) => n.id));
  for (const e of ((window.RM_EXAMPLES || {}).examples || [])) {
    if (!e || !/^ex:/.test(e.id) || D.nodes.some((n) => n.id === e.id)) continue;
    const ts = (e.topics || []).filter((t) => topicIds.has(t));
    if (!ts.length) continue;
    D.nodes.push(Object.assign({}, e, { kind: "example", topics: ts }));
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
  const shown = (l) => l.curated || l.score >= D.defaultMinScore;   // the links the map draws: every bridge, and strong shared-tag links
  const relBy = new Map();
  for (const l of relLinks) for (const [self, other] of [[l.s, l.t], [l.t, l.s]]) (relBy.get(self) || relBy.set(self, []).get(self)).push({ other, link: l });
  for (const arr of relBy.values()) arr.sort((a, b) => (b.link.curated - a.link.curated) || (b.link.score - a.link.score));
  const THEME_IDS = D.themeOrder.map((n) => "th:" + n);
  const promptsOf = (thId) => byId.get(thId).topics.map((id) => byId.get(id)).sort((a, b) => a.order - b.order).map((t) => t.id);
  const themeOf = (id) => {
    const n = byId.get(id);
    if (!n) return null;
    if (n.kind === "theme") return n.id;
    if (n.kind === "topic") return "th:" + n.theme;
    if (n.topics && n.topics.length) return "th:" + byId.get(n.topics[0]).theme;
    return null;
  };
  // what sits under a prompt on the Niche: the discussions it came from, its examples on the ground, the books suggested with it
  const sourcesOf = (tid) => { const t = byId.get(tid); return { discussions: t.sources, examples: exByTopic.get(tid) || [], books: t.reading }; };
  const sourceCount = (tid) => { const s = sourcesOf(tid); return s.discussions.length + s.examples.length + s.books.length; };

  /* ------------------------------------------------------------------ colours */
  const NONE = "#9C978A", THREAD = "#666666", FAINT = "#6B675C";
  const FACET_COLOR = { tension: "#A04340", concept: "#48909F", barrier: "#7F8C64", domain: "#D9A441", method: "#8A8577" };
  const themeColor = (n) => u.themeColor(D.themeOrder, n);
  const pillarColors = (t) => (t.pillar || []).map((k) => D.lenses.pillar.values[k].color);
  function colorOf(id) {
    const n = byId.get(id);
    if (!n) return NONE;
    switch (n.kind) {
      case "theme": return themeColor(n.n);
      case "topic": return pillarColors(n)[0] || NONE;
      case "arc": return u.logoColor(u.CHAPTER_TONE[Math.max(0, D.arcs.findIndex((a) => a.id === n.arc)) % 3]);
      case "example": return colorOf(n.topics[0]);
      case "discussion": return THREAD;
      case "book": return FAINT;
      case "tag": return FACET_COLOR[n.facet] || FAINT;
      default: return "#C9963F";
    }
  }

  const S = { level: "landscape", theme: null, prompt: null, sel: null, hist: [], thread: null, walkExtras: [], q: "", tab: "explore", opener: null,
    view: u.store.get("rm-view") === "list" ? "list" : "map" };   // the Regime and Niche as a map (the standard) or as a list

  const app = {
    D, byId, topics, examples, S,
    level: () => S.level,
    themeColor, colorOf,
    relOf: (id) => relBy.get(id) || [],
    exOf: (id) => exByTopic.get(id) || [],
    sourceCount,
    select: (id, o) => select(id, o),
    shown,
    startThread: (id) => startThread(id),
    drill: (id) => drill(id),
    goLevel: (lv, o) => goLevel(lv, o),
    // the committee's review copy: show text that changed, and additions as they arrive
    refresh: () => { if (S.sel && byId.has(S.sel)) renderNote(); renderLevelNote(); if (S.level === "niche") { nic.m = null; showNiche(); } updateInsets(); },
    addExample: (e) => {
      const n = Object.assign({}, e, { kind: "example", topics: (e.topics || []).filter((x) => byId.has(x)) });
      if (!n.topics.length || byId.has(n.id)) return;
      D.nodes.push(n); byId.set(n.id, n); examples.push(n);
      for (const x of n.topics) (exByTopic.get(x) || exByTopic.set(x, []).get(x)).push(n.id);
    },
    removeExample: (id) => {
      const n = byId.get(id);
      if (!n) return;
      byId.delete(id);
      for (const x of n.topics || []) exByTopic.set(x, (exByTopic.get(x) || []).filter((y) => y !== id));
      if (S.sel === id) deselect({ sync: false });
    },
    walksThrough: (n) => D.threads.filter((t) => t.steps.some((s) => (byId.get(s.topic) || {}).theme === n)),
    themeReach: (n) => {
      const c = {};
      for (const l of relLinks) {
        if (!shown(l)) continue;
        const a = byId.get(l.s).theme, b = byId.get(l.t).theme;
        if (a === n && b !== n) c[b] = (c[b] || 0) + 1; else if (b === n && a !== n) c[a] = (c[a] || 0) + 1;
      }
      return Object.entries(c).map(([theme, count]) => ({ theme: +theme, count })).sort((x, y) => y.count - x.count);
    },
    // links between prompts that cross from one theme to another, per pair of themes (the Landscape's dashed ties)
    themePairs: () => {
      const c = new Map();
      for (const l of relLinks) {
        if (!shown(l)) continue;
        const a = byId.get(l.s).theme, b = byId.get(l.t).theme;
        if (a === b) continue;
        const k = Math.min(a, b) + "-" + Math.max(a, b);
        const e = c.get(k) || c.set(k, { a: Math.min(a, b), b: Math.max(a, b), w: 0 }).get(k);
        e.w++;
      }
      return [...c.values()].sort((x, y) => y.w - x.w || x.a - y.a || x.b - y.b);
    },
    // links inside a chapter, and from it to each of the others
    chapterReach: (arc) => {
      const c = {};
      let inside = 0;
      for (const l of relLinks) {
        if (!shown(l)) continue;
        const a = byId.get(l.s).arc, b = byId.get(l.t).arc;
        if (a === arc && b === arc) inside++;
        else if (a === arc) c[b] = (c[b] || 0) + 1;
        else if (b === arc) c[a] = (c[a] || 0) + 1;
      }
      return { inside, out: Object.entries(c).map(([id, count]) => ({ id, count })).sort((x, y) => y.count - x.count) };
    },
  };

  /* ------------------------------------------------------------------ the three planes */
  const landEl = $("#landscape"), regEl = $("#regime"), nicEl = $("#niche");
  const land = new RM.Landscape(landEl, app, { select: (id) => select(id), drill: (id) => drill(id), hover: (id, rect) => showTipAt(id, rect) });
  const fmCallbacks = {
    select: (id) => { if (S.thread && !S.thread.t.steps.some((s) => s.topic === id) && id !== S.theme) endThread(); select(id); },
    drill: (id) => drill(id),
    move: (id) => move(id),
    hover: (id, rect) => showTipAt(id, rect),
    laidOut: (fm) => { if (fm === MAPS[S.level]) { syncToggle(); body.classList.toggle("no-arrows", !!fm.noArrows); } },
  };
  const reg = new RM.FocusMap(regEl, fmCallbacks);
  const nic = new RM.FocusMap(nicEl, fmCallbacks);
  reg.view = nic.view = S.view;
  const MAPS = { landscape: land, regime: reg, niche: nic };
  const PLANE = { landscape: landEl, regime: regEl, niche: nicEl };

  // the Regime: a theme in the middle, its prompts round it, and the themes they reach (plus, during a walk, the themes of the
  // stops either side of this one)
  function regimeModel(thId) {
    const th = byId.get(thId), mine = promptsOf(thId), inTheme = new Set(mine), arc = D.arcs.find((a) => a.id === th.arc);
    const members = mine.map((id) => {
      const t = byId.get(id), cs = pillarColors(t), n = sourceCount(id);
      const label = n === 0 ? u.t("regime.down_none") : n === 1 ? u.t("regime.down_one") : u.t("regime.down", { n });
      return { id, kind: "topic", label: t.label, color: cs[0] || NONE, color2: cs[1], down: { label, aria: u.t("regime.down_aria", { what: label, label: t.label }) } };
    });
    const links = [], out = new Map();
    for (const l of relLinks) {
      if (!shown(l)) continue;
      const a = inTheme.has(l.s), b = inTheme.has(l.t);
      if (a && b) links.push({ a: l.s, b: l.t, type: l.type, curated: !!l.curated });
      else if (a || b) {
        const mineId = a ? l.s : l.t, other = "th:" + byId.get(a ? l.t : l.s).theme;
        const e = out.get(other) || out.set(other, []).get(other);
        e.push({ member: mineId, type: l.type, curated: !!l.curated });
      }
    }
    const extras = S.thread ? S.walkExtras.filter((x) => x !== thId && !out.has(x)) : [];
    for (const x of extras) out.set(x, []);
    const w = S.thread ? walkThemes() : {};
    const neighbours = THEME_IDS.filter((x) => out.has(x)).map((x) => {
      const o = byId.get(x), ties = out.get(x), count = ties.length;
      let sub = count ? (count === 1 ? u.t("regime.nb_one") : u.t("regime.nb_sub", { n: count })) : "";
      const walkWord = x === w.next ? u.t("regime.nb_walk_next") : x === w.prev ? u.t("regime.nb_walk_prev") : "";
      if (walkWord) sub = sub ? sub + " · " + walkWord : walkWord;
      return { id: x, num: o.n, label: o.label, sub, color: themeColor(o.n), ties,
        aria: walkWord ? u.t("regime.nb_aria_walk", { num: o.n, label: o.label, walk: walkWord }) : u.t("regime.nb_aria", { num: o.n, label: o.label, links: sub }) };
    });
    return { key: thId + "|" + extras.join(","), style: "regime", members, links, neighbours,
      centre: { id: thId, kicker: u.t("landscape.theme_n", { n: th.n }), title: th.label, sub: arc ? arc.label : "", color: themeColor(th.n) },
      membersTitle: u.t("regime.members_title", { n: th.n }), neighboursTitle: u.t("regime.nbs_title") };
  }
  // the Niche: a prompt in the middle, what grounds it round it, and the prompts it reaches
  function nicheModel(tid) {
    const t = byId.get(tid), s = sourcesOf(tid), R = u.t("relations"), T = D.exampleTypes || {};
    const when = (d) => d.sessions.map((x) => D.sessions[x].label + (D.sessions[x].date ? " · " + u.fmtDate(D.sessions[x].date) : "")).join(", ");
    const members = [
      ...s.discussions.map((id) => { const d = byId.get(id); return { id, kind: "discussion", label: d.label, color: THREAD, shape: d.proposed ? "ring" : "dot",
        kicker: d.proposed ? u.t("niche.kind_proposed") : u.t("niche.kind_discussion", { when: when(d) }) }; }),
      ...s.examples.map((id) => { const e = byId.get(id), ty = T[e.type] || {}; return { id, kind: "example", label: e.label, color: colorOf(tid), shape: ty.shape || "dot",
        kicker: [ty.label || u.t("example.kind"), e.org, e.year].filter(Boolean).join(" · ") }; }),
      ...s.books.map((id) => { const b = byId.get(id); return { id, kind: "book", label: b.label, color: FAINT, shape: "book", kicker: u.t("niche.kind_book", { author: b.author }) }; }),
    ];
    const neighbours = (relBy.get(tid) || []).filter((r) => shown(r.link)).map((r) => {
      const o = byId.get(r.other), l = r.link, rel = l.curated ? (l.dir === tid ? R[l.type] : R[l.type + "_rev"] || R[l.type]) : R.shares;
      return { id: o.id, label: o.label, sub: u.t("niche.nb_sub", { n: o.theme, rel }), color: colorOf(o.id),
        ties: [{ member: null, type: l.type, curated: !!l.curated }], aria: u.t("niche.nb_aria", { label: o.label, n: o.theme, rel }) };
    });
    return { key: tid, style: "niche", members, links: [], neighbours,
      centre: { id: tid, kicker: u.t("niche.centre_kicker", { n: t.theme }), title: t.label, color: colorOf(tid) },
      membersTitle: u.t("niche.members_title"), neighboursTitle: u.t("niche.nbs_title"),
      empty: { title: u.t("niche.empty_title"), body: u.t("niche.empty_body") } };
  }
  function showRegime(dir) { const m = regimeModel(S.theme); if (!reg.m || reg.m.key !== m.key) reg.show(m, dir); reg.setSelected(S.sel); }
  function showNiche(dir) { const m = nicheModel(S.prompt); if (!nic.m || nic.m.key !== m.key) nic.show(m, dir); nic.setSelected(S.sel); }

  /* ------------------------------------------------------------------ level bar (a breadcrumb), side arrows, peek tab, live region */
  const PLANE_Y = { landscape: 3, regime: 10, niche: 17 };
  function planesIcon(level, cls) {
    const shape = (y, on) => `<path d="M3 ${y + 3.2}L14 ${y}L25 ${y + 3.2}L14 ${y + 6.4}Z" fill="${on ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" opacity="${on ? 1 : 0.55}"/>`;
    return h("svg", { class: cls || "planes", viewBox: "0 0 28 27", "aria-hidden": "true", html: LEVELS.map((lv) => shape(PLANE_Y[lv], lv === level)).join("") });
  }
  const levelbar = $("#levelbar"), levelBtns = {}, levelWhat = {};
  levelbar.setAttribute("aria-label", u.t("levels.nav_label"));
  LEVELS.forEach((lv, i) => {
    if (i) levelbar.append(h("i", { class: "lv-sep " + (i === 1 ? "dashed" : "solid"), "aria-hidden": "true" }));
    levelWhat[lv] = h("span", { class: "lv-what" });
    levelBtns[lv] = h("button", { type: "button", "data-level": lv, title: u.t("levels.key_hint", { key: i + 1 }), onclick: () => goLevel(lv) },
      planesIcon(lv, "lv-ico"), h("span", { class: "lv-text" }, h("span", { class: "lv-name" }, u.t("levels." + lv + ".name")), levelWhat[lv]));
    levelbar.append(levelBtns[lv]);
  });
  const peek = $("#peek"), live = $("#live"), sidePrev = $("#sidePrev"), sideNext = $("#sideNext"), upBtn = $("#btnUp");
  upBtn.addEventListener("click", () => goUp());
  // up one level of abstraction: from a prompt's sources to its theme, from a theme to the Landscape
  function goUp() {
    if (S.level === "niche") goLevel("regime", { theme: themeOf(S.prompt) });
    else if (S.level === "regime") goLevel("landscape");
  }
  const viewToggle = $("#viewToggle"), viewBtns = {};
  viewToggle.setAttribute("aria-label", u.t("view.label"));
  for (const v of ["map", "list"]) {
    viewBtns[v] = h("button", { type: "button", "aria-pressed": S.view === v ? "true" : "false", onclick: () => setView(v) },
      h("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.7", "stroke-linecap": "round", "aria-hidden": "true",
        html: v === "map" ? '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8" stroke-dasharray="2 3"/><circle cx="12" cy="4" r="1.6"/><circle cx="19" cy="15" r="1.6"/><circle cx="5" cy="15" r="1.6"/>'
          : '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>' }),
      h("span", null, u.t("view." + v)));
    viewToggle.append(viewBtns[v]);
  }
  function setView(v) {
    const fm = MAPS[S.level];
    if (v === "map" && fm && fm.fellBack && S.view === "map") { live.textContent = u.t("view.no_room"); return; }   // nothing to switch to
    S.view = v;
    u.store.set("rm-view", v);
    reg.setView(v); nic.setView(v);
    syncToggle();
    live.textContent = fm && fm.fellBack && v === "map" ? u.t("view.no_room") : u.t("view.announce_" + v);
  }
  // the switch shows what is drawn: List is on when the visitor chose it, and also when the ring had no room (Map then says why)
  function syncToggle() {
    const fm = MAPS[S.level], noRoom = !!(fm && fm.fellBack), ring = !!(fm && fm.el && fm.m && !fm.el.classList.contains("stack"));
    viewBtns.map.setAttribute("aria-pressed", ring ? "true" : "false");
    viewBtns.list.setAttribute("aria-pressed", ring ? "false" : "true");
    if (noRoom) { viewBtns.map.setAttribute("aria-disabled", "true"); viewBtns.map.title = u.t("view.no_room"); }
    else { viewBtns.map.removeAttribute("aria-disabled"); viewBtns.map.removeAttribute("title"); }
  }
  peek.addEventListener("click", () => { if (S.sel) drill(S.sel); });
  function sideTargets() {
    if (S.level === "regime" && S.theme) { const i = THEME_IDS.indexOf(S.theme), n = THEME_IDS.length; return [THEME_IDS[(i - 1 + n) % n], THEME_IDS[(i + 1) % n]]; }
    if (S.level === "niche" && S.prompt) {
      const ids = promptsOf(themeOf(S.prompt)), i = ids.indexOf(S.prompt), n = ids.length;
      return n > 1 ? [ids[(i - 1 + n) % n], ids[(i + 1) % n]] : [null, null];
    }
    return [null, null];
  }
  for (const [btn, k] of [[sidePrev, 0], [sideNext, 1]]) btn.addEventListener("click", (e) => { if (e.detail > 1) return; const id = sideTargets()[k]; if (id) move(id, k ? "right" : "left"); });

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
      RM.review ? RM.review.editable(h("p", null, u.t("levels." + lv + ".explain")), "copy:levels." + lv + ".explain", { inline: true }) : h("p", null, u.t("levels." + lv + ".explain")),
      lv === "regime" ? h("p", { class: "ln-aria" }, u.t("levels.regime.aria"), " ", h("a", { class: "ext", href: A.url, target: "_blank", rel: "noopener noreferrer" }, A.text)) : null,
      h("details", { class: "about-levels" },
        h("summary", null, u.t("about.summary")),
        u.md(u.t("about.body")),
        h("ul", { class: "refs" }, u.t("about.refs").map((r) => h("li", null, h("a", { href: r.url, target: "_blank", rel: "noopener noreferrer" }, r.text)))))].filter(Boolean));
  }

  /* ------------------------------------------------------------------ explore pane: go to a theme, highlight a pillar, the key */
  const sec = (title, ...kids) => h("section", { class: "sec" }, h("h3", null, title), ...kids);
  const chip = (label, o = {}) => h("button", { type: "button", class: "chip" + (o.cls ? " " + o.cls : ""), "aria-pressed": o.pressed ? "true" : "false", style: o.color ? { "--c": o.color } : null, title: o.title, onclick: o.onclick },
    o.color ? h("i", { class: "dot" }) : null, label, o.count != null ? h("span", { class: "n" }, o.count) : null);
  const themeBtns = {};
  const themeList = h("div", { class: "theme-list" }, THEME_IDS.map((id) => {
    const th = byId.get(id);
    return (themeBtns[id] = h("button", { type: "button", class: "theme-go", style: { "--c": themeColor(th.n) }, onclick: () => { goTheme(id); if (mobile()) closeLeft(); } },
      h("b", { class: "num" }, th.n), h("span", null, th.label), h("small", null, u.t("explore.theme_count", { n: th.topics.length }))));
  }));
  const PL = D.lenses.pillar;
  const legendEl = h("div", { class: "legend-inline", id: "legend", "aria-label": u.t("explore.legend") });
  panes.explore.append(
    sec(u.t("explore.themes_title"), h("p", { class: "hint" }, u.t("explore.themes_hint")), themeList),
    h("div", { class: "not-landscape" }, sec(u.t("explore.legend_title"), legendEl)));

  function renderLegend() {
    const el = legendEl, R = u.t("relations");
    const line = (color, label, dash) => h("span", { html: `<svg viewBox="0 0 22 12"><path d="M1 8 Q 11 0 21 6" fill="none" stroke="${color}" stroke-width="${dash ? 1.3 : 1.8}"${dash ? ' stroke-dasharray="3 3"' : ""} stroke-linecap="round"/></svg>` }, label);
    const lines = h("div", { class: "keys" }, h("span", { class: "keys-h" }, u.t("explore.legend_lines")),
      h("div", { class: "keys-grid" }, line("#2F6B63", R.echoes), line("#B65438", R.tension), line("#5B6B3C", R.enables), line("#9A6F1F", R.extends)),
      line("#6B675C", R.shared, true));
    if (S.level === "niche") {
      const T = D.exampleTypes || {};
      const items = [["dot", u.t("explore.legend_discussion")], ["ring", u.t("explore.legend_proposed")], ["book", u.t("explore.legend_book")],
        ...Object.values(T).map((v) => [v.shape, v.plural || v.label])];
      el.replaceChildren(h("ul", { class: "type-key" }, items.map(([s, l]) => h("li", null, h("i", { class: "shape shape-" + s }), l))), lines);
    } else el.replaceChildren(h("ul", null, Object.values(PL.values).map((v) => h("li", null, h("i", { style: { "--c": v.color } }), v.label))), lines);
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
    if (!q) { closeResults(); return; }
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
    else if (ev.key === "Escape") { ev.stopPropagation(); if (searchInput.value) { searchInput.value = ""; onSearch(); } else searchInput.blur(); }
  });
  searchInput.addEventListener("blur", () => setTimeout(closeResults, 120));
  searchInput.addEventListener("focus", () => { if (S.q && resList.length) renderResults(); });

  /* ------------------------------------------------------------------ guided walks + index panes */
  panes.walks.append(
    h("p", { class: "hint pane-intro" }, u.t("walks.intro")),
    ...D.threads.map((t) => h("button", { class: "thread-card", type: "button", onclick: () => startThread(t.id) },
      h("h4", null, t.title), h("p", null, t.intro),
      h("div", { class: "meta" }, h("span", { class: "pips" }, t.steps.map((s) => h("i", { style: { "--c": colorOf(s.topic) } }))), h("span", null, u.t("walks.stops", { n: t.steps.length }))))));
  D.arcs.forEach((arc) => {
    panes.index.append(h("button", { class: "idx-arc", style: { "--c": colorOf("arc:" + arc.id) }, onclick: () => { select("arc:" + arc.id); if (mobile()) closeLeft(); } }, arc.label));
    for (const n of D.themeOrder.filter((x) => arc.themes.includes(x))) {
      const th = byId.get("th:" + n);
      const ul = h("ul", null, promptsOf(th.id).map((id) => byId.get(id)).map((t) =>
        h("li", null, h("button", { onclick: () => { select(t.id); if (mobile()) closeLeft(); } }, h("i", { class: "dot", style: { "--c": colorOf(t.id) } }), t.label))));
      panes.index.append(h("div", { class: "idx-theme" }, h("button", { onclick: () => { goTheme(th.id); if (mobile()) closeLeft(); } }, h("i", null, String(n).padStart(2, "0")), th.title), ul));
    }
  });

  /* ------------------------------------------------------------------ tooltips */
  const tip = $("#tip");
  function tipBody(id) {
    const n = byId.get(id);
    if (!n) return null;
    let title = n.label, sub = "", extra = null;
    if (n.kind === "topic") { sub = u.t("tip.topic", { n: n.theme, label: byId.get("th:" + n.theme).label }); extra = h("span", { class: "tip-future" }, n.text); }
    else if (n.kind === "theme") {
      title = u.t("tip.theme_title", { n: n.n, label: n.label });
      if (S.level === "landscape") {
        sub = u.t("tip.theme_landscape", { n: n.topics.length });
        if (n.future) extra = h("span", { class: "tip-future" }, n.future.text);
      } else if (id === S.theme) sub = n.lead;
      else sub = u.t("tip.theme_move");
    }
    else if (n.kind === "tag") sub = u.t("tip.tag", { facet: D.facets[n.facet].label.replace(/s$/, ""), n: n.topics.length });
    else if (n.kind === "discussion") sub = n.sessions.map((s) => D.sessions[s].label).join(", ");
    else if (n.kind === "book") sub = n.author;
    else if (n.kind === "arc") sub = u.t("tip.arc", { themes: n.themes.length, prompts: n.topics.length });
    else if (n.kind === "example") sub = [(D.exampleTypes[n.type] || {}).label, n.org, n.year].filter(Boolean).join(" · ");
    else { title = D.center.label; sub = u.t("tip.center"); }
    return [h("b", null, title), h("small", null, sub), extra];
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
    tip.style.top = u.clamp(y, 8, st.height - 140) + "px";
    tip.classList.add("show");
  }

  /* ------------------------------------------------------------------ moving between levels */
  let swapT = [];
  function settlePlanes(lv) {
    for (const t of swapT) clearTimeout(t);
    swapT = [];
    for (const [k, el] of Object.entries(PLANE)) { el.classList.remove("enter-down", "enter-up", "leave-down", "leave-up"); el.classList.toggle("off", k !== lv); }
  }
  /* the planes tilt past one another: going down, the one you leave lifts away and the next rises into place */
  function swapPlanes(from, to, instant) {
    settlePlanes(from);
    const out = PLANE[from], inn = PLANE[to], dir = LEVELS.indexOf(to) > LEVELS.indexOf(from) ? "down" : "up";
    if (instant || reduced) { settlePlanes(to); return; }
    out.classList.add("leave-" + dir);
    inn.classList.add("enter-" + dir); inn.classList.remove("off"); void inn.offsetWidth; inn.classList.remove("enter-" + dir);
    swapT.push(setTimeout(() => settlePlanes(to), 560));
  }
  // the theme to show on the Regime and the prompt to show on the Niche, when nothing more specific is asked for
  function themeFor(o, from) {
    if (o.theme) return o.theme;
    if (from === "niche" && S.prompt) return themeOf(S.prompt);
    return (S.sel && themeOf(S.sel)) || S.theme || THEME_IDS[0];
  }
  function promptFor(o) {
    if (o.prompt) return o.prompt;
    const n = S.sel && byId.get(S.sel);
    if (n && n.kind === "topic") return n.id;
    if (n && n.kind === "theme") return promptsOf(n.id)[0];
    if (n && n.kind === "arc") return promptsOf("th:" + n.themes[0])[0];
    if (n && n.topics && n.kind !== "tag") return promptUnder(n);
    if (S.prompt && (!S.theme || themeOf(S.prompt) === S.theme)) return S.prompt;
    return promptsOf(S.theme || THEME_IDS[0])[0];
  }
  // the prompt to show a source under: the prompt you were reading if it is one of its own, else one in the theme you are in
  function promptUnder(n) {
    const sel = S.sel && byId.get(S.sel);
    if (sel && sel.kind === "topic" && n.topics.includes(sel.id)) return sel.id;
    if (S.prompt && n.topics.includes(S.prompt)) return S.prompt;
    return n.topics.find((t) => themeOf(t) === S.theme) || n.topics[0];
  }
  // going up or down keeps your place: what was open travels with you if the new level shows it, or its parent does
  function carryTo(id, lv, from) {
    if (!id) return null;
    const n = byId.get(id);
    if (!n) return null;
    if (n.kind === "tag") return id;   // a tag runs across every level: its note stays open
    if (lv === "landscape") return LV.shows("landscape", id) ? id : themeOf(from === "niche" ? S.prompt || id : id);
    if (lv === "regime") {
      if (reg.holds(id)) return id;
      if (from === "niche" && S.prompt && themeOf(S.prompt) === S.theme) return S.prompt;
      return null;
    }
    return nic.holds(id) ? id : null;
  }
  function goLevel(lv, o = {}) {
    if (!LEVELS.includes(lv)) return;
    RM.press.cancel();
    const from = S.level;
    if (lv === from) {
      if (lv === "regime" && o.theme && o.theme !== S.theme) setTheme(o.theme, { sync: o.sync });
      if (lv === "niche" && o.prompt && o.prompt !== S.prompt) setPrompt(o.prompt, { sync: o.sync });
      return;
    }
    const ae = document.activeElement, stranded = !!ae && (PLANE[from].contains(ae) || peek === ae || right.contains(ae) || (ae === upBtn && lv === "landscape"));
    if (S.thread && lv !== "regime") endThread(true);
    if (lv === "regime") S.theme = themeFor(o, from);
    if (lv === "niche") { S.prompt = promptFor(o); S.theme = themeOf(S.prompt); }
    S.level = lv;
    body.dataset.level = lv;
    tip.classList.remove("show");
    if (lv === "regime") showRegime();
    if (lv === "niche") showNiche();
    const carried = o.selecting ? S.sel : carryTo(S.sel, lv, from);
    renderChrome();
    if (lv !== "landscape") makeRoom();
    else if (S.autoClosedLeft === "level") { body.classList.remove("left-closed"); S.autoClosedLeft = false; updateInsets(); }
    swapPlanes(from, lv, o.instant);
    if (carried !== S.sel) { if (carried) select(carried, { noPush: true, sync: false, keepFocus: true }); else deselect({ sync: false, keepFocus: true }); }
    else { MAPS[lv].setSelected(S.sel); if (S.sel && !o.selecting) renderNote(); }
    announce();
    // a keyboard user who went down (or up) lands on the middle of the new level, not on whatever came after it
    if (stranded && !o.selecting && !right.contains(document.activeElement)) { const c = lv === "landscape" ? land.center : MAPS[lv].centre; if (c) c.focus({ preventScroll: true }); }
    if (o.sync !== false) syncURL(o.push !== false);
  }
  // one step down from a theme (to its prompts) or from a prompt (to its sources)
  function drill(id) {
    const n = byId.get(id);
    if (!n) return;
    if (S.thread) endThread(true);
    if (mobile() && S.sel) deselect({ sync: false });   // a phone's note would cover the level you came down to see
    if (n.kind === "theme") { if (S.level === "regime") setTheme(id); else goLevel("regime", { theme: id }); }
    else if (n.kind === "topic") { if (S.level === "niche") setPrompt(id); else goLevel("niche", { prompt: id }); }
  }
  // on a small laptop the left panel folds away when the map going down (or across) has no room for its ring beside it
  function makeRoom() {
    const fm = MAPS[S.level];
    if (mobile() || S.view !== "map" || !fm || !fm.fellBack || body.classList.contains("left-closed")) return;
    body.classList.add("left-closed"); S.autoClosedLeft = "level";
    updateInsets();
  }
  function goTheme(id) { if (S.thread) endThread(true); if (S.level === "regime") setTheme(id); else goLevel("regime", { theme: id }); }
  // sideways: another theme on the Regime, another prompt on the Niche
  function move(id, dir) {
    // during a walk, the theme holding the next (or previous) stop is the way on (or back)
    if (S.thread) {
      const w = walkThemes();
      if (id === w.next) { stepTo(S.thread.i + 1); return; }
      if (id === w.prev) { stepTo(S.thread.i - 1); return; }
      if (!S.thread.t.steps.some((s) => s.topic === id)) { endThread(true); live.textContent = u.t("walks.ended"); }
    }
    if (S.level === "regime") setTheme(id, { dir });
    else if (S.level === "niche") setPrompt(id, { dir });
  }
  // the themes of the stops either side of the current one, when they are not this one
  function walkThemes() {
    const T = S.thread, steps = T ? T.t.steps : [], at = (j) => steps[j] && themeOf(steps[j].topic);
    const cur = at(T ? T.i : -1) || S.theme, prev = at(T.i - 1), next = at(T.i + 1);
    return { prev: prev && prev !== cur ? prev : null, next: next && next !== cur ? next : null };
  }
  const order = (list, a, b) => (list.indexOf(b) >= list.indexOf(a) ? "right" : "left");
  function setTheme(id, o = {}) {
    RM.press.cancel();
    if (!id || (id === S.theme && !o.force)) return;
    const before = S.theme;
    S.theme = id;
    showRegime(o.dir || (before ? order(THEME_IDS, before, id) : null));
    if (S.sel === before && byId.get(id)) select(id, { noPush: true, sync: false, keepFocus: true });   // the note follows the theme in the middle
    else if (S.sel && !reg.holds(S.sel)) deselect({ sync: false, keepFocus: true });
    renderChrome();
    makeRoom();
    if (!o.quiet) announce();
    if (o.sync !== false) syncURL(true);
  }
  function setPrompt(id, o = {}) {
    RM.press.cancel();
    if (!id || (id === S.prompt && !o.force)) return;
    const before = S.prompt;
    S.prompt = id;
    S.theme = themeOf(id);
    const all = THEME_IDS.flatMap(promptsOf);
    showNiche(o.dir || (before ? order(all, before, id) : null));
    if (S.sel === before) select(id, { noPush: true, sync: false, keepFocus: true });
    else if (S.sel && !nic.holds(S.sel)) deselect({ sync: false, keepFocus: true });
    renderChrome();
    makeRoom();
    if (!o.quiet) announce();
    if (o.sync !== false) syncURL(true);
  }
  // where an item's note opens: its own level, focused so the item is in view
  function place(id) {
    const n = byId.get(id);
    switch (n.kind) {
      case "center": case "arc": return { level: "landscape" };
      case "theme": return S.level === "landscape" ? { level: "landscape" } : { level: "regime", theme: id };
      case "topic": return S.level === "niche" ? { level: "niche", prompt: id } : { level: "regime", theme: themeOf(id) };
      case "tag": return { level: S.level };
      default: return { level: "niche", prompt: promptUnder(n) };
    }
  }
  // say where you are now (level and what is in the middle), for screen readers
  function announce() {
    live.textContent = u.t("levels.announce", { name: u.t("levels." + S.level + ".name"), what: levelWhatText(S.level) || u.t("levels." + S.level + ".short") });
  }
  function levelWhatText(lv) {
    if (lv === "regime" && S.theme) { const th = byId.get(S.theme); return u.t("levels.regime.what", { n: th.n, label: th.label }); }
    if (lv === "niche" && S.prompt) return byId.get(S.prompt).label;
    return "";
  }
  function renderChrome() {
    const lv = S.level;
    for (const [k, b] of Object.entries(levelBtns)) {
      if (k === lv) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
      const what = LEVELS.indexOf(k) <= LEVELS.indexOf(lv) ? levelWhatText(k) : "";
      levelWhat[k].textContent = what;
      b.classList.toggle("has-what", !!what);
    }
    // the way down from what is open
    const sel = S.sel && byId.get(S.sel);
    let down = null;
    if (lv === "landscape" && sel && sel.kind === "theme") down = u.t("peek.landscape", { n: sel.n, count: sel.topics.length });
    if (lv === "regime" && sel && sel.kind === "topic") {
      const c = sourceCount(sel.id);
      down = c === 0 ? u.t("peek.regime_none", { label: sel.label }) : c === 1 ? u.t("peek.regime_one", { label: sel.label }) : u.t("peek.regime", { label: sel.label, count: c });
    }
    peek.hidden = !down || !!S.thread;
    if (down) peek.replaceChildren(planesIcon(lv === "landscape" ? "regime" : "niche", "lv-ico"), h("span", null, down), h("span", { "aria-hidden": "true" }, " ↓"));
    // sideways
    const [p, n] = sideTargets(), kind = lv === "regime" ? "theme" : "prompt";
    for (const [btn, id, k] of [[sidePrev, p, "prev"], [sideNext, n, "next"]]) {
      btn.hidden = !id;
      if (!id) continue;
      const o = byId.get(id), short = kind === "theme" ? u.t("landscape.theme_n", { n: o.n }) : o.label;
      btn.replaceChildren(h("span", { class: "sa-arrow", "aria-hidden": "true" }, k === "prev" ? "‹" : "›"), h("span", { class: "sa-label" }, short));
      btn.setAttribute("aria-label", u.t("side." + k + "_" + kind, { short, label: o.label }));
    }
    for (const [id, b] of Object.entries(themeBtns)) b.setAttribute("aria-current", lv !== "landscape" && S.theme === id ? "true" : "false");
    upBtn.hidden = lv === "landscape";
    if (lv !== "landscape") {
      const th = S.theme && byId.get(S.theme), toTheme = lv === "niche" && th;
      upBtn.replaceChildren(h("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.9", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", html: '<path d="M12 19V5M6 11l6-6 6 6"/>' }),
        h("span", { class: "up-what" }, toTheme ? u.t("up.short_theme", { n: th.n }) : u.t("up.short_landscape")));
      upBtn.setAttribute("aria-label", toTheme ? u.t("up.to_theme", { n: th.n, label: th.label }) : u.t("up.to_landscape"));
      upBtn.title = upBtn.getAttribute("aria-label");
    }
    renderLevelNote();
    renderLegend();
    updateInsets();
  }

  /* ------------------------------------------------------------------ address bar */
  function stateHref(forCopy) {
    const T = S.thread, open = body.classList.contains("right-open");
    const focus = S.level === "regime" ? S.theme : S.level === "niche" ? S.prompt : null;
    return LV.href({ level: S.level, focus, walk: T ? T.t.id : null, stop: T ? T.i + 1 : null, id: T && !open ? null : S.sel, embed: embed && !forCopy });
  }
  function syncURL(push) {
    const url = location.pathname + stateHref();
    if (url === location.pathname + location.search + location.hash) return;
    try { (push && !embed ? history.pushState : history.replaceState).call(history, null, "", url); } catch (e) { /* file:// quirks */ }
  }
  // the focus an address asks for, or the one its open item implies
  function focusFrom(st) {
    const id = st.id && byId.has(st.id) ? st.id : null;
    if (st.level === "regime") return { theme: (st.focus && /^th:/.test(st.focus) && byId.has(st.focus) ? st.focus : null) || (id && themeOf(id)) || S.theme || THEME_IDS[0] };
    if (st.level === "niche") {
      if (st.focus && /^n:/.test(st.focus) && byId.has(st.focus)) return { prompt: st.focus };
      const n = id && byId.get(id);
      return { prompt: n && n.kind === "topic" ? id : n && n.topics && n.topics.length && n.kind !== "theme" && n.kind !== "arc" && n.kind !== "tag" ? n.topics[0] : S.prompt || promptsOf(S.theme || THEME_IDS[0])[0] };
    }
    return {};
  }
  // the address bar has changed under us (Back, Forward, an edited link): follow it
  function fromURL() {
    const st = LV.parse(location.search, location.hash);
    const walk = st.walk && D.threads.some((t) => t.id === st.walk) ? st.walk : null;
    if (S.thread && S.thread.t.id !== walk) endThread(true);
    if (walk) {
      if (!S.thread) startThread(walk, { sync: false, stop: st.stop });
      else if ((st.stop || 1) - 1 !== S.thread.i) stepTo((st.stop || 1) - 1, { sync: false });
    } else {
      const f = focusFrom(st);
      if (st.level !== S.level) goLevel(st.level, Object.assign({ sync: false }, f));
      else if (f.theme && f.theme !== S.theme && S.level === "regime") setTheme(f.theme, { sync: false });
      else if (f.prompt && f.prompt !== S.prompt && S.level === "niche") setPrompt(f.prompt, { sync: false });
    }
    const id = st.id && byId.has(st.id) ? st.id : null;
    if (id && (id !== S.sel || !body.classList.contains("right-open"))) select(id, { sync: false, noPush: !!S.thread });
    else if (!id && S.thread && body.classList.contains("right-open")) { body.classList.remove("right-open"); updateInsets(); }
    else if (!id && S.sel && !S.thread) deselect({ sync: false });
  }
  window.addEventListener("popstate", fromURL);
  window.addEventListener("hashchange", fromURL);

  /* ------------------------------------------------------------------ selection + note panel */
  const right = $("#right");
  const bar = $("#threadbar");
  function rightWidth() { return Math.round(parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--right-w")) || right.getBoundingClientRect().width || 456); }
  function chromeTop() { return mobile() ? 0 : 14 + (levelbar.offsetHeight || 46) + 12 + (body.classList.contains("lv-row2") ? 50 : 0); }
  // the top row (buttons at the left, level bar in the middle, map/list switch at the right) must never overlap. In turn: the
  // buttons fold to their icons, the switch folds to its icons, the level bar's names shorten, and last of all the level bar
  // takes just the room between them. Positions are worked out from the layout rather than read back, since the level bar and
  // the switch slide (a transition) when a note opens or closes.
  const fab = $(".fab-row"), stage = $("#stage");
  // is there room beside an open note (and the left panel) for a ring at all? Below this the Regime and Niche are lists, with no
  // side arrows, and the map/list switch has nothing to switch
  function leftWidth() { return Math.round(parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--left-w")) || 328); }
  // the stage's width once the left panel has finished opening or closing (the live width lags behind it by a third of a second)
  function stageWidth() {
    if (mobile()) return stage.clientWidth;
    const left = $(".left"), shown = !body.classList.contains("left-closed") && getComputedStyle(left).display !== "none";
    return document.documentElement.clientWidth - (shown ? leftWidth() : 0);
  }
  const WALK_W = 300;
  function walkDock() { return !!S.thread && !mobile() && stageWidth() - (body.classList.contains("right-open") ? rightWidth() : 0) - WALK_W - 32 >= 600; }
  function cramped() { return !mobile() && stageWidth() - (body.classList.contains("right-open") ? rightWidth() : 0) < 560; }
  function fitChrome() {
    body.classList.remove("fab-tight", "vt-tight", "lv-tight", "lv-icons", "lv-row2");
    levelbar.style.left = levelbar.style.maxWidth = "";
    const W = stageWidth();   // (all in the stage's own coordinates)
    const shift = body.classList.contains("right-open") && !mobile() ? rightWidth() : 0, gap = 10;
    body.classList.toggle("cramped", cramped());
    // the switch shows where it can do something: on the Regime and Niche, with room for a ring
    viewToggle.hidden = S.level === "landscape" || mobile() || cramped();
    syncToggle();
    if (mobile() || !W) return;
    const lo = () => fab.offsetLeft + fab.offsetWidth + gap;
    const hi = () => (viewToggle.hidden ? W - shift - 12 : W - shift - 16 - viewToggle.offsetWidth - gap);
    const mid = (W - shift) / 2;
    const fits = () => { const w = levelbar.offsetWidth; return mid - w / 2 >= lo() && mid + w / 2 <= hi(); };
    if (fits()) return;
    if (mid - levelbar.offsetWidth / 2 < lo()) body.classList.add("fab-tight");
    if (fits()) return;
    if (!viewToggle.hidden && mid + levelbar.offsetWidth / 2 > hi()) body.classList.add("vt-tight");
    if (fits()) return;
    body.classList.add("lv-tight");
    if (fits()) return;
    body.classList.add("lv-icons");   // the levels you are not on keep only their icons (and their names for screen readers)
    if (fits()) return;
    const L = lo(), H = hi();
    if (H - L >= 200) {
      levelbar.style.maxWidth = H - L + "px";
      levelbar.style.left = Math.round((L + H) / 2) + "px";
      return;
    }
    // no room beside the buttons at all: the level bar takes a row of its own beneath them, kept inside the visible strip
    body.classList.add("lv-row2");
    const room = Math.max(120, W - shift - 24);
    levelbar.style.maxWidth = room + "px";
    levelbar.style.left = Math.round(Math.max(12 + Math.min(levelbar.offsetWidth, room) / 2, (W - shift) / 2)) + "px";
  }
  function updateInsets() {
    fitChrome();
    const open = body.classList.contains("right-open"), m = mobile();
    const r = open && !m ? rightWidth() : 0;
    if (S.level === "landscape") {
      // the ring sits below the question's caption; as cards (the question heading the list), just below the top row
      const q = $("#qcap");
      land.setInsets({ t: m ? 0 : chromeTop() + (q.offsetHeight || 56) + 4, tc: m ? 0 : chromeTop() + 4, r, b: m ? 0 : 58, l: 0, w: m ? 0 : stageWidth() });
      return;
    }
    const dock = walkDock();
    body.classList.toggle("walk-dock", dock);
    document.documentElement.style.setProperty("--walk-top", chromeTop() + "px");
    const card = S.thread && !dock ? bar.offsetHeight + 28 : 0, pk = 58;   // room kept for the peek tab and hints, so the ring does not jump when one shows
    const c = cramped();   // (no side arrows then, so no room kept for them; nor during a walk, which has none)
    MAPS[S.level].setInsets(m ? { t: 0, r: 0, b: 0, l: 0, side: 0, cramp: false, w: 0 }
      : { t: chromeTop(), b: Math.max(card, pk), l: dock ? WALK_W + 32 : 0, r, side: c || S.thread ? 0 : 70, cramp: c, w: stageWidth() });
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
    const ae = document.activeElement, had = !!ae && right.contains(ae), key = had ? ae.getAttribute("data-k") : null;
    right.replaceChildren(head(r.crumb), h("div", { class: "r-body" }, r.body));
    right.setAttribute("aria-label", n.label || u.t("note.label"));
    const h1 = right.querySelector(".r-body h1");
    if (h1) h1.tabIndex = -1;
    if (had) { const el = (key && right.querySelector('[data-k="' + key + '"]')) || h1; if (el) el.focus({ preventScroll: true }); }
  }
  function select(id, o = {}) {
    const n = byId.get(id);
    if (!n) return;
    // opened from a button, link or the search box (not from the address bar): take keyboard focus into the note
    const ae = document.activeElement, fromControl = o.sync !== false && !o.keepFocus && !!ae && ae !== document.body && !right.contains(ae) && !bar.contains(ae);
    if (fromControl) S.opener = ae;
    const p = place(id), prevSel = S.sel;
    if (S.thread && !S.thread.t.steps.some((s) => s.topic === id) && (p.level !== S.level || (p.theme && p.theme !== S.theme) || p.prompt)) {
      endThread(true);
      live.textContent = u.t("walks.ended");
    }
    let pushed = false;
    if (p.level === S.level) {
      if (p.theme && p.theme !== S.theme) { S.sel = null; setTheme(p.theme, { sync: false }); pushed = true; }
      if (p.prompt && p.prompt !== S.prompt) { S.sel = null; setPrompt(p.prompt, { sync: false }); pushed = true; }
    } else {
      goLevel(p.level, { sync: false, selecting: true, theme: p.theme, prompt: p.prompt });
      pushed = true;
    }
    if (prevSel && prevSel !== id && !o.noPush) { S.hist.push(prevSel); if (S.hist.length > 30) S.hist.shift(); }
    S.sel = id;
    MAPS[S.level].setSelected(id);
    renderNote();
    body.classList.add("right-open");
    // on laptop-width windows give the map the room: tuck the left panel away while a note is open
    if (!mobile() && window.innerWidth < 1500 && !body.classList.contains("left-closed")) { body.classList.add("left-closed"); S.autoClosedLeft = "note"; }
    renderChrome();
    if (o.sync !== false) syncURL(pushed);
    if (mobile() && !o.keepLeft) closeLeft();
    if (fromControl) { const h1 = right.querySelector(".r-body h1"); if (h1) h1.focus({ preventScroll: true }); }
  }
  function back() {
    const prev = S.hist.pop();
    if (prev) select(prev, { noPush: true });
  }
  function deselect(o = {}) {
    const ae = document.activeElement, inNote = !o.keepFocus && !!ae && right.contains(ae);
    S.sel = null; S.hist = [];
    for (const m of Object.values(MAPS)) m.setSelected(null);
    body.classList.remove("right-open");
    if (S.autoClosedLeft === "note") { body.classList.remove("left-closed"); S.autoClosedLeft = false; }
    renderChrome();
    if (o.sync !== false) syncURL(false);
    // back to whatever opened the note, if it is still there to be seen
    if (inNote) {
      const el = S.opener;
      S.opener = null;
      if (el && el.isConnected && el.getClientRects().length && !el.closest(".off") && getComputedStyle(el).visibility !== "hidden") el.focus({ preventScroll: true });
      else rescueFocus(true);
    }
  }
  // keyboard focus left on something that has just gone away: put it somewhere that says where you are
  function rescueFocus(force) {
    const ae = document.activeElement;
    if (!force && ae && ae !== document.body) return;
    levelBtns[S.level].focus({ preventScroll: true });
  }

  function openLeft() { S.autoClosedLeft = false; if (mobile()) body.classList.add("left-open"); else body.classList.remove("left-closed"); }
  function closeLeft() { if (mobile()) body.classList.remove("left-open"); }
  $("#btnPanel").addEventListener("click", () => {
    S.autoClosedLeft = false; S.userPanel = true;
    if (mobile()) { body.classList.toggle("left-open"); return; }
    const opening = body.classList.contains("left-closed");
    if (opening && body.classList.contains("right-open") && document.documentElement.clientWidth - leftWidth() - rightWidth() < 380) { endThread(true); deselect(); }
    body.classList.toggle("left-closed");
  });

  /* ------------------------------------------------------------------ guided walks: they run through the Regime, theme by theme */
  bar.setAttribute("aria-label", u.t("walks.region"));
  function startThread(id, o = {}) {
    const t = D.threads.find((x) => x.id === id);
    if (!t) return;
    const moved = S.level !== "regime";
    S.thread = { t, i: -1 };
    body.classList.add("thread-on");
    reg.forceRing = true;
    closeLeft();
    if (!mobile() && !body.classList.contains("left-closed")) { body.classList.add("left-closed"); S.autoClosedLeft = "walk"; }
    // a walk is map-first: the note panel stays closed until you open a stop from the card
    S.sel = null; S.hist = []; body.classList.remove("right-open");
    stepTo(o.stop ? o.stop - 1 : 0, { sync: false });
    if (o.sync !== false) syncURL(moved);
  }
  // the themes of the stops either side of this one, so the way in and the way on can be drawn
  function walkExtras(i) {
    const steps = S.thread.t.steps, out = [];
    for (const j of [i - 1, i + 1]) if (steps[j]) out.push("th:" + byId.get(steps[j].topic).theme);
    return out;
  }
  function walkOverlay() {
    const T = S.thread, steps = T.t.steps, cur = steps[T.i] && steps[T.i].topic;
    if (!cur) return null;
    const stops = new Map();
    steps.forEach((s, k) => { if (reg.holds(s.topic)) stops.set(s.topic, k + 1); });
    const end = (j) => { const s = steps[j]; if (!s) return null; return { id: reg.holds(s.topic) ? s.topic : "th:" + byId.get(s.topic).theme }; };
    return { cur, stops, prev: end(T.i - 1), next: end(T.i + 1) };
  }
  function stepTo(i, o = {}) {
    const T = S.thread;
    if (!T) return;
    const t = T.t, n = t.steps.length, was = T.i;
    T.i = u.clamp(i, 0, n);
    renderBar();   // first, so the map can make room for the card at its real height
    if (T.i < n) {
      const id = t.steps[T.i].topic, th = themeOf(id), reading = body.classList.contains("right-open") && !mobile();
      S.walkExtras = walkExtras(T.i);
      const dir = was >= 0 && was !== T.i ? (T.i > was ? "right" : "left") : null;
      S.sel = id;   // first, so moving to the stop's theme keeps the note open rather than closing it
      if (S.level !== "regime") goLevel("regime", { theme: th, sync: false });
      else if (th !== S.theme) setTheme(th, { sync: false, dir, quiet: true });
      else showRegime();
      if (reading) select(id, { noPush: true, sync: false, keepFocus: true });   // keep reading along if a note is open
      else { reg.setSelected(id); }
      reg.setWalk(walkOverlay());
    } else {
      S.sel = null; reg.setSelected(null); reg.setWalk(null); body.classList.remove("right-open");
    }
    renderChrome();
    live.textContent = T.i < n ? u.t("walks.stop_of", { i: T.i + 1, n }) + ": " + byId.get(t.steps[T.i].topic).label : t.title + ": " + u.t("walks.summary");
    if (o.sync !== false) syncURL(false);
  }
  function renderBar() {
    const T = S.thread;
    if (!T) { bar.classList.remove("open"); return; }
    const t = T.t, n = t.steps.length, last = T.i >= n;
    const ae = document.activeElement, key = ae && bar.contains(ae) ? ae.getAttribute("data-k") : null;
    bar.replaceChildren(
      h("div", { class: "t-top" }, h("span", { class: "t-title" }, t.title), h("button", { class: "btn ghost", type: "button", "data-k": "end", onclick: () => endThread() }, u.t("walks.end"), h("span", { "aria-hidden": "true" }, " ✕"))),
      last
        ? h("div", null, h("div", { class: "t-step" }, u.t("walks.summary")), h("p", { class: "t-sowhat" }, t.soWhat), h("p", { class: "t-text", style: { minHeight: 0 } }, t.intro))
        : h("div", null,
          h("div", { class: "t-step" }, h("span", { class: "num" }, T.i + 1), u.t("walks.stop_of", { i: T.i + 1, n })),
          h("button", { class: "t-topic", type: "button", "data-k": "topic", onclick: () => select(t.steps[T.i].topic, { noPush: true }) }, byId.get(t.steps[T.i].topic).label),
          h("p", { class: "t-text" }, t.steps[T.i].text)),
      h("div", { class: "t-nav" },
        h("button", { class: "btn", type: "button", "data-k": "back", disabled: T.i === 0, onclick: () => stepTo(T.i - 1) }, h("span", { "aria-hidden": "true" }, "← "), u.t("walks.back")),
        h("div", { class: "t-dots" }, [...t.steps.map((s, k) => h("button", { type: "button", class: k === T.i ? "on" : "", "data-k": "dot" + k, "aria-current": k === T.i ? "step" : null, "aria-label": u.t("walks.stop_n", { n: k + 1 }), onclick: () => stepTo(k) })),
          h("button", { type: "button", class: last ? "on" : "", "data-k": "dot" + n, "aria-current": last ? "step" : null, "aria-label": u.t("walks.summary"), onclick: () => stepTo(n), style: { borderRadius: "2px" } })]),
        last ? h("button", { class: "btn solid", type: "button", "data-k": "next", onclick: () => { endThread(true); goLevel("landscape", { sync: false }); select("c", { sync: false }); syncURL(true); const h1 = right.querySelector(".r-body h1"); if (h1) h1.focus({ preventScroll: true }); } }, u.t("walks.big_picture"), h("span", { "aria-hidden": "true" }, " ↑"))
          : h("button", { class: "btn solid", type: "button", "data-k": "next", onclick: () => stepTo(T.i + 1) }, T.i === n - 1 ? u.t("walks.finish") : u.t("walks.next"), h("span", { "aria-hidden": "true" }, " →"))));
    bar.classList.add("open");
    // the buttons were rebuilt: keep keyboard focus on the one that was pressed (or Next, if that one is now disabled)
    if (key) { let el = bar.querySelector('[data-k="' + key + '"]'); if (!el || el.disabled) el = bar.querySelector('[data-k="next"]'); if (el) el.focus({ preventScroll: true }); }
  }
  function endThread(silent) {
    if (!S.thread) return;
    const inBar = bar.contains(document.activeElement);
    S.thread = null; S.walkExtras = [];
    body.classList.remove("thread-on", "walk-dock");
    reg.forceRing = false;
    if (S.autoClosedLeft === "walk") { body.classList.remove("left-closed"); S.autoClosedLeft = false; }
    bar.classList.remove("open");
    reg.setWalk(null);
    if (reg.m && S.level === "regime") showRegime();   // drop the themes that were only there for the walk
    if (!body.classList.contains("right-open")) { S.sel = null; reg.setSelected(null); }
    renderChrome();
    if (!silent) syncURL(false);
    if (inBar) rescueFocus(true);
  }

  /* ------------------------------------------------------------------ keyboard, resize */
  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    const inBar = levelbar.contains(document.activeElement);
    if (e.key === "/") { e.preventDefault(); openLeft(); setTab("explore"); searchInput.focus(); searchInput.select(); }
    else if (e.key === "Escape") { RM.press.cancel(); if (S.thread) endThread(); else if (S.sel) deselect(); else if (mobile() && body.classList.contains("left-open")) closeLeft(); else if (S.level !== "landscape") { goUp(); levelBtns[S.level].focus({ preventScroll: true }); } }
    else if (inBar && /^[123]$/.test(e.key)) { goLevel(LEVELS[+e.key - 1]); levelBtns[S.level].focus(); }
    else if (inBar && (e.key === "ArrowRight" || e.key === "ArrowLeft" || e.key === "Home" || e.key === "End")) {
      e.preventDefault();
      const i = LEVELS.indexOf(document.activeElement.dataset.level), j = e.key === "Home" ? 0 : e.key === "End" ? 2 : u.clamp(i + (e.key === "ArrowRight" ? 1 : -1), 0, 2);
      levelBtns[LEVELS[j]].focus();
    }
    else if (S.thread && e.key === "ArrowRight") stepTo(S.thread.i + 1);
    else if (S.thread && e.key === "ArrowLeft") stepTo(S.thread.i - 1);
  });
  new ResizeObserver(() => updateInsets()).observe($("#stage"));
  // (a frame later: changing the level bar's size inside its own resize callback would loop)
  let fitRaf = 0;
  new ResizeObserver(() => { cancelAnimationFrame(fitRaf); fitRaf = requestAnimationFrame(() => updateInsets()); }).observe(levelbar);

  /* ------------------------------------------------------------------ boot */
  const q = byId.get("c");
  $("#qcap").replaceChildren(h("span", { class: "q" }, q.question), h("span", { class: "c" }, u.t("qcap.cite")));
  $("#qcap").addEventListener("click", () => select("c"));
  const st = LV.parse(location.search, location.hash);
  const walk = st.walk && D.threads.some((t) => t.id === st.walk) ? st.walk : null;
  const f0 = focusFrom(st);
  S.level = st.level;
  body.dataset.level = S.level;
  if (f0.theme) S.theme = f0.theme;
  if (f0.prompt) { S.prompt = f0.prompt; S.theme = themeOf(f0.prompt); }
  if (S.level === "regime" && !walk) showRegime();
  if (S.level === "niche") showNiche();
  settlePlanes(S.level);
  renderChrome();
  if (S.level !== "landscape") makeRoom();   // a link straight to a theme or prompt on a small laptop: the map gets the room
  land.layout(false);
  if (walk) startThread(walk, { sync: false, stop: st.stop });
  const first = st.id && byId.has(st.id) ? st.id : null;
  if (first) select(first, { sync: false, noPush: !!walk });
  else if (!walk) notice(u.t("hints." + S.level + (mobile() ? "_touch" : "")));
  // web fonts change text widths: lay out again once they have loaded
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { land.layout(false); reg.layout(); nic.layout(); updateInsets(); if (!S.userPanel && S.level !== "landscape") makeRoom(); });
  RM.app = app;
  document.documentElement.dataset.ready = "1";
})();
