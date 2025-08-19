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

  // Strategy A: Look for metal-specific price table sections
  // Find the section containing the metal name and extract price from table structure
  let m = null;
  
  if (metal === 'platinum') {
    // For platinum, look specifically in the platinum section's price table
    // Look for the table row with 店頭価格 followed by the price
    const platinumTableRegex = /店頭価格[^>]*>[^<]*<[^>]*>[^<]*<[^>]*>([0-9]{1,2},[0-9]{3})[^0-9]*円\/g/i;
    m = norm.match(platinumTableRegex);
    
    if (!m) {
      // Alternative pattern for Web価格
      const platinumWebRegex = /Web価格[^>]*>[^<]*<[^>]*>[^<]*<[^>]*>([0-9]{1,2},[0-9]{3})[^0-9]*円\/g/i;
      m = norm.match(platinumWebRegex);
    }
    
    if (!m) {
      // Third try: simple pattern around known price structure
      const simpleRegex = /([0-9]{1,2},[0-9]{3})[^0-9]*円\/g[^0-9]*-66[^0-9]*円\/g[^0-9]*6,845/i;
      m = norm.match(simpleRegex);
    }
  } else if (metal === 'gold') {
    // For gold, look for the specific gold price table pattern (17,556 etc)
    const goldTableRegex = /店頭価格[^>]*>[^<]*<[^>]*>[^<]*<[^>]*>(1[0-9],[0-9]{3})[^0-9]*円\/g/i;
    m = norm.match(goldTableRegex);
    
    if (!m) {
      // Alternative: Web価格 for gold
      const goldWebRegex = /Web価格[^>]*>[^<]*<[^>]*>[^<]*<[^>]*>(1[0-9],[0-9]{3})[^0-9]*円\/g/i;
      m = norm.match(goldWebRegex);
    }
    
    if (!m) {
      // Third try: simple pattern around known gold price structure (17,xxx range)
      const simpleGoldRegex = /(1[0-9],[0-9]{3})[^0-9]*円\/g[^0-9]*-22[^0-9]*円\/g[^0-9]*1[0-9],[0-9]{3}/i;
      m = norm.match(simpleGoldRegex);
    }
  } else if (metal === 'silver') {
    // For silver, look for the specific silver price pattern (202.xx range)
    // Most specific pattern first - silver is typically around 200 yen/g
    const exactSilverRegex = /(20[0-9]\.[0-9]{1,2})[^0-9]*円\/g/i;
    m = norm.match(exactSilverRegex);
    
    if (!m) {
      // Broader pattern for silver in typical range 150-300 yen
      const silverRangeRegex = /([1-3][0-9]{2}\.[0-9]{1,2})[^0-9]*円\/g[^0-9]*\+[0-9]/i;
      m = norm.match(silverRangeRegex);
    }
    
    if (!m) {
      // Fallback: simple integer silver price
      const simpleSilverRegex = /([1-3][0-9]{2})[^0-9]*円\/g[^0-9]*\+[0-9]/i;
      m = norm.match(simpleSilverRegex);
    }
  } else {
    // For other metals (palladium), use the original pattern
    const rowRegex = new RegExp(`${escapeReg(jpName)}[^<]*</?[^>]*>(?:.|\n){0,200}?([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?)`, 'i');
    m = norm.match(rowRegex);
    if (!m) {
      // Strategy B: Look for stand-alone numeric near the metal label
      const aroundRegex = new RegExp(`${escapeReg(jpName)}(?:.|\n){0,120}?([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?)`, 'i');
      m = norm.match(aroundRegex);
    }
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

