import React, { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card-simple'
import { Button } from '@/components/ui/button-simple'

export default function DuplicateMergeModal({ isOpen, group, onClose, onMerged }) {
  const [keepId, setKeepId] = useState(null)
  const [plan, setPlan] = useState({})
  const assets = group?.assets || []

  useEffect(() => {
    if (isOpen && assets.length) {
      const newest = [...assets].sort((a,b)=> new Date(b.created_at) - new Date(a.created_at))[0]
      setKeepId(newest?.id || assets[0]?.id)
      setPlan({})
    }
  }, [isOpen, group])

  if (!isOpen || !group) return null

  const fieldsCommon = [
    { key: 'name', label: '名称' },
    { key: 'note', label: '備考' },
    { key: 'acquired_at', label: '取得日' },
    { key: 'book_value_jpy', label: '簿価（円）' },
    { key: 'valuation_source', label: '評価ソース' },
    { key: 'liquidity_tier', label: '流動性' },
    { key: 'tags', label: 'タグ(JSON)' },
  ]

  const classFields = useMemo(() => {
    const cls = assets[0]?.class
    if (cls === 'us_stock') return [
      { key: 'ticker', label: 'ティッカー' },
      { key: 'exchange', label: '取引所' },
      { key: 'us_quantity', label: '株数', map: 'quantity' },
      { key: 'avg_price_usd', label: '平均取得単価(USD)' },
    ]
    if (cls === 'jp_stock') return [
      { key: 'code', label: '証券コード' },
      { key: 'jp_quantity', label: '株数', map: 'quantity' },
      { key: 'avg_price_jpy', label: '平均取得単価(JPY)' },
    ]
    if (cls === 'precious_metal') return [
      { key: 'metal', label: '金属' },
      { key: 'weight_g', label: '重量(g)' },
      { key: 'purity', label: '純度' },
      { key: 'unit_price_jpy', label: '単価(円/g)' },
    ]
    return []
  }, [group])

  const choose = (fieldKey, assetId) => {
    setPlan(prev => ({ ...prev, [fieldKey]: assetId }))
  }

  const submit = async () => {
    try {
      const res = await fetch('/api/duplicates/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          asset_ids: assets.map(a => a.id),
          keep_asset_id: keepId,
          merge_plan: plan,
        })
      })
      if (!res.ok) {
        const j = await res.json().catch(()=>({}))
        throw new Error(j?.error || '統合に失敗しました')
      }
      const j = await res.json().catch(()=>({}))
      onMerged?.(j)
      onClose?.()
    } catch (e) {
      alert(e.message)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-lg max-w-5xl w-full m-4" onClick={e=>e.stopPropagation()}>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>重複統合（項目選択）</CardTitle>
                <CardDescription>{group.criteria} / {assets.length}件</CardDescription>
              </div>
              <div className="text-sm">保持対象: 
                <select className="ml-2 border rounded px-2 py-1" value={keepId || ''} onChange={(e)=>setKeepId(Number(e.target.value))}>
                  {assets.map(a=> <option key={a.id} value={a.id}>ID {a.id}: {a.name}</option>)}
                </select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left py-2 pr-4">フィールド</th>
                    {assets.map(a => (
                      <th key={a.id} className="text-left py-2 pr-4">ID {a.id}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...fieldsCommon, ...classFields].map(f => (
                    <tr key={f.key} className="border-t">
                      <td className="py-2 pr-4 font-medium whitespace-nowrap">{f.label}</td>
                      {assets.map(a => (
                        <td key={a.id} className="py-2 pr-4 align-top">
                          <label className="flex items-start gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name={`field_${f.key}`}
                              checked={plan[f.key] === a.id}
                              onChange={()=> choose(f.key, a.id)}
                            />
                            <span className="text-xs break-all">
                              {String(a[f.key] ?? a[(f.map||'')] ?? '').toString() || '-'}
                            </span>
                          </label>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <Button variant="secondary" onClick={onClose}>キャンセル</Button>
              <Button onClick={submit}>選択内容で統合</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

