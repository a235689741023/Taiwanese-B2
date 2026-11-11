"""Load MOE 臺灣台語常用詞辭典 (kautian.ods) into indexed structures, cached as JSON."""
import json, os, re, sys
from collections import defaultdict
sys.path.insert(0, os.path.dirname(__file__))
from ods import read_ods
from tailo import nfc

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ODS = os.path.join(ROOT, "data-raw", "kautian.ods")
CACHE = os.path.join(ROOT, "data-raw", "kautian.json")


def _clean_han(h):
    return re.sub(r"【.*?】", "", h).strip()


def load():
    if os.path.exists(CACHE) and os.path.getmtime(CACHE) > os.path.getmtime(ODS):
        with open(CACHE) as f:
            return json.load(f)
    d = read_ods(ODS)
    entries = {}
    for r in d["詞目"][1:]:
        r = r + [""] * (6 - len(r))
        eid, etype, han, roman, cat, audio = r[:6]
        entries[eid] = dict(id=eid, type=etype, han=_clean_han(han), rawHan=han,
                            roman=nfc(roman), romans=[nfc(x) for x in roman.split("/") if x],
                            cat=cat, audio=audio)
    senses = defaultdict(list)
    for r in d["義項"][1:]:
        r = r + [""] * (4 - len(r))
        senses[r[0]].append(dict(sid=r[1], pos=r[2], df=r[3]))
    examples = defaultdict(list)
    for r in d["例句"][1:]:
        r = r + [""] * (7 - len(r))
        examples[r[0]].append(dict(sid=r[1], ord=r[2], han=r[3], roman=nfc(r[4]), zh=r[5], audio=r[6]))
    alt = defaultdict(list)
    for sheet in ("又唸作", "俗唸作", "合音唸作"):
        for r in d[sheet][1:]:
            if len(r) >= 3:
                alt[r[0]].append(nfc(r[2]))
    hanroman = defaultdict(list)
    for r in d["漢字羅馬字對應"][1:]:
        if len(r) >= 2:
            hanroman[r[0]].append(nfc(r[1]))
    variants = defaultdict(list)
    for r in d["異用字"][1:]:
        if len(r) >= 3:
            variants[r[2]].append(r[1])
    syn = defaultdict(list)
    for r in d["詞目tuì詞目近義"][1:]:
        if len(r) >= 4:
            syn[r[0]].append(r[3])
    for r in d["義項tuì詞目近義"][1:]:
        if len(r) >= 5:
            syn[r[0] if False else ""]  # sense-level ids not needed
    out = dict(entries=entries, senses=senses, examples=examples, alt=alt,
               hanroman=hanroman, variants=variants, syn=syn)
    with open(CACHE, "w") as f:
        json.dump(out, f, ensure_ascii=False)
    return out


class Dict:
    def __init__(self):
        self.d = load()
        self.entries = self.d["entries"]
        self.by_han = defaultdict(list)
        for e in self.entries.values():
            self.by_han[e["han"]].append(e)
        self.hanroman = self.d["hanroman"]
        self.max_word = max(len(k) for k in self.hanroman)
        # sentence index for exact example matching
        self.ex_by_han = {}
        for eid, exs in self.d["examples"].items():
            for x in exs:
                self.ex_by_han.setdefault(x["han"], x)

    def readings(self, han):
        rs = []
        for e in self.by_han.get(han, []):
            rs += e["romans"]
            rs += self.d["alt"].get(e["id"], [])
        rs += self.hanroman.get(han, [])
        seen, out = set(), []
        for r in rs:
            if r not in seen:
                seen.add(r); out.append(r)
        return out


if __name__ == "__main__":
    D = Dict()
    print(len(D.entries), len(D.ex_by_han), D.readings("目"), D.readings("目屎"), D.readings("毋捌"))
