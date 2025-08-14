やりましょう。**Comparable Sales（コンプ）レジストリ**の実装一式を、API＋最小UIまで“そのまま差し込める形”で用意しました。ZIP作成が環境側で弾かれたので、ファイル内容をここに全部まとめておきます。コピペでOKです（そのまま追加／差し替え）。

---

# 1) DBマイグレーション

`migrations/20250813_comps.sql`

```sql
CREATE TABLE IF NOT EXISTS comparable_sales(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL,
  sale_date TEXT NOT NULL, -- YYYY-MM-DD
  price REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'JPY',
  price_jpy REAL NOT NULL, -- 事前換算 or JPYのとき price と同じ
  source TEXT,             -- auction/dealer/marketplace/manual
  source_url TEXT,
  marketplace TEXT,        -- e.g., Yahoo, Chrono24, Mercari
  condition_grade TEXT,    -- A+,A,B,C など
  completeness TEXT,       -- fullset/headonly など
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(asset_id, sale_date, price, COALESCE(source_url,''))
);
CREATE INDEX IF NOT EXISTS idx_comps_asset_date ON comparable_sales(asset_id, sale_date DESC);
```

> 既存のマイグレーションランナー（`scripts/apply-migrations.js`）があれば、ファイルを置いて実行してください。

---

# 2) サーバサイド

## 2-1. サービスロジック（新規）

`server/comps/service.js`

```js
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
```

## 2-2. ルート追加（`server.js`）

```diff
+ const path = require('path');
+ const sqlite3 = require('sqlite3').verbose();
+ const { listComps, addComp, updateComp, deleteComp, estimateFromComps, commitValuation } = require('./server/comps/service');
+ function getDb() {
+   const dbPath = process.env.DB_PATH || path.join(__dirname, 'data', 'portfolio.db');
+   return new sqlite3.Database(dbPath);
+ }

+ app.get('/api/comps/:assetId', async (req, res) => {
+   try {
+     const db = getDb();
+     const list = await listComps(db, Number(req.params.assetId), Number(req.query.limit||100));
+     db.close(); res.json({ items: list });
+   } catch (e) { res.status(500).json({ error: String(e.message||e) }); }
+ });

+ app.post('/api/comps/:assetId', async (req, res) => {
+   try {
+     const db = getDb();
+     await addComp(db, Number(req.params.assetId), req.body || {});
+     const list = await listComps(db, Number(req.params.assetId), 100);
+     db.close(); res.json({ ok:true, items: list });
+   } catch (e) { res.status(400).json({ error: String(e.message||e) }); }
+ });

+ app.patch('/api/comps/item/:compId', async (req, res) => {
+   try {
+     const db = getDb();
+     await updateComp(db, Number(req.params.compId), req.body || {});
+     db.close(); res.json({ ok:true });
+   } catch (e) { res.status(400).json({ error: String(e.message||e) }); }
+ });

+ app.delete('/api/comps/item/:compId', async (req, res) => {
+   try {
+     const db = getDb();
+     await deleteComp(db, Number(req.params.compId));
+     db.close(); res.json({ ok:true });
+   } catch (e) { res.status(400).json({ error: String(e.message||e) }); }
+ });

+ app.get('/api/comps/:assetId/estimate', async (req, res) => {
+   try {
+     const db = getDb();
+     const method = (req.query.method || 'wmad').toLowerCase();
+     const halfLifeDays = Number(req.query.half_life_days || 90);
+     const commit = String(req.query.commit||'0') === '1';
+     const est = await estimateFromComps(db, Number(req.params.assetId), method, halfLifeDays);
+     if (commit && est.estimate_jpy > 0) await commitValuation(db, Number(req.params.assetId), est);
+     db.close(); res.json({ ok:true, estimate: est, committed: commit });
+   } catch (e) { res.status(400).json({ error: String(e.message||e) }); }
+ });
```

---

# 3) クライアント（最小UI）

`client/src/pages/Comps.jsx`

```jsx
import React, { useEffect, useState } from 'react';

export default function CompsPage() {
  const [assetId, setAssetId] = useState('');
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ sale_date:'', price:'', currency:'JPY', price_jpy:'', source:'', source_url:'', marketplace:'', condition_grade:'', completeness:'', notes:'' });
  const [estimate, setEstimate] = useState(null);
  const [halfLife, setHalfLife] = useState(90);
  const [method, setMethod] = useState('wmad');

  async function load() {
    if (!assetId) return;
    const r = await fetch(`/api/comps/${assetId}`);
    const j = await r.json();
    setItems(j.items||[]);
    setEstimate(null);
  }
  async function add() {
    if (!assetId) return;
    const payload = {...form};
    if (!payload.sale_date) payload.sale_date = new Date().toISOString().slice(0,10);
    const r = await fetch(`/api/comps/${assetId}`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    const j = await r.json();
    setItems(j.items||[]);
    setForm({ sale_date:'', price:'', currency:'JPY', price_jpy:'', source:'', source_url:'', marketplace:'', condition_grade:'', completeness:'', notes:'' });
  }
  async function del(id) {
    if (!assetId) return;
    await fetch(`/api/comps/item/${id}`, { method:'DELETE' });
    load();
  }
  async function calc(commit=false) {
    if (!assetId) return;
    const qs = new URLSearchParams({ method, half_life_days:String(halfLife), commit: commit?'1':'0' }).toString();
    const r = await fetch(`/api/comps/${assetId}/estimate?${qs}`);
    const j = await r.json();
    setEstimate(j.estimate || null);
  }

  useEffect(()=>{ if (assetId) load(); }, [assetId]);

  return (
    <div className="p-4 grid gap-4 md:grid-cols-2 text-sm">
      <div>
        <h2 className="text-lg font-bold mb-2">Comps 登録</h2>
        <div className="mb-2">
          <input className="bg-neutral-900 p-2 rounded w-32 mr-2" placeholder="assetId" value={assetId} onChange={e=>setAssetId(e.target.value)} />
          <button className="px-3 py-1 rounded bg-blue-600 text-white" onClick={load}>読み込み</button>
        </div>
        <div className="grid gap-2">
          <div className="grid grid-cols-2 gap-2">
            <input className="bg-neutral-900 p-2 rounded" placeholder="sale_date YYYY-MM-DD" value={form.sale_date} onChange={e=>setForm({...form, sale_date:e.target.value})} />
            <input className="bg-neutral-900 p-2 rounded" placeholder="price" value={form.price} onChange={e=>setForm({...form, price:e.target.value})} />
            <input className="bg-neutral-900 p-2 rounded" placeholder="currency (JPY/USD/CNY)" value={form.currency} onChange={e=>setForm({...form, currency:e.target.value})} />
            <input className="bg-neutral-900 p-2 rounded" placeholder="price_jpy (任意)" value={form.price_jpy} onChange={e=>setForm({...form, price_jpy:e.target.value})} />
            <input className="bg-neutral-900 p-2 rounded col-span-2" placeholder="source (auction/dealer/marketplace)" value={form.source} onChange={e=>setForm({...form, source:e.target.value})} />
            <input className="bg-neutral-900 p-2 rounded col-span-2" placeholder="source_url" value={form.source_url} onChange={e=>setForm({...form, source_url:e.target.value})} />
            <input className="bg-neutral-900 p-2 rounded" placeholder="marketplace" value={form.marketplace} onChange={e=>setForm({...form, marketplace:e.target.value})} />
            <input className="bg-neutral-900 p-2 rounded" placeholder="condition_grade (A+/A/B/C)" value={form.condition_grade} onChange={e=>setForm({...form, condition_grade:e.target.value})} />
            <input className="bg-neutral-900 p-2 rounded col-span-2" placeholder="completeness (fullset/headonly…)" value={form.completeness} onChange={e=>setForm({...form, completeness:e.target.value})} />
            <input className="bg-neutral-900 p-2 rounded col-span-2" placeholder="notes" value={form.notes} onChange={e=>setForm({...form, notes:e.target.value})} />
          </div>
          <button className="px-3 py-1 rounded bg-green-600 text-white" onClick={add}>追加</button>
        </div>

        <div className="mt-4">
          <div className="font-semibold mb-1">登録済み（最新→）</div>
          <div className="max-h-[300px] overflow-auto border border-neutral-800 rounded">
            <table className="min-w-full">
              <thead><tr className="bg-neutral-900">
                <th className="px-2 py-1">日付</th><th className="px-2 py-1 text-right">価格(JPY)</th><th className="px-2 py-1">source</th><th className="px-2 py-1">操作</th>
              </tr></thead>
              <tbody>
                {items.map(it => (
                  <tr key={it.id} className="border-t border-neutral-800">
                    <td className="px-2 py-1">{it.sale_date}</td>
                    <td className="px-2 py-1 text-right">{Intl.NumberFormat('ja-JP').format(it.price_jpy)}</td>
                    <td className="px-2 py-1">{it.source || '-'}</td>
                    <td className="px-2 py-1">
                      <button className="px-2 py-1 bg-red-700 rounded" onClick={()=>{fetch(`/api/comps/item/${it.id}`,{method:'DELETE'}).then(load)}}>削除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-bold mb-2">推定</h2>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <label>method
            <select className="w-full bg-neutral-900 p-2 rounded" value={method} onChange={e=>setMethod(e.target.value)}>
              <option value="wmad">wmad（加重中央値+MAD除外）</option>
              <option value="wmean">wmean（加重平均）</option>
            </select>
          </label>
          <label>half_life_days
            <input type="number" className="w-full bg-neutral-900 p-2 rounded" value={halfLife} onChange={e=>setHalfLife(Number(e.target.value||0))} />
          </label>
        </div>
        <div className="flex gap-2 mb-3">
          <button className="px-3 py-1 rounded bg-blue-600 text-white" onClick={()=>calc(false)}>計算のみ</button>
          <button className="px-3 py-1 rounded bg-amber-600 text-white" onClick={()=>calc(true)}>計算して評価に反映</button>
        </div>
        {estimate && (
          <div className="p-3 rounded border border-neutral-700">
            <div>推定値: <b>{Intl.NumberFormat('ja-JP').format(estimate.estimate_jpy)} 円</b></div>
            <div>信頼度: {estimate.confidence} / 100</div>
            <div>使用件数: {estimate.used} / {estimate.total}（外れ値 {estimate.n_outliers} 件除外）</div>
            <div className="mt-2 text-xs opacity-70">明細（重みの高い順）</div>
            <ul className="text-xs list-disc ml-6">
              {estimate.details.sort((a,b)=>b.weight-a.weight).slice(0,8).map((d,i)=>(
                <li key={i}>{d.sale_date}: {Intl.NumberFormat('ja-JP').format(d.price_jpy)}円 / w={d.weight.toFixed(3)} / {d.condition||'-'} / {d.completeness||'-'} / {d.source||'-'}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
```

`client/src/App.jsx` にルートを追加

```diff
- import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
+ import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
+ import CompsPage from './pages/Comps';

  <div className="p-2 bg-neutral-950 border-b border-neutral-800">
    <Link className="mr-3" to="/">Dashboard</Link>
    <Link className="mr-3" to="/rebalance">Rebalance</Link>
+   <Link to="/comps">Comps</Link>
  </div>
  <Routes>
    <Route path="/" element={<Dashboard />} />
    <Route path="/rebalance" element={<Rebalance />} />
+   <Route path="/comps" element={<CompsPage />} />
  </Routes>
```

---

## 使い方（最短）

1. マイグレーション適用（`node scripts/apply-migrations.js` など）
2. サーバ再起動
3. `/comps` を開いて、`assetId` を入れて事例を登録

   * 外貨価格なら `price_jpy` を空にしてOK（`price_cache` に FX が入っていれば自動換算）
4. 「計算のみ」または「計算して評価に反映」を押す

   * 推定値・信頼度・採用件数/外れ値が出ます
   * 反映すると `valuations` に `source='comps'` の行が追記されます

---

## 補足・拡張ポイント

* **外れ値扱い**: MAD×3超過を除外（サンプル<5件は全採用）
* **重み**: 近さ（半減期デフォ90日）×状態（A+,A,B,C）×付属品（fullset/headonly）×ソース（auction/dealer/marketplace）
* **信頼度**: 件数＋鮮度から0–100で算出
* **UIの統合**: 将来は AssetCard に「Comps推定」を小バッジで表示可能（`/api/comps/:id/estimate` をバックグラウンドで叩くだけ）

---

ここまで入れば、**“相場の根拠がある評価”** を資産単位で持てます。
次は「**データ品質ダッシュボード**」 or 「**ドキュメントバインド**」に進めると運用体験がさらに上がります。どちらを先にやります？
