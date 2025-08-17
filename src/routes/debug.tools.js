// src/routes/debug.tools.js
function safeParseJson(s) {
  try { return s ? JSON.parse(s) : null; } catch { return null; }
}

async function getFxRate(app) {
  const fetchWithCache = app.get('fetchWithCache');
  const CACHE_TTL = app.get('CACHE_TTL') || { fx: 300000 };
  const fxProvider = app.get('fxProvider');
  if (!fetchWithCache || !fxProvider) return { rate: null, asOf: null };
  const fx = await fetchWithCache('fx:USDJPY', CACHE_TTL.fx, () => fxProvider.getRate('USDJPY'));
  const rate = Number(fx && fx.price);
  return { rate: Number.isFinite(rate) ? rate : null, asOf: fx && fx.asOf || null };
}

function decideUnitUsd({ qty, details, valuation, fxRate }) {
  const trace = { branch: null, input: { qty, market_price_usd: details.market_price_usd, valuation, fx: { rate: fxRate } } };
  let unitUsd = null;

  const ctx = safeParseJson(valuation && valuation.fx_context);
  if (valuation && Number(valuation.unit_price_jpy) > 0 && ctx && ctx.pair === 'USDJPY' && Number(ctx.rate) > 0) {
    unitUsd = Number(valuation.unit_price_jpy) / Number(ctx.rate);
    trace.branch = 'valuation_unit';
  } else if (Number(details.market_price_usd) > 0) {
    unitUsd = Number(details.market_price_usd);
    trace.branch = 'market_price_usd';
  } else if (valuation && Number(valuation.value_jpy) > 0 && Number(qty) > 0 && Number(fxRate) > 0) {
    unitUsd = Number(valuation.value_jpy) / (Number(qty) * Number(fxRate));
    trace.branch = 'valuation_value_fallback';
  } else {
    trace.branch = 'none';
  }
  return { unitUsd, trace };
}

module.exports.version = async (req, res) => {
  try {
    const dbPath = req.app.get('dbPath') || (req.app.get('dataDir') ? (req.app.get('dataDir') + '/portfolio.db') : null);
    const payload = {
      version: process.env.APP_VERSION || new Date().toISOString(),
      node: process.version,
      env: { MARKET_ENABLE: process.env.MARKET_ENABLE || null },
      dbPath
    };
    res.set('X-App-Version', String(payload.version));
    res.json(payload);
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e) });
  }
};

module.exports.assetTrace = async (req, res) => {
  const app = req.app;
  const db = app.get('db');
  if (!db) return res.status(500).json({ error: 'db_not_injected' });

  try {
    const assetId = parseInt(req.params.assetId);
    const details = await new Promise((resolve, reject) => {
      db.get('SELECT u.*, a.name FROM us_stocks u JOIN assets a ON a.id=u.asset_id WHERE u.asset_id = ?', [assetId], (err, row) => err ? reject(err) : resolve(row));
    });
    if (!details) return res.status(404).json({ error: 'asset_not_found' });

    const valuation = await new Promise((resolve, reject) => {
      db.get('SELECT value_jpy, unit_price_jpy, fx_context, as_of FROM valuations WHERE asset_id = ? ORDER BY as_of DESC, id DESC LIMIT 1', [assetId], (err, row) => err ? reject(err) : resolve(row || {}));
    });

    const fx = await getFxRate(app);
    const { unitUsd, trace } = decideUnitUsd({ qty: details.quantity || 0, details, valuation, fxRate: fx.rate });

    res.json({
      assetId,
      ticker: details.ticker,
      unitUsd,
      branch: trace.branch,
      input: trace.input,
      latestValuationAsOf: valuation && valuation.as_of || null
    });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e) });
  }
};

