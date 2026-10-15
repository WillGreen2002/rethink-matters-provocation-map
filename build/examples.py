"""Niche examples: turn curation/niche_examples.csv (kept by Rethink Matters in Excel) into checked, public example records.

Pure functions only (no file writes), so build.py and build/test_examples.py share them. Messages name spreadsheet rows
(the header is row 1), never the examples themselves, so build output and reports do not copy example text around.
"""
from __future__ import annotations

import csv
import difflib
import io
import re
from urllib.parse import urlsplit

import leakcheck  # the shared private-link and e-mail patterns

COLUMNS = ["id", "type", "name", "organisation", "year", "stage", "summary", "url", "prompts", "status", "notes"]
REQUIRED = ["type", "name", "url", "prompts", "status"]
ALIASES = {"organization": "organisation", "org": "organisation", "company": "organisation", "link": "url", "source": "url",
           "prompt": "prompts", "title": "name"}
STATUSES = ("draft", "checked", "hidden")
PUBLISHED_STATUS = "checked"
# never accepted as a public source: private or personal storage (by domain, so direct-download hosts count too), link
# shorteners (they can hide such a link), local or raw-IP addresses, user names in links, and signed links
PRIVATE_DOMAINS = ("docs.google.com", "drive.google.com", "googleusercontent.com", "usercontent.google.com", "sharepoint.com", "1drv.ms",
                   "onedrive.live.com", "onedrive.com", "dropbox.com", "dropboxusercontent.com", "db.tt", "box.com", "boxcloud.com",
                   "notion.so", "notion.site", "wetransfer.com", "we.tl", "mega.nz", "mega.io", "icloud.com", "teams.microsoft.com",
                   "teams.live.com", "slack.com", "zoom.us")
SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "goo.gl", "forms.gle", "ow.ly", "cutt.ly", "shorturl.at", "rebrand.ly", "buff.ly", "is.gd",
              "lnkd.in")
SIGNED = re.compile(r"(?:^|&)(?:x-amz-signature|x-goog-signature|x-ms-signature|sig|signature|token|access_token)=", re.I)
CELL_PATTERNS = [re.compile(p, re.I) for p in leakcheck.PRIVATE_LINKS + [leakcheck.EMAIL]]
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
    """A prompt reference may be its id, 'n:<id>', a link copied from the map (the Niche's address names its prompt as
    focus=n:<id>; an older link carries #n:<id>), or its exact label. Returns (id, suggestions)."""
    r = ref.strip()
    m = re.search(r"[?&]focus=(n:[a-z0-9-]+)", r)
    if m:
        r = m.group(1)
    elif "#" in r:
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
    try:
        parts = urlsplit(u)
        host = (parts.hostname or "").lower().rstrip(".")
    except ValueError:
        return u, "the link could not be read; copy it again from the browser's address bar"
    on = lambda domains: any(host == d or host.endswith("." + d) for d in domains)  # noqa: E731
    if "@" in parts.netloc:
        return u, "the link has a user name or password in it; use the plain public address"
    if not host or "." not in host or ":" in host or re.fullmatch(r"[\d.]+", host) or host.endswith((".local", ".internal", ".lan")):
        return u, "the link points to a private or local address, not a public web page"
    if on(PRIVATE_DOMAINS) or (on(("linkedin.com",)) and parts.path.lower().startswith("/in/")):
        return u, "the link points to private or personal storage; use a public page instead"
    if on(SHORTENERS):
        return u, "use the full address, not a shortened link"
    if SIGNED.search(parts.query):
        return u, "the link carries a private access key; use the public address instead"
    return u, ""


def private_cells(cells: list[str]) -> bool:
    """Does any cell hold a private link or an e-mail address? The whole sheet is public on GitHub, notes and parked rows too."""
    return any(p.search(c) for c in cells for p in CELL_PATTERNS)


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
        if private_cells(cells):
            err(f"niche_examples.csv row {rn}: a cell holds a private link or an e-mail address; the whole sheet is public, notes and "
                "parked rows included")
            continue
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
