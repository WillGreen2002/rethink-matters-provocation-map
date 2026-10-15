"""Evidence packs for drafting the futures (one Markdown file per theme, written to the git-ignored build/_packs/).

    python -I build/futures_pack.py

Reads only the public, already-anonymised map data (site/graph-data.js): never the private sources. Each pack separates the
group's own words (the prompts and the anonymised note digests), which a future may rest on, from framing written by the
map's author (walk summaries, bridge reasons, tag definitions), which may only guide wording.
"""
import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT = os.path.join(ROOT, "build", "_packs")

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass


def main():
    with open(os.path.join(ROOT, "site", "graph-data.js"), encoding="utf-8") as f:
        src = f.read()
    D = json.loads(src[src.index("{"):src.rindex("}") + 1])
    by = {n["id"]: n for n in D["nodes"]}
    os.makedirs(OUT, exist_ok=True)
    for th in sorted((n for n in D["nodes"] if n["kind"] == "theme"), key=lambda n: n["n"]):
        topics = sorted((by[t] for t in th["topics"]), key=lambda t: t["order"])
        tids = {t["id"] for t in topics}
        discs = []
        for t in topics:
            for d in t["sources"]:
                if d not in [x["id"] for x in discs] and by[d]["notes"].strip():
                    discs.append(by[d])
        L = [f"# Evidence pack: theme {th['n']} on the map (sheet theme {th['sheet']}), {th['label']}", "",
             f"**Theme title:** {th['title']}", f"**Lead question:** {th['lead']}", "",
             "## A. The group's own words (a future may rest only on these)", "", "### Prompts (verbatim from the Bristol retreat sheet)", ""]
        for t in topics:
            L.append(f"- `n:{t['id'][2:]}` **{t['label']}**: {t['text']}")
        L += ["", f"### Anonymised note digests from the discussions behind these prompts ({len(discs)})", ""]
        if not discs:
            L.append("*None: no session notes behind this theme yet. Draw only on the prompts above.*")
        for d in discs:
            L += [f"#### `d:{d['id'][2:]}` {d['label']}", "", d["notes"].strip(), ""]
        L += ["## B. Framing by the map's author (may guide wording; a future may NOT rest on these)", "", "### Tensions the prompts sit on", ""]
        tens = {}
        for t in topics:
            for tg in t["tags"]:
                n = by[tg]
                if n["facet"] == "tension":
                    tens[tg] = n
        for tg, n in tens.items():
            poles = f" ({n['poles'][0]} ↔ {n['poles'][1]})" if n.get("poles") else ""
            L.append(f"- `{tg}` {n['label']}{poles}: {n['def']}")
        L += ["", "### Guided walks passing through this theme", ""]
        for w in D["threads"]:
            if any(s["topic"] in tids for s in w["steps"]):
                L.append(f"- `{w['id']}` {w['title']}: {w['soWhat']}")
        L += ["", "### Hand-written bridges touching these prompts", ""]
        for l in D["links"]:
            if l["kind"] == "rel" and l["curated"] and (l["s"] in tids or l["t"] in tids):
                L.append(f"- {by[l['s']]['label']} / {by[l['t']]['label']}: {l['why']}")
        path = os.path.join(OUT, f"theme-sheet-{th['sheet']}.md")
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            f.write("\n".join(L) + "\n")
        print(f"pack: map theme {th['n']} (sheet {th['sheet']}) {th['label']}: {len(topics)} prompts, {len(discs)} digests")


if __name__ == "__main__":
    main()
