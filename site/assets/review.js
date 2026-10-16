/* Edit mode: the map itself, editable by anyone who has the edit link. It loads before the map (ui.js) and, without the link, simply
   starts the map as it is: visitors see the published text, untouched.

   With the link (opened once; the browser then remembers it), the map starts with the committee's latest text and shows an Edit
   switch in the header. With Edit on, the main text can be changed by clicking into it: theme titles, questions and futures, the
   overall answer, prompts, discussions and what the group said, the explainers. Leaving the text saves it for everyone with the
   link; History keeps every earlier version. Any prompt can take additions after a provocation; Freeze stops editing.

   Changes go through the committee's own Google Form into its Sheet, and every copy with the link reads the Sheet back. The public
   map changes only when the owner publishes (build/review_import.py, then the usual build and checks). The Form and Sheet addresses
   are never written into this repository: the owner pastes their links once on the setup screen (index.html?setup), and they travel
   inside the edit link's #k=... part, which browsers keep to themselves. */
(function () {
  "use strict";
  const RM = (window.RM = window.RM || {});
  const u = RM.u, h = u.h, t = u.t;
  const D = window.RM_DATA;
  const FIELDS = ["key", "text", "action", "who", "extra"];
  const STORE = { key: "rm-review-key", who: "rm-review-who", seen: "rm-review-welcome", demo: "rm-review-demo-log" };
  const POLL = 30000;
  const store = { get: (k) => u.store.get(k), set: (k, v) => u.store.set(k, v) };
  const scriptEl = document.currentScript;

  /* ------------------------------------------------------------------ the key: where to send changes and where to read them */
  const b64e = (s) => { let x = ""; new TextEncoder().encode(s).forEach((c) => (x += String.fromCharCode(c))); return btoa(x).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
  const b64d = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));
  function readKey() {
    const m = /(?:^#|[?&#])k=([A-Za-z0-9_-]+)/.exec(location.hash) || /[?&]k=([A-Za-z0-9_-]+)/.exec(location.search);
    if (m) {
      try {
        const cfg = JSON.parse(b64d(m[1]));
        if (cfg && (cfg.demo || (cfg.f && cfg.s && cfg.e))) store.set(STORE.key, m[1]);
      } catch (e) { /* a damaged link: fall back to what this browser already has */ }
      // the key stays in this browser; the address bar goes back to the map's own form
      const q = location.search.replace(/([?&])k=[A-Za-z0-9_-]+&?/, "$1").replace(/[?&]$/, "");
      history.replaceState(null, "", location.pathname + q + (location.hash.startsWith("#k=") ? "" : location.hash));
    }
    const k = store.get(STORE.key);
    if (!k) return null;
    try { return JSON.parse(b64d(k)); } catch (e) { return null; }
  }
  const isGoogle = (url) => /(^|\.)google\.com$/.test(url.hostname);
  // the Form's pre-filled link, made with its five answers typed as KEY, TEXT, ACTION, WHO and EXTRA
  function parseForm(link) {
    let url;
    try { url = new URL(String(link).trim()); } catch (e) { throw new Error(t("review.setup.bad_form")); }
    if (/forms\.gle$/.test(url.hostname)) throw new Error(t("review.setup.short_link"));
    if (!isGoogle(url) || !/\/forms\//.test(url.pathname) || !/\/viewform/.test(url.pathname)) throw new Error(t("review.setup.bad_form"));
    const e = {};
    for (const [k, v] of url.searchParams) if (/^entry\.\d+$/.test(k)) e[v.trim().toLowerCase()] = k;
    const missing = FIELDS.filter((f) => !e[f]);
    if (missing.length) throw new Error(t("review.setup.missing", { fields: missing.map((f) => f.toUpperCase()).join(", ") }));
    return { f: url.origin + url.pathname.replace(/\/viewform.*$/, "/formResponse"), e };
  }
  // the Sheet's link (shared so that anyone with it can view)
  function parseSheet(link) {
    let url;
    try { url = new URL(String(link).trim()); } catch (e) { throw new Error(t("review.setup.bad_sheet")); }
    const m = /\/spreadsheets\/d\/([A-Za-z0-9_-]+)/.exec(url.pathname);
    if (!isGoogle(url) || !m) throw new Error(t("review.setup.bad_sheet"));
    return { s: url.origin + "/spreadsheets/d/" + m[1], g: (/[#&?]gid=(\d+)/.exec(link) || [])[1] || "0" };
  }

  /* ------------------------------------------------------------------ the backend: the Form to write, the Sheet to read */
  let jsonpN = 0;
  function gviz(url) {
    return new Promise((res, rej) => {
      const cb = "__rmReview" + ++jsonpN, s = document.createElement("script");
      const done = () => { clearTimeout(timer); delete window[cb]; s.remove(); };
      const timer = setTimeout(() => { done(); rej(new Error("timeout")); }, 15000);
      window[cb] = (data) => { done(); if (!data || data.status === "error") rej(new Error(((data && data.errors) || [{}])[0].detailed_message || "sheet")); else res(data); };
      s.onerror = () => { done(); rej(new Error("load")); };
      s.src = url + "&tqx=" + encodeURIComponent("responseHandler:" + cb) + "&_=" + Date.now();
      document.head.append(s);
    });
  }
  const gdate = (v) => { const m = /Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?/.exec(String(v)); return m ? new Date(+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)).getTime() : Date.parse(v) || 0; };
  function sheetRows(data) {
    const cols = ((data.table && data.table.cols) || []).map((c) => String(c.label || "").trim().toLowerCase());
    const col = (name, i) => { const k = cols.indexOf(name); return k >= 0 ? k : i; };
    const I = { at: col("timestamp", 0), key: col("key", 1), text: col("text", 2), action: col("action", 3), who: col("who", 4), extra: col("extra", 5) };
    return ((data.table && data.table.rows) || []).map((r) => {
      const v = (i) => { const c = r.c && r.c[i]; return c && c.v != null ? c.v : ""; };
      return { at: gdate(v(I.at)), key: String(v(I.key)), text: String(v(I.text)), action: String(v(I.action)).trim().toLowerCase(), who: String(v(I.who)), extra: String(v(I.extra)) };
    }).filter((r) => r.action);
  }
  function backend(cfg) {
    if (cfg.demo) {
      const read = () => { try { return JSON.parse(store.get(STORE.demo) || "[]"); } catch (e) { return []; } };
      return {
        demo: true,
        send(rec) { const log = read(); log.push(Object.assign({ at: Date.now() }, rec)); store.set(STORE.demo, JSON.stringify(log)); return Promise.resolve(); },
        load: () => Promise.resolve(read()),
      };
    }
    return {
      // the Form answers without saying whether it worked (no-cors): a change counts as saved once the Sheet has it
      send(rec) {
        const body = new URLSearchParams();
        for (const f of FIELDS) body.append(cfg.e[f], rec[f] == null ? "" : String(rec[f]));
        return fetch(cfg.f, { method: "POST", mode: "no-cors", body });
      },
      load: () => gviz(cfg.s + "/gviz/tq?gid=" + encodeURIComponent(cfg.g || "0") + "&headers=1").then(sheetRows),
    };
  }

  /* ------------------------------------------------------------------ what the log of changes adds up to */
  const EDIT = /^(theme:th:\d+:(title|lead|future)|centre:answer|prompt:n:[a-z0-9-]+:(label|text)|disc:d:[a-z0-9-]+:(label|notes)|copy:(levels\.(landscape|regime|niche)\.explain|hero\.lede))$/;
  const LABEL = /^(prompt:n:[a-z0-9-]+:label|disc:d:[a-z0-9-]+:label)$/;   // names drawn on the map itself
  const S = { cfg: null, be: null, log: [], pending: [], edits: new Map(), adds: new Map(), frozen: null, base: new Map(), synced: 0, error: null,
    booted: false, editing: false, later: false };
  const node = (id) => (RM.app ? RM.app.byId.get(id) : D.nodes.find((n) => n.id === id));
  const parseExtra = (s) => { try { const x = JSON.parse(s || "{}"); return x && typeof x === "object" ? x : {}; } catch (e) { return {}; } };
  // (the Sheet may hand text back with different line endings or edges)
  const norm = (s) => String(s == null ? "" : s).replace(/\r/g, "").trim();
  const same = (a, b) => a.action === b.action && a.key === b.key && norm(a.text) === norm(b.text) && norm(a.extra) === norm(b.extra);
  function derive() {
    const all = S.log.concat(S.pending.filter((p) => !S.log.some((r) => same(r, p))));
    const edits = new Map(), adds = new Map();
    let frozen = null;
    all.forEach((r, seq) => {
      if (r.action === "edit" && EDIT.test(r.key)) (edits.get(r.key) || edits.set(r.key, []).get(r.key)).push(Object.assign({ seq }, r));
      else if (r.action === "add") {
        const x = parseExtra(r.extra), tp = node(r.key);
        if (x.id && /^[a-z0-9-]{4,40}$/.test(x.id) && tp && tp.kind === "topic")
          adds.set(x.id, { id: x.id, prompt: r.key, type: TYPES[x.type] ? x.type : "note", title: String(x.title || "").slice(0, 160), url: String(x.url || ""), text: r.text, who: r.who, at: r.at, checked: null });
      } else if (r.action === "check") { const a = adds.get(r.key); if (a) a.checked = r.who || "?"; }
      else if (r.action === "remove") adds.delete(r.key);
      else if (r.action === "freeze") frozen = { at: r.at, who: r.who };
      else if (r.action === "unfreeze") frozen = null;
    });
    S.edits = edits; S.adds = adds; S.frozen = frozen;
  }
  const isPending = (pred) => S.pending.some((p) => pred(p) && !S.log.some((r) => same(r, p)));
  const frozen = () => !!S.frozen;

  /* ------------------------------------------------------------------ where each editable text lives in the map's data */
  function slot(key) {
    let m;
    if ((m = /^theme:(th:\d+):(title|lead|future)$/.exec(key))) { const n = node(m[1]); if (!n) return null; return m[2] === "future" ? (n.future ? [n.future, "text"] : null) : [n, m[2]]; }
    if (key === "centre:answer") { const c = node("c"); return c && c.answer ? [c.answer, "text"] : null; }
    if ((m = /^prompt:(n:[a-z0-9-]+):(label|text)$/.exec(key))) { const n = node(m[1]); return n && n.kind === "topic" ? [n, m[2]] : null; }
    if ((m = /^disc:(d:[a-z0-9-]+):(label|notes)$/.exec(key))) { const n = node(m[1]); return n && n.kind === "discussion" ? [n, m[2]] : null; }
    if ((m = /^copy:(levels\.(landscape|regime|niche)\.explain|hero\.lede)$/.exec(key))) { const p = m[1].split("."), o = p.slice(0, -1).reduce((x, k) => (x ? x[k] : null), D.copy); return o ? [o, p[p.length - 1]] : null; }
    return null;
  }
  const current = (key) => { const s = slot(key); return s ? s[0][s[1]] || "" : ""; };
  // returns whether a name drawn on the map changed (the map is then drawn again)
  function applyEdits() {
    let labels = false;
    for (const [key, list] of S.edits) {
      const s = slot(key);
      if (!s) continue;
      if (!S.base.has(key)) S.base.set(key, s[0][s[1]] || "");
      const v = list[list.length - 1].text;
      if (s[0][s[1]] !== v) { if (LABEL.test(key)) labels = true; s[0][s[1]] = v; }
    }
    return labels;
  }

  /* ------------------------------------------------------------------ additions: shown on the Niche as cards, like the examples */
  const TYPES = { note: { shape: "dot" }, paper: { shape: "square" }, company: { shape: "triangle" }, product: { shape: "diamond" },
    preclinical: { shape: "ring" }, clinical: { shape: "dot" }, book: { shape: "book" }, link: { shape: "cross" }, other: { shape: "cross" } };
  function registerTypes() {
    D.exampleTypes = D.exampleTypes || {};
    for (const [k, v] of Object.entries(TYPES)) if (!D.exampleTypes[k]) D.exampleTypes[k] = { label: t("review.type." + k), plural: t("review.type." + k), shape: v.shape };
  }
  const exId = (a) => "ex:rv-" + a.id;
  const safeUrl = (s) => (/^https?:\/\//i.test(String(s).trim()) ? String(s).trim() : "");
  const asExample = (a) => ({ id: exId(a), kind: "example", type: a.type, label: a.title || t("review.type." + a.type), summary: a.text, url: safeUrl(a.url), topics: [a.prompt],
    review: { id: a.id, who: a.who, at: a.at, checked: a.checked } });
  function applyAdds() {
    if (!RM.app) {   // before the map starts: they join the examples it loads
      const X = (window.RM_EXAMPLES = window.RM_EXAMPLES || { examples: [] });
      X.examples = (X.examples || []).filter((e) => !/^ex:rv-/.test(e.id)).concat([...S.adds.values()].map(asExample));
      return;
    }
    const app = RM.app, want = new Map([...S.adds.values()].map((a) => [exId(a), asExample(a)]));
    for (const n of [...app.byId.values()]) if (n.kind === "example" && n.review && !want.has(n.id)) app.removeExample(n.id);
    for (const [id, e] of want) { const n = app.byId.get(id); if (n) Object.assign(n, e); else app.addExample(e); }
  }

  /* ------------------------------------------------------------------ sending, syncing */
  const who = () => store.get(STORE.who) || "";
  function send(rec) {
    rec = Object.assign({ who: who(), extra: "" }, rec);
    rec.text = String(rec.text == null ? "" : rec.text);
    S.pending.push(Object.assign({ at: Date.now() }, rec));
    derive(); const labels = applyEdits(); applyAdds(); refresh(labels);
    return S.be.send(rec).then(() => setTimeout(sync, S.be.demo ? 50 : 2500), () => { S.error = t("review.status.send_failed"); renderBar(); });
  }
  let syncing = false;
  function sync() {
    if (syncing || !S.be) return Promise.resolve();
    syncing = true;
    return S.be.load().then((rows) => {
      const before = S.log.length;
      // changes made elsewhere: new rows that are not this browser's own, just confirmed
      const theirs = rows.slice(before).filter((r) => r.action !== "ping" && !S.pending.some((p) => same(r, p))).length;
      S.log = rows; S.synced = Date.now(); S.error = null;
      S.pending = S.pending.filter((p) => !rows.some((r) => same(r, p)));
      derive(); const labels = applyEdits(); applyAdds();
      if (S.booted && rows.length !== before) { refresh(labels); if (before && theirs) toast(theirs === 1 ? t("review.status.new_one") : t("review.status.new", { n: theirs })); }
      else renderBar();
    }, () => { S.error = t("review.status.offline"); renderBar(); }).then(() => { syncing = false; });
  }
  // draw the note and panels again with the latest text; never while someone is typing in a field (it waits until they leave it)
  function refresh(labels) {
    if (!S.booted) return;
    renderBar();
    const ae = document.activeElement;
    if (ae && ae.classList && ae.classList.contains("rv-field")) { if (labels) S.later = "maps"; else S.later = S.later || "note"; return; }
    if (RM.app && RM.app.refresh) RM.app.refresh({ maps: !!labels });
  }

  /* ------------------------------------------------------------------ the header: the Edit switch, and the review's state */
  let bar = null;
  function renderBar() {
    if (!bar) return;
    const n = [...S.edits.values()].reduce((s, l) => s + l.length, 0) + S.adds.size;
    const status = S.error ? S.error : S.be && S.be.demo ? t("review.status.demo") : S.synced ? t("review.status.synced", { time: clock(S.synced) }) : t("review.status.loading");
    const waiting = S.pending.filter((p) => !S.log.some((r) => same(r, p))).length;
    const toggle = h("button", { type: "button", class: "rv-btn rv-toggle", "aria-pressed": S.editing ? "true" : "false", onclick: () => setEditing(!S.editing) },
      h("span", { "aria-hidden": "true" }, "✎ "), S.editing ? t("review.bar.done") : t("review.bar.edit"));
    const kids = [toggle];
    if (S.editing) kids.push(
      h("span", { class: "rv-count" }, n === 1 ? t("review.bar.count_one") : t("review.bar.count", { n }), waiting ? " · " + t("review.status.saving_n", { n: waiting }) : ""),
      h("span", { class: "rv-sync" + (S.error ? " bad" : "") }, status),
      h("button", { type: "button", class: "rv-btn", title: t("review.bar.refresh"), "aria-label": t("review.bar.refresh"), onclick: () => sync() }, "⟳"),
      h("button", { type: "button", class: "rv-btn", onclick: () => welcome(true) }, t("review.bar.help")),
      S.frozen
        ? h("button", { type: "button", class: "rv-btn rv-frozen", onclick: () => confirmBox(t("review.unfreeze.title"), t("review.unfreeze.body"), t("review.unfreeze.ok"), () => send({ action: "unfreeze", key: "*" })) },
          "❄ ", t("review.bar.frozen", { date: S.frozen.at ? u.fmtDate(new Date(S.frozen.at).toISOString().slice(0, 10)) : "" }))
        : h("button", { type: "button", class: "rv-btn rv-freeze", onclick: () => confirmBox(t("review.freeze.title"), t("review.freeze.body"), t("review.freeze.ok"), () => send({ action: "freeze", key: "*" })) }, t("review.bar.freeze")));
    else if (S.error) kids.push(h("span", { class: "rv-sync bad" }, status));
    else if (S.frozen) kids.push(h("span", { class: "rv-sync" }, "❄ ", t("review.bar.frozen", { date: "" })));
    bar.replaceChildren(...kids);
    document.body.classList.toggle("rv-is-frozen", frozen());
    document.body.classList.toggle("rv-editing", S.editing);
  }
  function setEditing(on) {
    S.editing = !!on && !!S.be;
    renderBar();
    if (RM.app && RM.app.refresh) RM.app.refresh({ maps: false });
    if (S.editing) welcome(false);
    toast(S.editing ? t("review.edit_on") : t("review.edit_off"));
  }
  const clock = (ms) => { const d = new Date(ms); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };
  const when = (ms) => (ms ? u.fmtDate(new Date(ms).toISOString().slice(0, 10)) + " " + clock(ms) : "");
  function toast(msg) {
    const el = h("div", { class: "rv-toast", role: "status" }, msg);
    document.body.append(el);
    setTimeout(() => el.classList.add("out"), 3000);
    setTimeout(() => el.remove(), 3600);
  }

  /* ------------------------------------------------------------------ dialogs */
  function modal(title, ...kids) {
    const close = () => { wrap.remove(); if (opener && opener.focus) opener.focus({ preventScroll: true }); };
    const opener = document.activeElement;
    const box = h("div", { class: "rv-modal", role: "dialog", "aria-modal": "true", "aria-label": title },
      h("button", { type: "button", class: "rv-x", "aria-label": t("review.close"), onclick: () => close() }, "✕"), h("h2", null, title), ...kids);
    const wrap = h("div", { class: "rv-overlay", onclick: (e) => { if (e.target === wrap) close(); } }, box);
    wrap.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } });
    document.body.append(wrap);
    const f = box.querySelector("textarea, input, select, button:not(.rv-x)");
    if (f) f.focus({ preventScroll: true });
    return close;
  }
  function confirmBox(title, body, ok, then) {
    const close = modal(title, h("p", null, body), h("div", { class: "rv-actions" },
      h("button", { type: "button", class: "btn", onclick: () => close() }, t("review.cancel")),
      h("button", { type: "button", class: "btn solid", onclick: () => { close(); then(); } }, ok)));
  }
  function welcome(force) {
    if (!force && store.get(STORE.seen)) return;
    store.set(STORE.seen, "1");
    const close = modal(t("review.welcome.title"), h("p", null, t("review.welcome.lede")),
      h("ul", { class: "rv-list" }, t("review.welcome.items").map((x) => h("li", null, ...u.inline(x)))),
      h("p", { class: "rv-rule" }, t("review.rule")),
      h("div", { class: "rv-actions" }, whoField(), h("button", { type: "button", class: "btn solid", onclick: () => close() }, t("review.welcome.ok"))));
  }
  // initials: only the committee sees them (they are not carried to the public map)
  function whoField() {
    const i = h("input", { type: "text", class: "rv-who", maxlength: "12", value: who(), placeholder: t("review.who_placeholder"), "aria-label": t("review.who_label"), title: t("review.who_label") });
    i.addEventListener("input", () => store.set(STORE.who, i.value.trim().slice(0, 12)));
    return i;
  }

  /* ------------------------------------------------------------------ editing in place: click into the text, type, click away */
  const PLAIN = (() => { const d = document.createElement("div"); try { d.contentEditable = "plaintext-only"; } catch (e) { return "true"; } return d.contentEditable === "plaintext-only" ? "plaintext-only" : "true"; })();
  const tidy = (s) => String(s).replace(/\r/g, "").replace(/\u00a0/g, " ").replace(/[\u2014\u2015]/g, "\u2013").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();   // (the map uses no em dashes)
  function editable(el, key, opts) {
    opts = opts || {};
    if (!S.be || !slot(key) || !S.editing || frozen()) return el;
    let field = el;
    if (opts.md) {   // what the group said: edited as written (lines starting "- " are bullets), shown as such once saved
      field = h("div", { class: "rv-md" });
      field.textContent = current(key);
    }
    field.classList.add("rv-field");
    field.setAttribute("contenteditable", PLAIN);
    field.setAttribute("role", "textbox");
    field.setAttribute("aria-label", t("review.field_label"));
    if (opts.md) field.setAttribute("aria-multiline", "true");
    field.spellcheck = true;
    field.dataset.editKey = key;
    let before = null;
    const value = () => tidy(field.innerText);
    field.addEventListener("focus", () => { before = value(); field.classList.add("on"); });
    field.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); field.textContent = opts.md ? current(key) : before; before = null; field.blur(); return; }
      if (e.key === "Enter" && (!opts.md || e.ctrlKey || e.metaKey)) { e.preventDefault(); field.blur(); }   // one-paragraph texts: Enter saves
      e.stopPropagation();   // (the map's own keys stay quiet while typing)
    });
    field.addEventListener("blur", () => {
      field.classList.remove("on");
      const text = value();
      if (before !== null && text !== before) {
        if (!text && !opts.md) { field.textContent = before; toast(t("review.empty")); }
        else send({ action: "edit", key, text });
      }
      before = null;
      if (S.later) { const maps = S.later === "maps"; S.later = false; setTimeout(() => { if (RM.app) RM.app.refresh({ maps }); }, 0); }
    });
    const list = S.edits.get(key) || [];
    const meta = h("div", { class: "rv-meta" });
    if (isPending((p) => p.action === "edit" && p.key === key)) meta.append(h("span", { class: "rv-saving" }, t("review.status.saving")));
    else if (list.length) { const last = list[list.length - 1]; meta.append(h("span", { class: "rv-by" }, t("review.edited", { who: last.who || t("review.someone"), when: when(last.at) }))); }
    if (list.length) meta.append(h("button", { type: "button", class: "rv-hist", onclick: () => openHistory(key, opts) }, t("review.history", { n: list.length })));
    return meta.childNodes.length ? h("div", { class: "rv-block" + (opts.inline ? " inline" : "") }, field, meta) : field;
  }
  function openHistory(key, opts) {
    const list = (S.edits.get(key) || []).slice().reverse();
    const item = (text, by, isNow) => h("li", { class: isNow ? "now" : "" },
      h("div", { class: "rv-h-by" }, by), opts.md ? u.md(text) : h("p", null, text),
      isNow || frozen() ? null : h("button", { type: "button", class: "btn sm", onclick: () => { close(); send({ action: "edit", key, text }); } }, t("review.use_version")));
    const close = modal(t("review.history_title"), h("ol", { class: "rv-versions" },
      list.map((r, i) => item(r.text, t("review.edited", { who: r.who || t("review.someone"), when: when(r.at) }), i === 0)),
      item(S.base.get(key) || "", t("review.original"), !list.length)));
  }

  /* ------------------------------------------------------------------ adding to a prompt after a discussion */
  const newId = () => (Date.now().toString(36) + Math.random().toString(36).slice(2, 7)).slice(0, 14);
  function openAdd(tid) {
    const ty = h("select", { class: "rv-in", "aria-label": t("review.add.type") }, Object.keys(TYPES).map((k) => h("option", { value: k }, t("review.type." + k))));
    const ti = h("input", { type: "text", class: "rv-in", maxlength: "160", placeholder: t("review.add.title_ph"), "aria-label": t("review.add.title") });
    const tx = h("textarea", { class: "rv-ta", rows: 6, placeholder: t("review.add.text_ph"), "aria-label": t("review.add.text") });
    const ln = h("input", { type: "url", class: "rv-in", placeholder: "https://", "aria-label": t("review.add.link") });
    const msg = h("p", { class: "rv-hint" }, t("review.add.hint"));
    const close = modal(t("review.add.heading", { label: node(tid).label }),
      h("label", { class: "rv-lab" }, t("review.add.type"), ty), h("label", { class: "rv-lab" }, t("review.add.title"), ti),
      h("label", { class: "rv-lab" }, t("review.add.text"), tx), h("label", { class: "rv-lab" }, t("review.add.link"), ln), msg,
      h("p", { class: "rv-rule" }, t("review.rule")),
      h("div", { class: "rv-actions" }, whoField(), h("button", { type: "button", class: "btn", onclick: () => close() }, t("review.cancel")),
        h("button", { type: "button", class: "btn solid", onclick: () => {
          const title = tidy(ti.value), text = tidy(tx.value), url = ln.value.trim();
          if (!title || !text) { msg.textContent = t("review.add.need"); return; }
          if (url && !safeUrl(url)) { msg.textContent = t("review.add.bad_link"); return; }
          close();
          send({ action: "add", key: tid, text, extra: JSON.stringify({ id: newId(), type: ty.value, title, url }) });
          toast(t("review.add.done"));
        } }, t("review.add.save"))));
  }
  const byLine = (a) => t("review.added_by", { who: a.who || t("review.someone"), when: when(a.at) });
  const checkLine = (a) => (a.checked ? t("review.checked_by", { who: a.checked }) : t("review.unchecked"));
  function contribActions(a) {
    if (frozen() || !S.editing) return null;
    return h("div", { class: "rv-actions left" },
      a.checked ? null : h("button", { type: "button", class: "btn sm", onclick: () => send({ action: "check", key: a.id, text: "" }) }, t("review.check")),
      h("button", { type: "button", class: "btn sm ghost", onclick: () => confirmBox(t("review.remove_title"), t("review.remove_body"), t("review.remove_ok"), () => send({ action: "remove", key: a.id, text: "" })) }, t("review.remove")));
  }
  // the section at the foot of a prompt's note, in edit mode
  function contributions(app, tid) {
    if (!S.be || !S.editing) return null;
    const list = [...S.adds.values()].filter((a) => a.prompt === tid);
    const sec = h("section", { class: "rv-contrib" }, h("h2", null, t("review.added.title"), h("small", null, list.length ? t("review.added.n", { n: list.length }) : t("review.added.none"))));
    for (const a of list) sec.append(h("div", { class: "rv-card" },
      h("button", { type: "button", class: "rv-card-title", onclick: () => app.select(exId(a)) }, h("span", { class: "rv-type" }, t("review.type." + a.type)), a.title),
      h("p", { class: "rv-card-text" }, a.text.length > 220 ? a.text.slice(0, 220) + "…" : a.text),
      h("p", { class: "rv-card-by" }, byLine(a), " · ", checkLine(a)), contribActions(a)));
    if (!frozen()) sec.append(h("button", { type: "button", class: "btn rv-add", onclick: () => openAdd(tid) }, "+ ", t("review.add.button")));
    return sec;
  }
  // the foot of an addition's own note (in place of "checked by a second person")
  function exampleFooter(app, n) {
    const a = S.adds.get(n.review.id);
    if (!a) return null;
    return h("div", { class: "rv-foot" }, h("p", { class: "cite" }, byLine(a), " · ", checkLine(a), " · ", t("review.not_public")), contribActions(a));
  }

  /* ------------------------------------------------------------------ setup (the owner, once, at index.html?setup) */
  function setupScreen() {
    document.body.classList.add("rv-setup-on");
    const fi = h("input", { type: "url", class: "rv-in", placeholder: t("review.setup.form_ph"), "aria-label": t("review.setup.form") });
    const si = h("input", { type: "url", class: "rv-in", placeholder: t("review.setup.sheet_ph"), "aria-label": t("review.setup.sheet") });
    const out = h("div", { class: "rv-out" });
    const go = h("button", { type: "button", class: "btn solid", onclick: () => test() }, t("review.setup.go"));
    async function test() {
      out.replaceChildren(h("p", null, t("review.setup.testing")));
      let cfg;
      try { cfg = Object.assign(parseForm(fi.value), parseSheet(si.value)); } catch (e) { out.replaceChildren(h("p", { class: "bad" }, e.message)); return; }
      const be = backend(cfg), token = "setup-" + newId();
      try {
        await be.send({ action: "ping", key: "setup", text: token, who: "", extra: "" });
        let seen = false;
        for (let i = 0; i < 12 && !seen; i++) {
          await new Promise((r) => setTimeout(r, i ? 2500 : 1500));
          try { seen = (await be.load()).some((r) => r.text === token); }
          catch (e) { if (i > 3) throw e; }
        }
        if (!seen) throw new Error(t("review.setup.no_row"));
      } catch (e) {
        out.replaceChildren(h("p", { class: "bad" }, /load|timeout|sheet/i.test(e.message) ? t("review.setup.no_sheet") : e.message));
        return;
      }
      const link = location.origin + location.pathname + "#k=" + b64e(JSON.stringify(cfg));
      const box = h("input", { type: "text", class: "rv-in", readonly: true, value: link, "aria-label": t("review.setup.link") });
      out.replaceChildren(h("p", { class: "good" }, t("review.setup.ok")), box,
        h("div", { class: "rv-actions left" },
          h("button", { type: "button", class: "btn solid", onclick: () => { box.select(); (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(() => toast(t("review.setup.copied")), () => document.execCommand("copy")); } }, t("review.setup.copy")),
          h("a", { class: "btn", href: link }, t("review.setup.open"))),
        h("p", { class: "rv-hint" }, t("review.setup.send")));
    }
    const demo = h("button", { type: "button", class: "btn", onclick: () => { location.href = location.pathname + "#k=" + b64e(JSON.stringify({ demo: 1 })); } }, t("review.setup.demo"));
    const page = h("div", { class: "rv-setup" },
      h("h1", null, t("review.setup.title")),
      h("p", { class: "rv-lede" }, t("review.setup.lede")),
      h("ol", { class: "rv-steps" }, t("review.setup.steps").map((x) => h("li", null, ...u.inline(x)))),
      h("label", { class: "rv-lab" }, t("review.setup.form"), fi), h("label", { class: "rv-lab" }, t("review.setup.sheet"), si),
      h("div", { class: "rv-actions left" }, go, demo), out);
    document.getElementById("app").replaceChildren(page);
  }

  /* ------------------------------------------------------------------ start: (with the edit link) read the Sheet, then start the map */
  function startMap(after) {
    const ui = document.createElement("script");
    ui.src = (scriptEl && scriptEl.dataset.ui) || "assets/ui.js";
    if (after) ui.onload = after;
    document.body.append(ui);
  }
  function editorStart() {
    S.booted = true;
    bar = h("div", { class: "rv-bar", role: "region", "aria-label": t("review.bar.region") });
    const nav = document.querySelector("#siteHeader .nav");
    if (nav) nav.before(bar); else document.body.prepend(bar);
    renderBar();
    setInterval(() => { if (!document.hidden) sync(); }, POLL);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) sync(); });
  }
  // the edit link opened in a tab that already shows the map changes only its #part: start again with it
  window.addEventListener("hashchange", () => { if (/^#k=/.test(location.hash)) location.reload(); });
  RM.review = null;
  if (/[?&]setup\b/.test(location.search)) { readKey(); setupScreen(); return; }
  S.cfg = readKey();
  if (!S.cfg) { startMap(); return; }   // no edit link: the public map, exactly as published
  S.be = backend(S.cfg);
  registerTypes();
  RM.review = { editable, contributions, exampleFooter, editing: () => S.editing, frozen };
  // the map waits a few seconds for the Sheet, so that it starts with the committee's latest text; if the Sheet cannot be reached,
  // it starts with the published text and says so
  let started = false;
  const begin = () => { if (started) return; started = true; startMap(editorStart); };
  sync().then(begin);
  setTimeout(begin, 5000);
})();
