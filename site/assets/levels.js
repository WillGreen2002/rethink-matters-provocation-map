/* The map's three levels, after Frank Geels' multi-level perspective, used as a snapshot of the discussions rather than a model of
   change over time: the Landscape (the nine themes), the Regime (the sixty prompts) and the Niche (examples on the ground).
   Pure helpers for reading and writing the address bar; no DOM, so they can be tested under node (build/test_levels.js).

   ?level=regime&focus=th:5#n:hype-vs-evidence      ?level=regime&walk=data-bottleneck&stop=3
   A link with no level opens wherever its item lives: #n:… (and #d:, #t:, #b:) on the Regime, #ex:… on the Niche, and #th:…,
   #arc:… and #c, or nothing at all, on the Landscape. */
(function (root) {
  const LEVELS = ["landscape", "regime", "niche"];
  const FOCUS = /^(th:\d{1,2}|arc:[a-z0-9-]{1,60})$/;
  const WALK = /^[a-z0-9-]{1,60}$/;

  // where an item lives when the address does not say
  function homeLevel(id) {
    if (!id || id === "c" || /^(th|arc):/.test(id)) return "landscape";
    if (/^ex:/.test(id)) return "niche";
    return "regime";
  }
  // can this level open a note on this item without leaving it?
  function shows(level, id) {
    if (!id) return true;
    if (level === "landscape") return id === "c" || /^(th|arc):/.test(id);
    if (level === "niche") return /^(ex|n):/.test(id);
    return !/^ex:/.test(id);
  }
  function parse(search, hash) {
    const q = new URLSearchParams(search || "");
    let id = null;
    try { id = decodeURIComponent(String(hash || "").replace(/^#/, "")) || null; } catch (e) { id = null; }
    let level = q.get("level");
    if (!LEVELS.includes(level)) level = homeLevel(id);
    const focus = FOCUS.test(q.get("focus") || "") && level !== "landscape" ? q.get("focus") : null;
    const walk = WALK.test(q.get("walk") || "") ? q.get("walk") : null;
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
