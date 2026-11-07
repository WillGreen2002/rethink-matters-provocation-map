/* Right-hand "note" panel renderers. Each returns { crumb, body } for a node. Wording: curation/copy.yaml, through u.t(). */
(function () {
  const RM = (window.RM = window.RM || {});
  const { u } = RM;
  const h = u.h;
  const put = (el, ...kids) => { for (const k of kids) if (k) el.append(k); };   // append what exists (append(null) would print "null")
  // in edit mode (with the edit link: review.js), a text block that can be clicked into and changed; otherwise the block as it is
  const ed = (el, key, o) => (RM.review ? RM.review.editable(el, key, o) : el);
  const FACET_COLOR = { tension: "#A04340", concept: "#48909F", barrier: "#7F8C64", domain: "#D9A441", method: "#8A8577" };
  const REACH_MIN = 3;   // "Most connected to" names a theme only from this many links between prompts

  function relLabel(type, forward) {
    const R = u.t("relations");
    return forward ? R[type] : R[type + "_rev"] || R[type];
  }
  function nodeLink(app, id, extra) {
    const n = app.byId.get(id);
    if (!n) return null;
    return h("button", { type: "button", class: "chip sm ro", onclick: () => app.select(id) }, h("i", { class: "dot", style: { "--c": app.colorOf(id) } }), extra || n.label);
  }
  // which of the report's values a prompt speaks to, as one quiet line
  function valueLine(app, value) {
    if (!value || !value.length) return null;
    const L = app.D.lenses.value.values;
    return h("p", { class: "meta-line" }, u.t("topic.value") + " " + value.map((v) => L[v].label.toLowerCase()).join(", "));
  }
  function refs(list) {
    if (!list || !list.length) return null;
    return h("ul", { class: "refs" }, list.map((r) => h("li", null, h("a", { href: r.url, target: "_blank", rel: "noopener noreferrer" }, r.label))));
  }
  function conf(app) { return h("p", { class: "conf" }, app.D.site.chatham); }
  // a way to say something about what is open: an input in the note. With the edit link it goes to the committee's Sheet; without
  // it, it opens an email to Rethink Matters in the visitor's own email app, so nothing is sent from the page itself
  function thoughts(app, n) {
    const mail = app.D.site.feedback_email, sheet = !!(RM.review && RM.review.sendThought);
    if (!mail && !sheet) return null;
    const wrap = h("section", { class: "thoughts" });
    const closed = (focus) => {
      const b = h("button", { type: "button", class: "btn th-open", "data-k": "thoughts", onclick: open }, u.t("thoughts.button"));
      wrap.replaceChildren(b);
      if (focus === true) b.focus({ preventScroll: true });
    };
    function open() {
      const ta = h("textarea", { class: "th-in", rows: 4, "aria-label": u.t("thoughts.label"), placeholder: u.t("thoughts.placeholder") });
      const msg = h("p", { class: "th-hint", role: "status" }, sheet ? u.t("thoughts.hint_sheet") : u.t("thoughts.hint_mail", { mail }));
      const go = (e) => {
        const text = ta.value.trim();
        if (!text) { e.preventDefault(); msg.textContent = u.t("thoughts.empty"); ta.focus(); return; }
        if (sheet) { RM.review.sendThought(n.id, text); closed(true); return; }
        e.currentTarget.href = "mailto:" + mail + "?subject=" + encodeURIComponent(u.t("thoughts.subject", { label: n.label || u.t("center.kind") })) + "&body=" + encodeURIComponent(text);
      };
      wrap.replaceChildren(h("label", { class: "th-lab" }, u.t("thoughts.label"), ta), msg, h("div", { class: "th-acts" },
        sheet ? h("button", { type: "button", class: "btn solid", onclick: go }, u.t("thoughts.send_sheet")) : h("a", { class: "btn solid", href: "mailto:" + mail, onclick: go }, u.t("thoughts.send_mail")),
        h("button", { type: "button", class: "btn ghost", onclick: () => closed(true) }, u.t("thoughts.cancel"))));
      ta.focus({ preventScroll: true });
      wrap.scrollIntoView({ block: "nearest" });
    }
    closed();
    return wrap;
  }
  const foot = (body, app, n) => put(body, thoughts(app, n), conf(app));
  function sessionMeta(app, d) {
    const S = app.D.sessions, out = [];
    for (const s of d.sessions) {
      const ss = S[s];
      out.push(h("span", { class: "tagm" + (s === "PROPOSED" ? " proposed" : "") }, ss.label + (ss.date ? " · " + u.fmtDate(ss.date) : "")));
    }
    for (const n of d.noteIds) out.push(h("span", { class: "tagm" }, u.t("disc.notes_n", { n })));
    return out;
  }
  // a future (or the overall answer): its words and what it was drawn from
  function future(app, f, title, key) {
    if (!f) return null;
    const waiting = f.pending && !f.text;
    return h("section", { class: "future" },
      h("h2", null, title),
      ed(h("p", { class: "future-text" + (waiting ? " pending" : "") }, waiting ? u.t("future.pending") : f.text), key),
      f.note ? h("p", { class: "future-note" }, f.note) : null,
      f.drawsOn && f.drawsOn.length ? h("div", { class: "drawn" }, h("span", { class: "drawn-k" }, u.t("future.drawn")), h("div", { class: "chips" }, f.drawsOn.map((id) => nodeLink(app, id)))) : null);
  }
  function examplesLine(app, ids, topicId) {
    const wrap = h("div", { class: "ground" });
    if (!ids.length) { wrap.append(h("p", { class: "md faint" }, u.t("ground.none"))); return wrap; }
    if (topicId) wrap.append(h("button", { type: "button", class: "btn", onclick: () => app.drill(topicId) }, h("span", { "aria-hidden": "true" }, "↓ "), u.t("ground.some", { n: ids.length })));
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
    wrap.append(ed(d.notes ? u.md(d.notes) : h("p", { class: "md faint", style: { fontStyle: "italic", margin: 0 } }, d.proposed ? u.t("disc.proposed_note") : u.t("disc.no_notes")), "disc:" + d.id + ":notes", { md: true }));
    const r = refs(d.refs);
    if (r) { wrap.append(h("h3", null, u.t("disc.refs"))); wrap.append(r); }
    return wrap;
  }
  function discItem(app, d, open, why) {
    const el = h("details", { class: "disc" }, h("summary", null, h("div", { class: "d-title" }, h("span", null, d.label)), h("div", { class: "d-meta" }, sessionMeta(app, d)),
      why ? h("p", { class: "d-why" }, u.t("disc.why", { why })) : null), discBody(app, d));
    if (open) el.setAttribute("open", "");
    return el;
  }

  /* ---------------------------------------------------------------- cross-references */
  function relItem(app, selfId, r) {
    const o = app.byId.get(r.other), l = r.link;
    return h("button", { type: "button", class: "rel-item", onclick: () => app.select(r.other) },
      h("div", { class: "rt" }, h("i", { style: { "--c": app.colorOf(r.other) } }), h("span", null, o.label), h("span", { class: "ty ty-" + l.type }, relLabel(l.type, l.dir === selfId))),
      h("p", { class: "why" }, l.why));
  }

  /* ---------------------------------------------------------------- topic */
  function topic(app, n) {
    const th = app.byId.get("th:" + n.theme), color = app.colorOf(n.id);
    const body = h("div");
    body.append(h("span", { class: "kind", style: { "--c": color } }, h("i"), u.t("topic.kind")));
    body.append(ed(h("h1", null, n.label), "prompt:" + n.id + ":label"));
    body.append(ed(h("p", { class: "prompt", style: { "--c": color } }, n.text), "prompt:" + n.id + ":text"));
    if (n.open) body.append(h("p", { class: "open-q" }, u.t("topic.open")));
    if (app.level() === "regime") {
      const c = app.sourceCount(n.id);
      body.append(h("button", { type: "button", class: "btn solid down-btn", "data-k": "down", onclick: () => app.drill(n.id) },
        h("span", { "aria-hidden": "true" }, "↓ "), c === 0 ? u.t("topic.down_none") : c === 1 ? u.t("topic.down_one") : u.t("topic.down", { n: c })));
    }
    if (n.refs && n.refs.length) body.append(h("div", { class: "p-refs" }, h("span", { class: "drawn-k" }, u.t("topic.refs")), refs(n.refs)));

    // discussions come first: they are what the prompt grew from
    const ds = n.sources.map((id) => app.byId.get(id)), why = n.sourceWhy || {};
    if (ds.length) {
      body.append(h("h2", null, n.open ? u.t("topic.proposed") : u.t("topic.discussions"), h("small", null, n.open ? u.t("topic.proposed_sub", { n: ds.length }) : u.t("topic.discussions_sub", { n: ds.length }))));
      ds.forEach((d, i) => body.append(discItem(app, d, ds.length === 1 || (i === 0 && !!d.notes), why[d.id])));
    }
    if (RM.review) put(body, RM.review.contributions(app, n.id));   // in edit mode: what the committee has added since

    // cross-references: exactly the hand-written links, each with its reason
    const cur = app.relOf(n.id).filter((r) => r.link.curated);
    if (cur.length) {
      body.append(h("h2", null, u.t("topic.xrefs")));
      cur.forEach((r) => body.append(relItem(app, n.id, r)));
    }

    // the Niche: examples on the ground
    const ex = app.exOf(n.id);
    if (ex.length) {
      body.append(h("h2", null, u.t("ground.title")));
      body.append(examplesLine(app, ex, app.level() === "niche" ? null : n.id));
    }

    if (n.reading.length) {
      body.append(h("h2", null, u.t("topic.reading"), h("small", null, u.t("topic.reading_sub"))));
      body.append(h("div", { class: "chips books" }, n.reading.map((b) => nodeLink(app, b, app.byId.get(b).label))));
    }
    put(body, valueLine(app, n.value));
    foot(body, app, n);
    return { crumb: h("a", { href: "#" + th.id, onclick: (e) => { e.preventDefault(); app.select(th.id); } }, u.t("topic.crumb", { n: th.n, title: th.title })), body };
  }

  /* ---------------------------------------------------------------- theme */
  function theme(app, n) {
    const arc = app.D.arcs.find((a) => a.id === n.arc), color = app.colorOf(n.id);
    const ts = n.topics.map((id) => app.byId.get(id)).sort((a, b) => a.order - b.order);
    const body = h("div");
    body.append(h("span", { class: "kind", style: { "--c": color } }, h("i"), u.t("theme.kind", { n: n.n, chapter: arc.label })));
    body.append(ed(h("h1", null, n.title), "theme:" + n.id + ":title"));
    body.append(ed(h("p", { class: "prompt", style: { "--c": color } }, n.lead), "theme:" + n.id + ":lead"));
    // down to its prompts (from the Landscape; on the Regime the theme is already in the middle)
    if (app.level() === "landscape") body.append(h("button", { type: "button", class: "btn solid down-btn", "data-k": "down", onclick: () => app.drill(n.id) }, h("span", { "aria-hidden": "true" }, "↓ "), u.t("theme.down", { n: ts.length })));
    put(body, future(app, n.future, u.t("future.title"), "theme:" + n.id + ":future"));
    body.append(h("h2", null, u.t("theme.prompts"), h("small", null, u.t("theme.prompts_sub", { n: ts.length }))));
    ts.forEach((t) => body.append(h("button", { type: "button", class: "rel-item slim", onclick: () => app.select(t.id) },
      h("div", { class: "rt" }, h("i", { class: t.open ? "open" : null, style: { "--c": app.colorOf(t.id) } }), h("span", null, t.label, t.open ? h("span", { class: "sr-only" }, " (" + u.t("topic.open") + ")") : null)))));
    // where this theme reaches out: the ties with some weight, or its strongest if none reaches that
    const reach = app.themeReach(n.n), most = reach.length ? reach[0].count : 0, cross = reach.filter((c) => c.count >= Math.min(REACH_MIN, most));
    if (cross.length) {
      body.append(h("h2", null, u.t("theme.reach")));
      body.append(h("div", { class: "chips" }, cross.map((c) => {
        const t = app.byId.get("th:" + c.theme);
        return h("button", { type: "button", class: "chip ro sm", onclick: () => app.select(t.id), title: u.t("theme.reach_tip", { n: c.count }) }, h("i", { class: "dot", style: { "--c": app.colorOf(t.id) } }), t.label);
      })));
    }
    const walks = app.walksThrough(n.n);
    if (walks.length) {
      body.append(h("h2", null, u.t("theme.walks")));
      walks.forEach((w) => body.append(h("button", { type: "button", class: "rel-item walk-item", onclick: () => app.startThread(w.id) },
        h("div", { class: "rt" }, h("span", null, w.title), h("span", { class: "ty faint" }, u.t("walks.stops", { n: w.steps.length }))))));
    }
    const exs = [...new Set(ts.flatMap((t) => app.exOf(t.id)))];
    if (exs.length) {
      body.append(h("h2", null, u.t("ground.title")));
      body.append(examplesLine(app, exs, null));
    }
    foot(body, app, n);
    return { crumb: h("a", { href: "#arc:" + arc.id, onclick: (e) => { e.preventDefault(); app.select("arc:" + arc.id); } }, u.t("theme.crumb", { label: arc.label })), body };
  }

  /* ---------------------------------------------------------------- chapter (one of the Bookshelf's three shelves) */
  function arc(app, n) {
    const body = h("div"), color = app.colorOf(n.id);
    const ths = n.themes.map((x) => app.byId.get("th:" + x)).filter(Boolean);
    body.append(h("span", { class: "kind", style: { "--c": color } }, h("i"), u.t("arc.kind")));
    body.append(h("h1", null, n.label));
    body.append(h("p", { class: "prompt plain", style: { "--c": color } }, u.t("arc.lede", { themes: ths.length, prompts: n.topics.length })));
    body.append(h("h2", null, u.t("arc.themes")));
    ths.forEach((t) => body.append(h("div", { class: "rel-row" },
      h("button", { type: "button", class: "rel-item", onclick: () => app.select(t.id) },
        h("div", { class: "rt" }, h("i", { style: { "--c": app.colorOf(t.id) } }), h("span", null, u.t("arc.theme_item", { n: t.n, title: t.title }))),
        h("p", { class: "why" }, t.lead)),
      h("button", { type: "button", class: "btn down-mini", "aria-label": u.t("arc.down_theme", { n: t.n, label: t.label }), onclick: () => app.drill(t.id) },
        u.t("arc.prompts_n", { n: t.topics.length }), h("span", { "aria-hidden": "true" }, " ↓")))));
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
    body.append(h("p", { class: "md", style: { marginTop: "16px" } }, h("a", { class: "ext", href: u.t("links.bookshelf"), target: "_blank", rel: "noopener noreferrer" }, u.t("arc.shelf_link"))));
    foot(body, app, n);
    return { crumb: h("span", null, u.t("arc.crumb")), body };
  }

  /* ---------------------------------------------------------------- centre */
  // the magic 8 ball, as a way in: a question or an answer from somewhere on the map, a new one each time
  function askPool(app) {
    const Q = [], A = [];
    for (const t of app.topics) if (/\?\s*$/.test(t.text)) Q.push({ text: t.text, from: t.label, id: t.id });
    for (const d of app.D.nodes) if (d.kind === "discussion") for (const q of d.questions || []) Q.push({ text: q, from: d.label, id: d.id });
    for (const th of app.D.nodes) if (th.kind === "theme" && th.future && th.future.text) A.push({ text: th.future.text, from: th.label, id: th.id });
    for (const w of app.D.threads) A.push({ text: w.soWhat, from: w.title, walk: w.id });
    return { Q, A };
  }
  function askCard(app) {
    const { Q, A } = askPool(app), ball = h("span", { class: "ask-ball", "aria-hidden": "true" }), kind = h("span", { class: "ask-k" }), text = h("p", { class: "ask-text" });
    const from = h("button", { type: "button", class: "btn sm ask-from" }), again = h("button", { type: "button", class: "btn sm ask-again", onclick: () => roll() }, u.t("center.ask_again"));
    const card = h("section", { class: "ask", "aria-live": "polite" }, ball, kind, again, text, from);
    let last = null;
    function roll() {
      const isQ = Math.random() < 0.5, list = isQ ? Q : A;
      let x = list[Math.floor(Math.random() * list.length)];
      if (x === last) x = list[(list.indexOf(x) + 1) % list.length];
      last = x;
      ball.textContent = isQ ? "Q" : "A";
      kind.textContent = isQ ? u.t("center.ask_q") : u.t("center.ask_a");
      text.textContent = x.text;
      from.textContent = u.t("center.ask_from", { label: x.from });
      from.onclick = () => (x.walk ? app.startThread(x.walk) : app.select(x.id));
      card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake");
    }
    roll();
    return card;
  }
  // what the map does not hold yet, worked out from the map itself
  function gaps(app) {
    const open = app.topics.filter((t) => t.open), nodes = app.D.nodes;
    const quiet = nodes.filter((d) => d.kind === "discussion" && !d.proposed && !d.notes);
    const empty = nodes.filter((t) => t.kind === "theme" && !t.topics.some((id) => app.byId.get(id).sources.some((s) => app.byId.get(s).notes)));
    const sec = h("section", { class: "gaps" }, h("h2", null, u.t("center.gaps")));
    if (open.length) sec.append(h("p", { class: "md" }, u.t("center.gaps_open", { n: open.length })), h("div", { class: "chips" }, open.map((t) => nodeLink(app, t.id))));
    if (quiet.length) sec.append(h("p", { class: "md" }, u.t("center.gaps_notes", { n: quiet.length })), h("div", { class: "chips" }, quiet.map((d) => nodeLink(app, d.id))));
    for (const t of empty) sec.append(h("p", { class: "md" }, u.t("center.gaps_theme", { label: t.label })));
    sec.append(h("p", { class: "md" }, ...u.inline(u.t("center.gaps_add"))));
    return sec;
  }
  function center(app, n) {
    const body = h("div");
    body.append(h("span", { class: "kind", style: { "--c": "#C9963F" } }, h("i"), u.t("center.kind")));
    body.append(h("h1", { class: "q-title" }, n.question));
    body.append(h("p", { class: "cite" }, h("a", { class: "ext", href: n.citation.url, target: "_blank", rel: "noopener noreferrer" }, n.citation.text)));
    body.append(askCard(app));
    put(body, future(app, n.answer, u.t("center.answer"), "centre:answer"));
    body.append(h("h2", null, u.t("center.howto")));
    body.append(h("ul", { class: "howto" }, u.t("center.howto_items").map((t) => h("li", null, ...u.inline(t)))));
    body.append(h("h2", null, u.t("center.words")));
    body.append(h("ul", { class: "howto" }, u.t("center.words_items").map((t) => h("li", null, ...u.inline(t)))));
    body.append(gaps(app));
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
    body.append(h("h2", null, u.t("center.conflicts")));
    body.append(ed(h("p", { class: "md" }, u.t("about.conflicts")), "copy:about.conflicts", { inline: true }));
    foot(body, app, n);
    return { crumb: h("span", null, u.t("center.crumb")), body };
  }

  /* ---------------------------------------------------------------- discussion */
  function discussion(app, n) {
    const body = h("div");
    body.append(h("span", { class: "kind", style: { "--c": "#666666" } }, h("i"), n.proposed ? u.t("disc.kind_proposed") : u.t("disc.kind")));
    body.append(ed(h("h1", null, n.label), "disc:" + n.id + ":label"));
    body.append(h("div", { class: "chips", style: { marginBottom: "6px" } }, sessionMeta(app, n).map((x) => h("span", { class: "chip sm static" + (x.className.includes("proposed") ? " dashed" : "") }, x.textContent))));
    const d = discBody(app, n);
    d.style.padding = "0"; d.style.border = "0";
    body.append(d);
    body.append(h("h2", null, u.t("disc.feeds")));
    body.append(h("div", { class: "chips" }, n.topics.map((t) => nodeLink(app, t))));
    foot(body, app, n);
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
    foot(body, app, n);
    return { crumb: h("span", null, u.t("tag.crumb", { facet: f.label, question: f.question })), body };
  }

  /* ---------------------------------------------------------------- book */
  function book(app, n) {
    const body = h("div");
    body.append(h("span", { class: "kind", style: { "--c": "#6B675C" } }, h("i"), u.t("book.kind")));
    body.append(h("h1", null, n.label));
    body.append(h("p", { class: "prompt plain" }, n.author));
    body.append(h("p", { class: "md" }, u.t("book.shelf") + " ", h("em", null, n.shelf), ". ", h("a", { class: "ext", href: u.t("links.bookshelf"), target: "_blank", rel: "noopener noreferrer" }, u.t("book.link"))));
    body.append(h("h2", null, u.t("book.alongside")));
    body.append(h("div", { class: "chips" }, n.topics.map((t) => nodeLink(app, t))));
    foot(body, app, n);
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
    body.append(n.review && RM.review ? RM.review.exampleFooter(app, n) || h("span") : h("p", { class: "cite" }, u.t("example.checked")));
    foot(body, app, n);
    return { crumb: h("span", null, u.t("example.crumb")), body };
  }

  /* ---------------------------------------------------------------- anything else */
  function generic(app, n) {
    const body = h("div");
    body.append(h("h1", null, n.label || n.id));
    if (n.topics && n.topics.length) body.append(h("div", { class: "chips" }, n.topics.map((t) => nodeLink(app, t))));
    foot(body, app, n);
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
