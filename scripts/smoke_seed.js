// Seed one precious metal asset and a cached gold price
// Prints the created asset_id to stdout
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.join(__dirname, '..', 'data', 'portfolio.db');
const db = new sqlite3.Database(dbPath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

async function main() {
  try {
    // Insert asset
    const res = await run(
      `INSERT INTO assets (class, name, note, acquired_at, book_value_jpy, valuation_source, liquidity_tier, tags)
       VALUES (?, ?, '', ?, ?, 'manual', ?, NULL)`,
      ['precious_metal', 'SmokeTest Gold', '2024-01-01', 100000, 'L2']
    );
    const assetId = res.lastID;

    // Insert precious metal details
    await run(
      `INSERT INTO precious_metals (asset_id, metal, weight_g, purity, unit_price_jpy)
       VALUES (?, ?, ?, ?, NULL)`,
      [assetId, 'gold', 10.0, 0.999]
    );

    // Seed cache for gold price to avoid upstream network
    const payload = JSON.stringify({ price: 10000, currency: 'JPY', asOf: new Date().toISOString() });
    await run(
      `INSERT OR REPLACE INTO price_cache (key, payload, fetched_at) VALUES (?, ?, ?)`,
      ['precious_metal:gold', payload, new Date().toISOString()]
    );

    console.log(String(assetId));
  } catch (e) {
    console.error('seed failed:', e);
    process.exit(1);
  } finally {
    db.close();
  }
}

main();

