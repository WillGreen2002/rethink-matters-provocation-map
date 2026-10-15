"""Niche examples: turn curation/niche_examples.csv (kept by Rethink Matters in Excel) into checked, public example records.

Pure functions only (no file writes), so build.py and build/test_examples.py share them. Messages name spreadsheet rows
(the header is row 1), never the examples themselves, so build output and reports do not copy example text around.
"""
from __future__ import annotations

import csv
import difflib
import io
import re

COLUMNS = ["id", "type", "name", "organisation", "year", "stage", "summary", "url", "prompts", "status", "notes"]
REQUIRED = ["type", "name", "url", "prompts", "status"]
ALIASES = {"organization": "organisation", "org": "organisation", "company": "organisation", "link": "url", "source": "url",
           "prompt": "prompts", "title": "name"}
STATUSES = ("draft", "checked", "hidden")
PUBLISHED_STATUS = "checked"
# share links into private storage are never accepted as a public source
PRIVATE_HOSTS = [r"docs\.google\.", r"drive\.google\.", r"sharepoint\.com", r"1drv\.ms", r"onedrive\.", r"dropbox\.com",
                 r"(^|\.)box\.com", r"notion\.(so|site)", r"wetransfer\.com", r"linkedin\.com/in/", r"^localhost", r"^127\.",
                 r"^192\.168\.", r"^10\."]
ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,59}$")


def decode(raw: bytes) -> tuple[str, str]:
    """Text and the encoding it was read with. Excel's 'CSV UTF-8' has a BOM; plain 'CSV' on Windows is cp1252."""
    if raw.startswith(b"\xff\xfe") or raw.startswith(b"\xfe\xff"):
        return raw.decode("utf-16"), "utf-16"
    try:
        return raw.decode("utf-8-sig"), "utf-8"
    except UnicodeDecodeError:
        return raw.decode("cp1252", errors="replace"), "cp1252"


def sniff_delimiter(text: str) -> str:
    """Comma, semicolon (Excel in many European locales) or tab, judged from the header line."""
    head = text.split("\n", 1)[0]
    counts = {d: head.count(d) for d in (",", ";", "\t")}
    best = max(counts, key=counts.get)
    return best if counts[best] else ","


def slugify(s: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return s[:60].strip("-") or "example"


def norm_label(s: str) -> str:
    s = s.replace("‘", "'").replace("’", "'").replace("“", '"').replace("”", '"')
    return re.sub(r"\s+", " ", s).strip().lower()


def normalise_header(h: str) -> str:
    k = re.sub(r"[^a-z]", "", (h or "").strip().lower())
    return ALIASES.get(k, k)


def resolve_prompt(ref: str, ids: set[str], by_label: dict[str, str]):
    """A prompt reference may be its id, 'n:<id>', a link copied from the map (anything after '#'), or its exact label.
    Returns (id, suggestions)."""
    r = ref.strip()
    if "#" in r:
        r = r.rsplit("#", 1)[1]
    if r.startswith("n:"):
        r = r[2:]
    if r in ids:
        return r, []
    hit = by_label.get(norm_label(r))
    if hit:
        return hit, []
    pool = sorted(ids) + sorted(by_label)
    sugg = difflib.get_close_matches(r.lower(), pool, n=3, cutoff=0.6)
    return None, [by_label.get(s, s) for s in sugg]


def clean_url(u: str):
    """(url, problem) with DOIs turned into links; problem is an error message or ''."""
    u = u.strip()
    m = re.match(r"^(?:doi:\s*|https?://(?:dx\.)?doi\.org/)?(10\.\d{4,9}/\S+)$", u, re.I)
    if m:
        return "https://doi.org/" + m.group(1), ""
    if not re.match(r"^https?://", u, re.I):
        return u, "the link must start with https:// (or be a DOI)"
    host = re.sub(r"^https?://", "", u, flags=re.I).split("/", 1)[0].lower()
    rest = re.sub(r"^https?://", "", u, flags=re.I).lower()
    for pat in PRIVATE_HOSTS:
        if re.search(pat, host) or (pat.startswith("linkedin") and re.search(pat, rest)):
            return u, "the link points to private or personal storage; use a public page instead"
    return u, ""


def parse(raw: bytes, topics: dict[str, str], types: dict[str, str], this_year: int) -> dict:
    """topics: prompt id (without 'n:') -> label. types: type key -> label.
    Returns {examples (published rows only), rows, errors, warnings, encoding, delimiter, derived_ids, counts}."""
    text, enc = decode(raw)
    delim = sniff_delimiter(text)
    out = {"examples": [], "rows": 0, "errors": [], "warnings": [], "encoding": enc, "delimiter": delim, "derived_ids": 0,
           "counts": {s: 0 for s in STATUSES}}
    err, warn = out["errors"].append, out["warnings"].append
    reader = csv.reader(io.StringIO(text), delimiter=delim)
    rows = list(reader)
    if not rows:
        err("niche_examples.csv is empty: it needs at least the header row")
        return out
    header = [normalise_header(h) for h in rows[0]]
    unknown = [rows[0][i] for i, h in enumerate(header) if h and h not in COLUMNS]
    if unknown:
        err(f"niche_examples.csv: unknown column(s) {unknown}; the columns are {', '.join(COLUMNS)}")
    missing = [c for c in REQUIRED if c not in header]
    if missing:
        err(f"niche_examples.csv: missing column(s) {missing}")
    if unknown or missing:
        return out
    col = {h: i for i, h in enumerate(header) if h}
    by_label = {norm_label(v): k for k, v in topics.items()}
    ids = set(topics)
    type_keys = {re.sub(r"[^a-z]", "", k): k for k in types}
    type_keys.update({re.sub(r"[^a-z]", "", v.lower()): k for k, v in types.items()})
    seen = set()
    for rn, row in enumerate(rows[1:], start=2):
        cells = [c.strip() for c in row]
        if not any(cells):
            continue                                   # blank rows (Excel leaves trailing ones)
        if cells[0].startswith("#"):
            continue                                   # a row parked by starting it with '#'
        get = lambda k: cells[col[k]] if k in col and col[k] < len(cells) else ""  # noqa: E731
        out["rows"] += 1
        where = f"niche_examples.csv row {rn}"
        n_err = len(out["errors"])
        status = get("status").lower()
        if status not in STATUSES:
            err(f"{where}: status must be one of {', '.join(STATUSES)}")
            continue
        out["counts"][status] += 1
        name = get("name")
        if not name:
            err(f"{where}: name is empty")
        elif len(name) > 140:
            warn(f"{where}: name is long ({len(name)} characters)")
        tkey = type_keys.get(re.sub(r"[^a-z]", "", get("type").lower()))
        if not tkey:
            err(f"{where}: type must be one of {', '.join(types)}")
        url, problem = clean_url(get("url"))
        if not get("url"):
            err(f"{where}: url is empty (every example needs a public source)")
        elif problem:
            err(f"{where}: {problem}")
        elif url.lower().startswith("http://"):
            warn(f"{where}: the link is http://, not https://")
        year = get("year")
        yv = None
        if year:
            if not re.fullmatch(r"\d{4}", year) or not (1800 <= int(year) <= this_year + 1):
                err(f"{where}: year should be four digits, e.g. 2021")
            else:
                yv = int(year)
        rid = get("id").lower()
        if rid:
            if not ID_RE.match(rid):
                err(f"{where}: id may use only lower-case letters, digits and hyphens (2-60 characters)")
        else:
            rid = slugify(name)
            out["derived_ids"] += 1
        if rid in seen:
            err(f"{where}: id {rid!r} is used twice")
        seen.add(rid)
        refs = [r for r in re.split(r"[;\n]+", get("prompts")) if r.strip()]
        if not refs:
            err(f"{where}: prompts is empty (link each example to at least one prompt)")
        pids = []
        for ref in refs:
            pid, sugg = resolve_prompt(ref, ids, by_label)
            if pid:
                if pid not in pids:
                    pids.append(pid)
            else:
                hint = f"; did you mean {' / '.join(repr(s) for s in sugg)}?" if sugg else ""
                err(f"{where}: prompt {ref.strip()[:60]!r} is not on the map{hint}")
        summary = get("summary")
        if len(summary) > 200:
            warn(f"{where}: summary is long ({len(summary)} characters; aim for one line)")
        if status != PUBLISHED_STATUS or len(out["errors"]) > n_err:
            continue                                   # only rows a second person has checked, and that pass every check
        out["examples"].append({
            "id": "ex:" + rid, "kind": "example", "type": tkey, "label": name, "org": get("organisation"), "year": yv,
            "stage": get("stage"), "summary": summary, "url": url, "topics": ["n:" + p for p in pids],
        })
    return out
