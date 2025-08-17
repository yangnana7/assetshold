const { fetchHtml } = require('../fetchHtml.ts');
async function fetchGoogle(key, opt) {
  const url = (opt && opt.urlOverride) ? opt.urlOverride : `https://www.google.com/finance/quote/${encodeURIComponent(key)}`;
  const html = (opt && opt.html) || await fetchHtml(url);
  const patterns = [
    /data-last-price\s*=\s*"([0-9]+\.?[0-9]*)"/i,
    /aria-label\s*=\s*"[^"]*\$([0-9]+\.?[0-9]*)[^"]*"/i,
    /"price"\s*:\s*\{[^}]*"raw"\s*:\s*([0-9]+\.?[0-9]*)/i,
    />\$\s*([0-9]+\.?[0-9]*)\s*</i,
  ];
  let price = null;
  for (const rx of patterns) { const m = html.match(rx); if (m) { price = Number(m[1]); break; } }
  if (!isFinite(price)) throw new Error("google_no_price");
  let currency = "USD";
  const cm = html.match(/USD|\bCurrency\b/i);
  if (cm) currency = "USD";
  return { provider: "google", price: Number(price), currency, ts: Date.now(), url };
}

module.exports = { fetchGoogle };
