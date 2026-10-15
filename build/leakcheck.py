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

# Links into private storage (share links, direct downloads), link shorteners that can hide one, and signed links that carry a
# private access key. Used on every published file (preflight), in the build's leak check, and on every cell of the Niche sheet.
PRIVATE_LINKS = [
    r"\bdocs\.google\.com", r"\bdrive\.google\.com", r"googleusercontent\.com", r"usercontent\.google\.com",
    r"sharepoint\.com", r"\b1drv\.ms\b", r"onedrive\.live\.com", r"dropbox(?:usercontent)?\.com", r"\bdb\.tt/",
    r"\bbox\.com/s/", r"\bnotion\.(?:so|site)\b", r"wetransfer\.com", r"\bwe\.tl/", r"\bmega\.nz\b", r"\bicloud\.com/",
    r"teams\.microsoft\.com", r"teams\.live\.com", r"\bbit\.ly/", r"\btinyurl\.com/", r"\bforms\.gle/", r"\bgoo\.gl/",
    r"(?<![\w.])t\.co/", r"\bow\.ly/", r"\bcutt\.ly/", r"\bshorturl\.at/", r"\brebrand\.ly/", r"\blnkd\.in/",
    r"[?&](?:X-Amz-Signature|X-Goog-Signature|X-Ms-Signature|sig|signature)=",
]
EMAIL = r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b"   # any domain, not only .com/.org/...

# Always checked, with or without a local file: private links, e-mail addresses, local file paths.
GENERIC_PATTERNS = PRIVATE_LINKS + [
    EMAIL,
    r"C:\\Users\\",
    r"OneDrive",
]


def load_local() -> dict:
    d = {"name_tokens": [], "phrases": [], "restricted": [], "redactions": {}, "example_ok": [], "present": False}
    if os.path.exists(LOCAL_PATH):
        with open(LOCAL_PATH, encoding="utf-8") as f:
            d.update(json.load(f))
        d["present"] = True
    return d


def scan_text(text: str, local: dict, extra_tokens=(), scope: str = "all") -> list[tuple[str, str]]:
    """Return [(what_matched, context)] for one string. `extra_tokens` = names read live from the source sheets.

    scope="example" is for the public Niche examples only: exact phrases listed under `example_ok` in the local file (e.g. a
    company that is fine to list from its own public website) are set aside first. Every other check still applies, so a
    deliberate, per-phrase decision is needed before a restricted name can appear, and only in the examples."""
    hits: list[tuple[str, str]] = []
    s2 = text
    for ph in ALLOW_PHRASES:
        s2 = s2.replace(ph, "")
    if scope == "example":
        for ph in local.get("example_ok", []):
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


# House style for everything the map shows: no em dashes (or the horizontal bar that looks like one).
BANNED_CHARS = {"—": "em dash", "―": "horizontal bar"}


def banned_chars(text: str) -> list[str]:
    """Names of the banned characters found in `text` (empty if none)."""
    return [name for ch, name in BANNED_CHARS.items() if ch in text]


def dedupe(hits):
    seen, out = set(), []
    for h in hits:
        if h not in seen:
            seen.add(h)
            out.append(h)
    return out
