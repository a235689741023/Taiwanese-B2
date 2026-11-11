"""Minimal ODS reader (stdlib only): returns {sheet_name: [rows]}."""
import zipfile, xml.etree.ElementTree as ET

NS = {
    "table": "urn:oasis:names:tc:opendocument:xmlns:table:1.0",
    "text": "urn:oasis:names:tc:opendocument:xmlns:text:1.0",
    "office": "urn:oasis:names:tc:opendocument:xmlns:office:1.0",
}
T = "{%s}" % NS["table"]
X = "{%s}" % NS["text"]


def _cell_text(cell):
    parts = []
    for p in cell.iter(X + "p"):
        buf = []
        def walk(el):
            if el.text:
                buf.append(el.text)
            for ch in el:
                if ch.tag == X + "s":
                    buf.append(" " * int(ch.get(X + "c", "1")))
                elif ch.tag == X + "line-break":
                    buf.append("\n")
                else:
                    walk(ch)
                if ch.tail:
                    buf.append(ch.tail)
        walk(p)
        parts.append("".join(buf))
    return "\n".join(parts)


def read_ods(path):
    with zipfile.ZipFile(path) as z:
        root = ET.fromstring(z.read("content.xml"))
    out = {}
    for table in root.iter(T + "table"):
        rows = []
        for row in table.iter(T + "table-row"):
            rrep = int(row.get(T + "number-rows-repeated", "1"))
            cells = []
            for cell in row:
                if cell.tag not in (T + "table-cell", T + "covered-table-cell"):
                    continue
                rep = int(cell.get(T + "number-columns-repeated", "1"))
                txt = _cell_text(cell)
                if txt == "":
                    v = cell.get("{%s}value" % NS["office"])
                    if v is not None:
                        txt = v[:-2] if v.endswith(".0") else v
                cells.extend([txt] * min(rep, 50))
            while cells and cells[-1] == "":
                cells.pop()
            if not cells:
                continue
            rows.extend([cells] * min(rrep, 1))
        out[table.get(T + "name")] = rows
    return out
