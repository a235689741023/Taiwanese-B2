"""Tâi-lô helpers: normalisation, syllable split, tone handling, textbook repair."""
import re, unicodedata

MARKS = {"́": 2, "̀": 3, "̂": 5, "̌": 6, "̄": 7, "̍": 8, "̋": 9}
COMB = re.compile(r"[̀-ͯ]")
SEP = re.compile(r"[\s\-]+")
PUNCT = re.compile(r"[.,!?;:\"'“”‘’（）()，。！？；：、…「」『』]")


def nfd(s):
    return unicodedata.normalize("NFD", s)


def nfc(s):
    return unicodedata.normalize("NFC", s)


SPACING = {"\u02c9": "\u0304", "\u02c6": "\u0302", "\u02ca": "\u0301", "\u02cb": "\u0300", "\u02c7": "\u030c"}


def fix_textbook_artifacts(r):
    """Fix systematic PDF extraction artefacts (tone marks rendered as spacing modifier letters, wrapped hyphens)."""
    r = r.replace("\uff08", "(").replace("\uff09", ")")
    r = re.sub(r"([nN])n\s*\u02c9\s*g", lambda m: m.group(1) + "\u0304g", r)  # nnˉg -> n̄g
    r = re.sub(r"([mMnN])\s*([\u02c9\u02c6\u02ca\u02cb\u02c7])(?: +(?=[-g]))?", lambda m: m.group(1) + SPACING[m.group(2)], r)
    for k, v in SPACING.items():
        r = r.replace(k, v)
    r = re.sub(r"-\s+(?=[A-Za-z])", "-", r)
    r = re.sub(r"[ \t]+", " ", r).strip()
    return nfc(r)


def toneless(s):
    return COMB.sub("", nfd(s)).lower()


def syllables(r):
    """Split romanisation into syllables, keeping '--' neutral-tone prefix attached."""
    r = PUNCT.sub(" ", r)
    r = r.replace("--", " \x00")
    out = []
    for tok in SEP.split(r):
        if not tok:
            continue
        out.append(tok.replace("\x00", "--"))
    return out


VOWEL = re.compile(r"[aeiou]|^m$|^ng$|^n$", re.I)


def is_valid_syllable(s):
    t = toneless(s).lstrip("-")
    if not t:
        return False
    if re.fullmatch(r"(p|ph|m|b|t|th|n|l|k|kh|ng|g|h|ts|tsh|s|j)?(m|ng)(h)?", t):
        return True
    return bool(re.search(r"[aeiou]", t))


def tone_of(s):
    d = nfd(s)
    for ch in d:
        if ch in MARKS:
            return MARKS[ch]
    t = toneless(s)
    return 4 if t and t[-1] in "ptkh" else 1


def compatible(tb, dic):
    """Is textbook syllable `tb` (possibly with lost marks / '#' gaps) compatible with dictionary syllable `dic`?"""
    tbn, dn = nfd(tb.lower()).lstrip("-"), nfd(dic.lower()).lstrip("-")
    if "#" in tbn:
        pat = "^" + re.escape(tbn).replace("\\#", "(?:[a-z]?[\u0300-\u036f]*)") + "$"
        # allow textbook letters to have lost combining marks too
        pat = pat.replace("[a-z]", "[a-z]")
        return re.match(pat, dn) is not None or re.match(pat, COMB.sub("", dn) ) is not None
    if toneless(tbn) != toneless(dn):
        return False
    t1, t2 = tone_of(tbn), tone_of(dn)
    if t1 == t2:
        return True
    # lost U+030D: textbook shows tone 4 (unmarked checked) where dict has 8
    if t1 == 4 and t2 == 8:
        return True
    return False


def _bad(piece):
    t = toneless(piece).strip(".,!?;:)(")
    return bool(t) and re.fullmatch(r"[a-z]+", t) is not None and not is_valid_syllable(t)


def mark_gaps_variants(r, limit=16):
    """Candidate readings of a romanisation whose V̍ / m̄ glyphs were lost (rendered as nothing or a space).
    '#' marks the lost glyph. e.g. 'b k' -> ['b#k'], 'i h' -> ['i#h', 'i #h'], ' -bat' -> ['#-bat']."""
    r = r.strip()
    r = re.sub(r"^\s*(?=-)", "#", r)
    parts = re.split(r"(\s+|-+)", r)
    i = 0
    while i + 2 < len(parts):  # two consonant-only fragments around a space -> one syllable
        if parts[i + 1].isspace() and _bad(parts[i]) and _bad(parts[i + 2]):
            parts[i:i + 3] = [parts[i] + "#" + parts[i + 2]]
            continue
        i += 2
    variants = [parts]
    for j in range(0, len(parts), 2):
        if not _bad(parts[j]):
            continue
        nxt = []
        for v in variants:
            a = list(v); a[j] = "#" + a[j]
            nxt.append(a)
            if j >= 2 and v[j - 1].isspace() and "#" not in v[j - 2]:
                b = list(v); b[j] = v[j - 2] + "#" + v[j]; b[j - 2] = ""; b[j - 1] = ""
                nxt.append(b)
        variants = nxt[:limit]
    return ["".join(v) for v in variants]


def mark_gaps(r):
    return mark_gaps_variants(r)[0]
