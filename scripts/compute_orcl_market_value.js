const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '..', 'data', 'portfolio.db');
const db = new sqlite3.Database(dbPath);

function all(sql, params) { return new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows))); }
function get(sql, params) { return new Promise((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row))); }
function safeParseJson(s) { try { return s ? JSON.parse(s) : null; } catch { return null; } }

(async () => {
  try {
    const rows = await all(
      `SELECT a.id, a.name, u.ticker, u.exchange, u.quantity, u.avg_price_usd, u.market_price_usd
       FROM assets a JOIN us_stocks u ON u.asset_id=a.id
       WHERE u.ticker = ?
       ORDER BY a.id ASC`,
      ['ORCL']
    );
    const out = [];
    for (const r of rows) {
      const v = await get(
        `SELECT id, as_of, value_jpy, unit_price_jpy, fx_context
         FROM valuations
         WHERE asset_id = ?
         ORDER BY as_of DESC, id DESC
         LIMIT 1`,
        [r.id]
      );
      const qty = Number(r.quantity || 0);
      const mpu = Number(r.market_price_usd || 0);
      const ctx = v && v.fx_context ? safeParseJson(v.fx_context) : null;
      const rate = (ctx && ctx.pair === 'USDJPY' && Number(ctx.rate) > 0) ? Number(ctx.rate) : null;
      let unitUsd = null;
      let branch = 'none';
      if (v && Number(v.unit_price_jpy) > 0 && rate) {
        unitUsd = Number(v.unit_price_jpy) / rate;
        branch = 'valuation_unit';
      } else if (mpu > 0) {
        unitUsd = mpu;
        branch = 'market_price_usd';
      } else if (v && Number(v.value_jpy) > 0 && qty > 0 && rate) {
        unitUsd = Number(v.value_jpy) / (qty * rate);
        branch = 'valuation_value_fallback';
      }
      const market_value_usd = (unitUsd && qty) ? Math.round(unitUsd * qty * 100) / 100 : null;
      out.push({ asset_id: r.id, name: r.name, exchange: r.exchange, qty, unit_usd: unitUsd, branch, market_value_usd, latestValuation: v || null });
    }
    console.log(JSON.stringify(out, null, 2));
  } catch (e) {
    console.error('ERR', e);
  } finally {
    db.close();
  }
})();

