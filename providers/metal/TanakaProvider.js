const fetch = require('node-fetch');

/**
 * Fetch daily gold/silver/platinum price from Tanaka (public site).
 * Note: HTML structure may change; add robust selectors later.
 */
async function getGoldJPYPerGram() {
  const url = 'https://gold.tanaka.co.jp/commodity/souba/';
  const res = await fetch(url, { timeout: 10000, headers: { 'User-Agent': 'assetshold/1.0' } });
  if (!res.ok) throw new Error('tanaka fetch failed');
  const html = await res.text();
  // Normalize whitespace to make regex matching robust across layout changes
  const norm = html.replace(/\r?\n|\t/g, ' ').replace(/\s+/g, ' ');

  // Try multiple patterns to extract gold price
  const patterns = [
    // Original patterns for 金 (gold) label
    /<th[^>]*>\s*金\s*<\/th>\s*<td[^>]*>\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?)\s*<\/td>/i,
    /金[^<]*<\/(?:th|td)>\s*<td[^>]*>\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?)\s*<\/td>/i,
    // New patterns for retail price structure
    /店頭小売価格[^>]*>\s*([0-9,]+)\s*円/i,
    /([0-9,]+)\s*円.*?小売/i,
    /小売.*?([0-9,]+)\s*円/i,
  ];

  let m = null;
  for (const re of patterns) {
    m = norm.match(re);
    if (m) break;
  }

  if (!m) throw new Error('tanaka parse failed');
  const price = Number(String(m[1]).replace(/[,]/g, ''));
  if (!isFinite(price) || price <= 0) throw new Error('tanaka invalid price');
  return { metal: 'gold', price_jpy_per_g: price, as_of: new Date().toISOString() };
}

module.exports = { getGoldJPYPerGram };
