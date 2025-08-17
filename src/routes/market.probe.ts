const { fetchLatestUSQuote } = require("../market/index.ts");

async function probeHandler(req, res) {
  try {
    const ticker = String(req.query.ticker || "");
    const exchange = String(req.query.exchange || "");
    const providers = String(req.query.providers || "yahoo,google")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);
    const yahooHost = (String(req.query.yahoo_host || "com") === "co.jp" ? "co.jp" : "com");
    
    const result = await fetchLatestUSQuote({ ticker, exchange }, { providers, yahooHost });
    
    return res.json({ 
      resolved: { 
        ticker, 
        exchange, 
        keys: result.keys, 
        yahooHost 
      }, 
      fetches: result.quotes, 
      aggregate: result.aggregate, 
      errors: result.errors 
    });
  } catch (e) {
    console.error('Market probe error:', e);
    return res.status(500).json({ 
      error: String(e && e.message || e) 
    });
  }
}

module.exports = { probeHandler };