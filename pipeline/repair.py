"""Repair textbook Tâi-lô (lost U+030D, m̄/n̄g artefacts, missing glyphs) against the MOE dictionary."""
import re, sys, os
from functools import lru_cache
sys.path.insert(0, os.path.dirname(__file__))
from tailo import fix_textbook_artifacts, mark_gaps, mark_gaps_variants, syllables, compatible, nfc, nfd, toneless, is_valid_syllable

HAN = re.compile(r"[㐀-鿿豈-﫿\U00020000-\U0003ffff]")
LAT = re.compile(r"[A-Za-z0-9]+")


def strip_tag(r):
    return re.sub(r"【.*?】", "", r).strip()


class Repairer:
    def __init__(self, D):
        self.D = D

    def readings(self, han):
        return [strip_tag(r) for r in self.D.readings(han)]

    def units(self, han):
        """Split Han string into CJK chars and latin/digit runs; drop punctuation."""
        out = []
        i = 0
        while i < len(han):
            ch = han[i]
            if HAN.match(ch) or ch in "〇":
                out.append(ch); i += 1
            else:
                m = LAT.match(han, i)
                if m:
                    out.append(m.group(0)); i = m.end()
                else:
                    i += 1
        return out

    def align(self, units, syl):
        D = self
        n, m = len(units), len(syl)

        @lru_cache(maxsize=None)
        def go(i, j):
            if i == n:
                return () if j == m else None
            u = units[i]
            if not HAN.match(u):  # latin run: consume one or more syllables literally
                for k in range(1, 4):
                    if j + k <= m and toneless("".join(syl[j:j + k])).replace("-", "") == u.lower():
                        rest = go(i + 1, j + k)
                        if rest is not None:
                            return tuple(syl[j:j + k]) + rest
                return None
            for L in range(min(8, n - i), 0, -1):
                w = "".join(units[i:i + L])
                if not all(HAN.match(c) for c in w):
                    continue
                for r in D.readings(w):
                    rs = syllables(r)
                    k = len(rs)
                    if j + k <= m and all(compatible(a, b) for a, b in zip(syl[j:j + k], rs)):
                        rest = go(i + L, j + k)
                        if rest is not None:
                            return tuple(rs) + rest
            return None
        return go(0, 0)

    def repair(self, han, roman):
        r0 = fix_textbook_artifacts(roman)
        if not re.search(r"[a-z]", toneless(r0)):
            return r0, "empty"
        variants = mark_gaps_variants(r0)
        for r in variants:
            syl = syllables(r)
            dsyl = None
            for cand in self.readings(han.strip("。！？，")):
                cs = syllables(cand)
                if len(cs) == len(syl) and all(compatible(a, b) for a, b in zip(syl, cs)):
                    dsyl = cs
                    break
            if dsyl is None:
                dsyl = self.align(tuple(self.units(han)), tuple(syl))
            if dsyl is not None:
                return self.substitute(r, syl, dsyl), "dict"
        r = variants[0]
        syl = syllables(r)
        ok = "#" not in r and all(is_valid_syllable(s) for s in syl)
        return r.replace("#", "?"), ("unverified" if ok else "broken")

    def substitute(self, r, syl, dsyl):
        out, pos = [], 0
        for a, b in zip(syl, dsyl):
            a_core = a.lstrip("-")
            idx = r.find(a_core, pos)
            if idx < 0:
                return r.replace("#", "?")
            b_core = b.lstrip("-")
            if a_core[:1].isupper():
                b_core = b_core[:1].upper() + b_core[1:]
            out.append(r[pos:idx]); out.append(b_core)
            pos = idx + len(a_core)
        out.append(r[pos:])
        return nfc("".join(out))


if __name__ == "__main__":
    from dictionary import Dict
    R = Repairer(Dict())
    for h, r in [("目屎", "b k-sái"), ("毋捌", " -bat"), ("一甌茶", "ts t au tê"), ("後日", "āu--j t"),
                 ("我承認這項代誌是我毋著。", "Guá sîng-jīn tsit hāng tāi-tsì sī guá mˉ -tioh. "),
                 ("恁兩个莫閣冤家矣啦！", "Lín nnˉg ê mài koh uan-ke--ah--lah!"),
                 ("逐家咧開講，講甲笑咍咍。", "Tak-ke teh khai-káng, kóng kah tshiò-hai-hai."),
                 ("尪仔物", "ang-á-m h"), ("明仔載才閣講。", "Bîn-á-tsài tsiah koh kóng.")]:
        print(h, "|", r, "=>", R.repair(h, r))
