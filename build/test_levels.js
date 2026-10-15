// node build/test_levels.js : checks the address-bar helpers in site/assets/levels.js
const assert = require("assert");
const L = require("../site/assets/levels.js");

const p = (url) => { const i = url.indexOf("#"), s = i < 0 ? url : url.slice(0, i); return L.parse(s, i < 0 ? "" : url.slice(i)); };

// old links keep working: a bare item opens where it lives
assert.deepStrictEqual(p(""), { level: "landscape", focus: null, walk: null, id: null, embed: false });
assert.strictEqual(p("#n:hype-vs-evidence").level, "regime");
assert.strictEqual(p("#d:some-discussion").level, "regime");
assert.strictEqual(p("#t:tension/x").level, "regime");
assert.strictEqual(p("#b:a-book").level, "regime");
assert.strictEqual(p("#th:5").level, "landscape");
assert.strictEqual(p("#arc:matter-to-life").level, "landscape");
assert.strictEqual(p("#c").level, "landscape");
assert.strictEqual(p("#ex:a-paper").level, "niche");
assert.strictEqual(p("?embed=1#n:x").embed, true);

// explicit levels, focus and walks
assert.deepStrictEqual(p("?level=regime&focus=th:5#n:hype-vs-evidence"), { level: "regime", focus: "th:5", walk: null, id: "n:hype-vs-evidence", embed: false });
assert.strictEqual(p("?level=niche").level, "niche");
assert.strictEqual(p("?level=bogus#th:2").level, "landscape");
assert.strictEqual(p("?level=regime&focus=evil()").focus, null);
assert.strictEqual(p("?level=landscape&focus=th:5").focus, null, "the Landscape has no focus");
assert.strictEqual(p("?walk=data-bottleneck").level, "regime", "walks run on the Regime");
assert.strictEqual(p("?walk=../../x").walk, null);
assert.strictEqual(p("#%E0%A4%A").id, null, "a malformed hash is ignored, not thrown");

// writing
assert.strictEqual(L.href({ level: "landscape" }), "");
assert.strictEqual(L.href({ level: "landscape", id: "th:5" }), "?level=landscape#th:5");
assert.strictEqual(L.href({ level: "regime" }), "?level=regime");
assert.strictEqual(L.href({ level: "regime", focus: "arc:matter-to-life", id: "n:x" }), "?level=regime&focus=arc:matter-to-life#n:x");
assert.strictEqual(L.href({ level: "landscape", focus: "th:3" }), "", "focus is dropped on the Landscape");
assert.strictEqual(L.href({ level: "landscape", walk: "w" }), "?level=regime&walk=w");
assert.strictEqual(L.href({ level: "niche", embed: true }), "?level=niche&embed=1");

// round trips
for (const s of [{ level: "regime", focus: "th:9", id: "n:a" }, { level: "niche", id: "ex:b" }, { level: "landscape", id: "c" }, { level: "regime", walk: "w", id: "n:c" }]) {
  const url = L.href(s), back = p(url);
  assert.strictEqual(back.level, s.walk ? "regime" : s.level, url);
  assert.strictEqual(back.id, s.id || null, url);
  assert.strictEqual(back.focus, s.focus || null, url);
  assert.strictEqual(back.walk, s.walk || null, url);
}

// which level can open which note
assert.ok(L.shows("landscape", "th:1") && L.shows("landscape", "c") && L.shows("landscape", "arc:x"));
assert.ok(!L.shows("landscape", "n:x") && !L.shows("landscape", "ex:x"));
assert.ok(L.shows("regime", "n:x") && L.shows("regime", "t:a/b") && L.shows("regime", "th:2") && !L.shows("regime", "ex:x"));
assert.ok(L.shows("niche", "ex:x") && L.shows("niche", "n:x") && !L.shows("niche", "th:2"));
console.log("test_levels: all passed");
