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
  // naive parse: look for "小売価格" table cell for gold (24K) per gram
  const m = html.match(/<th[^>]*>金.*?<\/th>\\s*<td[^>]*>([\\d,]+)<\\/td>/s);
  if (!m) throw new Error('tanaka parse failed');
  const price = Number(m[1].replace(/[,]/g,''));
  return { metal: 'gold', price_jpy_per_g: price, as_of: new Date().toISOString() };
}

module.exports = { getGoldJPYPerGram };
