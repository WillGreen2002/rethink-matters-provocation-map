#!/usr/bin/env python
"""Pre-publication safety scan — run before every commit / push:

    python -I build/preflight.py

Looks at exactly the files git would publish (tracked + untracked-but-not-ignored) and fails (exit code 1) if it finds
  * a forbidden path: the raw sources (source_data/, source_notes/ — participant names, contact e-mails, budgets),
    spreadsheets / Word files / zips / PDFs, the local check lists, local tooling folders;
  * participant names or confidential terms (build/local_checks.json, never published), Drive/Docs share-links,
    e-mail addresses, or local machine paths (generic patterns in leakcheck.py).
The Chatham House Rule applies to everything on the public map: ideas may be used, but nothing is attributed to a person.
"""
from __future__ import annotations

import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import leakcheck  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
FORBIDDEN_PATHS = [r"^source_data/", r"^source_notes/", r"^build/local_checks\.json$", r"^\.claude/", r"^\.obsidian/workspace",
                   r"\.(xlsx|xlsm|xls|docx|doc|zip|pdf|pptx)$"]
TEXT_EXT = {".js", ".html", ".css", ".md", ".yaml", ".yml", ".json", ".py", ".svg", ".txt", ".gitignore", ".gitattributes", ""}
# files that necessarily contain the *patterns* themselves
SKIP_CONTENT = {"build/leakcheck.py", "build/preflight.py", "build/local_checks.example.json"}

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass


def git(*args):
    r = subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, encoding="utf-8")
    if r.returncode != 0:
        raise SystemExit(f"git {' '.join(args)} failed: {r.stderr.strip()}")
    return r.stdout


def main():
    local = leakcheck.load_local()
    problems = []
    if not local["present"]:
        problems.append("build/local_checks.json is missing — cannot check for participant names / confidential terms. Refusing to continue.")
    files = [f for f in git("ls-files", "--cached", "--others", "--exclude-standard").splitlines() if f]
    for f in files:
        for pat in FORBIDDEN_PATHS:
            if re.search(pat, f):
                problems.append(f"FORBIDDEN PATH would be published: {f}")
    scanned = 0
    for f in files:
        if f in SKIP_CONTENT or os.path.splitext(f)[1].lower() not in TEXT_EXT or any(re.search(p, f) for p in FORBIDDEN_PATHS):
            continue
        full = os.path.join(ROOT, f)
        try:
            with open(full, encoding="utf-8") as fh:
                text = fh.read()
        except (UnicodeDecodeError, OSError) as e:
            problems.append(f"cannot read {f}: {e}")
            continue
        scanned += 1
        for n, line in enumerate(text.split("\n"), 1):
            for what, ctx in leakcheck.dedupe(leakcheck.scan_text(line, local)):
                problems.append(f"{f}:{n}: {what!r} in {ctx[:70]!r}")
    # sensitive paths must be ignored by git, not merely absent today
    for probe in ("source_data/x.xlsx", "source_notes/x.docx", "build/local_checks.json"):
        r = subprocess.run(["git", "check-ignore", "-q", probe], cwd=ROOT)
        if r.returncode != 0:
            problems.append(f".gitignore does not cover {probe}")
    print(f"preflight: {len(files)} publishable files, {scanned} text files scanned")
    if problems:
        print("PREFLIGHT FAILED — do not publish:")
        for p in problems[:60]:
            print("  - " + p)
        if len(problems) > 60:
            print(f"  … and {len(problems) - 60} more")
        sys.exit(1)
    print("preflight OK — nothing sensitive found")


if __name__ == "__main__":
    main()
