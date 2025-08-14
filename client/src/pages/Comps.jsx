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