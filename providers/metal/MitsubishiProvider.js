const fetch = require('node-fetch');

/**
 * Mitsubishi Materials Precious Metals Market (public site)
 * URL: https://gold.mmc.co.jp/market/
 * Note: The site varies by day and has holidays/weekends without quotes.
 * This scraper tries to extract the latest displayed retail price per gram in JPY.
 */
async function getMitsubishiJPYPerGram(metal = 'gold') {
  const url = 'https://gold.mmc.co.jp/market/';
  const res = await fetch(url, { timeout: 12000, headers: { 'User-Agent': 'assetshold/1.0 (+https://github.com/)' } });
  if (!res.ok) throw new Error(`mitsubishi fetch failed: HTTP ${res.status}`);
  const html = await res.text();

  // Normalize whitespace
  const norm = html.replace(/\r?\n|\t/g, ' ');

  const jpName = metalLabelJa(metal);

  // Strategy A: Find a row that contains the JP metal name and then a numeric JPY per gram
  // Try to match a table row-like block; capture the first numeric with commas/decimals
  const rowRegex = new RegExp(`${escapeReg(jpName)}[^<]*</?[^>]*>(?:.|\n){0,200}?([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?)`, 'i');
  let m = norm.match(rowRegex);
  if (!m) {
    // Strategy B: Look for stand-alone numeric near the metal label
    const aroundRegex = new RegExp(`${escapeReg(jpName)}(?:.|\n){0,120}?([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?)`, 'i');
    m = norm.match(aroundRegex);
  }
  if (!m) throw new Error('mitsubishi parse failed');
  const price = Number(m[1].replace(/,/g, ''));
  if (!isFinite(price) || price <= 0) throw new Error('mitsubishi invalid price');
  return { metal, price_jpy_per_g: Math.round(price * 100) / 100, as_of: new Date().toISOString(), source: 'mitsubishi' };
}

function metalLabelJa(metal) {
  switch ((metal || '').toLowerCase()) {
    case 'gold': return '金';
    case 'platinum': return 'プラチナ';
    case 'silver': return '銀';
    case 'palladium': return 'パラジウム';
    default: return '金';
  }
}

function escapeReg(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

module.exports = { getMitsubishiJPYPerGram };

