const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '..', 'data', 'portfolio.db');
const db = new sqlite3.Database(dbPath);

function all(sql, params) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

(async () => {
  try {
    const rows = await all(
      `SELECT a.id, a.name, u.ticker, u.exchange, u.quantity, u.avg_price_usd, u.market_price_usd
       FROM assets a JOIN us_stocks u ON u.asset_id=a.id
       WHERE u.ticker = ?
       LIMIT 5`,
      ['ORCL']
    );
    if (!rows.length) {
      console.log(JSON.stringify({ error: 'no_orcl' }));
      return;
    }
    const orcl = rows[0];
    const v = await all(
      `SELECT id, as_of, value_jpy, unit_price_jpy, fx_context
       FROM valuations
       WHERE asset_id = ?
       ORDER BY as_of DESC, id DESC
       LIMIT 1`,
      [orcl.id]
    );
    const valuation = v[0] || null;
    console.log(JSON.stringify({ orcl, valuation }, null, 2));
  } catch (e) {
    console.error('ERR', e);
  } finally {
    db.close();
  }
})();

