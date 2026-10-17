# Rethink Matters: Provocation Map

An interactive map of what Rethink Matters has been discussing, around one central question
(*"As we learn to engineer the living world, how can we ensure it is a world in which we want to live?"*, WEF, 2021).
It sorts the group's discussions into **three levels**, borrowed from Frank Geels' multi-level perspective and used here as a
snapshot of one point in time, not a model of change. You walk it from the top down, each step less abstract and more specific:

| level | what it shows |
|---|---|
| **Landscape** (the big picture, the landing page) | the nine themes on a ring, the three chapters, the ties between themes, and a drafted future for each theme |
| **Regime** (one theme's prompts) | one theme at a time: its prompts and the links between them, with the other themes they reach further out; agencies such as ARIA help drive this level |
| **Niche** (one prompt's sources) | one prompt at a time: the discussions where it was aired, the books suggested with it and real examples on the ground (papers, companies, products, pre-clinical and clinical work, once Rethink Matters adds checked rows), with the prompts it links to further out |

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
| `…/?level=regime&focus=th:5` | the Regime on theme 5 |
| `…/?level=regime&focus=th:8#n:hype-vs-evidence` | theme 8 with a prompt's note open (the focus can be left out: the prompt implies its theme) |
| `…/?level=niche&focus=n:hype-vs-evidence` | the Niche on one prompt |
| `…/?level=niche&focus=n:hype-vs-evidence#d:spudcells-hype` | the same, with a discussion's note open |
| `…/?level=regime&walk=data-bottleneck` | a guided walk, from its first stop (`&stop=3` for the third) |

Older links keep working: `#n:…` and `#t:…` open on the Regime (in the prompt's theme); `#d:…`, `#b:…` and `#ex:…` open on the Niche (under the first prompt
they belong to); `#th:…`, `#arc:…` and `#c` open on the Landscape.
The browser's Back button goes back up a level, or back across. With the level bar focused, keys **1**, **2** and **3** switch level (the arrow keys move along it; Enter goes); **Esc** ends a
walk, then closes a note, then goes up a level.
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
   (circularity and waste) has no session notes yet, so its future is drawn from its prompts only. The site no longer labels them as drafts; their `status` in
   `curation/futures.yaml` still records where each stands.
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

* **Moving down and up.** One click opens a note; a double click goes down a level (a theme to its prompts, a prompt to its sources), and so does
  **Go down** in the note (the way down from the keyboard). The rings carry no way-down pills and the Landscape's lines no numbers; in a list (on a
  phone, or with List chosen), each card's ↓ goes down. A double click acts only on what its first click hit, so a map that moves when the note opens
  never sends you somewhere else. The **Up** button (the upward arrow at the top left, which on a wide screen also names where it goes: *Landscape*
  from the Regime, *Theme 8* from the Niche) goes back up a level, as does **Esc** once no note or walk is open. During a walk, Up ends the walk.
* **The level bar** (top centre; a tab bar at the bottom on a phone) is also the trail: *Landscape › Theme 8 · Value, scale & adoption › Hype vs evidence*. Click a step to go
  back up. The tab at the bottom of the map goes one level down from whatever is open; the arrows at the sides move across, to the next theme or the next prompt in the theme.
* **Map or list.** The Regime and Niche open as a map (the standard). The **Map / List** switch at the top right shows the same level as a plain list in the same order; the
  site remembers the choice on that browser. Where a window is too small for the map (a short window during a walk, say), List shows as on and Map says why.
* **Words.** A *prompt* is one of the sixty (the sheet's provocation prompts); a *provocation* is what was put to a session, and a *discussion* holds it with what was said;
  a *source* is what sits under a prompt on the Niche (its discussions, examples and books); a *note* is the panel that opens when you choose something.
* **Landscape.** The question in the middle; the nine themes round it, **numbered 1 to 9 clockwise from the top right**. The numbers follow the ring, not the Bristol sheet (sheet
  theme 7 is map theme 5, and so on; each theme's note gives its sheet number, and `curation/` keeps the sheet's numbers; the ring order is `theme_order` in `curation/meta.yaml`).
  The three chapters, the Bookshelf's shelves (*how matter becomes life, how life becomes technology, how technology becomes society*), are coloured bands with their names in
  the gaps. Dashed lines join themes whose prompts are linked: at rest each theme's strongest tie and any tie of three links or more; point at a theme for all of them (the thicker the line, the more links).
  Click a theme for its note and its future; double-click it (or use Go down in its note) to go down to the Regime on that theme. Click the question for the overall answer.
  On a phone the ring becomes a list of cards.
* **Regime.** One theme in the middle and only its prompts round it (verbatim from the sheet, coloured by the pillar of the Rethink Matters mission each speaks to), with
  the links between them. The other themes they reach sit further out as small numbered discs: point at a prompt and its links light up in the colour of the relation (teal
  *echoes*, terracotta *in tension with*, olive *enables*, ochre *leads on to*; dashed lines share tags or a discussion), together with the themes it reaches; click a theme
  further out to move across to it. Double-click a prompt to go down to the Niche, or use Go down in its note (which says how many
  sources sit under it). During a walk, the theme further out that holds the next stop takes you on to it.
* **Niche.** One prompt in the middle with its sources round it: the discussions where it was aired (open one for the provocation and what the group said), the books
  suggested with it, and examples shaped by type (square paper, triangle company, diamond product, ring pre-clinical, dot clinical, cross other). The prompts it links to sit
  further out, in the colour of the relation; click one to move across.
* **Narrow screens.** On a phone the Regime and Niche are always plain lists in the same order. On a laptop the ring stays beside an open note: it shrinks to fit
  (its discs never smaller than their names need, its middle never smaller than its title), then tightens the gaps between its rings, sets the outer themes' names
  above and below them, and lets the side arrows step aside. On a small laptop, going down folds the left panel away if the ring still has no room beside it (it
  comes back on the Landscape). Only if none of that is enough does the level fall back to the list, and the Map / List switch then says so. The top row's buttons
  fold to icons when space is short, and opening the left panel where there is no room beside a note closes the note.
* **Guided walks.** Eight curated paths that cross themes and end back at the question, then offer the big picture. They run through the Regime: each stop shows its
  theme with the stop lit, and a gold line leads in from the previous stop and on to the next (through the theme it lies in, when that is another one). Start one from the
  button at the top left, the hero button, the Walks tab, a theme's note or the question's note.
* **Index tab.** Every chapter, theme and prompt as a plain list. Everything on every level is a real button, so the map works with a keyboard and a screen reader.

## Editing the map (the edit link)

The map itself can be edited by anyone who has its **edit link**. Without the link, the site is exactly as published.

* **Opening the edit link once** sets that browser up (it remembers it). The map then starts with everyone's latest changes and shows an
  **Edit** switch in the header.
* **With Edit on**, everything that can be changed is outlined: theme titles, questions and futures, the overall answer, prompts (names and
  text), discussions (names and what the group said), the level explainers and the introduction. **Click into the text and type; click
  away (or press Enter) to save**, Esc to undo. Changes reach everyone with the link at once; **History** under a changed text keeps every
  earlier version, with initials and time, and can bring one back. Renaming a prompt renames its disc on the map.
* **Add to this prompt** (in a prompt's note, in edit mode), for after a provocation: a note from the discussion, a paper, a company, a
  product, a book or a link. It appears on the prompt's Niche straight away; a second person ticks **I have checked this**.
* **Freeze** stops editing for everyone; **Unfreeze** reopens it. **Done editing** turns the outlines off.

**The public map changes only when you publish** (below): everyone else keeps seeing the published text until then, and publishing runs
the Chatham House name check and the other checks first.

**Setting it up (once, about five minutes).** Open the map with `?setup` on the end
(`https://willgreen2002.github.io/rethink-matters-provocation-map/?setup`) and follow the steps: make a Google Form in a personal Google
account (five short questions: *key, text, action, who, extra*), link it to a Sheet, share the Sheet with *anyone with the link, viewer*,
and paste the two links in. The page sends a test row through the Form, reads it back from the Sheet, and gives you the edit link. The
Form and Sheet addresses are never written into this repository: they travel inside the edit link's `#k=...` part, which browsers do
not send to any server. Anyone with the edit link (or the Sheet's link) can read and change the text, so share it only with the people
who should edit. Making it members-only is a later step.

**Publishing.** From the project folder (ideally after **Freeze**):

```bash
python -I build/review_import.py --sheet "<the Sheet's link>"
```

(or download the Sheet as CSV and use `--csv responses.csv`; add `--anyway` to publish without freezing). It writes the latest text of
every edited block to `curation/review_edits.yaml`, which `build.py` applies to the published map before its leak and house-style checks;
additions with a public link become rows in `curation/niche_examples.csv` (`checked` if a second person ticked them, otherwise `draft`,
which is not published); notes without a link go to `curation/review_notes.yaml`, to be folded into the anonymised discussion notes by
hand. Initials stay in the Sheet. Then build, preflight, commit and push as usual.

## Backups

The whole map as published on 16 October 2026, before editing began, is kept on GitHub as the tag **`map-backup-2026-10-16`** (and the
branch `backup/map-2026-10-16`). To look at it, or to put the live site back to it:

```bash
git checkout map-backup-2026-10-16
```

```bash
git push --force origin map-backup-2026-10-16:main
```

(the second replaces the live site with the backup: everything after it stays in the repository's history and in the edit Sheet). Every
change made in edit mode is also a row in the Sheet, so any single text can be brought back with **History**. Before each publish, a
new tag of the same kind keeps the previous public map recoverable.

## Credits and sources

Visual language: rethinkmatters.org (tokens and the logo gradient were read from the live site). Central question and the four values: *Revisiting and Realizing the Promises of
Synthetic Biology*, World Economic Forum, 25 October 2021. The group's essay *Let's build a shared language* (20 April 2026) informs the definitions tags.
The three levels follow F. W. Geels, *Technological transitions as evolutionary reconfiguration processes: a multi-level perspective and a case-study*,
Research Policy 31 (2002) 1257–1274, <https://doi.org/10.1016/S0048-7333(02)00062-8>, and Geels, *The multi-level perspective on sustainability transitions*, in Wesche and
Hendriks (eds), *Introduction to Sustainability Transitions Research*, Cambridge University Press (2026) 15–33, <https://doi.org/10.1017/9781009437318.004>.
ARIA's opportunity spaces: <https://www.aria.org.uk/opportunity-spaces/>.
