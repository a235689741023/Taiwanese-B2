"""Usage: .venv/bin/python pipeline/lookup.py 詞1 [詞2 ...]  |  --roman tsi̍t  |  --zh 華語關鍵字
Prints MOE dictionary readings, definitions and one example for each query."""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from dictionary import Dict
D = Dict()
args = sys.argv[1:]
mode = "han"
for a in args:
    if a in ("--roman", "--zh"):
        mode = a[2:]; continue
    if mode == "han":
        es = D.by_han.get(a, [])
    elif mode == "roman":
        es = [e for e in D.entries.values() if a in e["romans"]]
    else:
        es = [e for e in D.entries.values() if any(a in s["df"] for s in D.d["senses"].get(e["id"], []))][:15]
    if not es:
        print(f"{a}: (辭典無此詞目)"); continue
    for e in es[:6]:
        defs = "；".join(s["df"] for s in D.d["senses"].get(e["id"], [])[:2])
        ex = D.d["examples"].get(e["id"], [])
        exs = f"  例：{ex[0]['han']} {ex[0]['roman']}（{ex[0]['zh']}）" if ex else ""
        print(f"{e['han']} [{e['roman']}] {defs}{exs}")
