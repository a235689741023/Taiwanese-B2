"""Join parsed textbook data with the MOE dictionary; repair Tâi-lô; select & copy audio; write app data."""
import json, os, re, sys, zipfile, shutil, random
from collections import Counter, defaultdict
sys.path.insert(0, os.path.dirname(__file__))
from dictionary import Dict
from repair import Repairer, strip_tag
from tailo import syllables, compatible, nfc, fix_textbook_artifacts

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data-raw")
APP = os.path.join(ROOT, "app", "public")
OUT_DATA = os.path.join(APP, "data")
OUT_AUDIO = os.path.join(APP, "audio")
REPORT = os.path.join(ROOT, "content", "report.md")

# manual fixes where the PDF text layer lost the whole romanisation (verified with pipeline/lookup.py)
VOCAB_OVERRIDES = {"w1-219": "m̄", "w2-173": "m̄", "w1-347": "ta̍uh", "w2-085": "ka-lún-sún"}

PUA = {"": "𪜶", "": "𬦰", "": "𫟂", "": "𫝛", "": "𫞼", "": "𫝏"}


def depua(o):
    if isinstance(o, str):
        for k, v in PUA.items():
            o = o.replace(k, v)
        return o
    if isinstance(o, list):
        return [depua(x) for x in o]
    if isinstance(o, dict):
        return {k: depua(v) for k, v in o.items()}
    return o


def load(name):
    with open(os.path.join(RAW, "parsed", name + ".json")) as f:
        return depua(json.load(f))


def safe(name):
    return re.sub(r"[()]", "_", name).strip("_").replace("__", "_")


class AudioPicker:
    def __init__(self):
        self.zs = {k: zipfile.ZipFile(os.path.join(RAW, f"{k}-mp3.zip")) for k in ("sutiau", "leku")}
        self.idx = {k: {os.path.basename(n)[:-4]: n for n in z.namelist() if n.endswith(".mp3")} for k, z in self.zs.items()}
        self.want = defaultdict(set)
        self.tb = set(os.listdir(os.path.join(RAW, "tb-audio"))) if os.path.isdir(os.path.join(RAW, "tb-audio")) else set()

    def su(self, name):
        if name and name in self.idx["sutiau"]:
            self.want["sutiau"].add(name); return "su/" + safe(name) + ".mp3"

    def le(self, name):
        if name and name in self.idx["leku"]:
            self.want["leku"].add(name); return "le/" + safe(name) + ".mp3"

    def tbf(self, fn):
        if fn in self.tb:
            self.want["tb"].add(fn); return "tb/" + fn

    def copy(self):
        for k, sub in (("sutiau", "su"), ("leku", "le")):
            d = os.path.join(OUT_AUDIO, sub); os.makedirs(d, exist_ok=True)
            for n in self.want[k]:
                dst = os.path.join(d, safe(n) + ".mp3")
                if not os.path.exists(dst):
                    with self.zs[k].open(self.idx[k][n]) as src, open(dst, "wb") as o:
                        shutil.copyfileobj(src, o)
        d = os.path.join(OUT_AUDIO, "tb"); os.makedirs(d, exist_ok=True)
        for fn in self.want["tb"]:
            dst = os.path.join(d, fn)
            if not os.path.exists(dst):
                shutil.copy(os.path.join(RAW, "tb-audio", fn), dst)
        ex = os.path.join(OUT_AUDIO, "exam"); os.makedirs(ex, exist_ok=True)
        for sub in ("聽力", "口語", "書寫"):
            for f in os.listdir(os.path.join(ROOT, "B_example_full", sub)):
                if f.endswith(".mp3") and not os.path.exists(os.path.join(ex, f)):
                    shutil.copy(os.path.join(ROOT, "B_example_full", sub, f), os.path.join(ex, f))


def match_entry(D, han, roman):
    """Dictionary entry with same Han whose reading matches the (repaired) roman."""
    cands = D.by_han.get(han, [])
    if not cands:
        for v in D.d["variants"].get(han, []):
            cands += D.by_han.get(v, [])
    s1 = syllables(roman)
    best = None
    for e in cands:
        for r in e["romans"]:
            s2 = syllables(strip_tag(r))
            if len(s1) == len(s2) and all(compatible(a, b) for a, b in zip(s1, s2)):
                if e["type"] == "主詞目" or best is None:
                    best = e
                    if e["type"] == "主詞目":
                        return e
    return best


def main():
    D = Dict(); R = Repairer(D); A = AudioPicker()
    stats = Counter(); problems = []
    links = json.load(open(os.path.join(RAW, "audio_links.json")))

    # ---------- vocabulary ----------
    vocab = []
    for w in load("vocab"):
        roman, st = R.repair(w["han"], w["romanRaw"])
        if w["id"] in VOCAB_OVERRIDES:
            roman, st = VOCAB_OVERRIDES[w["id"]], "dict"
        stats["vocab_" + st] += 1
        if st in ("broken", "unverified"):
            problems.append(f"| {w['id']} | {w['han']} | `{w['romanRaw']}` | `{roman}` | {st} |")
        e = match_entry(D, w["han"], roman)
        item = dict(id=w["id"], book=w["book"], num=w["num"], han=w["han"], roman=roman, zh=w["zh"])
        if st != "dict":
            item["check"] = st
        if e:
            stats["vocab_dict_entry"] += 1
            item["dictId"] = e["id"]
            item["defs"] = [dict(pos=s["pos"], df=s["df"]) for s in D.d["senses"].get(e["id"], [])][:3]
            exs = [x for x in D.d["examples"].get(e["id"], []) if len(x["han"]) >= 4][:2]
            item["ex"] = [dict(han=x["han"], roman=x["roman"], zh=x["zh"], audio=A.le(x["audio"])) for x in exs]
            item["audio"] = A.su(e["audio"])
            syn = D.d["syn"].get(e["id"], [])
            if syn:
                item["syn"] = syn[:4]
        tbf = f"02{w['book']:02d}_{w['num']:03d}_A.mp3"
        item["audioTb"] = A.tbf(tbf)
        if not item.get("audio"):
            item["audio"] = item["audioTb"]
        if not item.get("audio"):
            stats["vocab_no_audio"] += 1
        ext = []
        for x in w["ext"]:
            r2, st2 = R.repair(x["han"], x["roman"])
            stats["ext_" + st2] += 1
            e2 = match_entry(D, x["han"], r2)
            ext.append(dict(han=x["han"], roman=r2, audio=A.su(e2["audio"]) if e2 else None,
                            zh=(D.d["senses"].get(e2["id"], [{}])[0].get("df") if e2 else None)))
        item["ext"] = ext
        vocab.append(item)

    # ---------- sentences ----------
    sents = []
    for s in load("sentences"):
        roman, st = R.repair(s["han"], s["romanRaw"])
        stats["sent_" + st] += 1
        if st == "broken":
            problems.append(f"| {s['id']} | {s['han']} | `{s['romanRaw']}` | `{roman}` | {st} |")
        _, cat, num = s["id"].split("-")
        # textbook file name: 030B_CC_NN_PP.mp3 ; page unknown -> look up by prefix
        pref = f"030{s['book']}_{cat}_{num}_"
        f = next((x for x in sorted(A.tb) if x.startswith(pref)), None)
        item = dict(id=s["id"], book=s["book"], cat=s["cat"], num=s["num"], han=s["han"], roman=roman, zh=s["zh"],
                    audio=A.tbf(f) if f else None)
        if st != "dict":
            item["check"] = st
        if not item["audio"]:
            stats["sent_no_audio"] += 1
        sents.append(item)

    # ---------- articles ----------
    arts = load("articles")
    for a in arts:
        for para in a["paras"]:
            for seg in para:
                m = re.search(r"\d?作\s*者：(\S+)$", seg["t"])
                if m:
                    a["author"] = a["author"] or m.group(1)
                    seg["t"] = seg["t"][:m.start()]
                if a["id"] == "a1-19":  # 䡾 (tsng) glyph missing in the PDF text layer
                    seg["t"] = re.sub(r"(?<=[水个。軀破倒])\u3000", "䡾", seg["t"]).replace("\u3000(", "䡾(")
            para[:] = [seg for seg in para if seg["t"] or seg.get("r")]
    for bk in (1, 2):
        L = [x for x in links[f"04《讀文章蓋趣味 0{bk}》"]]
        whole = [x["file"] for x in L if re.fullmatch(r"040\d-\d+\.mp3", x["file"])]
        mine = [a for a in arts if a["book"] == bk]
        stats[f"articles{bk}"] = len(mine); stats[f"article_audio{bk}"] = len(whole)
        for a, f in zip(mine, whole):
            a["audio"] = A.tbf(f)
            page = f[5:-4]
            vfiles = sorted(x["file"] for x in L if re.fullmatch(rf"040{bk}-{int(page) + 1:02d}-\d+\.mp3", x["file"]))
            for v, vf in zip(a["vocab"], vfiles):
                v["audio"] = A.tbf(vf)
            gf = f"040{bk}-{int(page) + 1:02d}-A.mp3"
            if a.get("grammar") and gf in A.tb:
                a["grammarAudio"] = A.tbf(gf)
        if len(whole) != len(mine):
            problems.append(f"| articles book {bk} | | {len(mine)} parsed vs {len(whole)} audio | | check |")

    # ---------- tone drill pool: monosyllabic headwords ----------
    tones = []
    for v in vocab:
        if len(syllables(v["roman"])) == 1 and v.get("audio", "") and v["audio"].startswith("su/"):
            tones.append(dict(id=v["id"], han=v["han"], roman=v["roman"], audio=v["audio"]))

    A.copy()
    os.makedirs(OUT_DATA, exist_ok=True)
    for name, data in (("vocab", vocab), ("sentences", sents), ("articles", arts), ("tones", tones)):
        with open(os.path.join(OUT_DATA, name + ".json"), "w") as f:
            json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    # AI-authored (non-official) practice content + official sample paper
    ai = os.path.join(ROOT, "content", "ai")
    qs = []
    for f in ("article_questions_book1.json", "article_questions_book2.json"):
        fp = os.path.join(ai, f)
        if os.path.exists(fp):
            qs += json.load(open(fp))
    with open(os.path.join(OUT_DATA, "questions.json"), "w") as f:
        json.dump(qs, f, ensure_ascii=False, separators=(",", ":"))
    pp = os.path.join(ai, "prompts.json")
    prompts = json.load(open(pp)) if os.path.exists(pp) else dict(situational=[], picture=[], speech=[], sentence=[], feedback=[], essay=[], grammar=[])
    with open(os.path.join(OUT_DATA, "prompts.json"), "w") as f:
        json.dump(prompts, f, ensure_ascii=False, separators=(",", ":"))
    shutil.copy(os.path.join(ROOT, "content", "exam-sample.json"), os.path.join(OUT_DATA, "exam.json"))
    stats["ai_article_questions"] = sum(len(x["questions"]) for x in qs)
    stats["ai_prompts"] = sum(len(v) for v in prompts.values())

    # audio manifest for offline download
    man = []
    for root, _, files in os.walk(OUT_AUDIO):
        for fn in files:
            p = os.path.relpath(os.path.join(root, fn), APP)
            g = "exam" if "/exam/" in p else ("articles" if "/tb/04" in p else "core")
            man.append(dict(p=p, s=os.path.getsize(os.path.join(root, fn)), g=g))
    with open(os.path.join(OUT_DATA, "audio-manifest.json"), "w") as f:
        json.dump(man, f, separators=(",", ":"))

    # ---------- report ----------
    random.seed(7)
    sample = random.sample(vocab, 15) + random.sample(sents, 15)
    os.makedirs(os.path.dirname(REPORT), exist_ok=True)
    with open(REPORT, "w") as f:
        f.write("# 資料前處理比對報告\n\n## 統計\n\n")
        for k, v in sorted(stats.items()):
            f.write(f"- {k}: {v}\n")
        f.write(f"- 音檔總數: {len(man)}；總大小: {sum(x['s'] for x in man) / 1e6:.1f} MB\n")
        f.write("\n說明：`dict` = 已依教育部辭典校正或確認；`unverified` = 臺羅格式正常但辭典比對不到（保留課本原文）；`broken` = 有缺字或缺調號且無法自動補正，需人工檢查。\n")
        f.write("\n## 待人工檢查\n\n| id | 漢字 | 課本原始抽取 | 輸出 | 狀態 |\n|---|---|---|---|---|\n")
        f.write("\n".join(problems) + "\n")
        f.write("\n## 隨機抽樣 30 筆（請對照課本與音檔）\n\n| id | 漢字 | 臺羅 | 華語 | 音檔 |\n|---|---|---|---|---|\n")
        for x in sample:
            f.write(f"| {x['id']} | {x['han']} | {x['roman']} | {x['zh']} | {x.get('audio') or '—'} |\n")
    print(dict(stats)); print("audio files", len(man), round(sum(x['s'] for x in man) / 1e6, 1), "MB")


if __name__ == "__main__":
    main()
