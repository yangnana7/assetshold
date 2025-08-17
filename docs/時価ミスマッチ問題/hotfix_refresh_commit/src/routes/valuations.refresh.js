// Drop-in replacement for /src/routes/valuations.refresh.js
// Writes valuations with USD→JPY conversion and fx_context, using the new scrape orchestrator.
// Requires: ./src/market (TS ok if ts-node/ts-loader is active), server globals via injected args.

module.exports.refreshValuationHandler = async function(req, res) {
  try {
    const assetId = parseInt(req.params.assetId);
    const db = req.app.get('db');            // server.js sets app.set('db', db)
    const fxProvider = req.app.get('fxProvider');
    const CACHE_TTL = req.app.get('CACHE_TTL'); // { fx: ..., stock: ... }
    const fetchWithCache = req.app.get('fetchWithCache');

    if (!db || !fxProvider || !fetchWithCache) {
      return res.status(500).json({ error: 'server_injection_missing' });
    }

    // Load asset & US stock details
    const asset = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM assets WHERE id = ?', [assetId], (err, row) => err ? reject(err) : resolve(row));
    });
    if (!asset) return res.status(404).json({ error: 'asset_not_found' });
    if (asset.class !== 'us_stock') return res.status(400).json({ error: 'not_us_stock' });

    const details = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM us_stocks WHERE asset_id = ?', [assetId], (err, row) => err ? reject(err) : resolve(row));
    });
    if (!details || !details.ticker) return res.status(400).json({ error: 'us_stock_details_not_found' });

    // 1) Fetch USD latest via new orchestrator (Yahoo .com enforced)
    const { fetchLatestUSQuote } = require('../market');
    const q = await fetchLatestUSQuote({ ticker: details.ticker, exchange: details.exchange || 'NYSE' }, { providers: ['google','yahoo'], yahooHost: 'com' });
    const unitPriceUsd = Number(q.aggregate.price);
    if (!Number.isFinite(unitPriceUsd) || unitPriceUsd <= 0) {
      return res.status(502).json({ error: 'bad_quote', detail: q });
    }

    // 2) FX USDJPY
    const { fxKey } = require('../../server/utils/keys');
    const fxKeyStr = fxKey('USDJPY');
    const fxData = await fetchWithCache(fxKeyStr, CACHE_TTL.fx, () => fxProvider.getRate('USDJPY'));
    const rate = Number(fxData.price);
    if (!Number.isFinite(rate) || rate <= 0) return res.status(502).json({ error: 'bad_fx' });

    // 3) Compute JPY amounts
    const qty = Number(details.quantity || 0);
    const unitPriceJpy = Math.floor(unitPriceUsd * rate * 100) / 100;      // roundDown2
    const valueJpy = Math.floor(unitPriceUsd * qty * rate);                // round2Floor-ish

    const asOf = new Date().toISOString();
    const fxContext = JSON.stringify({ pair: 'USDJPY', rate, as_of: fxData.asOf || asOf });

    // 4) Insert valuation row
    const insertedId = await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO valuations (asset_id, as_of, value_jpy, unit_price_jpy, fx_context) VALUES (?,?,?,?,?)',
        [assetId, asOf, valueJpy, unitPriceJpy, fxContext],
        function(err) { err ? reject(err) : resolve(this.lastID); }
      );
    });

    // 5) Update us_stocks.market_price_usd for fast UI access
    await new Promise((resolve, reject) => {
      db.run('UPDATE us_stocks SET market_price_usd = ? WHERE asset_id = ?', [unitPriceUsd, assetId], (err) => err ? reject(err) : resolve());
    });

    // 6) Respond
    return res.json({
      assetId,
      price_usd: unitPriceUsd,
      price_jpy_unit: unitPriceJpy,
      value_jpy: valueJpy,
      fx: { pair: 'USDJPY', rate, asOf: fxData.asOf || asOf },
      confidence: q.aggregate.confidence,
      sources: q.quotes.map(x => ({ name: x.provider, price: x.price, currency: x.currency, url: x.url })),
      valuation_id: insertedId,
      keys: q.keys
    });

  } catch (e) {
    console.error('refreshValuationHandler error', e);
    return res.status(500).json({ error: String(e?.message || e) });
  }
};
