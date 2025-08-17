const { fetchLatestUSQuote } = require("../market/index.ts");

async function refreshValuationHandler(req, res) {
  try {
    const assetId = req.params.assetId;
    const { ticker, exchange, yahooHost } = req.body || {};
    
    if (!ticker) {
      return res.status(400).json({ error: 'ticker is required in request body' });
    }
    
    const { quotes, aggregate, keys } = await fetchLatestUSQuote({ ticker, exchange }, { yahooHost: yahooHost || "com" });
    const valuation_id = Math.floor(Math.random()*1e9);
    
    return res.json({
      assetId,
      price_usd: aggregate.price,
      confidence: aggregate.confidence,
      sources: quotes.map(q=>({ name: q.provider, price: q.price, currency: q.currency, url: q.url })),
      valuation_id,
      note: `no-API HTML scrape / ${new Date().toISOString()}`,
      keys,
    });
  } catch (e) {
    return res.status(500).json({ error: String(e && e.message || e) });
  }
}

module.exports = { refreshValuationHandler };
