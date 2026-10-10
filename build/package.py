#!/usr/bin/env python
"""Zip the deployable site/ folder (forward-slash paths, so it unpacks cleanly on any server).

    python build/package.py      ->  rethink_matters_map_site.zip  (contains index.html, graph-data.js, assets/…)

Run build/build.py first. Only site/ is packaged — never source_data/, source_notes/ or curation/.
"""
import os
import zipfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SRC = os.path.join(ROOT, "site")
OUT = os.path.join(ROOT, "rethink_matters_map_site.zip")

with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
    for dirpath, _, files in os.walk(SRC):
        for fn in sorted(files):
            full = os.path.join(dirpath, fn)
            rel = os.path.relpath(full, SRC).replace(os.sep, "/")
            z.write(full, rel)
            print("  +", rel, os.path.getsize(full))
print("wrote", OUT, os.path.getsize(OUT), "bytes")
