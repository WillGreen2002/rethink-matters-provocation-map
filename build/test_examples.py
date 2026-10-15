"""Tests for build/examples.py (plain asserts; run with: python -I build/test_examples.py). Rows are placeholders, not real examples."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import examples as ex  # noqa: E402

TOPICS = {"hype-vs-evidence": "Hype vs evidence", "chronic-bioelectrodes": "Chronic bioelectrodes", "when-to-let-die": "When to let materials die"}
TYPES = {"paper": "Paper", "company": "Company", "product": "Product", "preclinical": "Pre-clinical", "clinical": "Clinical", "other": "Other"}
HEAD = "id,type,name,organisation,year,stage,summary,url,prompts,status,notes\n"


def run(body, head=HEAD, enc="utf-8-sig"):
    return ex.parse((head + body).encode(enc), TOPICS, TYPES, 2026)


def test_header_only():
    r = run("")
    assert r["errors"] == [] and r["examples"] == [] and r["rows"] == 0


def test_checked_only_published():
    r = run("a1,paper,Test row 1,Org,2021,,One line.,https://example.org/a,hype-vs-evidence,checked,\n"
            "a2,company,Test row 2,Org,2020,,One line.,https://example.org/b,hype-vs-evidence,draft,\n"
            "a3,product,Test row 3,Org,2019,,One line.,https://example.org/c,hype-vs-evidence,hidden,\n")
    assert r["errors"] == [], r["errors"]
    assert [e["id"] for e in r["examples"]] == ["ex:a1"]
    assert r["counts"] == {"draft": 1, "checked": 1, "hidden": 1}


def test_prompt_references():
    link = "https://example.github.io/map/?level=regime#n:chronic-bioelectrodes"
    r = run(f'b1,clinical,Test row,Org,2024,phase-1,One line.,https://example.org/x,"n:hype-vs-evidence; {link};When To Let Materials Die",checked,\n')
    assert r["errors"] == [], r["errors"]
    assert r["examples"][0]["topics"] == ["n:hype-vs-evidence", "n:chronic-bioelectrodes", "n:when-to-let-die"]


def test_niche_address_as_prompt():
    r = run("h1,paper,Test row,Org,2021,,x,https://example.org/a,https://example.org/map/?level=niche&focus=n:hype-vs-evidence#d:x,checked,\n")
    assert r["errors"] == [], r["errors"]
    assert r["examples"][0]["topics"] == ["n:hype-vs-evidence"]


def test_unknown_prompt_suggests():
    r = run("c1,paper,Test row,Org,2021,,x,https://example.org/a,hype-vs-evidense,checked,\n")
    assert len(r["errors"]) == 1 and "did you mean" in r["errors"][0] and "row 2" in r["errors"][0]


def test_private_url_and_doi():
    r = run("d1,paper,Test row,Org,2021,,x,https://docs.google.com/document/d/abc,hype-vs-evidence,checked,\n"
            "d2,paper,Test row 2,Org,2021,,x,doi:10.1000/xyz123,hype-vs-evidence,checked,\n")
    assert len(r["errors"]) == 1 and "private" in r["errors"][0]
    assert r["examples"][0]["url"] == "https://doi.org/10.1000/xyz123"


def test_private_url_forms():
    bad = ["https://dl.dropboxusercontent.com/s/x", "https://drive.usercontent.google.com/download?id=1", "https://lh3.googleusercontent.com/x",
           "https://bit.ly/abc", "https://forms.gle/abc", "https://mega.nz/file/x", "https://teams.microsoft.com/l/x", "https://www.icloud.com/x",
           "https://x@127.0.0.1/", "https://[::1]/a", "https://172.16.0.4/a", "https://example.org/a?X-Amz-Signature=abc",
           "https://storage.googleapis.com/b/o?X-Goog-Signature=1", "https://www.linkedin.com/in/someone", "https://intranet.local/a",
           "https://contoso.sharepoint.com/x", "https://1drv.ms/w/s!x"]
    for u in bad:
        assert ex.clean_url(u)[1], u
    for u in ["https://example.org/a", "https://www.nature.com/articles/x", "https://clinicaltrials.gov/study/NCT0", "https://www.linkedin.com/company/x"]:
        assert ex.clean_url(u)[1] == "", u


def test_private_links_anywhere_in_the_sheet():
    r = run("g1,paper,Test row,Org,2021,,x,https://example.org/a,hype-vs-evidence,checked,see https://1drv.ms/abc\n"
            "#g2,paper,Parked,Org,2021,,x,https://example.org/b,hype-vs-evidence,draft,ask someone@nhs.uk\n"
            "g3,paper,Fine,Org,2021,,x,https://example.org/c,hype-vs-evidence,checked,\n")
    assert len(r["errors"]) == 2 and all("private link or an e-mail" in e for e in r["errors"]), r["errors"]
    assert [e["id"] for e in r["examples"]] == ["ex:g3"]


def test_semicolon_delimiter_cp1252_and_aliases():
    head = "ID;Type;Title;Organization;Year;Stage;Summary;Link;Prompt;Status;Notes\n"
    body = "e1;Pre-clinical;Test röw;Org;2022;;Café ’quote’;https://example.org/e;Hype vs evidence;checked;\n"
    r = ex.parse((head + body).encode("cp1252"), TOPICS, TYPES, 2026)
    assert r["errors"] == [], r["errors"]
    assert r["delimiter"] == ";" and r["encoding"] == "cp1252"
    e = r["examples"][0]
    assert e["type"] == "preclinical" and e["label"] == "Test röw" and e["topics"] == ["n:hype-vs-evidence"]


def test_bad_rows():
    r = run("f1,blog,Test row,Org,21,,x,ftp://x,hype-vs-evidence,maybe,\n"
            "f2,paper,,Org,2021,,x,https://example.org,,checked,\n"
            "Bad ID!,paper,Test,Org,2021,,x,https://example.org,hype-vs-evidence,checked,\n")
    msgs = " | ".join(r["errors"])
    assert "status must be" in msgs and "name is empty" in msgs and "prompts is empty" in msgs and "id may use only" in msgs


def test_duplicate_and_derived_ids():
    r = run(",paper,Same Name,Org,2021,,x,https://example.org/1,hype-vs-evidence,checked,\n"
            ",paper,Same Name,Org,2021,,x,https://example.org/2,hype-vs-evidence,checked,\n")
    assert r["derived_ids"] == 2 and any("used twice" in e for e in r["errors"])


def test_skips_blank_and_parked_rows():
    r = run(",,,,,,,,,,\n#parked,paper,Test,Org,2021,,x,https://example.org,hype-vs-evidence,checked,\n")
    assert r["rows"] == 0 and r["errors"] == []


def test_unknown_column():
    r = run("", head="id,type,name,url,prompts,status,colour\n")
    assert any("unknown column" in e for e in r["errors"])


if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for fn in fns:
        fn()
    print(f"test_examples: {len(fns)} tests passed")
