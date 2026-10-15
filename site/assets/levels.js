/* The map's three levels, after Frank Geels' multi-level perspective, used as a snapshot of the discussions rather than a model of
   change over time, and walked from the top down: the Landscape (the nine themes), the Regime (one theme and its prompts) and the
   Niche (one prompt and its discussions, examples and books).
   Pure helpers for reading and writing the address bar; no DOM, so they can be tested under node (build/test_levels.js).

   ?level=regime&focus=th:5#n:hype-vs-evidence      ?level=niche&focus=n:hype-vs-evidence#d:spudcells-hype
   ?level=regime&walk=data-bottleneck&stop=3
   A link with no level opens wherever its item lives: #n:… and #t:… on the Regime; #d:…, #b:… and #ex:… on the Niche; #th:…,
   #arc:… and #c, or nothing at all, on the Landscape. The focus (the theme of the Regime, the prompt of the Niche) can be left out:
   the item implies it. */
(function (root) {
  const LEVELS = ["landscape", "regime", "niche"];
  const FOCUS = { regime: /^th:\d{1,2}$/, niche: /^n:[a-z0-9-]{1,80}$/ };
  const WALK = /^[a-z0-9-]{1,60}$/;

  // where an item lives when the address does not say
  function homeLevel(id) {
    if (!id || id === "c" || /^(th|arc):/.test(id)) return "landscape";
    if (/^(ex|d|b):/.test(id)) return "niche";
    return "regime";
  }
  // can this level open a note on this item without leaving it?
  function shows(level, id) {
    if (!id) return true;
    if (level === "landscape") return id === "c" || /^(th|arc):/.test(id);
    if (level === "niche") return /^(ex|n|d|b|t):/.test(id);
    return /^(th|n|t):/.test(id);
  }
  function parse(search, hash) {
    const q = new URLSearchParams(search || "");
    let id = null;
    try { id = decodeURIComponent(String(hash || "").replace(/^#/, "")) || null; } catch (e) { id = null; }
    const walk = WALK.test(q.get("walk") || "") ? q.get("walk") : null;
    let level = q.get("level");
    if (!LEVELS.includes(level)) level = homeLevel(id);
    const want = walk ? "regime" : level, focus = FOCUS[want] && FOCUS[want].test(q.get("focus") || "") ? q.get("focus") : null;
    const stop = walk && /^[1-9]\d?$/.test(q.get("stop") || "") ? +q.get("stop") : null;   // 1-based; one past the last is the summary
    return { level: walk ? "regime" : level, focus, walk, stop, id, embed: q.has("embed") };
  }
  // the query string and hash for a state: "" for the bare Landscape, so the plain address stays the plain address
  function href(s) {
    const q = [];
    const level = s.walk ? "regime" : s.level || "landscape";
    if (level !== "landscape" || s.id) q.push("level=" + level);
    if (s.focus && level !== "landscape") q.push("focus=" + s.focus);
    if (s.walk) q.push("walk=" + s.walk);
    if (s.walk && s.stop > 1) q.push("stop=" + s.stop);
    if (s.embed) q.push("embed=1");
    return (q.length ? "?" + q.join("&") : "") + (s.id ? "#" + s.id : "");
  }
  const api = { LEVELS, homeLevel, shows, parse, href };
  if (typeof module === "object" && module.exports) module.exports = api;
  else (root.RM = root.RM || {}).levels = api;
})(typeof window !== "undefined" ? window : globalThis);
