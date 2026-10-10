"""Shared leak-check logic for build.py and preflight.py.

Why this exists: the map is published under the Chatham House Rule (no statement attributed to a person, no participant
identified) and must not reveal project-confidential material. The SENSITIVE lists — names and nicknames of participants
and of outside people mentioned in the notes, project-confidential terms, and the original text of any redactions — live in
`build/local_checks.json`, which is git-ignored and never published. This file contains only generic patterns, so it is safe
to publish. See `build/local_checks.example.json` for the format.
"""
from __future__ import annotations

import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
LOCAL_PATH = os.path.join(HERE, "local_checks.json")

# Phrases that legitimately contain a flagged word (e.g. the author of a cited 1973 book).
ALLOW_PHRASES = ["Ivan Illich"]

# Always checked, with or without a local file: share-links into private folders/docs, e-mail addresses, local file paths.
GENERIC_PATTERNS = [
    r"docs\.google\.com",
    r"drive\.google\.com",
    r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.(?:com|org|net|ac\.uk|edu)\b",
    r"C:\\Users\\",
    r"OneDrive",
]


def load_local() -> dict:
    d = {"name_tokens": [], "phrases": [], "restricted": [], "redactions": {}, "present": False}
    if os.path.exists(LOCAL_PATH):
        with open(LOCAL_PATH, encoding="utf-8") as f:
            d.update(json.load(f))
        d["present"] = True
    return d


def scan_text(text: str, local: dict, extra_tokens=()) -> list[tuple[str, str]]:
    """Return [(what_matched, context)] for one string. `extra_tokens` = names read live from the source sheets."""
    hits: list[tuple[str, str]] = []
    s2 = text
    for ph in ALLOW_PHRASES:
        s2 = s2.replace(ph, "")
    ctx = text[:100].replace("\n", " ")
    for tok in list(local.get("name_tokens", [])) + list(extra_tokens):
        if re.search(rf"(?<![\w]){re.escape(tok)}(?![\w])", s2):
            hits.append((tok, ctx))
    for ph in local.get("phrases", []):
        if ph in s2:
            hits.append((ph, ctx))
    # 'Will' as a name only (mid-sentence, followed by a capitalised surname); sentence-initial 'Will' is an ordinary word
    if re.search(r"(?<=[a-z,;] )Will [A-Z][a-z]+(?! (?:be|it|we|they|the|this|these))", s2):
        hits.append(("Will <Surname>", ctx))
    if re.search(r"\bIvan\b", s2):
        hits.append(("Ivan", ctx))
    for pat in local.get("restricted", []):
        if re.search(pat, s2):
            hits.append((pat, ctx))
    for pat in GENERIC_PATTERNS:
        if re.search(pat, s2, re.I):
            hits.append((pat, ctx))
    return hits


def dedupe(hits):
    seen, out = set(), []
    for h in hits:
        if h not in seen:
            seen.add(h)
            out.append(h)
    return out
