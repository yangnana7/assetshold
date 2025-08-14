const sqlite3 = require('sqlite3').verbose();

function dbAll(db, sql, params=[]) { return new Promise((ok, ng)=> db.all(sql, params, (e, rows)=> e?ng(e):ok(rows))); }
function dbGet(db, sql, params=[]) { return new Promise((ok, ng)=> db.get(sql, params, (e, row)=> e?ng(e):ok(row))); }
function dbRun(db, sql, params=[]) { return new Promise((ok, ng)=> db.run(sql, params, function(e){ e?ng(e):ok(this)})); }

async function getFxFromCacheJPY(db, currency) {
  if (!currency || currency.toUpperCase() === 'JPY') return 1;
  const pair = (currency.toUpperCase() + 'JPY');
  const row = await dbGet(db, `SELECT payload FROM price_cache WHERE key=? ORDER BY fetched_at DESC LIMIT 1`, ['fx:'+pair]);
  if (!row) return null;
  try {
    const js = JSON.parse(row.payload);
    const price = js.price || js.rate || js.value;
    if (typeof price === 'number' && price>0) return price;
  } catch(e) {}
  return null;
}

function parseISO(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s||'')) throw new Error('sale_date must be YYYY-MM-DD');
  return s;
}

function conditionFactor(c) {
  const m = { 'A+':1.10, 'A':1.00, 'B':0.92, 'C':0.85 };
  return m[(c||'').toUpperCase()] || 1.0;
}
function completenessFactor(k) {
  const key = (k||'').toUpperCase();
  if (key.includes('FULL')) return 1.05;
  if (key.includes('HEAD') || key.includes('WATCH ONLY')) return 0.95;
  return 1.0;
}
function sourceFactor(s) {
  const key = (s||'').toLowerCase();
  if (key.includes('auction')) return 1.00;
  if (key.includes('dealer')) return 0.96;
  if (key.includes('market')) return 0.98;
  return 1.00;
}

function daysDiff(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
}

function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a,b)=>a-b);
  const m = Math.floor(s.length/2);
  return s.length%2 ? s[m] : (s[m-1]+s[m])/2;
}

function robustFilterMAD(values, k=3.0) {
  if (values.length < 5) return values.map((v,i)=>({v,i}));
  const m = median(values);
  const devs = values.map(v=>Math.abs(v-m));
  const mad = median(devs) || 1;
  const keep = [];
  for (let i=0;i<values.length;i++){
    if (Math.abs(values[i]-m) <= k*mad) keep.push({v:values[i], i});
  }
  return keep;
}

function weightedMedian(pairs) {
  const totalW = pairs.reduce((s,o)=>s+o.weight,0);
  if (totalW <= 0) return 0;
  const arr = [...pairs].sort((a,b)=>a.value-b.value);
  let acc = 0;
  for (const p of arr) { acc += p.weight; if (acc >= totalW/2) return p.value; }
  return arr[arr.length-1].value;
}

function confidenceScore(nUsed, nTotal, ages) {
  const countScore = Math.min(60, nUsed*10); // 6件で満点60
  const avgAge = ages.length ? (ages.reduce((s,a)=>s+a,0)/ages.length) : 999;
  const freshScore = Math.max(0, 40 - Math.min(40, avgAge*0.5)); // 0日=40, 80日=0
  return Math.round(countScore + freshScore);
}

async function listComps(db, assetId, limit=100) {
  return await dbAll(db, `SELECT * FROM comparable_sales WHERE asset_id=? ORDER BY sale_date DESC, id DESC LIMIT ?`, [assetId, limit]);
}

async function addComp(db, assetId, comp) {
  const sale_date = parseISO(comp.sale_date);
  const currency = (comp.currency || 'JPY').toUpperCase();
  let price_jpy = Number(comp.price_jpy || 0);
  const price = Number(comp.price);
  if (!Number.isFinite(price) || price<=0) throw new Error('price must be > 0');
  if (currency !== 'JPY' && (!price_jpy || price_jpy<=0)) {
    const fx = await getFxFromCacheJPY(db, currency);
    if (!fx) throw new Error('FX rate not found in cache for ' + currency + 'JPY');
    price_jpy = price * fx;
  }
  if (currency === 'JPY') price_jpy = price;

  const now = new Date().toISOString();
  await dbRun(db, `
    INSERT INTO comparable_sales(asset_id, sale_date, price, currency, price_jpy, source, source_url, marketplace, condition_grade, completeness, notes, created_at, updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
  `, [assetId, sale_date, price, currency, price_jpy, comp.source||null, comp.source_url||null, comp.marketplace||null, comp.condition_grade||null, comp.completeness||null, comp.notes||null, now, now]);
}

async function updateComp(db, compId, patch) {
  const row = await dbGet(db, `SELECT * FROM comparable_sales WHERE id=?`, [compId]);
  if (!row) throw new Error('not_found');
  const sale_date = patch.sale_date ? parseISO(patch.sale_date) : row.sale_date;
  const currency = (patch.currency || row.currency || 'JPY').toUpperCase();
  let price = ('price' in patch) ? Number(patch.price) : row.price;
  if (!Number.isFinite(price) || price<=0) throw new Error('price must be > 0');
  let price_jpy = ('price_jpy' in patch) ? Number(patch.price_jpy) : row.price_jpy;
  if ((!price_jpy || price_jpy<=0) && currency!=='JPY') {
    const fx = await getFxFromCacheJPY(db, currency);
    if (!fx) throw new Error('FX rate not found');
    price_jpy = price * fx;
  }
  if (currency==='JPY') price_jpy = price;
  const now = new Date().toISOString();
  await dbRun(db, `UPDATE comparable_sales SET sale_date=?, price=?, currency=?, price_jpy=?, source=?, source_url=?, marketplace=?, condition_grade=?, completeness=?, notes=?, updated_at=? WHERE id=?`,
    [sale_date, price, currency, price_jpy, patch.source??row.source, patch.source_url??row.source_url, patch.marketplace??row.marketplace, patch.condition_grade??row.condition_grade, patch.completeness??row.completeness, patch.notes??row.notes, now, compId]);
}

async function deleteComp(db, compId) { await dbRun(db, `DELETE FROM comparable_sales WHERE id=?`, [compId]); }

async function estimateFromComps(db, assetId, method='wmad', halfLifeDays=90) {
  const rows = await listComps(db, assetId, 500);
  if (!rows.length) return { estimate_jpy: 0, used:0, total:0, method, n_outliers:0, details:[], confidence:0 };
  const prices = rows.map(r=>Number(r.price_jpy));
  const kept = robustFilterMAD(prices, 3.0);
  const usedRows = kept.map(k => rows[k.i]);
  const ages = usedRows.map(r => Math.max(0, Math.floor((Date.now() - new Date(r.sale_date+'T00:00:00Z').getTime())/86400000)));
  const recW = ages.map(d => Math.pow(0.5, d / Math.max(1,halfLifeDays)));
  const pairs = usedRows.map((r,idx) => ({ value: Number(r.price_jpy), weight: Math.max(0.0001, recW[idx] * conditionFactor(r.condition_grade) * completenessFactor(r.completeness) * sourceFactor(r.source)) }));
  let estimate = 0;
  if (method === 'wmad' || method === 'wmedian') estimate = weightedMedian(pairs);
  else estimate = pairs.reduce((s,p)=>s+p.value*p.weight,0)/pairs.reduce((s,p)=>s+p.weight,0);
  const conf = confidenceScore(usedRows.length, rows.length, ages);
  return {
    estimate_jpy: Math.round(estimate),
    used: usedRows.length, total: rows.length, method,
    n_outliers: rows.length - usedRows.length, confidence: conf,
    details: usedRows.map((r,idx)=>({ id:r.id, sale_date:r.sale_date, price_jpy:r.price_jpy, weight: pairs[idx].weight, condition:r.condition_grade, completeness:r.completeness, source:r.source }))
  };
}

async function commitValuation(db, assetId, estimate) {
  if (!estimate || !Number.isFinite(Number(estimate.estimate_jpy)) || estimate.estimate_jpy<=0) throw new Error('bad estimate');
  const asOf = new Date().toISOString().slice(0,10);
  await dbRun(db, `
    INSERT INTO valuations(asset_id, as_of, value_jpy, unit_price_jpy, fx_context)
    VALUES(?,?,?,?,?)
  `, [assetId, asOf, estimate.estimate_jpy, null, JSON.stringify({source:'comps', confidence: estimate.confidence}) ]);
}

module.exports = { listComps, addComp, updateComp, deleteComp, estimateFromComps, commitValuation };