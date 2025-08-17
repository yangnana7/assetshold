const fetch = require('node-fetch');

/**
 * Fetch daily gold price (JPY/gram) from Tanaka Kikinzoku public page.
 * Tries multiple robust patterns and proximity search around the "金" label.
 */
async function getGoldJPYPerGram() {
  const url = 'https://gold.tanaka.co.jp/commodity/souba/';
  const res = await fetch(url, {
    timeout: 12000,
    headers: {
      'User-Agent': 'assetshold/1.0 (+https://github.com) Node-fetch',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7'
    }
  });
  if (!res.ok) throw new Error(`tanaka fetch failed: HTTP ${res.status}`);
  const html = await res.text();
  // Normalize whitespace to make regex matching robust across layout changes
  const norm = html.replace(/\r?\n|\t/g, ' ').replace(/\s+/g, ' ');

  // 1) Strict table pattern: <th>金</th><td>12,345</td>
  const strictPatterns = [
    /<th[^>]*>\s*金\s*<\/th>\s*<td[^>]*>\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?)\s*(?:円)?\s*(?:\/?\s*g)?\s*<\/td>/i,
    /金[^<]*<\/(?:th|td)>\s*<td[^>]*>\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?)\s*(?:円)?\s*(?:\/?\s*g)?\s*<\/td>/i,
  ];
  for (const re of strictPatterns) {
    const m = norm.match(re);
    if (m) {
      const price = toNumberSafe(m[1]);
      if (price >= 1000) return ok(price);
    }
  }

  // 2) Proximity search near the first occurrence of 金 (scan next ~1200 chars for number)
  const idx = norm.indexOf('金');
  if (idx >= 0) {
    const window = norm.slice(idx, Math.min(idx + 1200, norm.length));
    const candidates = extractNumbers(window);
    const picked = pickLikelyJPYPerGram(candidates);
    if (picked) return ok(picked);
  }

  // 3) Global fallback: search anywhere and pick a sensible value
  const globalCandidates = extractNumbers(norm);
  const pickedGlobal = pickLikelyJPYPerGram(globalCandidates);
  if (pickedGlobal) return ok(pickedGlobal);

  throw new Error('tanaka parse failed');

  function ok(price) {
    return { metal: 'gold', price_jpy_per_g: Math.round(price * 100) / 100, as_of: new Date().toISOString() };
  }
}

function toNumberSafe(s) {
  const n = Number(String(s).replace(/[,\s]/g, ''));
  return Number.isFinite(n) ? n : NaN;
}

function extractNumbers(text) {
  const out = [];
  const re = /([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?)\s*(?:円)?\s*(?:\/?\s*g)?/gi;
  let m;
  while ((m = re.exec(text))) {
    const val = toNumberSafe(m[1]);
    if (Number.isFinite(val)) out.push(val);
  }
  return out;
}

// Heuristic: gold JPY/gram should be thousands (>= 1000). Prefer first sensible candidate.
function pickLikelyJPYPerGram(nums) {
  const filtered = nums.filter(n => n >= 1000 && n <= 100000);
  if (filtered.length === 0) return null;
  return filtered[0] || Math.max(...filtered);
}

module.exports = { getGoldJPYPerGram };

