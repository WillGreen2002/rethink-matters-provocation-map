# Rethink Matters — Provocation Map

An interactive, Obsidian-style map of the Rethink Matters provocations. One central question
(*"As we learn to engineer the living world, how can we ensure it is a world in which we want to live?"* — WEF, 2021),
nine themes from the Bristol retreat sheet, sixty discussion prompts under them, the discussions and notes behind
those prompts, and a tag system that links prompts across themes. Styled from rethinkmatters.org (colours, Inter + Spectral,
and the visual grammar of the *Map of shared aims* on the About page).

| folder | what it is |
|---|---|
| `site/` | **the website** — a self-contained static folder; upload this and nothing else |
| `vault/` | the same content as an **Obsidian vault** (notes, tag hubs, threads) for the group's own Zettelkasten work |
| `curation/` | the hand-edited source: lenses, tag vocabulary, prompts + tags + bridges, discussions + anonymised note digests, threads |
| `build/build.py` | reads the sheets + notes + `curation/` → writes `site/graph-data.js`, `vault/`, `docs/` |
| `build/preflight.py` | **safety scan** — run before every commit/push; refuses if anything sensitive would be published |
| `build/leakcheck.py` | the generic part of that check (Drive links, e-mail addresses, local paths); `build/package.py` zips `site/` |
| `docs/TAG-GUIDE.md` | the tag system (generated; counts always match the data) |
| `docs/build-report.md` | tag usage, network statistics, warnings from the last build |
| `source_data/`, `source_notes/`, `build/local_checks.json` | **local only — never in the GitHub repo.** The original spreadsheets and notes document (participant names, contact e-mails, budgets), and the private lists of names/terms the leak check refuses to publish. See `build/local_checks.example.json` for the format. |

## Live site

**<https://willgreen2002.github.io/rethink-matters-provocation-map/>** — hosted by GitHub Pages straight from this repository.
A GitHub Actions workflow (`.github/workflows/pages.yml`) publishes **only the `site/` folder**; the vault, curation files and build tools are in the repository but are not served.
Share a link to any note with `#`, e.g. `…/#n:hype-vs-evidence`. The page carries `noindex`, so search engines are asked to leave it alone — but anyone with the link can open it.

To update the live site after changing `curation/` (or the code in `site/assets/`):

```bash
python -I build/build.py       # rebuild site/, vault/ and docs/ (skip if you only edited site/assets/)
python -I build/preflight.py   # must say "preflight OK" before anything is committed
git add -A
git commit -m "describe the change"
git push                       # the site redeploys within a minute or two
```

The repository is **public** (free GitHub Pages needs that), so everything committed is readable by anyone — which is why the original spreadsheets, the raw notes
document and `build/local_checks.json` are git-ignored and must stay out. `preflight.py` checks for exactly this; do not skip it.

## View it locally

Double-click `site/index.html` (it works from disk), or serve the folder:

```bash
python -m http.server 8766 --directory site
```

then open <http://localhost:8766>. Share a link to any note with `#`, e.g. `…/index.html#n:hype-vs-evidence`.

## Put it on rethinkmatters.org

`site/` has no build step, no server code and no tracking. Fonts (Inter, Spectral) load from Google Fonts like the main site; delete the two
`<link>` tags to `fonts.googleapis.com` in `index.html` if you would rather self-host them.

* **As a page of its own:** upload the `site/` folder as, say, `rethinkmatters.org/map/` (all paths are relative).
* **Inside an existing page:** `<iframe src="/map/?embed=1" title="Provocation map" style="width:100%;height:85vh;border:0"></iframe>` — `?embed=1` hides the duplicate site header.
* The page carries `<meta name="robots" content="noindex">` as a safe default. Remove that line in `index.html` when you want it findable.

### Review before publishing

1. **Chatham House.** All provocateur and joiner names are removed; note digests are anonymised; named people appear only as cited authors
   (book authors on your Bookshelf, one 1973 book's author). `build.py` *refuses to build* — and `build/preflight.py` *refuses to publish* — if any participant name,
   Google Drive/Docs link, e-mail address, local path or a term on the private list (`build/local_checks.json`) shows up. That is a safety net, not a substitute for
   reading the digests in `curation/discussions_*.yaml` once yourselves.
2. **Links to the group's Google-Doc notes are deliberately not included** (they are share-links; on a public page they could expose the full notes).
3. **Only scale and working group come from your sheets.** Pillar, value, every semantic tag, every bridge and every thread are first drafts by the map's author; working-group
   assignments the sheets did not record are shown dashed.
4. Notes mention a few companies and products by name where the group did. Digests avoid stating unverified facts about them; check you are comfortable with the remainder.

## Updating the map

Requirements: Python 3.10+ with `openpyxl`, `python-docx`, `ruamel.yaml` (`pip install openpyxl python-docx ruamel.yaml`).

```bash
python -I build/build.py      # from this folder; add -I only if your Python has no per-user packages issues
```

* **Reword a theme or prompt:** edit the Bristol sheet, copy it over `source_data/bristol_retreat.xlsx`, rebuild. A prompt that no longer matches is reported as an error; a *new* prompt is
  reported as "not covered" until you add it to `curation/topics_*.yaml`.
* **Add a provocation / session:** add a discussion to `curation/discussions_*.yaml` (the `texts:` entry says where to pull the verbatim provocation from), write its note digest
  under `notes:`, then attach it to the prompt(s) it feeds via `sources:` in `curation/topics_*.yaml`.
* **Add a tag:** define it in `curation/tags.yaml` (one-line meaning; poles for tensions) and apply it to at least three prompts across at least two themes.
* The build also checks every reference resolves, every tag is defined, and prints how many tags are too rare/too common.

## What is on the map

The map is a fixed **orbit** layout (no physics): everything has a set place, so the whole map can be read at once and it never rearranges itself.

* **Centre** — the central question; click it (or the caption above the map) for the citation, the four WEF values, and a "how to read this map" guide.
* **Themes** — the nine themes on an inner ring, **numbered 1–9 clockwise from the top left**. The numbers follow the ring, not the Bristol sheet (sheet theme 7 is map theme 5, and so on; each theme's note gives its sheet number, and `curation/` keeps the sheet's numbers — the ring order is `theme_order` in `curation/meta.yaml`).
* **Chapters** — the three shelves of the Rethink Matters Bookshelf, *how matter becomes life → how life becomes technology → how technology becomes society*, shown as coloured bands round the outer ring (three points of the logo's gradient). Point at a chapter's name to light it up; click it for its themes, how it links to the other two, and the books from that shelf the map suggests. Which themes sit on which shelf is a first draft.
* **Prompts** — the 60 bullets under the themes, verbatim from the sheet, on the outer ring beside their theme, every label readable. Colour = the lens you pick (pillar by default); a ring split in two means two values.
* **Connections** — at rest only the hand-written bridges show, faintly (switch to *Quiet* or *Every link* under Connections). Point at a prompt or theme and all of its connections light up in the colour of the relation — teal *echoes*, terracotta *in tension with*, olive *enables*, ochre *leads on to*; dashed = shared tags or a shared discussion. Lines leave through their own theme and arrive through the other.
* **Opening a note** keeps the whole map in view beside it and holds it still, so you can follow a connection by clicking the prompt at its other end. Opening a tag, book or discussion lights up the prompts it belongs to.
* **Discussions layer** — optional grey dots just inside the prompts (the provocation and notes are also in every prompt's note).
* **Guided threads** — eight curated paths through the map that cross themes and end back at the question.
* **Index tab** — the same content as a plain list (also the accessible, no-canvas route).

## Credits and sources

Visual language: rethinkmatters.org (tokens and the logo gradient were read from the live site). Central question and the four values: *Revisiting and Realizing the Promises of
Synthetic Biology*, World Economic Forum, 25 October 2021. The group's essay *Let's build a shared language* (20 April 2026) informs the definitions tags.
