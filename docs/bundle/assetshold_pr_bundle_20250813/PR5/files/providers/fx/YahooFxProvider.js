const fetch = require('node-fetch');

/**
 * Simple FX provider using Yahoo endpoints.
 * Returns { pair:'USDJPY', price: number, as_of: ISO }
 */
async function getFx(pair='USDJPY') {
  const symbol = pair.toUpperCase() === 'USDJPY' ? 'USDJPY=X' :
                 pair.toUpperCase() === 'CNYJPY' ? 'CNYJPY=X' : null;
  if (!symbol) throw new Error('unsupported pair');
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`;
  const res = await fetch(url, { timeout: 10000, headers: { 'User-Agent': 'assetshold/1.0' } });
  if (!res.ok) throw new Error('fx fetch failed');
  const js = await res.json();
  const q = js?.quoteResponse?.result?.[0];
  if (!q || !q.regularMarketPrice) throw new Error('fx no price');
  return { pair, price: q.regularMarketPrice, as_of: new Date().toISOString() };
}

module.exports = { getFx };
