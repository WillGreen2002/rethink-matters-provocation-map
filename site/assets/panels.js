/* Right-hand "note" panel renderers. Each returns { crumb, body } for a node. Wording: curation/copy.yaml, through u.t(). */
(function () {
  const RM = (window.RM = window.RM || {});
  const { u } = RM;
  const h = u.h;
  const put = (el, ...kids) => { for (const k of kids) if (k) el.append(k); };   // append what exists (append(null) would print "null")
  const FACET_COLOR = { tension: "#A04340", concept: "#48909F", barrier: "#7F8C64", domain: "#D9A441", method: "#8A8577" };

  function relLabel(type, forward) {
    const R = u.t("relations");
    return forward ? R[type] : R[type + "_rev"] || R[type];
  }
  function pillarChip(app, key) {
    const v = app.D.lenses.pillar.values[key];
    return h("button", { type: "button", class: "chip sm ro", style: { "--c": v.color }, title: u.t("topic.pillar_tip") + " " + (v.def || v.q || ""),
      onclick: () => app.filterBy("pillar", key) }, h("i", { class: "dot" }), v.short || v.label);
  }
  function tagChip(app, tid) {
    const t = app.byId.get(tid);
    return h("button", { type: "button", class: "chip sm ro", title: t.def, onclick: () => app.select(tid) }, h("i", { class: "dot", style: { "--c": FACET_COLOR[t.facet] } }), t.label);
  }
  function nodeLink(app, id, extra) {
    const n = app.byId.get(id);
    if (!n) return null;
    return h("button", { type: "button", class: "chip sm ro", onclick: () => app.select(id) }, h("i", { class: "dot", style: { "--c": app.colorOf(id) } }), extra || n.label);
  }
  // working group and value: who looks after a prompt and which of the report's values it speaks to, as one quiet line
  function metaLine(app, wg, wgProposed, value) {
    const L = app.D.lenses, parts = [];
    if (wg && wg.length) parts.push(u.t("topic.wg") + " " + wg.map((v) => L.wg.values[v].short + ((wgProposed || []).includes(v) ? "*" : "")).join(", "));
    if (value && value.length) parts.push(u.t("topic.value") + " " + value.map((v) => L.value.values[v].label.toLowerCase()).join(", "));
    if (!parts.length) return null;
    return h("p", { class: "meta-line", title: (wgProposed || []).length ? u.t("topic.wg_proposed") : null }, parts.join(" · "));
  }
  function refs(list) {
    if (!list || !list.length) return null;
    return h("ul", { class: "refs" }, list.map((r) => h("li", null, h("a", { href: r.url, target: "_blank", rel: "noopener noreferrer" }, r.label))));
  }
  function conf(app) { return h("p", { class: "conf" }, app.D.site.chatham, " ", u.t("note.draft_tags")); }
  function badge(status) { return h("span", { class: "badge " + status }, u.t("future.badge_" + String(status).replace("-", "_"))); }
  function sessionMeta(app, d) {
    const S = app.D.sessions, out = [];
    for (const s of d.sessions) {
      const ss = S[s];
      out.push(h("span", { class: "tagm" + (s === "PROPOSED" ? " proposed" : "") }, ss.label + (ss.date ? " · " + u.fmtDate(ss.date) : "")));
    }
    for (const n of d.noteIds) out.push(h("span", { class: "tagm" }, u.t("disc.notes_n", { n })));
    return out;
  }
  // a drafted future (or the overall answer): its words, a Draft badge, and what it was drawn from
  function future(app, f, title, note) {
    if (!f) return null;
    return h("section", { class: "future" },
      h("h2", null, title, badge(f.status)),
      h("p", { class: "future-text" }, f.text),
      f.note ? h("p", { class: "future-note" }, f.note) : null,
      f.drawsOn && f.drawsOn.length ? h("div", { class: "drawn" }, h("span", { class: "drawn-k" }, u.t("future.drawn")), h("div", { class: "chips" }, f.drawsOn.map((id) => nodeLink(app, id)))) : null,
      h("p", { class: "cite" }, note));
  }
  function examplesLine(app, ids, topicId) {
    const wrap = h("div", { class: "ground" });
    if (!ids.length) { wrap.append(h("p", { class: "md faint" }, u.t("ground.none"))); return wrap; }
    if (topicId) wrap.append(h("button", { type: "button", class: "btn", onclick: () => { app.goLevel("niche"); app.select(topicId); } }, h("span", { "aria-hidden": "true" }, "↓ "), u.t("ground.some", { n: ids.length })));
    wrap.append(h("div", { class: "chips" }, ids.map((id) => nodeLink(app, id))));
    return wrap;
  }

  /* ---------------------------------------------------------------- discussion block (used inside topic + own panel) */
  function discBody(app, d) {
    const wrap = h("div", { class: "d-body" });
    wrap.append(h("h3", null, d.texts.length > 1 ? u.t("disc.provocations") : u.t("disc.provocation")));
    for (const tx of d.texts) {
      if (tx.session) wrap.append(h("div", { class: "session-tag" }, app.D.sessions[tx.session].label));
      wrap.append(h("blockquote", null, tx.paras.map((p) => h("p", null, p))));
    }
    if (d.questions && d.questions.length) {
      wrap.append(h("h3", null, u.t("disc.points")));
      wrap.append(h("ul", { class: "qs" }, d.questions.map((q) => h("li", null, q))));
    }
    wrap.append(h("h3", null, u.t("disc.said")));
    if (d.notes) wrap.append(u.md(d.notes));
    else wrap.append(h("p", { class: "md faint", style: { fontStyle: "italic", margin: 0 } }, d.proposed ? u.t("disc.proposed_note") : u.t("disc.no_notes")));
    const r = refs(d.refs);
    if (r) { wrap.append(h("h3", null, u.t("disc.refs"))); wrap.append(r); }
    return wrap;
  }
  function discItem(app, d, open) {
    const el = h("details", { class: "disc" }, h("summary", null, h("div", { class: "d-title" }, h("span", null, d.label)), h("div", { class: "d-meta" }, sessionMeta(app, d))), discBody(app, d));
    if (open) el.setAttribute("open", "");
    return el;
  }

  /* ---------------------------------------------------------------- relations */
  function relItem(app, selfId, r) {
    const o = app.byId.get(r.other), l = r.link;
    const el = h("button", { type: "button", class: "rel-item" + (l.curated ? "" : " derived"), onclick: () => app.select(r.other) });
    const tl = l.curated ? relLabel(l.type, l.dir === selfId) : u.t("relations.shares");
    el.append(h("div", { class: "rt" }, h("i", { style: { "--c": app.colorOf(r.other) } }), h("span", null, o.label), h("span", { class: "ty " + (l.curated ? "ty-" + l.type : "faint") }, tl)));
    if (l.curated) el.append(h("p", { class: "why" }, l.why));
    const via = [];
    for (const t2 of l.tags) via.push(app.byId.get(t2).label);
    for (const d of l.src) via.push(u.t("relations.same_disc", { label: app.byId.get(d).label }));
    if (via.length) el.append(h("p", { class: "via" }, (l.curated ? u.t("relations.also") : u.t("relations.shared_prefix")) + " " + via.slice(0, 5).join(" · ") + (via.length > 5 ? " …" : "")));
    return el;
  }

  /* ---------------------------------------------------------------- topic */
  function topic(app, n) {
    const th = app.byId.get("th:" + n.theme), color = app.colorOf(n.id);
    const body = h("div");
    body.append(h("span", { class: "kind", style: { "--c": color } }, h("i"), u.t("topic.kind")));
    body.append(h("h1", null, n.label));
    body.append(h("p", { class: "prompt", style: { "--c": color } }, n.text));
    body.append(h("div", { class: "lens-row" }, h("span", null, u.t("topic.pillar")), h("div", { class: "chips" }, n.pillar.map((v) => pillarChip(app, v)))));
    put(body, metaLine(app, n.wg, n.wgProposed, n.value));

    // tags grouped by facet
    body.append(h("h2", null, u.t("topic.tags"), h("small", null, u.t("topic.tags_sub"))));
    const byFacet = {};
    for (const t of n.tags) (byFacet[app.byId.get(t).facet] = byFacet[app.byId.get(t).facet] || []).push(t);
    for (const f of Object.keys(app.D.facets)) {
      if (!byFacet[f]) continue;
      body.append(h("div", { class: "group-h" }, app.D.facets[f].label));
      body.append(h("div", { class: "chips" }, byFacet[f].map((t) => tagChip(app, t))));
    }

    // connections
    const rels = app.relOf(n.id);
    const cur = rels.filter((r) => r.link.curated), der = rels.filter((r) => !r.link.curated && r.link.score >= 3.4);
    body.append(h("h2", null, u.t("topic.connections"), h("small", null, u.t("topic.connections_sub", { cur: cur.length, der: der.length }))));
    if (cur.length) cur.forEach((r) => body.append(relItem(app, n.id, r)));
    if (der.length) {
      body.append(h("div", { class: "group-h" }, u.t("topic.also")));
      der.slice(0, 5).forEach((r) => body.append(relItem(app, n.id, r)));
      if (der.length > 5) {
        const more = h("button", { type: "button", class: "more", onclick: () => { der.slice(5).forEach((r) => more.before(relItem(app, n.id, r))); more.remove(); } }, u.t("topic.more", { n: der.length - 5 }));
        body.append(more);
      }
    }
    if (!cur.length && !der.length) body.append(h("p", { class: "md faint" }, u.t("topic.no_links")));

    // the Niche: examples on the ground
    body.append(h("h2", null, u.t("ground.title")));
    body.append(examplesLine(app, app.exOf(n.id), app.level() === "niche" ? null : n.id));

    // discussions
    const ds = n.sources.map((id) => app.byId.get(id));
    body.append(h("h2", null, u.t("topic.discussions"), h("small", null, ds.length ? u.t("topic.discussions_sub", { n: ds.length }) : "")));
    if (ds.length) ds.forEach((d, i) => body.append(discItem(app, d, ds.length === 1 || (i === 0 && !!d.notes))));
    else body.append(h("p", { class: "md faint" }, u.t("topic.no_discussions")));

    if (n.reading.length) {
      body.append(h("h2", null, u.t("topic.reading"), h("small", null, u.t("topic.reading_sub"))));
      body.append(h("div", { class: "chips books" }, n.reading.map((b) => nodeLink(app, b, app.byId.get(b).label))));
    }
    body.append(conf(app));
    return { crumb: h("a", { href: "#" + th.id, onclick: (e) => { e.preventDefault(); app.select(th.id); } }, u.t("topic.crumb", { n: th.n, title: th.title })), body };
  }

  /* ---------------------------------------------------------------- theme */
  function theme(app, n) {
    const arc = app.D.arcs.find((a) => a.id === n.arc), color = app.colorOf(n.id), S = app.S;
    const ts = n.topics.map((id) => app.byId.get(id)).sort((a, b) => a.order - b.order);
    const body = h("div");
    body.append(h("span", { class: "kind", style: { "--c": color } }, h("i"), u.t("theme.kind", { n: n.n, chapter: arc.label })));
    body.append(h("h1", null, n.title));
    body.append(h("p", { class: "prompt", style: { "--c": color } }, n.lead));
    // down to its provocations (from the Landscape), or show only them (on the map itself)
    if (app.level() === "landscape") body.append(h("button", { type: "button", class: "btn solid down-btn", onclick: () => app.drill(n.id) }, h("span", { "aria-hidden": "true" }, "↓ "), u.t("theme.down", { n: ts.length })));
    else body.append(h("button", { type: "button", class: "btn down-btn", "aria-pressed": S.focus === n.id ? "true" : "false", onclick: () => app.drill(S.focus === n.id ? null : n.id) },
      S.focus === n.id ? u.t("theme.focus_off") : u.t("theme.focus_on", { n: ts.length })));
    put(body, future(app, n.future, u.t("future.title"), u.t("future.theme_note")));
    if (n.sheet && n.sheet !== n.n) body.append(h("p", { class: "cite" }, u.t("theme.sheet", { sheet: n.sheet })));
    body.append(h("h2", null, u.t("theme.prompts"), h("small", null, u.t("theme.prompts_sub", { n: ts.length }))));
    ts.forEach((t) => body.append(h("button", { type: "button", class: "rel-item", onclick: () => app.select(t.id) },
      h("div", { class: "rt" }, h("i", { style: { "--c": app.colorOf(t.id) } }), h("span", null, t.label)),
      h("p", { class: "why" }, t.text))));
    // where this theme reaches out
    const cross = app.themeReach(n.n);
    if (cross.length) {
      body.append(h("h2", null, u.t("theme.reach")));
      body.append(h("div", { class: "chips" }, cross.slice(0, 5).map((c) => {
        const t = app.byId.get("th:" + c.theme);
        return h("button", { type: "button", class: "chip ro sm", onclick: () => app.select(t.id), title: u.t("theme.reach_tip", { n: c.count }) }, h("i", { class: "dot", style: { "--c": app.colorOf(t.id) } }), t.label + " ", h("span", { class: "n" }, c.count));
      })));
    }
    const walks = app.walksThrough(n.n);
    if (walks.length) {
      body.append(h("h2", null, u.t("theme.walks")));
      walks.forEach((w) => body.append(h("button", { type: "button", class: "rel-item walk-item", onclick: () => app.startThread(w.id) },
        h("div", { class: "rt" }, h("span", null, w.title), h("span", { class: "ty faint" }, u.t("walks.stops", { n: w.steps.length }))))));
    }
    const exs = [...new Set(ts.flatMap((t) => app.exOf(t.id)))];
    body.append(h("h2", null, u.t("ground.title")));
    body.append(examplesLine(app, exs, null));
    const tc = {};
    for (const t of ts) for (const tg of t.tags) tc[tg] = (tc[tg] || 0) + 1;
    const top = Object.entries(tc).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 9);
    body.append(h("h2", null, u.t("theme.tags")));
    body.append(h("div", { class: "chips" }, top.map(([tg, c]) => h("button", { type: "button", class: "chip sm ro", onclick: () => app.select(tg), title: app.byId.get(tg).def }, h("i", { class: "dot", style: { "--c": FACET_COLOR[app.byId.get(tg).facet] } }), app.byId.get(tg).label + " ", h("span", { class: "n" }, c)))));
    body.append(conf(app));
    return { crumb: h("a", { href: "#arc:" + arc.id, onclick: (e) => { e.preventDefault(); app.select("arc:" + arc.id); } }, u.t("theme.crumb", { label: arc.label })), body };
  }

  /* ---------------------------------------------------------------- chapter (one of the Bookshelf's three shelves) */
  function arc(app, n) {
    const body = h("div"), color = app.colorOf(n.id), S = app.S;
    const ths = n.themes.map((x) => app.byId.get("th:" + x)).filter(Boolean);
    body.append(h("span", { class: "kind", style: { "--c": color } }, h("i"), u.t("arc.kind")));
    body.append(h("h1", null, n.label));
    body.append(h("p", { class: "prompt plain", style: { "--c": color } }, u.t("arc.lede", { themes: ths.length, prompts: n.topics.length })));
    if (app.level() === "landscape") body.append(h("button", { type: "button", class: "btn solid down-btn", onclick: () => app.drill(n.id) }, h("span", { "aria-hidden": "true" }, "↓ "), u.t("arc.down", { n: n.topics.length })));
    else body.append(h("button", { type: "button", class: "btn down-btn", "aria-pressed": S.focus === n.id ? "true" : "false", onclick: () => app.drill(S.focus === n.id ? null : n.id) },
      S.focus === n.id ? u.t("theme.focus_off") : u.t("arc.focus_on", { n: n.topics.length })));
    body.append(h("h2", null, u.t("arc.themes")));
    ths.forEach((t) => body.append(h("button", { type: "button", class: "rel-item", onclick: () => app.select(t.id) },
      h("div", { class: "rt" }, h("i", { style: { "--c": app.colorOf(t.id) } }), h("span", null, u.t("arc.theme_item", { n: t.n, title: t.title })),
        h("span", { class: "ty faint" }, u.t("arc.prompts_n", { n: t.topics.length }))),
      h("p", { class: "why" }, t.lead))));
    const r = app.chapterReach(n.arc);
    body.append(h("h2", null, u.t("arc.connects"), h("small", null, u.t("arc.connects_sub"))));
    body.append(h("div", { class: "chips" },
      h("span", { class: "chip sm static" }, u.t("arc.inside", { n: r.inside })),
      r.out.map((o) => {
        const a = app.byId.get("arc:" + o.id);
        return a ? h("button", { type: "button", class: "chip sm ro", onclick: () => app.select(a.id) }, h("i", { class: "dot", style: { "--c": app.colorOf(a.id) } }), u.t("arc.to", { n: o.count, label: a.label.replace(/^How /, "how ") })) : null;
      })));
    if (n.books.length) {
      body.append(h("h2", null, u.t("arc.shelf"), h("small", null, u.t("arc.shelf_sub"))));
      body.append(h("div", { class: "chips books" }, n.books.map((b) => nodeLink(app, b, app.byId.get(b).label))));
    }
    body.append(h("p", { class: "md", style: { marginTop: "16px" } }, h("a", { class: "ext", href: "https://rethinkmatters.org/bookshelf", target: "_blank", rel: "noopener noreferrer" }, u.t("arc.shelf_link"))));
    body.append(h("p", { class: "cite" }, u.t("arc.draft")));
    body.append(conf(app));
    return { crumb: h("span", null, u.t("arc.crumb")), body };
  }

  /* ---------------------------------------------------------------- centre */
  function center(app, n) {
    const body = h("div");
    body.append(h("span", { class: "kind", style: { "--c": "#C9963F" } }, h("i"), u.t("center.kind")));
    body.append(h("h1", { class: "q-title" }, n.question));
    body.append(h("p", { class: "cite" }, h("a", { class: "ext", href: n.citation.url, target: "_blank", rel: "noopener noreferrer" }, n.citation.text)));
    put(body, future(app, n.answer, u.t("center.answer"), u.t("future.answer_note")));
    body.append(h("h2", null, u.t("center.howto")));
    body.append(h("ul", { class: "howto" }, u.t("center.howto_items").map((t) => h("li", null, ...u.inline(t)))));
    body.append(h("h2", null, u.t("center.values")));
    body.append(h("p", { class: "md faint", style: { margin: "0 0 10px", fontSize: "13.5px" } }, n.valuesIntro));
    const grid = h("div", { class: "value-grid" });
    for (const [k, v] of Object.entries(app.D.lenses.value.values)) {
      const c = app.topics.filter((t) => t.value.includes(k)).length;
      grid.append(h("div", { class: "vg" }, h("b", null, h("i", { style: { "--c": v.color } }), v.label, h("span", { class: "vg-n", title: u.t("center.values_n", { n: c }) }, c)), h("small", null, v.def)));
    }
    body.append(grid);
    body.append(h("h2", null, u.t("center.walks")));
    for (const th of app.D.threads) body.append(h("button", { type: "button", class: "rel-item", onclick: () => app.startThread(th.id) }, h("div", { class: "rt" }, h("i", { style: { "--c": app.D.lenses.value.values[th.value].color } }), h("span", null, th.title), h("span", { class: "ty faint" }, u.t("walks.stops", { n: th.steps.length }))), h("p", { class: "why" }, th.intro.split(". ")[0] + ".")));
    body.append(conf(app));
    return { crumb: h("span", null, u.t("center.crumb")), body };
  }

  /* ---------------------------------------------------------------- discussion */
  function discussion(app, n) {
    const body = h("div");
    body.append(h("span", { class: "kind", style: { "--c": "#666666" } }, h("i"), n.proposed ? u.t("disc.kind_proposed") : u.t("disc.kind")));
    body.append(h("h1", null, n.label));
    body.append(h("div", { class: "chips", style: { marginBottom: "6px" } }, sessionMeta(app, n).map((x) => h("span", { class: "chip sm static" + (x.className.includes("proposed") ? " dashed" : "") }, x.textContent))));
    put(body, metaLine(app, n.wg, [], []));
    const d = discBody(app, n);
    d.style.padding = "0"; d.style.border = "0";
    body.append(d);
    body.append(h("h2", null, u.t("disc.feeds")));
    body.append(h("div", { class: "chips" }, n.topics.map((t) => nodeLink(app, t))));
    body.append(conf(app));
    return { crumb: h("span", null, n.proposed ? u.t("disc.crumb_proposed") : u.t("disc.crumb")), body };
  }

  /* ---------------------------------------------------------------- tag */
  function tag(app, n) {
    const body = h("div"), fc = FACET_COLOR[n.facet], f = app.D.facets[n.facet];
    body.append(h("span", { class: "kind", style: { "--c": fc } }, h("i"), u.t("tag.kind", { facet: f.label.replace(/s$/, "") })));
    body.append(h("h1", null, n.label));
    if (n.poles) body.append(h("div", { class: "poles" }, h("span", null, n.poles[0]), h("em", null, "↔"), h("span", null, n.poles[1])));
    body.append(h("p", { class: "prompt plain", style: { "--c": fc } }, n.def));
    const ts = n.topics.map((id) => app.byId.get(id));
    body.append(h("h2", null, u.t("tag.used"), h("small", null, u.t("tag.used_sub", { n: ts.length, t: n.themes.length }))));
    const groups = {};
    for (const t of ts) (groups[t.theme] = groups[t.theme] || []).push(t);
    for (const th of Object.keys(groups).map(Number).sort((a, b) => a - b)) {
      const tn = app.byId.get("th:" + th);
      body.append(h("div", { class: "group-h" }, u.t("tag.group", { n: th, label: tn.label })));
      groups[th].forEach((t) => body.append(h("button", { type: "button", class: "rel-item slim", onclick: () => app.select(t.id) }, h("div", { class: "rt" }, h("i", { style: { "--c": app.colorOf(t.id) } }), h("span", null, t.label)))));
    }
    // co-occurring tags
    const co = {};
    for (const t of ts) for (const tg of t.tags) if (tg !== n.id) co[tg] = (co[tg] || 0) + 1;
    const top = Object.entries(co).sort((a, b) => b[1] - a[1]).slice(0, 7);
    if (top.length) {
      body.append(h("h2", null, u.t("tag.often")));
      body.append(h("div", { class: "chips" }, top.map(([tg, c]) => h("button", { type: "button", class: "chip sm ro", onclick: () => app.select(tg) }, h("i", { class: "dot", style: { "--c": FACET_COLOR[app.byId.get(tg).facet] } }), app.byId.get(tg).label + " ", h("span", { class: "n" }, c)))));
    }
    body.append(conf(app));
    return { crumb: h("span", null, u.t("tag.crumb", { facet: f.label, question: f.question })), body };
  }

  /* ---------------------------------------------------------------- book */
  function book(app, n) {
    const body = h("div");
    body.append(h("span", { class: "kind", style: { "--c": "#6B675C" } }, h("i"), u.t("book.kind")));
    body.append(h("h1", null, n.label));
    body.append(h("p", { class: "prompt plain" }, n.author));
    body.append(h("p", { class: "md" }, u.t("book.shelf") + " ", h("em", null, n.shelf), ". ", h("a", { class: "ext", href: "https://rethinkmatters.org/bookshelf", target: "_blank", rel: "noopener noreferrer" }, u.t("book.link"))));
    body.append(h("h2", null, u.t("book.alongside")));
    body.append(h("div", { class: "chips" }, n.topics.map((t) => nodeLink(app, t))));
    body.append(conf(app));
    return { crumb: h("span", null, u.t("book.crumb")), body };
  }

  /* ---------------------------------------------------------------- example (the Niche) */
  function example(app, n) {
    const T = (app.D.exampleTypes || {})[n.type] || {}, color = app.colorOf(n.id);
    const body = h("div");
    body.append(h("span", { class: "kind", style: { "--c": color } }, h("i", { class: "shape shape-" + (T.shape || "dot") }), T.label || u.t("example.kind")));
    body.append(h("h1", null, n.label));
    const meta = [n.org, n.year, n.stage].filter(Boolean).join(" · ");
    if (meta) body.append(h("p", { class: "meta-line strong" }, meta));
    if (n.summary) body.append(h("p", { class: "prompt plain", style: { "--c": color } }, n.summary));
    if (n.url) body.append(h("p", { class: "md" }, h("a", { class: "ext", href: n.url, target: "_blank", rel: "noopener noreferrer" }, u.t("example.source"))));
    body.append(h("h2", null, u.t("example.speaks")));
    n.topics.forEach((id) => {
      const t = app.byId.get(id);
      body.append(h("button", { type: "button", class: "rel-item", onclick: () => app.select(id) },
        h("div", { class: "rt" }, h("i", { style: { "--c": app.colorOf(id) } }), h("span", null, t.label), h("span", { class: "ty faint" }, u.t("example.theme_n", { n: t.theme }))),
        h("p", { class: "why" }, t.text)));
    });
    body.append(h("p", { class: "cite" }, u.t("example.checked")));
    body.append(conf(app));
    return { crumb: h("span", null, u.t("example.crumb")), body };
  }

  /* ---------------------------------------------------------------- anything else */
  function generic(app, n) {
    const body = h("div");
    body.append(h("h1", null, n.label || n.id));
    if (n.topics && n.topics.length) body.append(h("div", { class: "chips" }, n.topics.map((t) => nodeLink(app, t))));
    body.append(conf(app));
    return { crumb: h("span", null, u.t("note.label")), body };
  }

  const RENDER = { topic, theme, center, discussion, tag, book, arc, example };
  RM.panels = {
    render(app, id) {
      const n = app.byId.get(id);
      if (!n) return null;
      return (RENDER[n.kind] || generic)(app, n);
    },
  };
})();
