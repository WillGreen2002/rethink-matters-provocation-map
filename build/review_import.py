#!/usr/bin/env python
"""Publish the committee's edits: bring them from the edit Sheet into the map's curation files.

    python -I build/review_import.py --csv  responses.csv        # the Sheet, downloaded (File > Download > CSV)
    python -I build/review_import.py --sheet "<the Sheet's link>" # or read it straight from the Sheet (shared: anyone with the link)

Writes
  * curation/review_edits.yaml: the latest text of every block the committee edited (build.py applies it to the published map);
  * new rows in curation/niche_examples.csv for what the committee added to prompts: status "checked" where a second person
    ticked "I have checked this", otherwise "draft" (only checked rows are published, after the usual link and leak checks).
Initials stay in the Sheet: nothing here records who wrote what. Then run build.py and preflight.py as usual.
The review should be frozen first (the script says so if it is not, and stops unless --anyway is given).
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import os
import re
import sys
import urllib.parse
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
EDIT = re.compile(r"^(theme:th:\d+:(title|lead|future)|centre:answer|prompt:n:[a-z0-9-]+:(label|text)|disc:d:[a-z0-9-]+:(label|notes)|copy:(levels\.(landscape|regime|niche)\.explain|hero\.lede))$")
EX_TYPES = {"paper": "paper", "company": "company", "product": "product", "preclinical": "preclinical", "clinical": "clinical",
            "note": "other", "book": "other", "link": "other", "other": "other"}
EX_COLS = ["id", "type", "name", "organisation", "year", "stage", "summary", "url", "prompts", "status", "notes"]

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass


def read_rows(args):
    if args.csv:
        with open(args.csv, encoding="utf-8-sig", newline="") as f:
            text = f.read()
    else:
        u = urllib.parse.urlsplit(args.sheet.strip())
        m = re.search(r"/spreadsheets/d/([A-Za-z0-9_-]+)", u.path)
        if not m or not u.netloc.endswith("google.com"):
            sys.exit("--sheet: that is not a Google Sheets link")
        gid = (re.search(r"gid=(\d+)", args.sheet) or [None, "0"])[1]
        url = f"{u.scheme}://{u.netloc}/spreadsheets/d/{m.group(1)}/export?format=csv&gid={gid}"
        with urllib.request.urlopen(url, timeout=30) as r:
            text = r.read().decode("utf-8-sig")
    rows = list(csv.reader(io.StringIO(text)))
    if not rows:
        sys.exit("the Sheet is empty")
    head = [h.strip().lower() for h in rows[0]]
    col = {name: (head.index(name) if name in head else i) for i, name in enumerate(["timestamp", "key", "text", "action", "who", "extra"])}
    out = []
    for r in rows[1:]:
        get = lambda k: r[col[k]].strip() if col[k] < len(r) else ""   # noqa: E731
        if get("action"):
            out.append({k: get(k) for k in col})
    return out


def derive(rows):
    edits, adds, frozen = {}, {}, False
    for r in rows:
        a, key = r["action"].lower(), r["key"]
        if a == "edit" and EDIT.match(key):
            edits[key] = r["text"]
        elif a == "add":
            try:
                x = json.loads(r["extra"] or "{}")
            except ValueError:
                continue
            if re.fullmatch(r"[a-z0-9-]{4,40}", str(x.get("id", ""))) and re.fullmatch(r"n:[a-z0-9-]+", key):
                adds[x["id"]] = {"id": x["id"], "prompt": key, "type": EX_TYPES.get(x.get("type"), "other"), "title": str(x.get("title", "")).strip(),
                                 "url": str(x.get("url", "")).strip(), "text": r["text"], "checked": False}
        elif a == "check" and key in adds:
            adds[key]["checked"] = True
        elif a == "remove":
            adds.pop(key, None)
        elif a == "freeze":
            frozen = True
        elif a == "unfreeze":
            frozen = False
    return edits, adds, frozen


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:48] or "item"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--csv", help="the Sheet downloaded as CSV")
    src.add_argument("--sheet", help="the Sheet's share link")
    ap.add_argument("--anyway", action="store_true", help="publish even though the edits are not frozen")
    args = ap.parse_args()
    edits, adds, frozen = derive(read_rows(args))
    if not frozen and not args.anyway:
        sys.exit("The edits are not frozen: press Freeze in edit mode first (or pass --anyway to publish them as they stand).")
    # the edits: one file, applied by build.py on top of everything else
    # (JSON-quoted strings are valid YAML: no YAML library needed here)
    path = os.path.join(ROOT, "curation", "review_edits.yaml")
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write("# Written by build/review_import.py from the committee's frozen review: the latest text of each block it edited.\n"
                "# build.py applies these to the published map, then checks them like everything else. Edit here only to correct an import.\n"
                "edits:\n")
        for k, v in sorted(edits.items()):
            f.write(f"  {json.dumps(k)}: {json.dumps(v, ensure_ascii=False)}\n")
    # the additions: rows for the Niche spreadsheet (only checked ones will be published)
    ex_path = os.path.join(ROOT, "curation", "niche_examples.csv")
    with open(ex_path, encoding="utf-8-sig", newline="") as f:
        existing = list(csv.DictReader(f))
    have = {r.get("id", "") for r in existing}
    new, notes = [], []
    for a in adds.values():
        if not a["title"] or not a["text"]:
            continue
        if not a["url"]:   # a note with no public source is not an example: it waits to be folded into the prompt's discussion notes
            notes.append(a)
            continue
        rid = "rv-" + slug(a["title"]) + "-" + a["id"][-4:]   # (the spreadsheet's ids carry no "ex:"; the build adds it)
        if rid in have or "ex:" + rid in have:
            continue
        new.append({"id": rid, "type": a["type"], "name": a["title"], "organisation": "", "year": "", "stage": "", "summary": a["text"],
                    "url": a["url"], "prompts": a["prompt"], "status": "checked" if a["checked"] else "draft", "notes": "added in the committee's review"})
    if new:
        with open(ex_path, "a", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=EX_COLS, extrasaction="ignore")
            for r in new:
                w.writerow(r)
    # notes from discussions: kept for whoever looks after the map to fold into the anonymised discussion digests by hand
    notes_path = os.path.join(ROOT, "curation", "review_notes.yaml")
    with open(notes_path, "w", encoding="utf-8", newline="\n") as f:
        f.write("# Written by build/review_import.py: notes the committee added in review that have no public source. They are not\n"
                "# published as they stand: fold each into its prompt's discussion notes (curation/discussions_*.yaml), anonymised.\n"
                "notes:\n")
        for a in notes:
            f.write(f"  - prompt: {json.dumps(a['prompt'])}\n    title: {json.dumps(a['title'], ensure_ascii=False)}\n"
                    f"    checked: {'true' if a['checked'] else 'false'}\n    text: {json.dumps(a['text'], ensure_ascii=False)}\n")
    print(f"review import: {len(edits)} edited blocks written to curation/review_edits.yaml; "
          f"{len(new)} additions with a source appended to curation/niche_examples.csv ({sum(r['status'] == 'checked' for r in new)} checked); "
          f"{len(notes)} notes without a source written to curation/review_notes.yaml.")
    print("Next: python -I build/build.py, then python -I build/preflight.py, then commit and push.")


if __name__ == "__main__":
    main()
