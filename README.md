# Rethink Matters: Provocation Map

An interactive map of what Rethink Matters has been discussing, around one central question
(*"As we learn to engineer the living world, how can we ensure it is a world in which we want to live?"*, WEF, 2021).
It sorts the group's discussions into **three levels**, borrowed from Frank Geels' multi-level perspective and used here as a
snapshot of one point in time, not a model of change:

| level | what it shows |
|---|---|
| **Landscape** (the big picture, the landing page) | the nine themes on a ring, the three chapters, the ties between themes, and a drafted future for each theme |
| **Regime** (the prompts) | the sixty prompts and the links between them, with every discussion and note behind them; agencies such as ARIA help drive this level |
| **Niche** (examples on the ground) | real examples linked to the prompts: papers, companies, products, pre-clinical and clinical work; empty until Rethink Matters adds checked rows |

Styled from rethinkmatters.org (colours, Inter + Spectral, and the visual grammar of the *Map of shared aims* on the About page).

| folder | what it is |
|---|---|
| `site/` | **the website**: a self-contained static folder; upload this and nothing else |
| `vault/` | the same content as an **Obsidian vault** (notes, tag hubs, walks, examples) for the group's own Zettelkasten work |
| `curation/` | the hand-edited source: lenses, tags, prompts and bridges, discussions and anonymised note digests, walks, **all the site's wording (`copy.yaml`)**, **the drafted futures (`futures.yaml`)** and **the Niche spreadsheet (`niche_examples.csv`)** |
| `build/build.py` | reads the sheets, notes and `curation/`, then writes `site/graph-data.js`, `site/examples-data.js`, `vault/` and `docs/` |
| `build/preflight.py` | **safety scan**: run before every commit or push; refuses if anything sensitive would be published |
| `build/leakcheck.py` | the generic part of that check (Drive links, e-mail addresses, local paths, em dashes); `build/package.py` zips `site/` |
| `docs/NICHE-EXAMPLES.md` | how to add examples to the Niche (generated, with the table of prompt ids) |
| `docs/FUTURES-REVIEW.md` | every drafted future, clause by clause, with what it rests on (generated) |
| `docs/TAG-GUIDE.md`, `docs/build-report.md` | the tag system; tag usage, network statistics and warnings from the last build (generated) |
| `source_data/`, `source_notes/`, `build/local_checks.json` | **local only, never in the GitHub repo.** The original spreadsheets and notes document (participant names, contact e-mails, budgets), and the private lists of names and terms the leak check refuses to publish. See `build/local_checks.example.json` for the format. |

## Live site

**<https://willgreen2002.github.io/rethink-matters-provocation-map/>**, hosted by GitHub Pages straight from this repository.
A GitHub Actions workflow (`.github/workflows/pages.yml`) publishes **only the `site/` folder**; the vault, curation files and build tools are in the repository but are not served.
The page carries `noindex`, so search engines are asked to leave it alone, but anyone with the link can open it.

### Links

The level and any focus go in the address; the open note goes after `#`:

| link | opens |
|---|---|
| `…/` | the Landscape |
| `…/?level=landscape#th:5` | the Landscape with theme 5's note open |
| `…/?level=regime` | the Regime, all sixty prompts |
| `…/?level=regime&focus=th:5` | the Regime showing only theme 5 (`focus=arc:matter-to-life` for a chapter) |
| `…/?level=regime#n:hype-vs-evidence` | the Regime with a prompt's note open |
| `…/?level=regime&walk=data-bottleneck` | a guided walk, from its first stop (`&stop=3` for the third) |
| `…/?level=niche` | the Niche |

Older links keep working: `#n:…`, `#d:…`, `#t:…` and `#b:…` open on the Regime; `#th:…`, `#arc:…` and `#c` open on the Landscape.
The browser's Back button goes back up a level. With the level bar focused, keys **1**, **2** and **3** (or the arrow keys) switch level; **Esc** ends a walk, then closes a note, then clears a focus.
The copy-link button in a note always gives the full-page link (without `embed`).

To update the live site after changing `curation/` (or the code in `site/assets/`):

```bash
python -I build/build.py       # rebuild site/, vault/ and docs/
python -I build/preflight.py   # must say "preflight OK" before anything is committed
git add -A
git commit -m "describe the change"
git push                       # the site redeploys within a minute or two
```

The repository is **public** (free GitHub Pages needs that), so everything committed is readable by anyone. That is why the original spreadsheets, the raw notes
document and `build/local_checks.json` are git-ignored and must stay out. `preflight.py` checks for exactly this; do not skip it.

## View it locally

Double-click `site/index.html` (it works from disk), or serve the folder:

```bash
python -m http.server 8766 --directory site
```

then open <http://localhost:8766>.

## Put it on rethinkmatters.org

`site/` has no build step, no server code and no tracking. Fonts (Inter, Spectral) load from Google Fonts like the main site; delete the two
`<link>` tags to `fonts.googleapis.com` in `index.html` if you would rather self-host them.

* **As a page of its own:** upload the `site/` folder as, say, `rethinkmatters.org/map/` (all paths are relative).
* **Inside an existing page:** `<iframe src="/map/?embed=1" title="Provocation map" style="width:100%;height:85vh;border:0"></iframe>`. `?embed=1` hides the duplicate site header, and moving round the map inside the frame never adds entries to the visitor's browser history.
* The page carries `<meta name="robots" content="noindex">` as a safe default. Remove that line in `index.html` when you want it findable.

### Review before publishing

1. **Chatham House.** All provocateur and joiner names are removed; note digests are anonymised; named people appear only as cited authors
   (book authors on your Bookshelf, one 1973 book's author, and Frank Geels for the levels). `build.py` *refuses to build*, and `build/preflight.py` *refuses to publish*, if any participant name,
   Google Drive or Docs link, e-mail address, local path, em dash or a term on the private list (`build/local_checks.json`) shows up. That is a safety net, not a substitute for
   reading the digests in `curation/discussions_*.yaml` once yourselves.
2. **Links to the group's Google-Doc notes are deliberately not included** (they are share-links; on a public page they could expose the full notes).
3. **Only scale and working group come from your sheets.** Pillar, value, every semantic tag, every bridge and every walk are first drafts by the map's author; working-group
   assignments the sheets did not record are marked with an asterisk.
4. **The futures are drafts.** Each was drafted only from the group's own prompts and anonymised notes, then checked clause by clause by an independent reader; theme 7
   (circularity and waste) has no session notes yet, so its future is drawn from its prompts only and says so. Every one shows a *Draft* badge until you change its status.
   `docs/FUTURES-REVIEW.md` lists what each clause rests on.
5. **Niche examples go live only when a row is marked `checked`**, by someone other than the person who added it. Everything in that spreadsheet that is published is public.
6. Notes mention a few companies and products by name where the group did. Digests avoid stating unverified facts about them; check you are comfortable with the remainder.

## Updating the map

Requirements: Python 3.10+ with `openpyxl`, `python-docx`, `ruamel.yaml` (`pip install openpyxl python-docx ruamel.yaml`).

```bash
python -I build/build.py             # rebuild
python -I build/build.py --review    # also write Excel-friendly review sheets to build/_review/ (never published)
```

* **Change any wording on the site:** edit `curation/copy.yaml`. Every label, button, hint and explainer the site writes itself is there, by key; words in `{curly brackets}` are filled in by the site. Names that come from the data (themes, prompts, chapters, tags, books) are edited in their own `curation/` files.
  The build refuses to run if the site asks for a key the file does not have.
* **Edit a future:** rewrite its `text` in `curation/futures.yaml` and set `status` to `rm-edited`, or `rm-approved` with `approved_on: YYYY-MM`. Keep `theme` (the Bristol sheet
  number) and `label` as they are: they guard the numbering. Limits the build checks: a theme future starts *A future where* (40 words at most); the overall answer starts
  *A world we would want to live in is one where* (60 words at most); no quotation marks, no attribution, no em dashes, and no number its sources do not contain.
  Set `show_on_site: false` to hide them all.
* **Add examples to the Niche:** open `curation/niche_examples.csv` in Excel, add a row per example (type, name, organisation, year, stage, a one-line summary, a public
  `https://` link, and the prompts it speaks to), save as **CSV UTF-8**, and rebuild. Rows go live only once `status` is `checked`. `docs/NICHE-EXAMPLES.md` has the details and
  the list of prompt ids.
* **Gather wider feedback:** `--review` writes `copy_review.csv`, `futures_review.csv` and `categories_review.csv` to `build/_review/` for people to comment on in Excel;
  apply the agreed changes in `curation/`.
* **Reword a theme or prompt:** edit the Bristol sheet, copy it over `source_data/bristol_retreat.xlsx`, rebuild. A prompt that no longer matches is reported as an error; a *new* prompt is
  reported as "not covered" until you add it to `curation/topics_*.yaml`.
* **Add a provocation or session:** add a discussion to `curation/discussions_*.yaml` (the `texts:` entry says where to pull the verbatim provocation from), write its note digest
  under `notes:`, then attach it to the prompt(s) it feeds via `sources:` in `curation/topics_*.yaml`.
* **Add a tag:** define it in `curation/tags.yaml` (one-line meaning; poles for tensions) and apply it to at least three prompts across at least two themes.
* The build also checks every reference resolves, every tag is defined, and prints how many tags are too rare or too common.

## What is on the map

* **The level switcher** (top centre; a tab bar at the bottom on a phone) moves between the Landscape, the Regime and the Niche. The tab at the bottom of the map goes one level down.
* **Words.** A *prompt* is one of the sixty (the sheet's provocation prompts); a *provocation* is what was put to a session, and a *discussion* holds it with what was said; a *note* is the panel that opens when you choose something.
* **Landscape.** The question in the middle; the nine themes round it, **numbered 1 to 9 clockwise from the top right**. The numbers follow the ring, not the Bristol sheet (sheet
  theme 7 is map theme 5, and so on; each theme's note gives its sheet number, and `curation/` keeps the sheet's numbers; the ring order is `theme_order` in `curation/meta.yaml`).
  The three chapters, the Bookshelf's shelves (*how matter becomes life, how life becomes technology, how technology becomes society*), are coloured bands with their names in
  the gaps. Dashed lines join themes whose prompts are linked: at rest each theme's strongest tie and any tie of three links or more; point at a theme for all of them, with counts.
  Click a theme for its note and its draft future; its "N prompts" pill goes down to the Regime showing only that theme. Click the question for the overall draft answer.
  On a phone the ring becomes a list of cards.
* **Regime.** The sixty prompts, verbatim from the sheet, on an outer ring beside their theme. Colour shows the pillar (or the theme). At rest only the hand-written bridges
  show, faintly; point at a prompt or theme and all of its connections light up in the colour of the relation: teal *echoes*, terracotta *in tension with*, olive *enables*,
  ochre *leads on to*; dashed lines share tags or a discussion. *Show only* (left panel) narrows the map to one chapter, one theme or a pillar; the rest dims but stays in view.
  More options holds what shows at rest, link strength and the discussions layer.
* **Niche.** The same ring with the prompts as anchors and the examples hanging inward from them like beads, shaped by type (square paper, triangle company, diamond product,
  ring pre-clinical, dot clinical, cross other). A prompt's note lists its examples; an example's note gives its source and the prompts it speaks to.
* **Guided walks.** Eight curated paths that cross themes and end back at the question, then offer the big picture. Start one from the button at the top left, the hero
  button, the Walks tab, a theme's note or the question's note.
* **Index tab.** The same content as a plain list (also the accessible, no-canvas route). Every theme on the Landscape is a real button, so it works with a keyboard and a screen reader.

## Credits and sources

Visual language: rethinkmatters.org (tokens and the logo gradient were read from the live site). Central question and the four values: *Revisiting and Realizing the Promises of
Synthetic Biology*, World Economic Forum, 25 October 2021. The group's essay *Let's build a shared language* (20 April 2026) informs the definitions tags.
The three levels follow F. W. Geels, *Technological transitions as evolutionary reconfiguration processes: a multi-level perspective and a case-study*,
Research Policy 31 (2002) 1257–1274, <https://doi.org/10.1016/S0048-7333(02)00062-8>, and Geels, *The multi-level perspective on sustainability transitions*, in Wesche and
Hendriks (eds), *Introduction to Sustainability Transitions Research*, Cambridge University Press (2026) 15–33, <https://doi.org/10.1017/9781009437318.004>.
ARIA's opportunity spaces: <https://www.aria.org.uk/opportunity-spaces/>.
