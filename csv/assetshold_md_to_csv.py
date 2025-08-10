#!/usr/bin/env python3
#python md_to_portfolio_csv_from_template.py "資産物ポートフォリオ管理シート.md" "資産物ポートフォリオ管理シート (1).md"

import re, csv, json, math
from pathlib import Path
from typing import List, Dict, Any, Optional

TEMPLATE = Path("portfolio_template.csv")

def read_template_header(path: Path):
    with path.open("r", encoding="utf-8") as f:
        reader = csv.reader(f)
        return next(reader)

def to_number(s: str) -> Optional[float]:
    if s is None: return None
    s = s.strip()
    if not s or s in {"—","-"}: return None
    s = s.replace(",", "").replace("円","").replace("%","").replace("+","").replace("±","")
    s = s.replace("　"," ").strip()
    m = re.search(r'[-+]?\d+(?:\.\d+)?', s)
    if not m: return None
    try: return float(m.group(0))
    except ValueError: return None

def floor_2(x: Optional[float]) -> Optional[float]:
    if x is None: return None
    return math.floor(x*100.0)/100.0

def fmt1(x: Optional[float]) -> str:
    if x is None: return ""
    return f"{x:.1f}"

def fmt2(x: Optional[float], floor=False) -> str:
    if x is None: return ""
    if floor: x = floor_2(x)
    return f"{x:.2f}"

def clean(s: Optional[str]) -> str:
    if s is None: return ""
    return s.strip()

def md_tables_from_section(lines, start_idx):
    i = start_idx + 1
    tables = []
    while i < len(lines):
        line = lines[i]
        if re.match(r"^#{1,6}\s", line): break
        if "|" in line and "---" in line and re.search(r"\|\s*-", line):
            header_idx = i-1
            tlines, j = [], header_idx
            while j < len(lines):
                if not lines[j].strip(): break
                if "|" in lines[j]:
                    tlines.append(lines[j]); j += 1
                else: break
            i = j
            rows = []
            for tl in tlines:
                parts = [c.strip() for c in tl.strip().strip("|").split("|")]
                rows.append(parts)
            rows = [r for r in rows if not all(re.match(r"^:?-{3,}:?$", c) for c in r)]
            if rows: tables.append(rows)
            continue
        i += 1
    return tables

def parse_sections(md_path: Path):
    text = md_path.read_text(encoding="utf-8")
    lines = text.splitlines()
    sections = {}
    mapping = {
        "gunpla": [r"^\s*###\s*2\.1.*ガンプラ|Gunpla"],
        "watches": [r"^\s*###\s*2\.2.*高級時計|Watches"],
        "precious": [r"^\s*###\s*2\.3.*貴金属|Precious\s*Metals"],
        "realestate": [r"^\s*###\s*2\.4.*不動産|Real\s*Estate"],
        "usstocks": [r"^\s*###\s*2\.5.*米国株|US\s*Stocks"],
        "jpstocks": [r"^\s*###\s*2\.6.*日本株|Japan\s*Stocks"],
        "cash": [r"^\s*###\s*2\.7.*(預金|Cash\s*Deposits)"],
    }
    for key, pats in mapping.items():
        starts = [i for i, ln in enumerate(lines) if any(re.search(p, ln, re.IGNORECASE) for p in pats)]
        tables = []
        for si in starts:
            tables.extend(md_tables_from_section(lines, si))
        if tables:
            sections[key] = tables
    return sections

def rows_from_md(md_files):
    out = []
    for md in md_files:
        if not md.exists(): continue
        secs = parse_sections(md)

        # Gunpla
        for t in secs.get("gunpla", []):
            for r in t[1:]:
                if len(r) < 6: continue
                out.append({
                    "class":"collection",
                    "category":"gunpla",
                    "name": clean(r[1]),
                    "book_value_jpy": int(to_number(r[3]) or 0),
                    "valuation_source":"manual",
                    "liquidity_tier":"L3",
                })

        # Watches
        for t in secs.get("watches", []):
            for r in t[1:]:
                if len(r) < 6: continue
                out.append({
                    "class":"watch",
                    "brand": clean(r[0]),
                    "model": clean(r[1]),
                    "ref": "" if r[2] == "—" else clean(r[2]),
                    "name": f"{clean(r[0])} {clean(r[1])}".strip(),
                    "book_value_jpy": int(to_number(r[3]) or 0),
                    "valuation_source":"manual",
                    "liquidity_tier":"L3",
                })

        # Precious metals
        for t in secs.get("precious", []):
            for r in t[1:]:
                if len(r) in (5,6):
                    if len(r) == 5:
                        metal, item = r[0], r[1]
                        weight = None
                        spot = to_number(r[3])
                    else:
                        metal, item = r[0], r[1]
                        weight = to_number(r[2])
                        spot = to_number(r[4])
                    unit = (spot/weight) if (spot and weight) else None
                    out.append({
                        "class":"precious_metal",
                        "name": clean(item),
                        "metal": clean(metal),
                        "weight_g": fmt1(weight) if weight is not None else "",
                        "unit_price_jpy": fmt2(unit, floor=True) if unit is not None else "",
                        "book_value_jpy": int(to_number(r[-3]) or 0) if len(r)>=5 else "",
                        "valuation_source":"manual",
                        "liquidity_tier":"L3",
                    })

        # Real estate
        for t in secs.get("realestate", []):
            for r in t[1:]:
                if len(r) < 11: continue
                out.append({
                    "class":"real_estate",
                    "name": clean(r[1]),
                    "address": clean(r[2]),
                    "land_area_sqm": to_number(r[3]) or "",
                    "building_area_sqm": to_number(r[4]) or "",
                    "book_value_jpy": int(to_number(r[8]) or 0),
                    "valuation_source":"manual",
                    "liquidity_tier":"L4",
                })

        # US stocks
        for t in secs.get("usstocks", []):
            hdr = [c.strip() for c in t[0]]
            for r in t[1:]:
                if len(r) < 5: continue
                if "口座" in hdr or "取引所" in hdr:
                    ticker = r[2]; name = r[3]; exch = r[4]; qty = to_number(r[5]); avg = to_number(r[6])
                else:
                    ticker = r[1]; name = r[2]; exch = ""; qty = to_number(r[3]); avg = to_number(r[4])
                out.append({
                    "class":"us_stock",
                    "name": clean(name),
                    "ticker": clean(ticker),
                    "exchange": clean(exch),
                    "quantity": qty if qty is not None else "",
                    "avg_price_usd": f"{avg:.2f}" if avg is not None else "",
                    "book_value_jpy": int(to_number(r[-3]) or 0),
                    "valuation_source":"manual",
                    "liquidity_tier":"L2",
                })

        # JP stocks
        for t in secs.get("jpstocks", []):
            for r in t[1:]:
                if len(r) < 10: continue
                code = r[1]; name = r[2]
                qty = to_number(r[4]); avg = to_number(r[5])
                out.append({
                    "class":"jp_stock",
                    "name": clean(name),
                    "code": clean(code),
                    "quantity": qty if qty is not None else "",
                    "avg_price_jpy": f"{avg:.2f}" if avg is not None else "",
                    "book_value_jpy": int(to_number(r[7]) or 0),
                    "valuation_source":"manual",
                    "liquidity_tier":"L2",
                })

        # Cash
        for t in secs.get("cash", []):
            for r in t[1:]:
                if len(r) < 4: continue
                cur = clean(r[0])
                if cur in {"合計","**合計**","—",""}: 
                    continue
                bal = to_number(r[1])
                out.append({
                    "class":"cash",
                    "currency": cur,
                    "balance": bal if bal is not None else "",
                    "valuation_source":"manual",
                    "liquidity_tier":"L1",
                    "name": f"Cash {cur}"
                })

    # Dedup
    seen, dedup = set(), []
    for r in out:
        cls = r.get("class","")
        if cls == "us_stock":
            key = (cls, r.get("ticker",""))
        elif cls == "jp_stock":
            key = (cls, r.get("code",""))
        elif cls == "precious_metal":
            key = (cls, r.get("metal",""), r.get("name",""))
        elif cls == "watch":
            key = (cls, r.get("brand",""), r.get("model",""), r.get("ref",""))
        elif cls == "real_estate":
            key = (cls, r.get("name",""), r.get("address",""))
        elif cls == "cash":
            key = (cls, r.get("currency",""))
        else:
            key = (cls, r.get("name",""))
        if key not in seen:
            seen.add(key)
            dedup.append(r)
    return dedup

def main(out_csv: Path, md_files: list):
    headers = read_template_header(TEMPLATE)
    rows = rows_from_md([Path(p) for p in md_files])
    with out_csv.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=headers)
        w.writeheader()
        for r in rows:
            w.writerow({h: r.get(h, "") for h in headers})

if __name__ == "__main__":
    import sys
    if len(sys.argv) < 3:
        print("Usage: md_to_portfolio_csv_from_template.py <out.csv> <md1> [md2 ...]")
        sys.exit(1)
    out_csv = Path(sys.argv[1])
    md_files = sys.argv[2:]
    if not TEMPLATE.exists():
        print("ERROR: portfolio_template.csv not found in current directory.")
        sys.exit(2)
    main(out_csv, md_files)
