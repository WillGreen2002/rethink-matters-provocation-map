#!/usr/bin/env python
"""
Rethink Matters provocation map: build script.

    python -I build/build.py            (from the project root; see README.md)
    python -I build/build.py --review   (also write Excel-friendly review sheets for Rethink Matters to build/_review/)
    python -I build/build.py --examples <test.csv> --examples-out <outside-the-repo.js>   (test fixture: writes only that file)

Reads
    source_data/bristol_retreat.xlsx        'Prompts (LIVE)'  -> themes, guiding questions, prompts (verbatim)
    source_data/provocations_signup.xlsx    provocation texts (never the Provocateur / Joiners columns)
    source_notes/provocation_combined.docx  provocation texts for sessions whose notes were combined
    curation/*.yaml                         lenses, tags, topics, discussions (+ anonymised note digests), threads, copy, futures
    curation/niche_examples.csv             the Niche level's examples, kept by Rethink Matters in Excel
Writes
    site/graph-data.js                      the whole map as one script (works from file:// and any static host)
    site/examples-data.js                   the published (checked) Niche examples
    vault/                                  Obsidian-ready Markdown vault (Zettelkasten view of the same data)
    docs/                                   tag guide, examples guide, futures review, build report

Hard failures (non-zero exit): unresolved references, bullets/texts not found, any participant name or other restricted
term in the published output (Chatham House Rule / project confidentiality), and any em dash in what the map shows.
"""
from __future__ import annotations

import argparse
import csv
import datetime as _dt
import glob
import json
import math
import os
import re
import sys
from collections import Counter, defaultdict
from itertools import combinations

try:
    import docx  # noqa: E402
    import openpyxl  # noqa: E402
    from ruamel.yaml import YAML  # noqa: E402
except ImportError:  # `python -I` ignores the per-user site-packages; add them back explicitly
    import site
    sys.path.append(site.getusersitepackages())
    import docx  # noqa: E402
    import openpyxl  # noqa: E402
    from ruamel.yaml import YAML  # noqa: E402

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:  # pragma: no cover
    pass

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # `-I` does not add the script folder
import examples  # noqa: E402  (the Niche spreadsheet parser)
import leakcheck  # noqa: E402  (generic patterns only; sensitive lists live in build/local_checks.json, which is never published)

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
P = lambda *a: os.path.join(ROOT, *a)  # noqa: E731
yaml = YAML(typ="safe")
LOCAL = leakcheck.load_local()

_ap = argparse.ArgumentParser(description="Build the Rethink Matters provocation map.")
_ap.add_argument("--examples", help="test fixture: read Niche examples from this CSV and write only --examples-out")
_ap.add_argument("--examples-out", help="with --examples: where to write the examples data (must be outside the repository)")
_ap.add_argument("--review", action="store_true", help="also write review sheets for Rethink Matters to build/_review/")
ARGS = _ap.parse_args() if __name__ == "__main__" else _ap.parse_args([])
FIXTURE = bool(ARGS.examples)
if FIXTURE:
    _out = os.path.abspath(ARGS.examples_out or "")
    if not ARGS.examples_out or _out.startswith(ROOT + os.sep):
        raise SystemExit("--examples needs --examples-out pointing outside the repository (fixtures are never written into it)")

ERRORS: list[str] = []
WARNINGS: list[str] = []
REDACTIONS: list[str] = []
OUT: list[tuple[str, str]] = []   # generated text files (path, text), checked before anything is written


def err(msg):  # collect, keep going so we can report everything at once
    ERRORS.append(msg)


def warn(msg):
    WARNINGS.append(msg)


def norm(s: str) -> str:
    s = str(s).replace("\u00a0", " ").replace("\r", "")
    return re.sub(r"[ \t]+", " ", s).strip()


def load_yaml(path):
    with open(path, encoding="utf-8") as f:
        return yaml.load(f)


def load_many(pattern):
    out = []
    for p in sorted(glob.glob(P("curation", pattern))):
        out.extend(load_yaml(p) or [])
    return out


# ----------------------------------------------------------------------------------------------------------
# 1. Source readers
# ----------------------------------------------------------------------------------------------------------
def read_bristol():
    wb = openpyxl.load_workbook(P("source_data", "bristol_retreat.xlsx"), data_only=True)
    ws = wb["Prompts (LIVE)"]
    themes, cur = {}, None
    for (v,) in ws.iter_rows(min_col=1, max_col=1, values_only=True):
        if v is None or not str(v).strip():
            continue
        s = norm(v)
        m = re.match(r"^Theme\s+(\d+)\.\s*(.+)$", s)
        if m:
            cur = {"n": int(m.group(1)), "title": m.group(2).strip(), "lead": None, "bullets": []}
            themes[cur["n"]] = cur
        elif cur is not None:
            if cur["lead"] is None:
                cur["lead"] = s
            else:
                cur["bullets"].append(s)
    return themes


class Sources:
    def __init__(self):
        self.signup = openpyxl.load_workbook(P("source_data", "provocations_signup.xlsx"), data_only=True)
        d = docx.Document(P("source_notes", "provocation_combined.docx"))
        self.docx_prov = []  # provocation cell texts (paragraph lists)
        for t in d.tables:
            for row in t.rows:
                cells = row.cells
                if len(cells) >= 2 and norm(cells[0].text).lower() == "provocation":
                    paras = [norm(p.text) for p in cells[1].paragraphs if norm(p.text)]
                    self.docx_prov.append(paras)
        self._people = None

    def find_docx(self, needle):
        hits = [p for p in self.docx_prov if needle in " ".join(p)]
        if len(hits) != 1:
            return None, len(hits)
        return hits[0], 1

    def find_xlsx(self, sheet, needle):
        if sheet not in self.signup.sheetnames:
            return None, -1
        hits = []
        for row in self.signup[sheet].iter_rows():
            for c in row:
                if isinstance(c.value, str) and needle in c.value:
                    hits.append(c.value)
        if len(hits) != 1:
            return None, len(hits)
        paras = [norm(x) for x in hits[0].replace("\r", "").split("\n")]
        return [p for p in paras if p], 1

    def people_tokens(self):
        """Capitalised first-name-like words found in Provocateur / Joiners / WG-voting columns.
        Used ONLY by the leak check, never published. 'Will' is excluded (ordinary word; handled separately)."""
        if self._people is not None:
            return self._people
        stop = {"Books", "Readers", "Group", "From", "Not", "Will", "Provocateur", "Joiners", "Preference", "Meeting", "None", "Skipped", "All", "Registration", "Interest"}
        toks = set()
        for ws in self.signup.worksheets:
            hdr = next(ws.iter_rows(min_row=1, max_row=1), None)
            if not hdr:
                continue
            cols = []
            for c in hdr:
                if isinstance(c.value, str) and re.search(r"Provocateur", c.value, re.I):
                    cols.append((c.column, c.column))
                elif isinstance(c.value, str) and re.search(r"Joiner|voting", c.value, re.I):
                    cols.append((c.column, c.column + 2))  # extra joiners are written in the cells to the right
            for lo, hi in cols:
                for row in ws.iter_rows(min_row=2, min_col=lo, max_col=hi):
                    for c in row:
                        if isinstance(c.value, str) and len(c.value) < 60 and "http" not in c.value:
                            for w in re.findall(r"[A-ZÇÍÉ][a-zçéêíóúãõ]{2,}", c.value):
                                if w not in stop:
                                    toks.add(w)
        self._people = toks
        return toks


# ----------------------------------------------------------------------------------------------------------
# 2. Load + validate curation
# ----------------------------------------------------------------------------------------------------------
meta = load_yaml(P("curation", "meta.yaml"))
tags_def = load_yaml(P("curation", "tags.yaml"))
books_def = load_yaml(P("curation", "books.yaml"))
topics_cur = load_many("topics_*.yaml")
disc_cur = load_many("discussions_*.yaml")
threads_cur = load_yaml(P("curation", "threads.yaml"))

bristol = read_bristol()
src = Sources()

# ---- themes
if len(bristol) != 9:
    warn(f"Expected 9 themes in 'Prompts (LIVE)', found {len(bristol)}")
for n in bristol:
    if n not in meta["themes"]:
        err(f"Theme {n} has no entry in curation/meta.yaml themes")

# ---- topics ↔ bullets
topic_ids = set()
claimed = defaultdict(set)  # theme -> bullet indexes
for t in topics_cur:
    tid = t["id"]
    if tid in topic_ids:
        err(f"Duplicate topic id {tid}")
    topic_ids.add(tid)
    th = bristol.get(t["theme"])
    if not th:
        err(f"{tid}: theme {t['theme']} not in sheet")
        continue
    hits = [i for i, b in enumerate(th["bullets"]) if t["match"] in b]
    if len(hits) != 1:
        err(f"{tid}: match {t['match']!r} found {len(hits)} times in theme {t['theme']} bullets")
        continue
    i = hits[0]
    claimed[t["theme"]].add(i)
    t["_raw"] = th["bullets"][i]
    t["_text"] = norm(t["override_text"]) if t.get("override_text") else th["bullets"][i]
    t["_idx"] = i
for n, th in bristol.items():
    for i, b in enumerate(th["bullets"]):
        if i not in claimed[n]:
            warn(f"Sheet prompt not covered by any topic (Theme {n}): {b[:90]}")

# ---- discussions
disc_ids = {d["id"] for d in disc_cur}
if len(disc_ids) != len(disc_cur):
    err("Duplicate discussion ids")
for d in disc_cur:
    blocks = []
    for tx in d.get("texts", []):
        if tx["from"] == "docx":
            paras, n = src.find_docx(tx["find"])
        else:
            paras, n = src.find_xlsx(tx["sheet"], tx["find"])
        if paras is None:
            err(f"discussion {d['id']}: text {tx.get('find')!r} ({tx['from']}) matched {n} times (need exactly 1)")
            continue
        blocks.append({"session": tx.get("session"), "paras": paras})
    # deliberate redactions of verbatim text (e.g. unverified claims about named third parties) — each must match, and is reported
    # The original wording is kept out of the published repo: curation names a key, build/local_checks.json holds [old, new].
    for key in d.get("redact", []) or []:
        pair = LOCAL["redactions"].get(key)
        if not pair:
            err(f"discussion {d['id']}: redaction key {key!r} is not defined in build/local_checks.json")
            continue
        old, new = pair
        if not any(old in p for b in blocks for p in b["paras"]):
            err(f"discussion {d['id']}: redaction {key!r} did not match the source text")
            continue
        for b in blocks:
            b["paras"] = [p.replace(old, new) for p in b["paras"]]
        REDACTIONS.append(f"{d['id']} ({key})")
    d["_blocks"] = blocks
    for s in d.get("sessions", []):
        if s not in meta["sessions"]:
            err(f"discussion {d['id']}: unknown session {s}")

# ---- tags / lenses / books / sources
all_tags = {f"{fac}/{k}": {"facet": fac, "key": k, **v} for fac, items in tags_def.items() for k, v in items.items()}
for fac in tags_def:
    if fac not in meta["facets"]:
        err(f"tags.yaml facet {fac} missing from meta.yaml facets")
for t in topics_cur:
    for tg in t.get("tags", []):
        if tg not in all_tags:
            err(f"{t['id']}: unknown tag {tg}")
    for lens in ("scale", "wg", "pillar", "value"):
        for v in t.get(lens, []) or []:
            if v not in meta["lenses"][lens]["values"]:
                err(f"{t['id']}: unknown {lens} value {v}")
    for s in t.get("sources", []) or []:
        if s not in disc_ids:
            err(f"{t['id']}: unknown discussion {s}")
    for b in t.get("reading", []) or []:
        if b not in books_def:
            err(f"{t['id']}: unknown book {b}")
    for lk in t.get("links", []) or []:
        if lk["to"] not in topic_ids:
            err(f"{t['id']}: link to unknown topic {lk['to']}")
        if lk["type"] not in ("echoes", "tension", "enables", "extends"):
            err(f"{t['id']}: bad link type {lk['type']}")
for th in threads_cur:
    for st in th["steps"]:
        if st["topic"] not in topic_ids:
            err(f"thread {th['id']}: unknown topic {st['topic']}")

# which discussions feed which topics
disc_topics = defaultdict(list)
for t in topics_cur:
    for s in t.get("sources", []) or []:
        disc_topics[s].append(t["id"])
for d in disc_cur:
    if not disc_topics[d["id"]]:
        warn(f"discussion {d['id']} feeds no topic")

# ---- copy: the wording the site shows lives in curation/copy.yaml, so Rethink Matters can edit it in one place
copy_text = load_yaml(P("curation", "copy.yaml")) or {}


def copy_get(key):
    o = copy_text
    for part in key.split("."):
        if not isinstance(o, dict) or part not in o:
            return None
        o = o[part]
    return o


COPY_USED = set()
for _path in sorted(glob.glob(P("site", "assets", "*.js"))):
    with open(_path, encoding="utf-8") as _f:
        COPY_USED |= set(re.findall(r'\bt\(\s*"([A-Za-z0-9_.]+)"', _f.read()))
for _k in sorted(COPY_USED):
    if copy_get(_k) is None:
        err(f"curation/copy.yaml has no entry {_k!r} (used by the site)")

# ---- futures: drafted answers to the WEF question, one per theme plus one overall (sheet theme numbers, like the rest of curation/)
_fpath = P("curation", "futures.yaml")
futures_cur = (load_yaml(_fpath) or {}) if os.path.exists(_fpath) else {}
FUT_STATUS = ("draft", "rm-edited", "rm-approved")
FUT_WORDS = re.compile(r"\b(said|says|argued|suggested|participants?|members?|provocateurs?|transform\w*|revolution\w*|unlock\w*|seamless\w*)\b", re.I)
topic_ids_by_sheet = defaultdict(list)
for t in topics_cur:
    topic_ids_by_sheet[t["theme"]].append(t["id"])
disc_by_id = {d["id"]: d for d in disc_cur}
thread_ids = {th["id"] for th in threads_cur}


def evidence_grade(sheet_n):
    ds = {s for tid in topic_ids_by_sheet[sheet_n] for s in (by_id_cur[tid].get("sources") or []) if (disc_by_id[s].get("notes") or "").strip()}
    return ("strong" if len(ds) >= 3 else "partial" if ds else "thin"), len(ds)


by_id_cur = {t["id"]: t for t in topics_cur}


def check_future(where, f, limit, opening, theme_n=None):
    """Lint one drafted future; returns the published record or None."""
    if not isinstance(f, dict):
        err(f"{where}: expected a mapping")
        return None
    txt = norm(f.get("text") or "")
    if not txt:
        warn(f"{where}: no text yet")
        return None
    status = f.get("status", "draft")
    if status not in FUT_STATUS:
        err(f"{where}: status must be one of {', '.join(FUT_STATUS)}")
    if status == "rm-approved" and not f.get("approved_on"):
        err(f"{where}: rm-approved needs approved_on (YYYY-MM)")
    words = len(txt.split())
    if words > limit:
        err(f"{where}: {words} words (limit {limit})")
    if opening and not txt.startswith(opening):
        err(f"{where}: should begin {opening!r}")
    if re.search(r"[\"“”]", txt):
        err(f"{where}: no quotation marks in a future")
    m = FUT_WORDS.search(txt)
    if m:
        err(f"{where}: avoid the word {m.group(0)!r} (no attribution, no hype)")
    draws = f.get("draws_on") or {}
    prompts = [p for p in (draws.get("prompts") or [])]
    discs = [d for d in (draws.get("discussions") or [])]
    for p in prompts:
        if p not in topic_ids:
            err(f"{where}: draws_on prompt {p!r} is not a topic id")
    for d in discs:
        if d not in disc_ids:
            err(f"{where}: draws_on discussion {d!r} is not a discussion id")
        elif not (disc_by_id[d].get("notes") or "").strip():
            err(f"{where}: draws_on discussion {d!r} has no notes")
    for th in draws.get("threads") or []:
        if th not in thread_ids:
            err(f"{where}: draws_on thread {th!r} is not a thread id")
    for i, s in enumerate(f.get("support") or [], 1):
        refs = s.get("from") or []
        if not any(r.startswith(("n:", "d:")) for r in refs):
            err(f"{where}: support clause {i} needs at least one n: or d: source")
        for r in refs:
            if r.startswith("n:") and r[2:] not in topic_ids or r.startswith("d:") and r[2:] not in disc_ids:
                err(f"{where}: support clause {i} cites unknown {r!r}")
    # digits only if a cited source has them too (no invented numbers)
    src_text = " ".join([by_id_cur[p].get("_text", "") for p in prompts if p in by_id_cur] +
                        [disc_by_id[d].get("notes") or "" for d in discs if d in disc_by_id])
    for num_s in re.findall(r"\d+", txt):
        if num_s not in src_text:
            err(f"{where}: the number {num_s} does not appear in the sources it draws on")
    rec = {"text": txt, "status": status, "approvedOn": f.get("approved_on"), "drawsOn": ["n:" + p for p in prompts]}
    if theme_n is not None:
        grade, n_disc = evidence_grade(theme_n)
        if f.get("evidence") and f["evidence"] != grade:
            warn(f"{where}: evidence says {f['evidence']!r} but the notes make it {grade!r} ({n_disc} discussions with notes)")
        rec["evidence"] = grade
    return rec


FUT_THEME, FUT_CENTER = {}, None
if futures_cur and futures_cur.get("show_on_site", True):
    for f in futures_cur.get("themes") or []:
        n = f.get("theme")
        if n not in meta["themes"]:
            err(f"futures.yaml: theme {n!r} is not a sheet theme number")
            continue
        if f.get("label") != meta["themes"][n]["short"]:
            err(f"futures.yaml: theme {n} label {f.get('label')!r} does not match meta.yaml ({meta['themes'][n]['short']!r}); check the numbering")
        rec = check_future(f"futures.yaml theme {n}", f, 40, "A future where", n)
        if rec:
            FUT_THEME[n] = rec
    if futures_cur.get("overall"):
        FUT_CENTER = check_future("futures.yaml overall", futures_cur["overall"], 60, "A world we would want to live in is one where")

# ---- Niche examples (the spreadsheet Rethink Matters keeps; only rows marked 'checked' are published)
EXAMPLE_TYPES = meta.get("example_types") or {}
EX_PATH = os.path.abspath(ARGS.examples) if FIXTURE else P("curation", "niche_examples.csv")
if not os.path.exists(EX_PATH):
    err(f"{os.path.relpath(EX_PATH, ROOT) if not FIXTURE else EX_PATH} not found")
    EXR = {"examples": [], "rows": 0, "errors": [], "warnings": [], "encoding": "utf-8", "delimiter": ",", "derived_ids": 0,
           "counts": {s: 0 for s in examples.STATUSES}}
else:
    with open(EX_PATH, "rb") as _f:
        EXR = examples.parse(_f.read(), {t["id"]: t["label"] for t in topics_cur},
                             {k: v["label"] for k, v in EXAMPLE_TYPES.items()}, _dt.date.today().year)
    for _m in EXR["errors"]:
        err(_m)
    for _m in EXR["warnings"]:
        warn(_m)
    if EXR["encoding"] == "cp1252" and not FIXTURE:
        warn("niche_examples.csv was saved as plain CSV (not 'CSV UTF-8'); the build rewrites it as UTF-8")

# ----------------------------------------------------------------------------------------------------------
# 3. Derived relations between topics (shared semantic tags + shared discussions)
# ----------------------------------------------------------------------------------------------------------
N = len(topics_cur)
df = Counter(tg for t in topics_cur for tg in set(t.get("tags", [])))
FACET_MULT = {"tension": 1.5, "concept": 1.0, "barrier": 1.0, "domain": 0.7, "method": 0.8}
SRC_BONUS = 2.5
tag_w = {tg: FACET_MULT[tg.split("/")[0]] * math.log((N + 1) / (df[tg] + 1)) for tg in df}
by_id = {t["id"]: t for t in topics_cur}

pairs = {}
for a, b in combinations(topics_cur, 2):
    shared = sorted(set(a.get("tags", [])) & set(b.get("tags", [])))
    ssrc = sorted(set(a.get("sources", []) or []) & set(b.get("sources", []) or []))
    score = sum(tag_w[x] for x in shared) + SRC_BONUS * len(ssrc)
    if shared or ssrc:
        pairs[(a["id"], b["id"])] = {"score": round(score, 2), "tags": shared, "src": ssrc}

curated = {}
for t in topics_cur:
    for lk in t.get("links", []) or []:
        key = tuple(sorted((t["id"], lk["to"])))
        rec = {"type": lk["type"], "why": norm(lk["why"]), "from": t["id"], "to": lk["to"]}
        if key in curated:
            warn(f"curated link duplicated between {key}")
        curated[key] = rec

MIN_SCORE = 2.6  # stored threshold (UI slider filters at runtime)
links = []
for (a, b), rec in pairs.items():
    key = (a, b) if (a, b) in curated else tuple(sorted((a, b)))
    c = curated.get(tuple(sorted((a, b))))
    if rec["score"] >= MIN_SCORE or c:
        links.append({"s": "n:" + a, "t": "n:" + b, "kind": "rel", "curated": bool(c), "type": c["type"] if c else None,
                      "why": c["why"] if c else None, "dir": ("n:" + c["from"]) if c else None,
                      "score": rec["score"], "tags": ["t:" + x for x in rec["tags"]], "src": ["d:" + x for x in rec["src"]]})
for key, c in curated.items():
    if key not in pairs and not any({l["s"], l["t"]} == {"n:" + key[0], "n:" + key[1]} for l in links):
        links.append({"s": "n:" + key[0], "t": "n:" + key[1], "kind": "rel", "curated": True, "type": c["type"], "why": c["why"],
                      "dir": "n:" + c["from"], "score": 0.0, "tags": [], "src": []})
        warn(f"curated link {key} shares no tag or discussion; consider adding a shared tag")

# ----------------------------------------------------------------------------------------------------------
# 3b. Theme numbers: on the map the themes are numbered 1-9 in ring order (theme 1 at the top right, then clockwise), so the
#     numbers read in order round the map. curation/ keeps the sheet's own numbers; the sheet number travels along as `sheet`.
# ----------------------------------------------------------------------------------------------------------
if sorted(meta["theme_order"]) != sorted(bristol):
    raise SystemExit("curation/meta.yaml: theme_order must list every theme in the sheet exactly once")
num = {sheet_n: i + 1 for i, sheet_n in enumerate(meta["theme_order"])}
bristol = {num[n]: dict(th, n=num[n], sheet=n) for n, th in bristol.items()}
meta["themes"] = {num[n]: m for n, m in meta["themes"].items()}
meta["arcs"] = [dict(a, themes=[num[n] for n in a["themes"]]) for a in meta["arcs"]]
meta["theme_order"] = [num[n] for n in meta["theme_order"]]
for t in topics_cur:
    t["theme"] = num[t["theme"]]

# ----------------------------------------------------------------------------------------------------------
# 4. Assemble the graph
# ----------------------------------------------------------------------------------------------------------
nodes, hier = [], []
nodes.append({"id": "c", "kind": "center", "label": meta["center"]["label"], "question": meta["center"]["question"],
              "citation": meta["center"]["citation"], "valuesIntro": meta["center"]["values_intro"], "answer": FUT_CENTER})
theme_topics = defaultdict(list)
for t in topics_cur:
    theme_topics[t["theme"]].append(t["id"])
for n in meta["theme_order"]:
    th = bristol[n]
    m = meta["themes"][n]
    nodes.append({"id": f"th:{n}", "kind": "theme", "n": n, "sheet": th["sheet"], "label": m["short"], "title": th["title"],
                  "lead": th["lead"], "arc": m["arc"], "topics": ["n:" + x for x in theme_topics[n]],
                  "future": FUT_THEME.get(th["sheet"])})
    hier.append({"s": "c", "t": f"th:{n}", "kind": "hier"})

wg_confirmed = {}
for t in topics_cur:
    conf = set()
    for s in t.get("sources", []) or []:
        conf |= set(next(d for d in disc_cur if d["id"] == s).get("wg", []) or [])
    wg_confirmed[t["id"]] = conf

for t in topics_cur:
    wgs = t.get("wg", []) or []
    nodes.append({
        "id": "n:" + t["id"], "kind": "topic", "label": t["label"], "text": t["_text"], "theme": t["theme"],
        "arc": meta["themes"][t["theme"]]["arc"], "order": t["_idx"],
        "scale": t.get("scale", []) or [], "wg": wgs, "wgProposed": [w for w in wgs if w not in wg_confirmed[t["id"]]],
        "pillar": t.get("pillar", []) or [], "value": t.get("value", []) or [],
        "tags": ["t:" + x for x in t.get("tags", [])],
        "sources": ["d:" + x for x in t.get("sources", []) or []],
        "reading": ["b:" + x for x in t.get("reading", []) or []],
    })
    hier.append({"s": f"th:{t['theme']}", "t": "n:" + t["id"], "kind": "hier"})

disc_nodes = []
for d in disc_cur:
    texts = []
    for b in d["_blocks"]:
        texts.append({"session": b["session"], "paras": b["paras"]})
    disc_nodes.append({
        "id": "d:" + d["id"], "kind": "discussion", "label": d["title"], "sessions": d.get("sessions", []),
        "noteIds": d.get("note_ids", []) or [], "scale": d.get("scale", []) or [], "wg": d.get("wg", []) or [],
        "texts": texts, "questions": d.get("questions", []) or [], "refs": d.get("refs", []) or [],
        "notes": (d.get("notes") or "").strip(), "topics": ["n:" + x for x in disc_topics[d["id"]]],
        "proposed": "PROPOSED" in (d.get("sessions") or []),
    })
nodes.extend(disc_nodes)
src_links = [{"s": "n:" + t["id"], "t": "d:" + s, "kind": "src"} for t in topics_cur for s in (t.get("sources", []) or [])]

tag_topics = defaultdict(list)
for t in topics_cur:
    for tg in t.get("tags", []):
        tag_topics[tg].append(t["id"])
tag_nodes = []
for tg, info in all_tags.items():
    if tg not in tag_topics:
        warn(f"tag {tg} is defined but unused")
        continue
    themes_of = sorted({by_id[x]["theme"] for x in tag_topics[tg]})
    tag_nodes.append({"id": "t:" + tg, "kind": "tag", "facet": info["facet"], "key": info["key"], "label": info["label"],
                      "def": info["def"], "poles": info.get("poles"), "topics": ["n:" + x for x in tag_topics[tg]],
                      "themes": themes_of})
nodes.extend(tag_nodes)
tag_links = [{"s": "n:" + t["id"], "t": "t:" + tg, "kind": "tag"} for t in topics_cur for tg in t.get("tags", [])]

book_topics = defaultdict(list)
for t in topics_cur:
    for b in t.get("reading", []) or []:
        book_topics[b].append(t["id"])
book_nodes = [{"id": "b:" + k, "kind": "book", "label": v["title"], "author": v["author"], "shelf": v["shelf"],
               "topics": ["n:" + x for x in book_topics[k]]} for k, v in books_def.items() if book_topics[k]]
nodes.extend(book_nodes)
read_links = [{"s": "n:" + t["id"], "t": "b:" + b, "kind": "read"} for t in topics_cur for b in (t.get("reading", []) or [])]

threads = []
for th in threads_cur:
    threads.append({"id": th["id"], "title": th["title"], "value": th.get("value"), "intro": th["intro"], "soWhat": th["so_what"],
                    "steps": [{"topic": "n:" + s["topic"], "text": s["text"]} for s in th["steps"]]})

# Niche examples: which (map-numbered) themes each one sits under, and how many hang from each prompt
example_nodes = EXR["examples"]
for e in example_nodes:
    e["themes"] = sorted({by_id[t[2:]]["theme"] for t in e["topics"]})
examples_by_topic = Counter(t for e in example_nodes for t in e["topics"])

# ----------------------------------------------------------------------------------------------------------
# 5. Network checks (reported, and used to tune the vocabulary)
# ----------------------------------------------------------------------------------------------------------
DEFAULT_MIN = 6.0  # UI default (slider can go lower/higher); every topic keeps >=1 link at this level
rel_default = [l for l in links if l["curated"] or l["score"] >= DEFAULT_MIN]
adj = defaultdict(set)
for l in rel_default:
    adj[l["s"]].add(l["t"])
    adj[l["t"]].add(l["s"])
topic_nodes = [n["id"] for n in nodes if n["kind"] == "topic"]
node_by = {n["id"]: n for n in nodes}


def components(ids, adjacency):
    seen, comps = set(), []
    for s in ids:
        if s in seen:
            continue
        stack, comp = [s], set()
        while stack:
            x = stack.pop()
            if x in comp:
                continue
            comp.add(x)
            stack.extend(adjacency[x] - comp)
        seen |= comp
        comps.append(comp)
    return sorted(comps, key=len, reverse=True)


comps = components(topic_nodes, adj)


def avg_path(ids, adjacency):
    tot = cnt = 0
    for s in ids:
        dist = {s: 0}
        q = [s]
        for x in q:
            for y in adjacency[x]:
                if y not in dist:
                    dist[y] = dist[x] + 1
                    q.append(y)
        for k, v in dist.items():
            if k != s:
                tot += v
                cnt += 1
    return tot / cnt if cnt else float("nan")


giant = comps[0] if comps else set()
cross = sum(1 for l in rel_default if node_by[l["s"]]["theme"] != node_by[l["t"]]["theme"])
deg = Counter()
for l in rel_default:
    deg[l["s"]] += 1
    deg[l["t"]] += 1
theme_x = Counter()
for l in rel_default:
    a, b = node_by[l["s"]]["theme"], node_by[l["t"]]["theme"]
    if a != b:
        theme_x[tuple(sorted((a, b)))] += 1

# ----------------------------------------------------------------------------------------------------------
# 6. Leak check (Chatham House + confidentiality) over everything that will be published
# ----------------------------------------------------------------------------------------------------------
# Names, nicknames and confidential terms come from build/local_checks.json (git-ignored) plus the Provocateur/Joiners
# columns of the source sheet; generic patterns (Drive links, e-mail addresses, local paths) live in leakcheck.py.
if not LOCAL["present"]:
    warn("build/local_checks.json not found: leak check limited to generic patterns and names read from the source sheets")


def collect_strings(o, out):
    if isinstance(o, str):
        out.append(o)
    elif isinstance(o, dict):
        for v in o.values():
            collect_strings(v, out)
    elif isinstance(o, (list, tuple)):
        for v in o:
            collect_strings(v, out)


def leak_check(published, scope="all"):
    strings = []
    collect_strings(published, strings)
    sheet_names = sorted(src.people_tokens())   # whatever the sign-up sheet recorded in its Provocateur / Joiners columns
    hits = []
    for s in strings:
        hits.extend(leakcheck.scan_text(s, LOCAL, sheet_names, scope=scope))
    return leakcheck.dedupe(hits)


def dash_check(obj, where):
    """House style: no em dashes anywhere the map shows text."""
    strings = []
    collect_strings(obj, strings)
    for s in strings:
        for name in leakcheck.banned_chars(s):
            err(f"{where}: {name} in {s[:90]!r} (house style: none anywhere in the map)")


# ----------------------------------------------------------------------------------------------------------
# 7. Write site data
# ----------------------------------------------------------------------------------------------------------
all_links = hier + links + src_links + tag_links + read_links
stats = {
    "topics": len(topic_nodes), "themes": len(meta["theme_order"]), "discussions": len(disc_nodes), "tags": len(tag_nodes),
    "books": len(book_nodes), "relLinks": len(links), "relDefault": len(rel_default), "curated": sum(1 for l in links if l["curated"]),
    "examples": len(example_nodes),
}
published = {
    "generated": _dt.date.today().isoformat(),
    "site": meta["site"], "center": meta["center"], "arcs": meta["arcs"], "themeOrder": meta["theme_order"],
    "lenses": meta["lenses"], "facets": meta["facets"], "sessions": meta["sessions"], "exampleTypes": EXAMPLE_TYPES,
    "copy": copy_text, "nodes": nodes, "links": all_links, "threads": threads, "stats": stats, "defaultMinScore": DEFAULT_MIN,
}
examples_published = {"generated": _dt.date.today().isoformat(), "examples": example_nodes}
if FIXTURE:
    examples_published["fixture"] = True
hits = leak_check({k: v for k, v in published.items() if k not in ("site",)})
for tok, ctx in hits:
    err(f"LEAK CHECK: {tok!r} in published data: {ctx!r}")
for tok, ctx in leak_check(examples_published, scope="example"):
    err(f"LEAK CHECK: {tok!r} in a Niche example (see niche_examples.csv): {ctx!r}")
dash_check(published, "published data")
dash_check(examples_published, "Niche examples")

# ----------------------------------------------------------------------------------------------------------
# 8. Obsidian vault
# ----------------------------------------------------------------------------------------------------------
def fname(s):
    s = re.sub(r'[\\/:*?"<>|]', "", s)
    s = s.replace("“", "").replace("”", "").replace("’", "'")
    return re.sub(r"\s+", " ", s).strip().rstrip(".")


def md_notes(txt):
    return txt.strip()


def write_vault():
    """Render the Obsidian vault into OUT; files are written only after every check has passed."""
    vroot = P("vault")
    names = {}
    used = set()

    def name_for(nid, base):
        b = fname(base) or nid
        while b.lower() in used:
            b += " (2)"
        used.add(b.lower())
        names[nid] = b
        return b

    center_name = name_for("c", "00 A world we want to live in")
    for n in nodes:
        if n["kind"] == "theme":
            name_for(n["id"], f"Theme {n['n']} · {n['label']}")
        elif n["kind"] in ("topic", "discussion"):
            name_for(n["id"], n["label"])
        elif n["kind"] == "tag":
            name_for(n["id"], f"{meta['facets'][n['facet']]['label'].rstrip('s')} · {n['label']}")
    for th in threads:
        name_for("th-" + th["id"], "Guided walk · " + th["title"])
    for e in example_nodes:
        name_for(e["id"], e["label"])
    ex_index = name_for("ex-index", "00 Examples index")

    def wl(nid, alias=None):
        nm = names[nid]
        return f"[[{nm}|{alias}]]" if alias and alias != nm else f"[[{nm}]]"

    def lens_tags(n):
        return [f"scale/{x}" for x in n.get("scale", [])] + [f"wg/{x}" for x in n.get("wg", [])] + \
               [f"pillar/{x}" for x in n.get("pillar", [])] + [f"value/{x}" for x in n.get("value", [])]

    def write(rel, text):
        OUT.append((os.path.join(vroot, rel), text))

    def status_note(rec):
        s = rec.get("status", "draft")
        if s == "rm-approved":
            return f"*Agreed by Rethink Matters ({rec.get('approvedOn')}).*"
        if s == "rm-edited":
            return "*Edited by Rethink Matters, still under review.*"
        return "*Draft, written from the group's notes for Rethink Matters to rewrite.*"

    arc_label = {a["id"]: a["label"] for a in meta["arcs"]}
    ex_types = {k: v["label"] for k, v in EXAMPLE_TYPES.items()}

    # centre
    c = node_by["c"]
    cu = c["citation"]["url"]
    lines = ["---", "tags: [rethink-matters/map]", "---", f"# {c['label']}", "", f"> {c['question']}", "",
             f"*{c['citation']['text']}* [{cu}]({cu})", ""]
    if c.get("answer"):
        lines += ["## Our draft answer", "", c["answer"]["text"], "", status_note(c["answer"]), ""]
    lines += [c["valuesIntro"], "", "Values used as a lens: " + ", ".join(f"#value/{k}" for k in meta["lenses"]["value"]["values"]), "",
              "## Themes, clockwise by chapter", ""]
    for arc in meta["arcs"]:
        lines.append(f"**{arc['label']}**")
        for n in meta["theme_order"]:
            if n in arc["themes"]:
                lines.append(f"- {wl(f'th:{n}')}")
        lines.append("")
    lines += ["## Guided walks", ""] + [f"- {wl('th-' + t['id'])}" for t in threads] + \
             ["", f"Niche examples: [[{ex_index}]]. Tag system: [[Tag guide]]."]
    write(center_name + ".md", "\n".join(lines) + "\n")

    # themes
    for n in nodes:
        if n["kind"] != "theme":
            continue
        L = ["---", f"tags: [theme/{n['n']}, arc/{n['arc']}]", "---", f"# Theme {n['n']}. {n['title']}", "", f"> {n['lead']}", "",
             f"Part of {wl('c', 'A world we want to live in')} · chapter: *{arc_label[n['arc']]}*"
             + (f" · theme {n['sheet']} in the Bristol retreat sheet" if n.get("sheet") and n["sheet"] != n["n"] else ""), ""]
        f = n.get("future")
        if f:
            L += ["## A future we'd want", "", f["text"], "", status_note(f)]
            if f.get("evidence") == "thin":
                L.append("*Drawn from the prompts only: no session notes yet.*")
            if f.get("drawsOn"):
                L += ["", "Drawn from: " + ", ".join(wl(p) for p in f["drawsOn"])]
            L.append("")
        L += ["## Prompts", ""]
        for tid in sorted(n["topics"], key=lambda x: node_by[x]["order"]):
            L.append(f"- {wl(tid)}")
        write(os.path.join("Themes", names[n["id"]] + ".md"), "\n".join(L) + "\n")

    # topics
    for n in nodes:
        if n["kind"] != "topic":
            continue
        th = node_by[f"th:{n['theme']}"]
        fm_tags = lens_tags(n) + [t[2:] for t in n["tags"]]
        wgs = ", ".join(w.upper() + (" (proposed)" if w in n["wgProposed"] else "") for w in n["wg"]) or "none"
        L = ["---", f"id: {n['id'][2:]}", f"theme: {n['theme']}", "tags:"] + [f"  - {x}" for x in fm_tags] + ["---", f"# {n['label']}", "",
             f"> {n['text']}", "", f"**Theme:** {wl(th['id'])}  ",
             f"**Scale:** {', '.join(n['scale']) or 'none'} · **Working group:** {wgs} · **Pillar:** {', '.join(n['pillar']) or 'none'}"
             f" · **Value:** {', '.join(n['value']) or 'none'}", ""]
        if n["sources"]:
            L += ["## Discussions behind this", ""]
            for s in n["sources"]:
                d = node_by[s]
                ses = ", ".join(meta["sessions"][x]["label"] for x in d["sessions"])
                L.append(f"- {wl(s)} ({ses})")
            L.append("")
        rels = [(l, l["t"] if l["s"] == n["id"] else l["s"]) for l in links if l["s"] == n["id"] or l["t"] == n["id"]]
        rels.sort(key=lambda x: (not x[0]["curated"], -x[0]["score"]))
        if rels:
            L += ["## Linked ideas", ""]
            for l, other in rels[:14]:
                if l["curated"]:
                    L.append(f"- *{l['type']}* → {wl(other)}: {l['why']}")
                else:
                    via = ", ".join("#" + x[2:] for x in l["tags"]) or "shared discussion"
                    L.append(f"- via {via} → {wl(other)}")
            L.append("")
        if n["reading"]:
            L += ["## On the Bookshelf", ""] + [f"- *{node_by[b]['label']}*, {node_by[b]['author']}" for b in n["reading"]] + [""]
        k = examples_by_topic.get(n["id"], 0)
        if k:
            L += ["## Niche examples", "", f"{k} example{'s' if k != 1 else ''}: see the backlinks, or [[{ex_index}]].", ""]
        L += ["## Tags", ""] + [f"- {wl(t)}" for t in n["tags"]]
        write(os.path.join("Topics", names[n["id"]] + ".md"), "\n".join(L) + "\n")

    # discussions
    for n in nodes:
        if n["kind"] != "discussion":
            continue
        ses = ", ".join(meta["sessions"][x]["label"] + (f" ({meta['sessions'][x]['date']})" if meta["sessions"][x]["date"] else "") for x in n["sessions"])
        L = ["---", f"tags: [discussion, {'proposed' if n['proposed'] else 'aired'}" + "".join(f", scale/{s}" for s in n["scale"]) + "".join(f", wg/{w}" for w in n["wg"]) + "]", "---",
             f"# {n['label']}", "", f"*{ses}*" + (f" · notes {', '.join(n['noteIds'])}" if n["noteIds"] else ""), "", "## Provocation", ""]
        for tx in n["texts"]:
            if tx["session"]:
                L.append(f"**{meta['sessions'][tx['session']]['label']}**")
            L += ["> " + "\n> \n> ".join(tx["paras"]), ""]
        if n["questions"]:
            L += ["## Discussion points", ""] + [f"- {q}" for q in n["questions"]] + [""]
        if n["notes"]:
            L += ["## Post-meeting synthesis (anonymised digest)", "", md_notes(n["notes"]), ""]
        if n["refs"]:
            L += ["## References", ""] + [f"- [{r['label']}]({r['url']})" for r in n["refs"]] + [""]
        L += ["## Feeds topics", ""] + [f"- {wl(t)}" for t in n["topics"]]
        write(os.path.join("Discussions", names[n["id"]] + ".md"), "\n".join(L) + "\n")

    # tag hubs
    for n in nodes:
        if n["kind"] != "tag":
            continue
        L = ["---", f"tags: [tag-hub, {n['facet']}/{n['key']}]", "---", f"# {meta['facets'][n['facet']]['label'].rstrip('s')} · {n['label']}", "", n["def"], ""]
        if n.get("poles"):
            L += [f"Poles: **{n['poles'][0]}** ↔ **{n['poles'][1]}**", ""]
        L += [f"Used by {len(n['topics'])} topics across {len(n['themes'])} themes:", ""] + [f"- {wl(t)}" for t in n["topics"]]
        write(os.path.join("Tags", names[n["id"]] + ".md"), "\n".join(L) + "\n")

    # guided walks
    for th in threads:
        L = ["---", "tags: [guided-walk]", "---", f"# {th['title']}", "", th["intro"], ""]
        for i, st in enumerate(th["steps"], 1):
            L.append(f"{i}. {wl(st['topic'])}: {st['text']}")
        L += ["", f"**So what for the central question:** {th['soWhat']}", "", f"Back to {wl('c', 'A world we want to live in')}"]
        write(os.path.join("Threads", names["th-" + th["id"]] + ".md"), "\n".join(L) + "\n")

    # Niche examples (public, checked rows of curation/niche_examples.csv)
    for e in example_nodes:
        meta_line = " · ".join(x for x in (ex_types.get(e["type"], e["type"]), e.get("org"), str(e["year"]) if e.get("year") else "", e.get("stage")) if x)
        L = ["---", f"tags: [example, example/{e['type']}]", f"type: {e['type']}", f"url: {e['url']}"] + \
            ([f"year: {e['year']}"] if e.get("year") else []) + ["---", f"# {e['label']}", "", f"*{meta_line}*", ""]
        if e.get("summary"):
            L += [e["summary"], ""]
        L += [f"Source: [{e['url']}]({e['url']})", "", "## Speaks to", ""] + [f"- {wl(t)}" for t in e["topics"]]
        write(os.path.join("Examples", names[e["id"]] + ".md"), "\n".join(L) + "\n")
    L = ["---", "tags: [example-index]", "---", "# Niche examples", "",
         "Real, public examples (papers, companies, products, pre-clinical and clinical work) linked to the prompts they speak to. "
         "They come from `curation/niche_examples.csv`; only rows a second person has marked `checked` appear.", ""]
    if not example_nodes:
        L += ["*None yet: the spreadsheet is being filled in.*"]
    for th_n in meta["theme_order"]:
        rows = [e for e in example_nodes if th_n in e["themes"]]
        if rows:
            L += ["", f"## {wl(f'th:{th_n}')}", ""] + [f"- {wl(e['id'])} ({ex_types.get(e['type'], e['type'])})" for e in rows]
    write(os.path.join("Examples", ex_index + ".md"), "\n".join(L) + "\n")

    # tag guide (short version for the vault)
    L = ["# Tag guide", "", "Two layers: **lenses** (every topic carries them) and **semantic tags** (the reasons two notes belong together).", "", "## Lenses", ""]
    for lk, lv in meta["lenses"].items():
        L += [f"### {lv['label']} (`{lk}/…`): {lv['question']}", "", lv["source"], ""]
        for vk, vv in lv["values"].items():
            L.append(f"- `{lk}/{vk}` **{vv['label']}**: {vv.get('def') or vv.get('q')}")
        L.append("")
    L += ["## Semantic tags", ""]
    for fk, fv in meta["facets"].items():
        L += [f"### {fv['label']}: {fv['question']}", "", fv["blurb"], ""]
        for n in tag_nodes:
            if n["facet"] == fk:
                L.append(f"- {wl(n['id'], n['label'])}: {len(n['topics'])} topics · {len(n['themes'])} themes")
        L.append("")
    write("Tag guide.md", "\n".join(L) + "\n")

    # graph colour groups (pillar colours) so Obsidian's own graph mirrors the website
    def rgb(h):
        return int(h.lstrip("#"), 16)
    groups = [{"query": f"tag:#pillar/{k}", "color": {"a": 1, "rgb": rgb(v["color"])}} for k, v in meta["lenses"]["pillar"]["values"].items()]
    write(os.path.join(".obsidian", "graph.json"), json.dumps({"colorGroups": groups, "showTags": False, "showOrphans": False}, indent=2))
    write("README.md", "# Rethink Matters provocation map: vault\n\nGenerated by `build/build.py`. Open this folder as a vault in Obsidian; start at [[" + center_name + "]].\n"
          "The Obsidian graph is coloured by pillar (teal design · terracotta climate · olive governance · gold translation).\n"
          "Content is anonymised under the Chatham House Rule.\n")


# ----------------------------------------------------------------------------------------------------------
# 8b. Tag guide (generated, so counts never drift from the data) + asset cache-busting
# ----------------------------------------------------------------------------------------------------------
def write_tag_guide():
    import statistics as st
    ks = [len(n["topics"]) for n in tag_nodes]
    ths = [len(n["themes"]) for n in tag_nodes]
    avg_sem = sum(len(n["tags"]) for n in nodes if n["kind"] == "topic") / max(1, len(topic_nodes))
    span2 = sum(1 for x in ths if x >= 2)
    bridges = sorted(tag_nodes, key=lambda n: (-len(n["themes"]), -len(n["topics"])))[:8]
    L = []
    A = L.append
    A("# The Rethink Matters tag system (draft v1)")
    A("")
    A(f"*Generated by `build/build.py` from `curation/meta.yaml` and `curation/tags.yaml`; the counts are live ({_dt.date.today().isoformat()}).*")
    A("")
    A("## The idea in one paragraph")
    A("")
    A("Every discussion prompt on the map carries two kinds of tag. **Lenses** say *where a prompt sits*: its length scale, the working group that would carry it, which pillar of the mission it advances, which of the World Economic Forum's four values it speaks to. **Semantic tags** say *what it is about* and, more importantly, *why it belongs with other prompts*: the tension it sits on, the concept at work, the barrier in the way, the material or setting, the method. Two prompts that share a semantic tag are linked however far apart their themes are. That is the network effect: a connection between ‘Chronic bioelectrodes’ (medicine) and ‘Hype vs evidence’ (commercial value) comes from a shared tag, rather than from someone having to spot it.")
    A("")
    A("## Five design rules, and how the vocabulary scores")
    A("")
    A(f"1. **Cross-cutting, not a re-labelled theme.** A tag must be able to connect at least two themes. *Result:* {span2} of {len(tag_nodes)} tags span two or more themes (median {st.median(ths):g}, maximum {max(ths)}).")
    A(f"2. **Reusable, but not ubiquitous.** Aim for roughly 3–14 prompts per tag: rarer tags create no network, commoner ones create a hairball. *Result:* min {min(ks)}, median {st.median(ks):g}, max {max(ks)} prompts per tag; {avg_sem:.1f} semantic tags per prompt.")
    A("3. **Faceted.** Five orthogonal families of tag, so two prompts can be linked for different reasons. Open a tag on the map to see everything it ties together.")
    A("4. **A tag is a reason.** Each tag has a one-line definition of what linking two notes by it *means*; tensions have two named poles.")
    A("5. **Your own language first.** Scale (micro/meso/macro), working groups (WG1–3), the mission pillars (the site tagline) and the WEF values come from your sheets, your site and the central report. Only the semantic tags are new, and they were derived by reading every provocation and note.")
    A("")
    A("## What the resulting network looks like")
    A("")
    A("| measure | value |")
    A("|---|---|")
    A(f"| prompts / themes / discussions | {stats['topics']} / {stats['themes']} / {stats['discussions']} ({sum(1 for d in disc_nodes if d['notes'])} with notes) |")
    A(f"| semantic tags in use | {stats['tags']} |")
    A(f"| hand-written bridges (with a one-line reason) | {stats['curated']} |")
    A(f"| links shown by default (bridges + strong shared-tag links) | {stats['relDefault']} |")
    A(f"| share of default links that cross a theme boundary | {100 * cross / max(1, len(rel_default)):.0f}% |")
    A(f"| connected components among prompts (default links) | {len(comps)} (the largest covers {len(giant)} of {len(topic_nodes)}) |")
    A(f"| average hops between two prompts | {avg_path(list(giant), adj):.1f} |")
    A("")
    A("**Tags that bridge the most themes** (the best ‘connectors’): " + "; ".join(f"{n['label']} ({len(n['themes'])} themes, {len(n['topics'])} prompts)" for n in bridges) + ".")
    A("")
    A("## Layer 1: lenses (every prompt carries them)")
    A("")
    for lk, lv in meta["lenses"].items():
        A(f"### {lv['label']}: *{lv['question']}*")
        A("")
        A(lv["source"])
        A("")
        A("| value | meaning | prompts |")
        A("|---|---|---:|")
        for vk, vv in lv["values"].items():
            c = sum(1 for n in nodes if n["kind"] == "topic" and vk in n[lk])
            A(f"| `{lk}/{vk}` **{vv['label']}** | {vv.get('def') or vv.get('q', '')} | {c} |")
        if lk == "wg":
            prop = sum(len(n["wgProposed"]) for n in nodes if n["kind"] == "topic")
            A("")
            A(f"*{prop} of the working-group assignments are proposals by the map (the sheets recorded none for that discussion); they appear dashed on the site. Please confirm or change them.*")
        A("")
    A("## Layer 2: semantic tags")
    A("")
    for fk, fv in meta["facets"].items():
        A(f"### {fv['label']}: *{fv['question']}*")
        A("")
        A(fv["blurb"])
        A("")
        A("| tag | meaning | prompts | themes | for example |")
        A("|---|---|---:|---:|---|")
        for n in sorted([t for t in tag_nodes if t["facet"] == fk], key=lambda t: -len(t["topics"])):
            ex = "; ".join(node_by[t]["label"] for t in n["topics"][:3])
            A(f"| `{fk}/{n['key']}` **{n['label']}** | {n['def']} | {len(n['topics'])} | {len(n['themes'])} | {ex} |")
        A("")
    A("## How to tag a new provocation (five questions)")
    A("")
    A("1. **Scale:** at what length scale does the problem become visible: micro, meso or macro (pick the one where it is most visible; add a second only if it is truly both)?")
    A("2. **Pillar and value:** which pillar of the mission does it advance (design, climate, governance, translation), and does it speak to equity, humility, sustainability or solidarity? Leave *value* empty if none fits.")
    A("3. **Tension:** what is being pulled in two directions? If you can name both poles, use or add a `tension/…` tag.")
    A("4. **Barrier and concept:** what stands in the way, and which phenomenon or principle is at work?")
    A("5. **Domain and method:** which material system or setting, and which tool? Then add one or two hand-written bridges to prompts it echoes, opposes, enables or builds on, each with a one-line reason.")
    A("")
    A("Aim for **4–8 semantic tags** per prompt. Before inventing a tag, check whether an existing one fits; a new tag earns its place only if it would sit on at least three prompts across at least two themes.")
    A("")
    A("## How tags turn into links")
    A("")
    A("For every pair of prompts the build adds up the weight of the semantic tags they share (rarer tags weigh more, `ln((N+1)/(n+1))`; tensions count 1.5×, domains 0.7×, methods 0.8×) and adds 2.5 for each discussion they both grew from. Pairs above a threshold become a link; the link-strength slider under More options on the Regime level moves that threshold. Hand-written bridges are always shown. Lenses are *not* used for linking (every prompt has a scale, so sharing one means little).")
    A("")
    A("## Things to decide")
    A("")
    A("* **Pillar, value and every semantic tag are the map author's first draft.** Scale and working group come from your sheets where recorded.")
    A("* The nine themes in the sheet include **Theme 9 (ocean & extreme environments)**; the brief mentioned eight. All nine are on the map.")
    A("* The *value* lens uses the four values from the WEF report behind the central question. If you would rather use the ten shared aims on your About page, the facet can be swapped without touching anything else.")
    A("")
    OUT.append((P("docs", "TAG-GUIDE.md"), "\n".join(L) + "\n"))


def stamp_assets():
    """Cache-bust: set ?v=<content hash of every stamped asset> on each asset reference in site/index.html."""
    import hashlib
    path = P("site", "index.html")
    with open(path, encoding="utf-8") as f:
        html = f.read()
    h = hashlib.sha1()
    for rel in re.findall(r'(?:src|href)="([^"?#]+)\?v=', html):   # whatever index.html loads with a ?v= stamp
        with open(P("site", rel), "rb") as f:
            h.update(f.read())
    v = h.hexdigest()[:8]
    html2 = re.sub(r"\?v=[A-Za-z0-9]+", "?v=" + v, html)
    if html2 != html:
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            f.write(html2)
    return v


# ----------------------------------------------------------------------------------------------------------
# 9. Report
# ----------------------------------------------------------------------------------------------------------
def report():
    L = ["# Build report", "", f"Generated {_dt.datetime.now().strftime('%Y-%m-%d %H:%M')}", "",
         f"- Themes {stats['themes']} · topics {stats['topics']} · discussions {stats['discussions']} ({sum(1 for d in disc_nodes if d['notes'])} with notes) · semantic tags used {stats['tags']} · books {stats['books']}",
         f"- Topic↔topic links stored: {stats['relLinks']} ({stats['curated']} curated); shown at default threshold ({DEFAULT_MIN}): {stats['relDefault']}",
         f"- Components at default threshold: {len(comps)} (giant component covers {len(giant)}/{len(topic_nodes)} topics)",
         f"- Average shortest path inside giant component: {avg_path(list(giant), adj):.2f} hops",
         f"- Cross-theme share of shown links: {cross}/{len(rel_default)} = {100*cross/max(1,len(rel_default)):.0f}%",
         f"- Isolated topics (no link at default threshold): {[node_by[t]['label'] for t in topic_nodes if not adj[t]]}", "",
         "## Tag usage (topics · themes)", "", "| tag | topics | themes | note |", "|---|---:|---:|---|"]
    for n in sorted(tag_nodes, key=lambda x: (x["facet"], -len(x["topics"]))):
        k = len(n["topics"])
        note = "RARE (<3)" if k < 3 else ("COMMON (>13)" if k > 13 else "")
        if len(n["themes"]) < 2:
            note += " single-theme"
        L.append(f"| {n['facet']}/{n['key']} | {k} | {len(n['themes'])} | {note.strip()} |")
    L += ["", "## Cross-theme links at default threshold (theme pair → count)", ""]
    for (a, b), k in sorted(theme_x.items(), key=lambda x: -x[1]):
        L.append(f"- T{a} ↔ T{b}: {k}")
    L += ["", "## Degree (links shown) per topic: top and bottom", ""]
    ranked = sorted(topic_nodes, key=lambda t: -deg[t])
    L.append("Top: " + ", ".join(f"{node_by[t]['label']} ({deg[t]})" for t in ranked[:8]))
    L.append("Bottom: " + ", ".join(f"{node_by[t]['label']} ({deg[t]})" for t in ranked[-8:]))
    L += ["", "## Links shown at each threshold (curated links always shown)", "", "| min score | links | cross-theme % | topics with no link |", "|---:|---:|---:|---:|"]
    for thr in (2.6, 3.0, 3.4, 3.8, 4.2, 4.6, 5.0, 5.5, 6.0, 7.0):
        sel = [l for l in links if l["curated"] or l["score"] >= thr]
        a2 = defaultdict(set)
        for l in sel:
            a2[l["s"]].add(l["t"])
            a2[l["t"]].add(l["s"])
        cx = sum(1 for l in sel if node_by[l["s"]]["theme"] != node_by[l["t"]]["theme"])
        iso = sum(1 for t in topic_nodes if not a2[t])
        L.append(f"| {thr} | {len(sel)} | {100*cx/max(1,len(sel)):.0f}% | {iso} |")
    L += ["", "## Lens distribution", ""]
    for lens in ("scale", "wg", "pillar", "value"):
        c = Counter(v for n in nodes if n["kind"] == "topic" for v in n[lens])
        L.append(f"- {lens}: " + ", ".join(f"{k} {v}" for k, v in c.most_common()))
    prop = sum(len(n["wgProposed"]) for n in nodes if n["kind"] == "topic")
    L.append(f"- working-group assignments proposed by the map (not recorded in the sheets): {prop}")
    c = EXR["counts"]
    by_type = Counter(e["type"] for e in example_nodes)
    L += ["", "## Niche examples", "",
          f"- spreadsheet rows: {EXR['rows']} ({c['checked']} checked and published, {c['draft']} draft, {c['hidden']} hidden)",
          f"- published by type: " + (", ".join(f"{EXAMPLE_TYPES[k]['label']} {v}" for k, v in by_type.most_common()) or "none yet"),
          f"- prompts with at least one example: {len(examples_by_topic)} of {len(topic_nodes)}",
          f"- read as {EXR['encoding']} with {EXR['delimiter']!r} between columns; ids made from the name: {EXR['derived_ids']} (fill in the id column to keep share links stable)"]
    L += ["", "## Futures", ""]
    for th_n in meta["theme_order"]:
        f = node_by[f"th:{th_n}"].get("future")
        L.append(f"- Theme {th_n}: " + (f"{f['status']}, evidence {f['evidence']}, {len(f['text'].split())} words" if f else "none yet"))
    L.append("- Overall answer: " + (f"{FUT_CENTER['status']}, {len(FUT_CENTER['text'].split())} words" if FUT_CENTER else "none yet"))
    if REDACTIONS:
        L += ["", "## Deliberate redactions in verbatim provocation text", ""] + [f"- {r}" for r in REDACTIONS]
    if WARNINGS:
        L += ["", "## Warnings", ""] + [f"- {w}".replace("—", ",").replace("―", ",") for w in WARNINGS]
    OUT.append((P("docs", "build-report.md"), "\n".join(L) + "\n"))


def write_examples_guide():
    """docs/NICHE-EXAMPLES.md: how Rethink Matters fills in the Niche spreadsheet (generated, so the prompt list never drifts)."""
    types = ", ".join(f"`{k}` ({v['label']})" for k, v in EXAMPLE_TYPES.items())
    L = ["# Niche examples: how to add them", "",
         f"*Generated by `build/build.py` ({_dt.date.today().isoformat()}). The prompt list at the end is always current.*", "",
         "The Niche level of the map shows real, public examples (papers, companies, products, pre-clinical and clinical work), each "
         "linked to the prompts it speaks to. They live in one spreadsheet, `curation/niche_examples.csv`, which Rethink Matters keeps.", "",
         "## What counts", "",
         "- A paper, preprint, company, product, or pre-clinical or clinical candidate that is **publicly documented**, with a public link.",
         "- Not: anything known only from a session, unpublished results, private documents or decks, anything under an NDA, rumours, or personal contacts.", "",
         "## The Chatham House Rule still applies", "",
         "- Public facts only. Never record who suggested a row, and never connect a row to what anyone said in a session.",
         "- No people's names in any column (paper titles are fine; leave out author lists).",
         "- **The whole file is public on GitHub**, including the `notes` column, even though the site does not show notes.", "",
         "## Adding rows in Excel", "",
         "1. Open `curation/niche_examples.csv` in Excel. Add one row per example. Do not change or add column headings.",
         "2. Save with **File, Save As, \"CSV UTF-8 (Comma delimited)\"**, same name, and keep the CSV format when asked. "
         "(Plain \"CSV\" also works; the build converts it.)",
         "3. Never save it as `.xlsx` in the project folder (the safety check refuses Excel files), and close Excel before building.", "",
         "## The columns", "",
         "| column | required | what to write |", "|---|---|---|",
         "| `id` | no | a short name for the example, lower case with hyphens (e.g. `example-paper-2021`). Left blank, it is made from the name; fill it in to keep links stable. |",
         f"| `type` | yes | one of {types} |",
         "| `name` | yes | its public name or the paper's title |",
         "| `organisation` | no | the company, lab or journal |",
         "| `year` | no | year of publication, founding, launch or trial start (four digits) |",
         "| `stage` | no | how far along it is, in its own source's words (e.g. research, prototype, on the market, phase 1) |",
         "| `summary` | no | one plain line: what it is or does, as its public source says. No opinions or 'first/best' claims. |",
         "| `url` | yes | a public link: a DOI for papers, the organisation's own site, or a trial registry. Links into private storage (Google Drive or Docs, SharePoint, Dropbox and the like) are refused. |",
         "| `prompts` | yes | the prompt(s) it speaks to, separated by `;`. Use the prompt id from the table below, the prompt's exact name, or paste a link copied from the map. |",
         "| `status` | yes | `draft` when added; `checked` once a second person has checked it; `hidden` to withdraw it. **Only `checked` rows appear on the map.** |",
         "| `notes` | no | notes for the checker. Public on GitHub, not shown on the map. |", "",
         "## Checking a row (two different people)", "",
         "The person who adds a row sets `draft`. A second person opens the link in a private window and confirms that it is public, that the "
         "summary matches the source, that the stage is stated by the source, that the prompt fits, and that nothing comes from a session; "
         "then they set `checked`.", "",
         "## What the build checks", "",
         "Every row needs a type, name, public link, at least one known prompt and a status. Problems are reported by spreadsheet row "
         "(the header is row 1), with suggestions for misspelled prompts. Rows that start with `#` and empty rows are skipped.", "",
         "## Prompt ids", ""]
    for th_n in meta["theme_order"]:
        th = node_by[f"th:{th_n}"]
        L += [f"### Theme {th_n} · {th['label']}", "", "| prompt | id |", "|---|---|"]
        for tid in sorted(th["topics"], key=lambda x: node_by[x]["order"]):
            L.append(f"| {node_by[tid]['label']} | `{tid[2:]}` |")
        L.append("")
    OUT.append((P("docs", "NICHE-EXAMPLES.md"), "\n".join(L) + "\n"))


def write_futures_review():
    """docs/FUTURES-REVIEW.md: each drafted future with its status and the sources each part of it rests on, for Rethink Matters."""
    L = ["# Futures: drafts for Rethink Matters to review", "",
         f"*Generated by `build/build.py` from `curation/futures.yaml` ({_dt.date.today().isoformat()}).*", "",
         "Each theme has one short future, drafted from the group's own prompts and anonymised notes, plus one overall answer to the "
         "central question. They are drafts: rewrite them in `curation/futures.yaml` and change `status` to `rm-edited` or `rm-approved`.", ""]
    if not futures_cur:
        L += ["*No futures drafted yet.*"]
    label = {t["id"]: t["label"] for t in topics_cur}
    dlabel = {d["id"]: d["title"] for d in disc_cur}

    def src_name(r):
        return label.get(r[2:], r) if r.startswith("n:") else dlabel.get(r[2:], r) if r.startswith("d:") else r

    def block(title, f):
        out = [f"## {title}", "", f"> {norm(f.get('text') or '')}", "",
               f"- status: **{f.get('status', 'draft')}**" + (f", evidence: {f['evidence']}" if f.get("evidence") else "")]
        chk = f.get("check") or {}
        if chk.get("result"):
            out.append(f"- independent check: **{chk['result']}** ({chk.get('date') or 'undated'})" +
                       ("; issues: " + "; ".join(chk.get("issues") or []) if chk.get("issues") else ""))
        sup = f.get("support") or []
        if sup:
            out += ["", "| part of the future | rests on |", "|---|---|"]
            for s in sup:
                out.append(f"| {s.get('clause', '')} | {'; '.join(src_name(r) for r in s.get('from') or [])} |")
        out.append("")
        return out
    if futures_cur.get("overall"):
        L += block("Overall answer", futures_cur["overall"])
    by_sheet = {f.get("theme"): f for f in futures_cur.get("themes") or []}
    for th_n in meta["theme_order"]:
        th = node_by[f"th:{th_n}"]
        f = by_sheet.get(th["sheet"])
        if f:
            L += block(f"Theme {th_n} · {th['label']}", f)
    OUT.append((P("docs", "FUTURES-REVIEW.md"), "\n".join(L) + "\n"))


def write_review_sheets():
    """--review: Excel-friendly sheets (UTF-8 with BOM) for gathering wider Rethink Matters feedback; git-ignored, kept local."""
    out_dir = P("build", "_review")
    os.makedirs(out_dir, exist_ok=True)

    def sheet(name, header, rows):
        with open(os.path.join(out_dir, name), "w", encoding="utf-8-sig", newline="") as f:
            w = csv.writer(f)
            w.writerow(header)
            w.writerows(rows)

    def walk_copy(o, pre=""):
        if isinstance(o, dict):
            for k, v in o.items():
                yield from walk_copy(v, f"{pre}.{k}" if pre else k)
        elif isinstance(o, list):
            for i, v in enumerate(o):
                yield from walk_copy(v, f"{pre}[{i}]")
        elif isinstance(o, str):
            yield pre, o
    sheet("copy_review.csv", ["key", "current wording", "words", "suggestion", "comment"],
          [[k, v, len(v.split()), "", ""] for k, v in walk_copy(copy_text)])
    rows = []
    if FUT_CENTER:
        rows.append(["overall", "", FUT_CENTER["status"], "", FUT_CENTER["text"], "", "", "", ""])
    for th_n in meta["theme_order"]:
        th = node_by[f"th:{th_n}"]
        f = th.get("future")
        if f:
            rows.append([f"Theme {th_n}", th["label"], f["status"], f.get("evidence", ""), f["text"],
                         "; ".join(node_by[p]["label"] for p in f.get("drawsOn") or []), "", "", ""])
    sheet("futures_review.csv", ["which", "theme", "status", "evidence", "draft", "drawn from", "agree / edit / reject", "suggestion", "comment"], rows)
    arcs = {a["id"]: a["label"] for a in meta["arcs"]}
    rows = [[n["id"][2:], n["label"], f"Theme {n['theme']}", node_by[f"th:{n['theme']}"]["label"], arcs[n["arc"]], ", ".join(n["pillar"]), "", "", ""]
            for n in sorted((n for n in nodes if n["kind"] == "topic"), key=lambda n: (meta["theme_order"].index(n["theme"]), n["order"]))]
    sheet("categories_review.csv", ["prompt id", "prompt", "theme", "theme name", "chapter", "pillar(s)", "suggested chapter", "suggested pillar", "comment"], rows)
    return out_dir


def examples_js():
    lines = [json.dumps(e, ensure_ascii=False, separators=(",", ":")) for e in examples_published["examples"]]
    head = {k: v for k, v in examples_published.items() if k != "examples"}
    return ("/* Generated by build/build.py from curation/niche_examples.csv: do not edit by hand. */\n"
            f"window.RM_EXAMPLES = {json.dumps(head, ensure_ascii=False, separators=(',', ':'))[:-1]},\"examples\":[\n"
            + ",\n".join(lines) + ("\n" if lines else "") + "]};\n")


def fail():
    print("BUILD FAILED\n" + "\n".join(" - " + e for e in ERRORS))
    for w in WARNINGS:
        print(" ~ " + w)
    sys.exit(1)


if __name__ == "__main__":
    if ERRORS:
        fail()
    if FIXTURE:   # test data only: write the one requested file outside the repository and stop
        with open(os.path.abspath(ARGS.examples_out), "w", encoding="utf-8", newline="\n") as f:
            f.write(examples_js())
        print(f"fixture: {len(example_nodes)} examples written to {ARGS.examples_out} (nothing in the repository was touched)")
        sys.exit(0)
    write_vault()
    write_tag_guide()
    write_examples_guide()
    write_futures_review()
    report()
    for path, text in OUT:   # house style, checked before anything is written
        for name in leakcheck.banned_chars(text):
            ERRORS.append(f"{os.path.relpath(path, ROOT)}: {name} in generated text")
    if ERRORS:
        fail()
    with open(P("site", "graph-data.js"), "w", encoding="utf-8") as f:
        f.write("/* Generated by build/build.py: do not edit by hand. */\nwindow.RM_DATA = ")
        json.dump(published, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    with open(P("site", "examples-data.js"), "w", encoding="utf-8", newline="\n") as f:
        f.write(examples_js())
    if EXR["encoding"] == "cp1252":
        try:
            with open(EX_PATH, "rb") as f:
                raw = f.read()
            with open(EX_PATH, "w", encoding="utf-8-sig", newline="") as f:
                f.write(raw.decode("cp1252"))
        except PermissionError:
            print(" ! could not rewrite niche_examples.csv as UTF-8: close it in Excel and build again, or Save As 'CSV UTF-8'")
    # stale vault notes are removed file by file (cloud-synced folders can refuse to delete whole directories); .obsidian settings stay
    for dirpath, dirnames, filenames in os.walk(P("vault")):
        if ".obsidian" in dirpath:
            continue
        for fn in filenames:
            try:
                os.remove(os.path.join(dirpath, fn))
            except OSError:
                print(f" ! could not remove stale vault file {fn}")
    for path, text in OUT:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            f.write(text)
    stamp = stamp_assets()
    print(f"assets stamped ?v={stamp}")
    if ARGS.review:
        print(f"review sheets written to {os.path.relpath(write_review_sheets(), ROOT)} (git-ignored: share them privately)")
    print(f"OK  topics={stats['topics']} discussions={stats['discussions']} tags={stats['tags']} links(rel)={stats['relLinks']} shown={stats['relDefault']} examples={stats['examples']}")
    print(f"    giant component {len(giant)}/{len(topic_nodes)}, avg path {avg_path(list(giant), adj):.2f}, cross-theme {cross}/{len(rel_default)}")
    for w in WARNINGS:
        print(" ~ " + w)
