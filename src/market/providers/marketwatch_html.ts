const { fetchHtml } = require('../fetchHtml.ts');

async function fetchMarketWatch(key, opt) {
  const url = `https://www.marketwatch.com/investing/stock/${encodeURIComponent(key.replace(/\./g,'-').toLowerCase())}`;
  const html = (opt && opt.html) || await fetchHtml(url);
  
  const patterns = [
    /"price"\s*:\s*\{[^}]*"last"\s*:\s*([0-9]+\.?[0-9]*)/i,
    /<bg-quote[^>]*class="value"[^>]*>([0-9]+\.?[0-9]*)<\/bg-quote>/i,
  ];
  
  let price = null;
  for (const rx of patterns) { 
    const m = html.match(rx); 
    if (m) { 
      price = Number(m[1]); 
      break; 
    } 
  }
  
  if (!isFinite(price)) {
    throw new Error("marketwatch_no_price");
  }
  
  return { 
    provider: "marketwatch", 
    price: Number(price), 
    currency: "USD", 
    ts: Date.now(), 
    url 
  };
}

module.exports = { fetchMarketWatch };