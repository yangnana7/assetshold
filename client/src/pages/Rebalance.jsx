import React, { useEffect, useState } from 'react';

export default function Rebalance() {
  const [targets, setTargets] = useState({ tolerance_pct: 5, targets: [] });
  const [plan, setPlan] = useState(null);
  const [tol, setTol] = useState(5);
  const [minTrade, setMinTrade] = useState(10000);
  const [to, setTo] = useState('target');
  const [useBook, setUseBook] = useState(true);

  useEffect(()=>{ fetchTargets(); }, []);

  async function fetchTargets() {
    const r = await fetch('/api/rebalance/targets');
    const j = await r.json();
    setTargets(j);
    if (j && typeof j.tolerance_pct === 'number') setTol(j.tolerance_pct);
  }
  async function fetchPlan() {
    const q = new URLSearchParams({
      tol: String(tol), min_trade: String(minTrade), to, use_book: useBook ? '1' : '0'
    }).toString();
    const r = await fetch(`/api/rebalance/plan?${q}`);
    setPlan(await r.json());
  }
  async function saveTargets() {
    const payload = { tolerance_pct: tol, targets: targets.targets };
    await fetch('/api/rebalance/targets', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    await fetchTargets();
  }

  return (
    <div className="p-4 grid gap-4 md:grid-cols-3 text-sm">
      <div className="md:col-span-2">
        <h2 className="text-lg font-bold mb-2">ドリフト & リバランス案</h2>
        <div className="mb-2">
          <button className="px-3 py-1 rounded bg-blue-600 text-white" onClick={fetchPlan}>プランを計算</button>
        </div>
        {plan && plan.plan && (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full border border-neutral-700">
                <thead>
                  <tr className="bg-neutral-900">
                    <th className="px-2 py-1 text-left">クラス</th>
                    <th className="px-2 py-1 text-right">現状(円)</th>
                    <th className="px-2 py-1 text-right">現状(%)</th>
                    <th className="px-2 py-1 text-right">目標(%)</th>
                    <th className="px-2 py-1 text-right">許容範囲</th>
                    <th className="px-2 py-1 text-right">ドリフト(%)</th>
                    <th className="px-2 py-1 text-center">逸脱</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.plan.rows.map((r)=> (
                    <tr key={r.class} className="border-t border-neutral-800">
                      <td className="px-2 py-1">{r.class}</td>
                      <td className="px-2 py-1 text-right">{Intl.NumberFormat('ja-JP').format(r.cur_value_jpy)}</td>
                      <td className="px-2 py-1 text-right">{r.cur_pct.toFixed(2)}</td>
                      <td className="px-2 py-1 text-right">{r.target_pct.toFixed(2)}</td>
                      <td className="px-2 py-1 text-right">{r.min_pct.toFixed(1)}–{r.max_pct.toFixed(1)}</td>
                      <td className={`px-2 py-1 text-right ${Math.abs(r.drift_pct)>=0.01?'font-bold':''}`}>{r.drift_pct.toFixed(2)}</td>
                      <td className="px-2 py-1 text-center">{r.breach ? '⚠' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4">
              <div className="font-semibold">売買提案</div>
              {plan.plan.trades.length === 0
                ? <div className="opacity-70">逸脱なし / 最小取引額未満のみ</div>
                : plan.plan.trades.map((t, i)=> (
                    <div key={i} className="mt-2 p-2 rounded border border-neutral-700">
                      <div className="flex justify-between">
                        <div>SELL <b>{t.from_class}</b> → BUY <b>{t.to_class}</b></div>
                        <div>{Intl.NumberFormat('ja-JP').format(t.amount_jpy)} 円</div>
                      </div>
                      <div className="grid md:grid-cols-2 gap-2 mt-2">
                        <div>
                          <div className="text-xs opacity-70">売却候補</div>
                          <ul className="list-disc ml-6">
                            {t.sells.map((s, j)=> <li key={j}>{s.name}（{s.liquidity_tier || '-'}）: {Intl.NumberFormat('ja-JP').format(s.amount_jpy)}円</li>)}
                          </ul>
                        </div>
                        <div>
                          <div className="text-xs opacity-70">購入候補</div>
                          <ul className="list-disc ml-6">
                            {t.buys.map((b, j)=> <li key={j}>{b.name}（{b.liquidity_tier || '-'}）: {Intl.NumberFormat('ja-JP').format(b.amount_jpy)}円</li>)}
                          </ul>
                        </div>
                      </div>
                    </div>
                  ))
              }
            </div>
          </>
        )}
      </div>

      <div className="md:col-span-1">
        <h3 className="font-semibold mb-2">パラメータ</h3>
        <div className="space-y-2">
          <label className="block">許容帯(±%)
            <input type="number" className="w-full bg-neutral-900 p-2 rounded" value={tol} onChange={e=>setTol(Number(e.target.value||0))} />
          </label>
          <label className="block">最小取引額(円)
            <input type="number" className="w-full bg-neutral-900 p-2 rounded" value={minTrade} onChange={e=>setMinTrade(Number(e.target.value||0))} />
          </label>
          <label className="block">合わせ方
            <select className="w-full bg-neutral-900 p-2 rounded" value={to} onChange={e=>setTo(e.target.value)}>
              <option value="target">target（目標ど真ん中へ）</option>
              <option value="mid">mid（許容帯の中央値へ）</option>
            </select>
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={useBook} onChange={e=>setUseBook(e.target.checked)} /> 評価が無い資産は簿価で代用
          </label>

          <div className="mt-4">
            <div className="text-xs opacity-70 mb-1">目標配分（合計≈100）</div>
            {(targets.targets||[]).map((t, i)=> (
              <div key={i} className="flex gap-2 mb-1">
                <input className="flex-1 bg-neutral-900 p-2 rounded" value={t.class} readOnly />
                <input type="number" className="w-24 bg-neutral-900 p-2 rounded"
                  value={t.pct}
                  onChange={e=>{
                    const v = [...(targets.targets||[])];
                    v[i] = {...v[i], pct: Number(e.target.value||0)};
                    setTargets({...targets, targets:v});
                  }}/>
              </div>
            ))}
            <button className="mt-2 px-3 py-1 rounded bg-green-600 text-white" onClick={saveTargets}>目標保存</button>
          </div>
        </div>
      </div>
    </div>
  );
}