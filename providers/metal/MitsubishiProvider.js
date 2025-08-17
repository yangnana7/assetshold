const fetch = require('node-fetch');

/**
 * Mitsubishi Materials Precious Metals Market (public site)
 * URL: https://gold.mmc.co.jp/market/
 * Note: The site varies by day and has holidays/weekends without quotes.
 * This scraper tries to extract the latest displayed retail price per gram in JPY.
 */
async function getMitsubishiJPYPerGram(metal = 'gold') {
  const url = 'https://gold.mmc.co.jp/market/';
  const res = await fetch(url, {
    timeout: 12000,
    headers: {
      'User-Agent': 'assetshold/1.0 (+https://github.com) Node-fetch',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7'
    }
  });
  if (!res.ok) throw new Error(`mitsubishi fetch failed: HTTP ${res.status}`);
  const html = await res.text();

  // Normalize whitespace (collapse)
  const norm = html.replace(/\r?\n|\t/g, ' ').replace(/\s+/g, ' ');

  const jpName = metalLabelJa(metal);
  const { min, max } = rangeForMetal(metal);

  // Strategy A: Label followed by a numeric with optional 円 and /g markers within a small window
  const strict = new RegExp(
    `${escapeReg(jpName)}[^<]{0,80}?(?:</?(?:th|td)[^>]*>[^<]{0,80}?)*?` +
    `([0-9]{1,3}(?:,[0-9]{3})*(?:\\.[0-9]+)?)\s*(?:円)?\s*(?:[\\/／]?\s*(?:g|ｇ))?`,
    'i'
  );
  let m = norm.match(strict);
  if (m) {
    const v = toNumberSafe(m[1]);
    if (v >= min && v <= max) return ok(metal, v);
  }

  // Strategy B: proximity window after label, collect candidates and pick plausible
  const idx = norm.indexOf(jpName);
  if (idx >= 0) {
    const window = norm.slice(idx, Math.min(idx + 2000, norm.length));
    const candidates = extractNumericCandidates(window);
    const picked = pickLikelyJPYPerGram(candidates, min, max);
    if (picked) return ok(metal, picked);
  }

  // Strategy C: global scan with context
  const candidates = extractNumericCandidates(norm);
  const picked = pickLikelyJPYPerGram(candidates, min, max);
  if (picked) return ok(metal, picked);

  throw new Error('mitsubishi parse failed');
}

function toNumberSafe(s) { const n = Number(String(s).replace(/[,\s]/g, '')); return Number.isFinite(n) ? n : NaN; }

function extractNumericCandidates(text) {
  const out = [];
  const re = /([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?)(?:\s*(円))?\s*(?:[\/／]?\s*(g|ｇ))?/gi;
  let m;
  while ((m = re.exec(text))) {
    const value = toNumberSafe(m[1]);
    const hasYen = !!m[2];
    const hasGram = !!m[3];
    out.push({ value, hasYen, hasGram, idx: m.index });
  }
  return out;
}

function pickLikelyJPYPerGram(cands, min, max) {
  // Prefer candidates with 円 and g markers, within range; fall back to first in range
  const inRange = cands.filter(c => Number.isFinite(c.value) && c.value >= min && c.value <= max);
  if (!inRange.length) return null;
  const withYenGram = inRange.find(c => c.hasYen && c.hasGram);
  if (withYenGram) return withYenGram.value;
  const withYen = inRange.find(c => c.hasYen);
  if (withYen) return withYen.value;
  return inRange[0].value;
}

function rangeForMetal(metal) {
  const m = (metal || '').toLowerCase();
  if (m === 'silver') return { min: 10, max: 10000 };
  // gold/platinum/palladium
  return { min: 1000, max: 200000 };
}

function ok(metal, price) {
  return { metal, price_jpy_per_g: Math.round(price * 100) / 100, as_of: new Date().toISOString(), source: 'mitsubishi' };
}

function metalLabelJa(metal) {
  switch ((metal || '').toLowerCase()) {
    case 'gold': return '\u91D1';
    case 'platinum': return '\u30D7\u30E9\u30C1\u30CA';
    case 'silver': return '\u9280';
    case 'palladium': return '\u30D1\u30E9\u30B8\u30A6\u30E0';
    default: return '\u91D1';
  }
}

function escapeReg(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

module.exports = { getMitsubishiJPYPerGram };


