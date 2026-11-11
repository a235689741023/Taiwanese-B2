"""Parse 《咱來學臺灣閩南語》 books into JSON (raw textbook romanisation kept + repaired version)."""
import json, os, re, sys
import pymupdf
sys.path.insert(0, os.path.dirname(__file__))
from tailo import nfc, fix_textbook_artifacts

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LR = os.path.join(ROOT, "Learning Resource")
HEADER = re.compile(r"｜")
CATS = ["人際", "交通", "食物", "動作", "徛家", "天文地理", "日常用品", "生活娛樂", "行業生產",
        "品行樣貌", "思想行為", "時間空間", "動物植物", "教育文化", "經濟用度", "醫療健康"]


def book_text(name):
    d = pymupdf.open(os.path.join(LR, name + ".pdf"))
    return [p.get_text() for p in d]


# ---------------- vocabulary ----------------
ITEM = re.compile(r"([^、()（）]+?)\s*[（(]([^()（）]*)[)）]")


def parse_vocab(name, level):
    pages = book_text(name)
    lines = []
    for t in pages[2:]:
        for ln in t.split("\n"):
            if HEADER.search(ln) or not ln.strip():
                continue
            lines.append(ln.rstrip())
    text = "\n".join(lines)
    blocks = re.split(r"\n(?=\d{3}\s)", "\n" + text)
    out = []
    for b in blocks:
        b = b.strip()
        m = re.match(r"(\d{3})\s+(.*)", b, re.S)
        if not m:
            continue
        num, rest = int(m.group(1)), m.group(2)
        if "華語" not in rest:
            continue
        head, tail = rest.split("華語", 1)
        zh, _, ext = tail.partition("詞彙")
        hp = head.strip().split(None, 1)
        han = hp[0].strip()
        roman = hp[1].strip() if len(hp) > 1 else ""
        roman = re.sub(r"\s*\n\s*", " ", roman)
        ext = re.sub(r"\s*\n\s*", "", ext.strip())
        items = []
        for seg in re.split(r"[、]|(?<=\))佮|(?<=）)佮", ext):
            mm = ITEM.search(seg)
            if mm:
                items.append(dict(han=mm.group(1).strip(), roman=mm.group(2).strip()))
        out.append(dict(id=f"w{level}-{num:03d}", book=level, num=num, han=han,
                        romanRaw=roman, zh=re.sub(r"\s+", "", zh), ext=items))
    return out


# ---------------- sentences ----------------
def is_latin_line(t):
    return bool(re.match(r"^[A-Za-zÀ-ɏḀ-ỿ]", t.strip()))


def parse_sentences(name, bookno):
    d = pymupdf.open(os.path.join(LR, name + ".pdf"))
    items = []
    for pi, p in enumerate(d):
        lines = []
        for b in p.get_text("dict")["blocks"]:
            for l in b.get("lines", []):
                t = "".join(s["text"] for s in l["spans"]).strip()
                if t and not HEADER.search(t):
                    x0, y0, x1, y1 = l["bbox"]
                    lines.append(dict(t=t, x=x0, y=(y0 + y1) / 2, col=0 if x0 < p.rect.width / 2 else 1))
        nums = [l for l in lines if re.fullmatch(r"\d{1,3}", l["t"])]
        for col in (0, 1):
            for n in sorted([l for l in nums if l["col"] == col], key=lambda l: l["y"]):
                same = [l for l in lines if l["col"] == col and l is not n]
                han = [l for l in same if -38 < l["y"] - n["y"] < -8 and not is_latin_line(l["t"]) and not l["t"].startswith("華")]
                rom = sorted([l for l in same if -12 < l["y"] - n["y"] < 14 and is_latin_line(l["t"]) and l["x"] > n["x"]], key=lambda l: l["y"])
                zh = [l for l in same if 12 < l["y"] - n["y"] < 42 and l["t"].startswith("華")]
                if not han or not zh:
                    continue
                items.append(dict(page=pi, col=col, y=n["y"], num=int(n["t"]),
                                  han=min(han, key=lambda l: abs(l["y"] - n["y"] + 23))["t"],
                                  romanRaw=" ".join(l["t"] for l in rom),
                                  zh=zh[0]["t"][1:].strip()))
    # drop the 3 sample items on the editorial-notes page, then assign categories by numbering resets
    while items and items[0]["han"] in ("漢字", "對應華語") or (items and items[0]["page"] < 2):
        items.pop(0)
    starts = [i for i, it in enumerate(items) if it["num"] == 1]
    if starts:
        items = items[starts[0]:]
    cat, prev, out = -1, 10**9, []
    for it in items:
        if it["num"] <= prev and it["num"] <= 2:
            cat += 1
        prev = it["num"]
        it["cat"] = CATS[min(cat, 15)]
        it["id"] = f"s{bookno}-{cat + 1:02d}-{it['num']:02d}"
        it["book"] = bookno
        for k in ("page", "col", "y"):
            it.pop(k)
        out.append(it)
    return out


# ---------------- articles ----------------
SECTIONS = {1: ["臺灣好𨑨迌", "臺灣好食物", "臺灣人情味", "臺灣文史古", "臺灣心適代"],
            2: ["臺灣好𨑨迌", "臺灣人情味", "臺灣文史古", "臺灣心適代"]}


def ruby_segments(body):
    """Turn '身懸(kuân)' annotations into segments [{t, r?}] using syllable count of the annotation."""
    segs, pos = [], 0
    for m in re.finditer(r"[(（]([^()（）]*[A-Za-zÀ-ỿ][^()（）]*)[)）]\s?", body):
        roman = fix_textbook_artifacts(m.group(1))
        nsyl = len([s for s in re.split(r"[\s\-]+", roman.replace("--", "-")) if s])
        before = body[pos:m.start()]
        # take nsyl CJK chars from the end of `before`
        chars, i = 0, len(before)
        while i > 0 and chars < nsyl:
            i -= 1
            if re.match(r"[㐀-鿿\U00020000-\U0003ffff]", before[i]):
                chars += 1
            else:
                break
        if before[:i]:
            segs.append(dict(t=before[:i]))
        segs.append(dict(t=before[i:], r=roman))
        pos = m.end()
    if body[pos:]:
        segs.append(dict(t=body[pos:]))
    return segs


def parse_articles(name, bookno):
    doc = pymupdf.open(os.path.join(LR, name + ".pdf"))
    out, sec = [], -1
    for pi, page in enumerate(doc):
        t = page.get_text()
        lines = [l for l in t.split("\n") if l.strip() and not HEADER.search(l)]
        n = len("".join(lines))
        if 0 < n < 40 and pi > 1:
            sec += 1  # section divider page
            continue
        if sec < 0 or n < 300:
            continue
        W = page.rect.width
        spans = [(round(s["size"], 1), s["text"], l["bbox"]) for b in page.get_text("dict")["blocks"]
                 for l in b.get("lines", []) for s in l["spans"] if s["text"].strip() and l["bbox"][1] > 45]
        big = max(sz for sz, tx, _ in spans if re.search(r"[\u3400-\u9fff]", tx))
        tspans = sorted([x for x in spans if x[0] == big], key=lambda x: (round(x[2][1]), x[2][0]))
        title = "".join(tx for _, tx, _ in tspans).strip()
        tboxes = [bb for _, _, bb in tspans]
        blocks = [b for b in page.get_text("blocks") if b[1] > 45 and b[4].strip()]
        def is_title(b):
            return any(abs(b[1] - bb[1]) < 6 and b[0] <= bb[0] + 2 and b[2] >= bb[2] - 2 for bb in tboxes)
        lab_v = next((b for b in blocks if b[4].strip() == "詞彙學習"), None)
        lab_g = next((b for b in blocks if b[4].strip() == "文法學習"), None)
        src_i = next((i for i, b in enumerate(blocks) if b[4].strip().startswith("※本文出處")), None)
        src_b = blocks[src_i] if src_i is not None else None
        body, vocab, gram, source, author, note = [], [], [], "", "", ""
        for b in blocks:
            tx = b[4].strip()
            if is_title(b) or tx in ("詞彙學習", "文法學習") or re.fullmatch(r"\d+", tx):
                continue
            if tx.startswith("作者"):
                author = tx.split("：", 1)[-1].strip(); continue
            if tx.startswith("註"):
                note = tx.replace("\n", ""); continue
            if src_b is not None and (b is src_b or (abs(b[0] - src_b[0]) < 15 and 0 < b[1] - src_b[1] < 20)):
                source += tx.replace("\n", ""); continue
            m = re.match(r"\d+\.【(.*?)】(.*?)：(.*)", tx, re.S)
            if m:
                vocab.append(dict(han=m.group(1), roman=fix_textbook_artifacts(m.group(2)), zh=m.group(3).replace("\n", "")))
                continue
            if lab_g is not None and b[0] > W / 2 - 20 and b[1] > lab_g[1] and (src_b is None or b[1] < src_b[1]):
                gram.append(tx.replace("\n", "")); continue
            if lab_v is not None and b[0] > W / 2 - 20 and b[1] > lab_v[1] and vocab and (lab_g is None or b[1] < lab_g[1]):
                vocab[-1]["zh"] += tx.replace("\n", ""); continue
            body.append(b)
        body.sort(key=lambda b: (b[0] > W / 2 - 20, b[1]))
        text = ""
        for b in body:
            for l in b[4].split("\n"):
                if not l.strip():
                    continue
                if l.startswith("\u3000\u3000") or l.startswith("\u3000"):
                    text += "\n" + l.strip("\u3000 ")
                else:
                    text += l.strip()
        paras = [p.strip() for p in text.split("\n") if p.strip()]
        out.append(dict(id=f"a{bookno}-{len(out) + 1:02d}", book=bookno,
                        section=SECTIONS[bookno][min(sec, len(SECTIONS[bookno]) - 1)],
                        title=title, author=author, paras=[ruby_segments(p) for p in paras],
                        vocab=vocab, grammar="".join(gram), note=note,
                        source=source.replace("※本文出處：", "")))
    return out


if __name__ == "__main__":
    os.makedirs(os.path.join(ROOT, "data-raw", "parsed"), exist_ok=True)
    res = dict(
        vocab=parse_vocab("02《學語詞真輕鬆 01》", 1) + parse_vocab("02《學語詞真輕鬆 02》", 2),
        sentences=parse_sentences("03《讀語句上簡單 01》", 1) + parse_sentences("03《讀語句上簡單 02》", 2),
        articles=parse_articles("04《讀文章蓋趣味 01》", 1) + parse_articles("04《讀文章蓋趣味 02》", 2),
    )
    for k, v in res.items():
        with open(os.path.join(ROOT, "data-raw", "parsed", k + ".json"), "w") as f:
            json.dump(v, f, ensure_ascii=False, indent=1)
    from collections import Counter
    print("vocab", Counter(x["book"] for x in res["vocab"]))
    print("sentences", Counter(x["book"] for x in res["sentences"]), Counter(x["cat"] for x in res["sentences"]))
    print("articles", Counter((x["book"], x["section"]) for x in res["articles"]))
    print(res["vocab"][19], res["sentences"][5], sep="\n")
    a = res["articles"][0]; print(a["title"], a["author"], len(a["paras"]), a["vocab"][:2], a["grammar"][:60], a["source"])
