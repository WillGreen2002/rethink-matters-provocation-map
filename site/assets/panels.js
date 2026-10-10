/* Right-hand "note" panel renderers. Each returns { crumb, body } for a node. */
(function () {
  const RM = (window.RM = window.RM || {});
  const { u } = RM;
  const h = u.h;
  const FACET_COLOR = { tension: "#A04340", concept: "#48909F", barrier: "#7F8C64", domain: "#D9A441", method: "#8A8577" };
  const TYPE = {
    echoes: { label: "echoes", rev: "echoes" },
    tension: { label: "in tension with", rev: "in tension with" },
    enables: { label: "enables", rev: "needs" },
    extends: { label: "leads on to", rev: "builds on" },
  };

  function lensChip(app, lens, key, proposed) {
    const v = app.D.lenses[lens].values[key];
    return h("button", {
      class: "chip sm ro" + (proposed ? " dashed" : ""), style: { "--c": v.color },
      title: (proposed ? "Proposed by the map — the sheets did not record this. " : "") + "Filter the map by this. " + (v.def || v.q || ""),
      onclick: () => app.filterBy(lens, key),
    }, h("i", { class: "dot" }), v.short || v.label);
  }
  function tagChip(app, tid) {
    const t = app.byId.get(tid);
    return h("button", { class: "chip sm ro", title: t.def, onclick: () => app.select(tid) }, h("i", { class: "dot", style: { "--c": FACET_COLOR[t.facet] } }), t.label);
  }
  function lensRow(label, chips) { return h("div", { class: "lens-row" }, h("span", null, label), h("div", { class: "chips" }, chips.length ? chips : h("span", { style: { color: "var(--faint)", fontSize: "13px" } }, "—"))); }
  function nodeLink(app, id, extra) {
    const n = app.byId.get(id);
    return h("button", { class: "chip sm ro", onclick: () => app.select(id) }, h("i", { class: "dot", style: { "--c": app.colorOf(id) } }), extra || n.label);
  }
  function refs(list) {
    if (!list || !list.length) return null;
    return h("ul", { class: "refs" }, list.map((r) => h("li", null, h("a", { href: r.url, target: "_blank", rel: "noopener noreferrer" }, r.label))));
  }
  function conf(app) { return h("p", { class: "conf" }, app.D.site.chatham, " Tags and links are a first-draft classification — treat them as proposals."); }
  function sessionMeta(app, d) {
    const S = app.D.sessions, out = [];
    for (const s of d.sessions) {
      const ss = S[s];
      out.push(h("span", { class: "tagm" + (s === "PROPOSED" ? " proposed" : "") }, ss.label + (ss.date ? " · " + u.fmtDate(ss.date) : "")));
    }
    for (const n of d.noteIds) out.push(h("span", { class: "tagm" }, "notes " + n));
    return out;
  }

  /* ---------------------------------------------------------------- discussion block (used inside topic + own panel) */
  function discBody(app, d) {
    const wrap = h("div", { class: "d-body" });
    wrap.append(h("h3", null, d.texts.length > 1 ? "Provocations" : "Provocation"));
    for (const tx of d.texts) {
      if (tx.session) wrap.append(h("div", { class: "session-tag" }, app.D.sessions[tx.session].label));
      wrap.append(h("blockquote", null, tx.paras.map((p) => h("p", null, p))));
    }
    if (d.questions && d.questions.length) {
      wrap.append(h("h3", null, "Discussion points"));
      wrap.append(h("ul", { class: "qs" }, d.questions.map((q) => h("li", null, q))));
    }
    wrap.append(h("h3", null, "What the group said"));
    if (d.notes) wrap.append(u.md(d.notes));
    else wrap.append(h("p", { class: "md", style: { color: "var(--faint)", fontStyle: "italic", margin: 0 } }, d.proposed ? "Proposed — not yet discussed in a session." : "Notes from this session haven’t been added to the map yet."));
    const r = refs(d.refs);
    if (r) { wrap.append(h("h3", null, "References")); wrap.append(r); }
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
    const color = app.colorOf(r.other);
    const el = h("button", { class: "rel-item" + (l.curated ? "" : " derived"), onclick: () => app.select(r.other) });
    const t = l.curated ? TYPE[l.type] : null;
    const tl = t ? (l.dir === selfId ? t.label : t.rev) : "shares tags";
    el.append(h("div", { class: "rt" }, h("i", { style: { "--c": color } }), h("span", null, o.label), h("span", { class: "ty " + (l.curated ? "ty-" + l.type : ""), style: l.curated ? null : { color: "var(--faint)" } }, tl)));
    if (l.curated) el.append(h("p", { class: "why" }, l.why));
    const via = [];
    for (const t2 of l.tags) via.push(app.byId.get(t2).label);
    for (const d of l.src) via.push("same discussion: " + app.byId.get(d).label);
    if (via.length) el.append(h("p", { class: "via" }, (l.curated ? "Also: " : "Shared: ") + via.slice(0, 5).join(" · ") + (via.length > 5 ? " …" : "")));
    return el;
  }

  /* ---------------------------------------------------------------- topic */
  function topic(app, n) {
    const th = app.byId.get("th:" + n.theme), color = app.colorOf(n.id);
    const body = h("div");
    body.append(h("span", { class: "kind", style: { "--c": color } }, h("i"), "Provocation prompt"));
    body.append(h("h1", null, n.label));
    body.append(h("p", { class: "prompt", style: { "--c": color } }, n.text));
    body.append(lensRow("Scale", n.scale.map((v) => lensChip(app, "scale", v))));
    body.append(lensRow("Group", n.wg.map((v) => lensChip(app, "wg", v, n.wgProposed.includes(v)))));
    body.append(lensRow("Pillar", n.pillar.map((v) => lensChip(app, "pillar", v))));
    body.append(lensRow("Value", n.value.map((v) => lensChip(app, "value", v))));

    // tags grouped by facet
    body.append(h("h2", null, "Tags", h("small", null, "click to see everything that shares one")));
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
    body.append(h("h2", null, "Connections", h("small", null, `${cur.length} bridges · ${der.length} through shared tags`)));
    if (cur.length) cur.forEach((r) => body.append(relItem(app, n.id, r)));
    if (der.length) {
      body.append(h("div", { class: "group-h" }, "Also linked through shared tags and discussions"));
      const shown = der.slice(0, 5);
      shown.forEach((r) => body.append(relItem(app, n.id, r)));
      if (der.length > 5) {
        const more = h("button", { class: "more", onclick: () => { der.slice(5).forEach((r) => more.before(relItem(app, n.id, r))); more.remove(); } }, `Show ${der.length - 5} more`);
        body.append(more);
      }
    }
    if (!cur.length && !der.length) body.append(h("p", { class: "md", style: { color: "var(--faint)" } }, "No strong links at the current threshold."));

    // discussions
    const ds = n.sources.map((id) => app.byId.get(id));
    body.append(h("h2", null, "From the discussions", h("small", null, ds.length ? `${ds.length} · open one to read the provocation and what was said` : "")));
    if (ds.length) ds.forEach((d, i) => body.append(discItem(app, d, ds.length === 1 || (i === 0 && !!d.notes))));
    else body.append(h("p", { class: "md", style: { color: "var(--faint)" } }, "This prompt was added for the Bristol retreat; it isn’t tied to a recorded session yet."));

    if (n.reading.length) {
      body.append(h("h2", null, "On the Bookshelf", h("small", null, "suggested reading")));
      body.append(h("div", { class: "chips books" }, n.reading.map((b) => nodeLink(app, b, app.byId.get(b).label))));
    }
    body.append(conf(app));
    return { crumb: h("a", { href: "#" + th.id, onclick: (e) => { e.preventDefault(); app.select(th.id); } }, `Theme ${th.n} · ${th.title}`), body };
  }

  /* ---------------------------------------------------------------- theme */
  function theme(app, n) {
    const arc = app.D.arcs.find((a) => a.id === n.arc), color = app.colorOf(n.id);
    const body = h("div");
    body.append(h("span", { class: "kind", style: { "--c": color } }, h("i"), `Theme ${n.n} · ${arc.label}`));
    body.append(h("h1", null, n.title));
    body.append(h("p", { class: "prompt", style: { "--c": color } }, n.lead));
    const ts = n.topics.map((id) => app.byId.get(id)).sort((a, b) => a.order - b.order);
    body.append(h("h2", null, "Prompts", h("small", null, `${ts.length} — open one for the notes behind it`)));
    ts.forEach((t) => body.append(h("button", { class: "rel-item", onclick: () => app.select(t.id) },
      h("div", { class: "rt" }, h("i", { style: { "--c": app.colorOf(t.id) } }), h("span", null, t.label)),
      h("p", { class: "why" }, t.text))));
    // where this theme reaches out
    const cross = app.themeReach(n.n);
    if (cross.length) {
      body.append(h("h2", null, "Connects most strongly to"));
      body.append(h("div", { class: "chips" }, cross.slice(0, 5).map((c) => {
        const t = app.byId.get("th:" + c.theme);
        return h("button", { class: "chip ro sm", onclick: () => app.select(t.id), title: `${c.count} links between prompts` }, h("i", { class: "dot", style: { "--c": app.colorOf(t.id) } }), `${t.label} `, h("span", { class: "n" }, c.count));
      })));
    }
    const tc = {};
    for (const t of ts) for (const tg of t.tags) tc[tg] = (tc[tg] || 0) + 1;
    const top = Object.entries(tc).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 9);
    body.append(h("h2", null, "Tags that define this theme"));
    body.append(h("div", { class: "chips" }, top.map(([tg, c]) => h("button", { class: "chip sm ro", onclick: () => app.select(tg), title: app.byId.get(tg).def }, h("i", { class: "dot", style: { "--c": FACET_COLOR[app.byId.get(tg).facet] } }), app.byId.get(tg).label + " ", h("span", { class: "n" }, c)))));
    body.append(conf(app));
    return { crumb: h("span", null, arc.label), body };
  }

  /* ---------------------------------------------------------------- centre */
  function center(app, n) {
    const body = h("div");
    body.append(h("span", { class: "kind", style: { "--c": "#C9963F" } }, h("i"), "The question"));
    body.append(h("h1", { style: { fontSize: "29px" } }, n.question));
    body.append(h("p", { class: "cite" }, h("a", { class: "ext", href: n.citation.url, target: "_blank", rel: "noopener noreferrer" }, n.citation.text)));
    body.append(h("h2", null, "Four values, one lens", h("small", null, "click to light up the prompts that speak to each")));
    body.append(h("p", { class: "md", style: { margin: "0 0 10px", color: "var(--faint)", fontSize: "13.5px" } }, n.valuesIntro));
    const grid = h("div", { class: "value-grid" });
    for (const [k, v] of Object.entries(app.D.lenses.value.values)) {
      const c = app.topics.filter((t) => t.value.includes(k)).length;
      grid.append(h("button", { onclick: () => app.filterBy("value", k) }, h("b", null, h("i", { style: { "--c": v.color } }), v.label, h("span", { style: { marginLeft: "auto", fontWeight: 400, color: "var(--faint)", fontSize: "12px" } }, c)), h("small", null, v.def)));
    }
    body.append(grid);
    body.append(h("h2", null, "How to read this map"));
    const ol = h("ul", { class: "howto" });
    [
      "The nine large circles are the themes from the Bristol retreat sheet, arranged clockwise along the Bookshelf’s reading arc — how matter becomes life, how life becomes technology, how technology becomes society — and all pointing back to the question in the middle.",
      "The sixty small circles are the discussion prompts under them. Click one to open the provocation, what the group said, and why it connects to other prompts. Grey dots (switch on in Layers) are the discussions themselves.",
      "Threads join prompts that share tags or a discussion. Darker threads are hand-written bridges, each with a one-line reason. Drag the link-strength slider to see more or fewer.",
      "Colour shows the lens you choose on the left — by default the pillar of the Rethink Matters mission each prompt speaks to. Filter by scale, working group, value or any tag to see how a single idea runs across themes.",
      "Follow a thread (left, second tab) for a guided path that crosses themes and ends where it started: back at the question.",
    ].forEach((t) => ol.append(h("li", null, t)));
    body.append(ol);
    body.append(h("h2", null, "Guided threads"));
    for (const th of app.D.threads) body.append(h("button", { class: "rel-item", onclick: () => app.startThread(th.id) }, h("div", { class: "rt" }, h("i", { style: { "--c": app.D.lenses.value.values[th.value].color } }), h("span", null, th.title), h("span", { class: "ty", style: { color: "var(--faint)" } }, th.steps.length + " stops")), h("p", { class: "why" }, th.intro.split(". ")[0] + ".")));
    body.append(conf(app));
    return { crumb: h("span", null, "Rethink Matters · provocation map"), body };
  }

  /* ---------------------------------------------------------------- discussion */
  function discussion(app, n) {
    const body = h("div");
    body.append(h("span", { class: "kind", style: { "--c": "#666666" } }, h("i"), n.proposed ? "Proposed provocation" : "Discussion"));
    body.append(h("h1", null, n.label));
    body.append(h("div", { class: "chips", style: { marginBottom: "6px" } }, sessionMeta(app, n).map((x) => h("span", { class: "chip sm static" + (x.className.includes("proposed") ? " dashed" : "") }, x.textContent))));
    body.append(h("div", { class: "chips", style: { margin: "10px 0 0" } }, [...n.scale.map((v) => lensChip(app, "scale", v)), ...n.wg.map((v) => lensChip(app, "wg", v))]));
    const d = discBody(app, n);
    d.style.padding = "0"; d.style.border = "0";
    body.append(d);
    body.append(h("h2", null, "Feeds these prompts"));
    body.append(h("div", { class: "chips" }, n.topics.map((t) => nodeLink(app, t))));
    body.append(conf(app));
    return { crumb: h("span", null, n.proposed ? "Proposed" : "Discussion"), body };
  }

  /* ---------------------------------------------------------------- tag */
  function tag(app, n) {
    const body = h("div"), fc = FACET_COLOR[n.facet], f = app.D.facets[n.facet];
    body.append(h("span", { class: "kind", style: { "--c": fc } }, h("i"), f.label.replace(/s$/, "") + " tag"));
    body.append(h("h1", null, n.label));
    if (n.poles) body.append(h("div", { class: "poles" }, h("span", null, n.poles[0]), h("em", null, "↔"), h("span", null, n.poles[1])));
    body.append(h("p", { class: "prompt", style: { "--c": fc, fontStyle: "normal", fontSize: "17px" } }, n.def));
    const ts = n.topics.map((id) => app.byId.get(id));
    body.append(h("h2", null, "Used by", h("small", null, `${ts.length} prompts across ${n.themes.length} themes`)));
    const groups = {};
    for (const t of ts) (groups[t.theme] = groups[t.theme] || []).push(t);
    for (const th of Object.keys(groups).map(Number).sort((a, b) => a - b)) {
      const tn = app.byId.get("th:" + th);
      body.append(h("div", { class: "group-h" }, `Theme ${th} · ${tn.label}`));
      groups[th].forEach((t) => body.append(h("button", { class: "rel-item", onclick: () => app.select(t.id), style: { padding: "8px 14px" } }, h("div", { class: "rt" }, h("i", { style: { "--c": app.colorOf(t.id) } }), h("span", { style: { fontWeight: 500 } }, t.label)))));
    }
    // co-occurring tags
    const co = {};
    for (const t of ts) for (const tg of t.tags) if (tg !== n.id) co[tg] = (co[tg] || 0) + 1;
    const top = Object.entries(co).sort((a, b) => b[1] - a[1]).slice(0, 7);
    if (top.length) {
      body.append(h("h2", null, "Often found with"));
      body.append(h("div", { class: "chips" }, top.map(([tg, c]) => h("button", { class: "chip sm ro", onclick: () => app.select(tg) }, h("i", { class: "dot", style: { "--c": FACET_COLOR[app.byId.get(tg).facet] } }), app.byId.get(tg).label + " ", h("span", { class: "n" }, c)))));
    }
    body.append(h("div", { style: { marginTop: "20px" } }, h("button", { class: "btn", onclick: () => app.filterByTag(n.id) }, "Filter the map by this tag")));
    body.append(conf(app));
    return { crumb: h("span", null, f.label + " · " + f.question), body };
  }

  /* ---------------------------------------------------------------- book */
  function book(app, n) {
    const body = h("div");
    body.append(h("span", { class: "kind", style: { "--c": "#6B675C" } }, h("i"), "On the Bookshelf"));
    body.append(h("h1", null, n.label));
    body.append(h("p", { class: "prompt", style: { fontStyle: "normal", fontSize: "17px" } }, n.author));
    body.append(h("p", { class: "md" }, "Shelf: ", h("em", null, n.shelf), ". ", h("a", { class: "ext", href: "https://rethinkmatters.org/bookshelf", target: "_blank", rel: "noopener noreferrer" }, "See the Rethink Matters Bookshelf ↗")));
    body.append(h("h2", null, "Suggested alongside these prompts"));
    body.append(h("div", { class: "chips" }, n.topics.map((t) => nodeLink(app, t))));
    body.append(conf(app));
    return { crumb: h("span", null, "Reading"), body };
  }

  RM.panels = {
    render(app, id) {
      const n = app.byId.get(id);
      if (!n) return null;
      return { topic, theme, center, discussion, tag, book }[n.kind](app, n);
    },
  };
})();
