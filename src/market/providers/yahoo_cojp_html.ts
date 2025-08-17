const { fetchHtml } = require('../fetchHtml.ts');

async function fetchYahooJp(key, opt) {
  const url = `https://finance.yahoo.co.jp/quote/${encodeURIComponent(key)}`;
  const html = (opt && opt.html) || await fetchHtml(url);
  
  // Yahoo Japan typically returns JPY prices
  const m = html.match(/>([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?)<\/span>/);
  if (!m) {
    throw new Error("yahoo_jp_no_price");
  }
  
  const price = Number(m[1].replace(/,/g, ""));
  
  return { 
    provider: "yahoo", 
    price, 
    currency: "JPY", 
    ts: Date.now(), 
    url, 
    host: "co.jp" 
  };
}

module.exports = { fetchYahooJp };