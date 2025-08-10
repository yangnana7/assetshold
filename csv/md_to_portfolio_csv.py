#!/usr/bin/env python3
import re, csv, json, math
from pathlib import Path
from typing import List, Dict, Any, Optional

SCHEMA_HEADERS = [
    "class","name","note","acquired_at","book_value_jpy","valuation_source","liquidity_tier","tags",
    "ticker","exchange","quantity","avg_price_usd","code","avg_price_jpy","brand","model","ref",
    "metal","weight_g","unit_price_jpy","purity","address","land_area_sqm","building_area_sqm",
    "category","variant","currency","balance"
]

# -------- helpers --------

def to_number(s: str) -> Optional[float]:
    if s is None:
        return None
    s = s.strip()
    if not s or s == "—" or s == "-":
        return None
    # remove currency and commas and spaces
    s = s.replace(",", "").replace("円", "").replace("%","").replace("+","").replace("±","")
    # Remove full-width spaces
    s = s.replace("　"," ").strip()
    # Extract first number (handles things like "1 USD = 147.10 JPY")
    m = re.search(r'[-+]?\d+(?:\.\d+)?', s)
    if not m:
        return None
    try:
        return float(m.group(0))
    except ValueError:
        return None

def floor_2(x: Optional[float]) -> Optional[float]:
    if x is None:
        return None
    return math.floor(x * 100.0) / 100.0

def fmt_1(x: Optional[float]) -> Optional[str]:
    if x is None: return None
    return f"{x:.1f}"

def fmt_2(x: Optional[float]) -> Optional[str]:
    if x is None: return None
    return f"{x:.2f}"

def clean_text(s: Optional[str]) -> str:
    if s is None: return ""
    return s.strip()

def as_json(d: Dict[str, Any]) -> str:
    if not d: return ""
    return json.dumps(d, ensure_ascii=False, separators=(",",":"))

def md_tables_from_section(lines: List[str], start_idx: int) -> List[List[List[str]]]:
    """Parse all GitHub-style tables that start after start_idx until next header."""
    i = start_idx + 1
    tables = []
    while i < len(lines):
        line = lines[i]
        if re.match(r"^#{1,6}\s", line):  # next header starts
            break
        # detect a table header row with pipes
        if "|" in line and "---" in line and re.search(r"\|\s*-", line):
            # backtrack to header line
            # the header line is typically the line before the separator
            # find header
            header_idx = i-1
            # collect table lines from header_idx until blank line
            tlines = []
            j = header_idx
            while j < len(lines):
                if not lines[j].strip():
                    break
                if "|" in lines[j]:
                    tlines.append(lines[j])
                    j += 1
                else:
                    break
            i = j
            # Convert to rows splitting by pipe, stripping edges
            rows = []
            for tl in tlines:
                # Remove leading/trailing pipes and split
                parts = [c.strip() for c in tl.strip().strip("|").split("|")]
                rows.append(parts)
            # filter out alignment row (contains ---)
            rows = [r for r in rows if not all(re.match(r"^:?-{3,}:?$", c) for c in r)]
            if rows:
                tables.append(rows)
            continue
        i += 1
    return tables

def find_section(lines: List[str], pattern: str) -> List[int]:
    idxs = []
    for i, ln in enumerate(lines):
        if re.search(pattern, ln):
            idxs.append(i)
    return idxs

def normalize_headers(cols: List[str]) -> List[str]:
    return [re.sub(r"\s+", "", c.lower()) for c in cols]

def write_rows(path: Path, rows: List[Dict[str, Any]]):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=SCHEMA_HEADERS)
        w.writeheader()
        for r in rows:
            # ensure only schema keys are written
            w.writerow({k: r.get(k, "") if r.get(k, "") is not None else "" for k in SCHEMA_HEADERS})

# -------- parsers by class --------

def parse_gunpla_table(rows: List[List[str]]) -> List[Dict[str, Any]]:
    # expected header: No | アイテム | 数量 | 取得単価 | 現在値 | 含み損益
    hdr = normalize_headers(rows[0])
    out = []
    for r in rows[1:]:
        if len(r) < 6: continue
        item = r[1]
        book = to_number(r[3])
        out.append({
            "class":"collection",
            "category":"gunpla",
            "name": clean_text(item),
            "book_value_jpy": int(book) if book is not None else "",
            "valuation_source":"manual",
            "liquidity_tier":"L3",
        })
    return out

def parse_watches_table(rows: List[List[str]]) -> List[Dict[str, Any]]:
    # header: ブランド | モデル | Ref | 取得コスト | 時価 | 含み損益
    out = []
    for r in rows[1:]:
        if len(r) < 6: continue
        brand, model, ref, cost = r[0], r[1], r[2] if r[2] != "—" else "", to_number(r[3])
        out.append({
            "class":"watch",
            "brand": clean_text(brand),
            "model": clean_text(model),
            "ref": clean_text(ref),
            "name": f"{clean_text(brand)} {clean_text(model)}".strip(),
            "book_value_jpy": int(cost) if cost is not None else "",
            "valuation_source":"manual",
            "liquidity_tier":"L3",
        })
    return out

def parse_precious_metals_table(rows: List[List[str]]) -> List[Dict[str, Any]]:
    # header: 金属 | アイテム | 重量(g) | 取得コスト | 時価 | 含み損益
    out = []
    for r in rows[1:]:
        if len(r) < 6: continue
        metal, item, weight, cost, spot = r[0], r[1], to_number(r[2]), to_number(r[3]), to_number(r[4])
        # unit price per gram from spot if available else None
        unit = None
        if weight and spot:
            unit = spot / weight
        # enforce rules: weight 1 decimal; unit_price 2 decimals floored
        weight_fmt = None
        if weight is not None:
            weight_fmt = float(f"{weight:.1f}")
        unit_fmt = None
        if unit is not None:
            unit_fmt = math.floor(unit * 100.0) / 100.0
        out.append({
            "class":"precious_metal",
            "name": clean_text(item),
            "metal": clean_text(metal),
            "weight_g": weight_fmt if weight_fmt is not None else "",
            "unit_price_jpy": f"{unit_fmt:.2f}" if unit_fmt is not None else "",
            "book_value_jpy": int(cost) if cost is not None else "",
            "valuation_source":"manual",
            "liquidity_tier":"L3",
        })
    return out

def parse_real_estate_table(rows: List[List[str]]) -> List[Dict[str, Any]]:
    # header: No | 物件 | 所在地 | 土地面積 (㎡) | 建物面積 (㎡) | 温泉/鉱泉権 | 取得価額 | 手数料 | 簿価合計 | 時価 | 含み損益
    out = []
    for r in rows[1:]:
        if len(r) < 11: continue
        name, addr = r[1], r[2]
        land, bldg = to_number(r[3]), to_number(r[4])
        book = to_number(r[8])
        out.append({
            "class":"real_estate",
            "name": clean_text(name),
            "address": clean_text(addr),
            "land_area_sqm": land if land is not None else "",
            "building_area_sqm": bldg if bldg is not None else "",
            "book_value_jpy": int(book) if book is not None else "",
            "valuation_source":"manual",
            "liquidity_tier":"L4",
        })
    return out

def parse_us_stocks_table(rows: List[List[str]]) -> List[Dict[str, Any]]:
    # header: No | 口座 | Ticker | 企業名 | 取引所 | 保有数量 | 取得単価 (USD) | 現在値 (USD) | 簿価 (円) | 時価 (円) | 含み損益 (円)
    out = []
    hdr = [c.strip() for c in rows[0]]
    for r in rows[1:]:
        if len(r) < 11: continue
        account, ticker, name, exch = r[1], r[2], r[3], r[4]
        qty = to_number(r[5])
        avg_usd = to_number(r[6])
        book_jpy = to_number(r[8])
        tags = {"account": account} if account else {}
        out.append({
            "class":"us_stock",
            "name": clean_text(name),
            "ticker": clean_text(ticker),
            "exchange": clean_text(exch),
            "quantity": qty if qty is not None else "",
            "avg_price_usd": f"{avg_usd:.2f}" if avg_usd is not None else "",
            "book_value_jpy": int(book_jpy) if book_jpy is not None else "",
            "valuation_source":"manual",
            "liquidity_tier":"L2",
            "tags": json.dumps(tags, ensure_ascii=False) if tags else ""
        })
    return out

def parse_jp_stocks_table(rows: List[List[str]]) -> List[Dict[str, Any]]:
    # header: No | 銘柄コード | 銘柄 | 口座 | 保有数量 | 取得単価 | 現在値 | 簿価 | 時価 | 含み損益
    out = []
    for r in rows[1:]:
        if len(r) < 10: continue
        code, name, account = r[1], r[2], r[3]
        qty = to_number(r[4])
        avg_jpy = to_number(r[5])
        book_jpy = to_number(r[7])
        tags = {"account": account} if account else {}
        out.append({
            "class":"jp_stock",
            "name": clean_text(name),
            "code": clean_text(code),
            "quantity": qty if qty is not None else "",
            "avg_price_jpy": f"{avg_jpy:.2f}" if avg_jpy is not None else "",
            "book_value_jpy": int(book_jpy) if book_jpy is not None else "",
            "valuation_source":"manual",
            "liquidity_tier":"L2",
            "tags": json.dumps(tags, ensure_ascii=False) if tags else ""
        })
    return out

def parse_cash_deposits_table(rows: List[List[str]]) -> List[Dict[str, Any]]:
    # header: 通貨 | 残高 | 換算レート | 円換算額
    out = []
    for r in rows[1:]:
        if len(r) < 4: continue
        currency = r[0].strip()
        if currency == "合計" or currency == "**合計**" or currency == "—": 
            continue
        balance = to_number(r[1])
        out.append({
            "class":"cash",
            "currency": currency,
            "balance": balance if balance is not None else "",
            "valuation_source":"manual",
            "liquidity_tier":"L1",
            "name": f"Cash {currency}"
        })
    return out

SECTION_PATTERNS = [
    (re.compile(r"^\s*###\s*2\.1.*ガンプラ|Gunpla", re.IGNORECASE), parse_gunpla_table),
    (re.compile(r"^\s*###\s*2\.2.*時計|Watches", re.IGNORECASE), parse_watches_table),
    (re.compile(r"^\s*###\s*2\.3.*貴金属|Precious Metals", re.IGNORECASE), parse_precious_metals_table),
    (re.compile(r"^\s*###\s*2\.4.*不動産|Real Estate", re.IGNORECASE), parse_real_estate_table),
    (re.compile(r"^\s*###\s*2\.5.*米国株|US Stocks", re.IGNORECASE), parse_us_stocks_table),
    (re.compile(r"^\s*###\s*2\.6.*日本株|Japan Stocks", re.IGNORECASE), parse_jp_stocks_table),
    (re.compile(r"^\s*###\s*2\.7.*預金|Cash Deposits", re.IGNORECASE), parse_cash_deposits_table),
]

def parse_file(path: Path) -> list:
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    results = []
    # find each section by heading, then parse tables within
    for patt, parser in SECTION_PATTERNS:
        # find all matching section starts
        starts = [i for i, ln in enumerate(lines) if patt.search(ln)]
        for si in starts:
            tables = md_tables_from_section(lines, si)
            for t in tables:
                try:
                    results.extend(parser(t))
                except Exception as e:
                    # skip malformed table chunk
                    continue
    return results

def main(md_files: list, out_csv: str):
    all_rows = []
    for f in md_files:
        p = Path(f)
        if p.exists() and p.suffix.lower() == ".md":
            all_rows.extend(parse_file(p))
    # deduplicate by (class + key) naive approach
    seen = set()
    deduped = []
    for r in all_rows:
        key = None
        cls = r.get("class","")
        if cls == "us_stock":
            key = (cls, r.get("ticker",""))
        elif cls == "jp_stock":
            key = (cls, r.get("code",""))
        elif cls == "precious_metal":
            key = (cls, r.get("name",""), r.get("metal",""))
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
            deduped.append(r)
    # finalize rows: ensure weight_g 1 decimal, unit_price 2-decimals floored
    finalized = []
    for r in deduped:
        if r.get("weight_g") != "" and r.get("weight_g") is not None:
            try:
                r["weight_g"] = f"{float(r['weight_g']):.1f}"
            except:
                pass
        if r.get("unit_price_jpy"):
            try:
                up = float(r["unit_price_jpy"])
                up = math.floor(up * 100.0)/100.0
                r["unit_price_jpy"] = f"{up:.2f}"
            except:
                pass
        finalized.append(r)
    # write CSV
    with open(out_csv, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=SCHEMA_HEADERS)
        w.writeheader()
        for row in finalized:
            w.writerow({k: row.get(k,"") for k in SCHEMA_HEADERS})

if __name__ == "__main__":
    import sys
    if len(sys.argv) < 3:
        print("Usage: md_to_portfolio_csv.py <out.csv> <md1> [md2 ...]")
        sys.exit(1)
    out_csv = sys.argv[1]
    md_files = sys.argv[2:]
    main(md_files, out_csv)
