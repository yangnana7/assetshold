const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db = new sqlite3.Database(path.resolve(__dirname, '..', 'data', 'portfolio.db'));
db.all(`SELECT a.id, a.name, u.ticker, u.exchange, u.quantity, u.avg_price_usd, u.market_price_usd
        FROM assets a JOIN us_stocks u ON u.asset_id=a.id
        WHERE u.ticker='ORCL'`, [], (e, r) => { if (e) console.error(e.message); else console.log(JSON.stringify(r,null,2)); db.close(); });

