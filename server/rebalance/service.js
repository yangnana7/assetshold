const sqlite3 = require('sqlite3').verbose();

const DEFAULT_CLASSES = ['us_stock','jp_stock','precious_metal','watch','collection','real_estate','cash'];

function dbAll(db, sql, params=[]) { return new Promise((ok, ng)=> db.all(sql, params, (e, rows)=> e?ng(e):ok(rows))); }
function dbGet(db, sql, params=[]) { return new Promise((ok, ng)=> db.get(sql, params, (e, row)=> e?ng(e):ok(row))); }
function dbRun(db, sql, params=[]) { return new Promise((ok, ng)=> db.run(sql, params, function(e){ e?ng(e):ok(this)})); }

async function getTolerancePct(db) {
  const row = await dbGet(db, `SELECT value FROM settings WHERE key='tolerance_pct'`);
  const v = row ? Number(row.value) : 5;
  return Number.isFinite(v) ? v : 5;
}
async function setTolerancePct(db, v) {
  await dbRun(db, `INSERT INTO settings(key,value) VALUES('tolerance_pct',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`, [String(v)]);
}

async function getTargets(db) {
  return await dbAll(db, `SELECT class, target_pct as pct FROM target_allocations ORDER BY class`);
}
async function setTargets(db, targets) {
  const seen = new Set();
  await dbRun(db, 'BEGIN IMMEDIATE');
  try {
    for (const t of targets) {
      if (!t.class || !Number.isFinite(Number(t.pct))) throw new Error('bad target row');
      if (seen.has(t.class)) throw new Error('duplicate class');
      seen.add(t.class);
      await dbRun(db, `
        INSERT INTO target_allocations(class,target_pct)
        VALUES(?,?)
        ON CONFLICT(class) DO UPDATE SET target_pct=excluded.target_pct
      `, [String(t.class), Number(t.pct)]);
    }
    await dbRun(db, 'COMMIT');
  } catch (e) {
    await dbRun(db, 'ROLLBACK'); throw e;
  }
}

async function getLatestValuationOrBook(db, assetId, bookValue, useBookIfMissing=true) {
  const row = await dbGet(db, `
    SELECT value_jpy FROM valuations
     WHERE asset_id = ? ORDER BY as_of DESC, id DESC LIMIT 1
  `, [assetId]);
  if (row && Number.isFinite(Number(row.value_jpy))) return Number(row.value_jpy);
  return useBookIfMissing ? Number(bookValue||0) : 0;
}
function liquidityScore(liq) { const m = {L1:1,L2:2,L3:3,L4:4}; return m[liq] || 99; }
function roundJPY(n){ return Math.round(n); }

async function getCurrentByClass(db, useBookIfMissing=true) {
  const assets = await dbAll(db, `SELECT id, class, name, book_value_jpy, liquidity_tier FROM assets`);
  const byClass = {}; const assetValues = [];
  for (const a of assets) {
    const val = await getLatestValuationOrBook(db, a.id, a.book_value_jpy, useBookIfMissing);
    assetValues.push({ asset_id:a.id, class:a.class, name:a.name, liquidity_tier:a.liquidity_tier, value_jpy:val, book_value_jpy:a.book_value_jpy });
    byClass[a.class] = (byClass[a.class]||0) + val;
  }
  const total = Object.values(byClass).reduce((s,v)=>s+v,0);
  const pct = {}; for (const c of Object.keys(byClass)) pct[c] = total>0 ? (byClass[c]/total*100) : 0;
  return { total, byClass, pct, assetValues };
}

function computePlanFromTargets(current, targets, tolerancePct, to='target', minTrade=0) {
  const classes = Array.from(new Set([...DEFAULT_CLASSES, ...Object.keys(current.byClass), ...targets.map(t=>t.class)]));
  const tgtMap = {}; for (const t of targets) tgtMap[t.class] = Number(t.pct);
  for (const c of classes) if (!(c in tgtMap)) tgtMap[c] = 0;
  const tgtSum = Object.values(tgtMap).reduce((s,v)=>s+v,0) || 1;
  const norm = 100 / tgtSum; for (const c of classes) tgtMap[c] = tgtMap[c]*norm;

  const rows = [], breaches = [];
  for (const c of classes) {
    const curV = current.byClass[c] || 0;
    const curPct = current.total>0 ? (curV/current.total*100) : 0;
    const tgt = tgtMap[c] || 0;
    const min = Math.max(0, tgt - tolerancePct);
    const max = Math.min(100, tgt + tolerancePct);
    const drift = curPct - tgt;
    const breach = (curPct < min) || (curPct > max);
    if (breach) breaches.push(c);
    rows.push({ class:c, cur_value_jpy:roundJPY(curV), cur_pct:curPct, target_pct:tgt, min_pct:min, max_pct:max, drift_pct:drift, breach });
  }

  // 目標値（to=mid なら許容帯の中央値）
  const desired = {};
  for (const r of rows) {
    if (!r.breach) { desired[r.class] = current.byClass[r.class] || 0; continue; }
    desired[r.class] = current.total * ((to==='mid' ? (r.min_pct+r.max_pct)/2 : r.target_pct)/100);
  }

  // 乖離（+BUY / -SELL）。最小取引額で丸め落とし
  const deltas = {};
  for (const c of classes) {
    const curV = current.byClass[c] || 0;
    const want = desired[c] !== undefined ? desired[c] : curV;
    const d = want - curV;
    deltas[c] = Math.abs(d) < minTrade ? 0 : d;
  }
  const buys = Object.entries(deltas).filter(([,a])=>a>0).map(([c,a])=>({class:c, amount:a}));
  const sells= Object.entries(deltas).filter(([,a])=>a<0).map(([c,a])=>({class:c, amount:Math.abs(a)}));

  // 資産レベル按分（流動性 L1→.. 優先）
  const byClassAssets = {};
  for (const a of current.assetValues) {
    (byClassAssets[a.class] ||= []).push(a);
  }
  for (const c of Object.keys(byClassAssets)) {
    byClassAssets[c].sort((x,y)=> liquidityScore(x.liquidity_tier)-liquidityScore(y.liquidity_tier) || (y.value_jpy - x.value_jpy));
  }

  const trades = [];
  let i=0,j=0;
  while (i<sells.length && j<buys.length) {
    const s = sells[i], b = buys[j];
    const x = Math.min(s.amount, b.amount);
    const sellAssets=[]; let rem=x;
    for (const a of (byClassAssets[s.class]||[])) {
      if (rem<=0) break;
      const can = Math.min(rem, a.value_jpy);
      if (can<=0) continue;
      sellAssets.push({ asset_id:a.asset_id, name:a.name, amount_jpy:roundJPY(can), liquidity_tier:a.liquidity_tier });
      rem -= can;
    }
    const buyAssets=[]; rem=x;
    for (const a of (byClassAssets[b.class]||[])) {
      if (rem<=0) break;
      const can = Math.min(rem, Math.max(0, a.value_jpy*10)); // 買いは仮の上限（調整余地）
      if (can<=0) continue;
      buyAssets.push({ asset_id:a.asset_id, name:a.name, amount_jpy:roundJPY(can), liquidity_tier:a.liquidity_tier });
      rem -= can;
    }
    trades.push({ from_class:s.class, to_class:b.class, amount_jpy:roundJPY(x), sells:sellAssets, buys:buyAssets });
    s.amount -= x; b.amount -= x;
    if (s.amount<=1) i++; if (b.amount<=1) j++;
  }

  const netBuy  = buys.reduce((s,o)=>s+o.amount,0);
  const netSell = sells.reduce((s,o)=>s+o.amount,0);
  return { rows, breaches, deltas, trades, net_flow_jpy: Math.round(netBuy - netSell) };
}

function toCsv(current, plan) {
  const header = ['class','cur_value_jpy','cur_pct','target_pct','min_pct','max_pct','drift_pct','breach'];
  const lines = [header.join(',')];
  for (const r of plan.rows) {
    lines.push([r.class, r.cur_value_jpy, r.cur_pct.toFixed(2), r.target_pct.toFixed(2),
      r.min_pct.toFixed(2), r.max_pct.toFixed(2), r.drift_pct.toFixed(2), r.breach?'1':'0'].join(','));
  }
  return lines.join('\n');
}

module.exports = {
  getTargets, setTargets, getTolerancePct, setTolerancePct,
  getCurrentByClass, computePlanFromTargets, toCsv
};