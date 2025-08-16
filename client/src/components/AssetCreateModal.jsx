import React, { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card-simple'
import { Button } from '@/components/ui/button-simple'
import { Badge } from '@/components/ui/badge-simple'
import { Input } from '@/components/ui/input-simple'
import { Plus, Save, X } from 'lucide-react'

export default function AssetCreateModal({ onClose, onAssetCreated }) {
  const [common, setCommon] = useState({
    class: '',
    name: '',
    note: '',
    acquired_at: '',
    book_value_jpy: 0,
    valuation_source: 'manual',
    liquidity_tier: '',
    tags: ''
  })
  const [classFields, setClassFields] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const isStock = useMemo(() => ['us_stock', 'jp_stock'].includes(common.class), [common.class])
  const isMetal = useMemo(() => common.class === 'precious_metal', [common.class])

  useEffect(() => {
    // Reset class fields when class changes
    if (common.class === 'us_stock') {
      setClassFields({ ticker: '', exchange: '', quantity: 0, avg_price_usd: 0 })
    } else if (common.class === 'jp_stock') {
      setClassFields({ code: '', quantity: 0, avg_price_jpy: 0 })
    } else if (common.class === 'precious_metal') {
      setClassFields({ metal: 'gold', weight_g: 0, purity: 0.9999, unit_price_jpy: 0 })
    } else if (common.class === 'watch') {
      setClassFields({ brand: '', model: '', ref: '', box_papers: false })
    } else if (common.class === 'real_estate') {
      setClassFields({ address: '', land_area_sqm: 0, building_area_sqm: 0, rights: '' })
    } else if (common.class === 'collection') {
      setClassFields({ category: '', variant: '' })
    } else if (common.class === 'cash') {
      setClassFields({ currency: 'JPY', balance: 0 })
    } else {
      setClassFields({})
    }
  }, [common.class])

  // Auto-calc book value for convenience (client-side hint only)
  useEffect(() => {
    if (common.class === 'us_stock') {
      const qty = Number(classFields.quantity) || 0
      const price = Number(classFields.avg_price_usd) || 0
      if (qty > 0 && price > 0) {
        const fx = 150 // hint only
        setCommon(prev => ({ ...prev, book_value_jpy: Math.floor(qty * price * fx) }))
      }
    } else if (common.class === 'jp_stock') {
      const qty = Number(classFields.quantity) || 0
      const price = Number(classFields.avg_price_jpy) || 0
      if (qty > 0 && price > 0) {
        setCommon(prev => ({ ...prev, book_value_jpy: Math.floor(qty * price) }))
      }
    } else if (common.class === 'precious_metal') {
      const w = Number(classFields.weight_g) || 0
      const u = Number(classFields.unit_price_jpy) || 0
      if (w > 0 && u > 0) {
        setCommon(prev => ({ ...prev, book_value_jpy: Math.floor(w * u) }))
      }
    }
  }, [common.class, classFields])

  const updateCommon = (field, value) => setCommon(prev => ({ ...prev, [field]: value }))
  const updateClassField = (field, value) => setClassFields(prev => ({ ...prev, [field]: value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const payload = { ...common, ...classFields }
      if (!payload.note) payload.note = ''
      const res = await axios.post('/api/assets', payload, { withCredentials: true })
      onAssetCreated(res.data)
    } catch (err) {
      setError(err.response?.data?.error || '登録に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto m-4">
        <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Plus className="w-5 h-5" />
            <h2 className="text-xl font-semibold">新規資産登録</h2>
            {common.class && <Badge variant="outline">{common.class}</Badge>}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && <div className="text-red-600 text-sm border border-red-200 bg-red-50 rounded p-2">{error}</div>}

          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">共通フィールド</CardTitle>
                <CardDescription>全資産共通の属性</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">アセットクラス</label>
                  <select
                    className="w-full px-3 py-2 border rounded-md"
                    value={common.class}
                    onChange={(e) => updateCommon('class', e.target.value)}
                    required
                    disabled={loading}
                  >
                    <option value="">選択してください</option>
                    <option value="us_stock">米国株</option>
                    <option value="jp_stock">日本株</option>
                    <option value="watch">時計</option>
                    <option value="precious_metal">貴金属</option>
                    <option value="real_estate">不動産</option>
                    <option value="collection">コレクション</option>
                    <option value="cash">現金・預金</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium mb-1 block">資産名</label>
                  <Input
                    value={common.name}
                    onChange={(e) => updateCommon('name', e.target.value)}
                    placeholder="例: Alphabet C, 純金小判"
                    disabled={loading}
                    required
                  />
                </div>

                <div>
                  <label className="text-sm font-medium mb-1 block">取得日</label>
                  <Input
                    type="date"
                    value={common.acquired_at}
                    onChange={(e) => updateCommon('acquired_at', e.target.value)}
                    disabled={loading}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium mb-1 block">簿価（円）</label>
                  <Input
                    type="number"
                    value={common.book_value_jpy}
                    onChange={(e) => updateCommon('book_value_jpy', Number(e.target.value) || 0)}
                    min={0}
                    step={1}
                    disabled={loading}
                    required
                  />
                </div>

                <div>
                  <label className="text-sm font-medium mb-1 block">評価ソース</label>
                  <select
                    className="w-full px-3 py-2 border rounded-md"
                    value={common.valuation_source}
                    onChange={(e) => updateCommon('valuation_source', e.target.value)}
                    disabled={loading}
                  >
                    <option value="manual">手動</option>
                    <option value="market">市場価格</option>
                    <option value="comps">参考価格</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium mb-1 block">流動性Tier</label>
                  <select
                    className="w-full px-3 py-2 border rounded-md"
                    value={common.liquidity_tier}
                    onChange={(e) => updateCommon('liquidity_tier', e.target.value)}
                    required
                    disabled={loading}
                  >
                    <option value="">選択してください</option>
                    <option value="L1">L1 (高)</option>
                    <option value="L2">L2 (中)</option>
                    <option value="L3">L3 (低)</option>
                    <option value="L4">L4 (極低)</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium mb-1 block">メモ</label>
                  <textarea
                    className="w-full px-3 py-2 border rounded-md resize-none"
                    rows={3}
                    value={common.note}
                    onChange={(e) => updateCommon('note', e.target.value)}
                    placeholder="資産に関するメモ"
                    disabled={loading}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium mb-1 block">タグ (JSON)</label>
                  <Input
                    value={common.tags}
                    onChange={(e) => updateCommon('tags', e.target.value)}
                    placeholder='{"category": "growth", "sector": "tech"}'
                    disabled={loading}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">クラス別フィールド</CardTitle>
                <CardDescription>選択したクラス専用の属性</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* US Stock */}
                {common.class === 'us_stock' && (
                  <>
                    <div>
                      <label className="text-sm font-medium mb-1 block">ティッカー</label>
                      <Input value={classFields.ticker || ''} onChange={(e) => updateClassField('ticker', e.target.value)} placeholder="例: GOOGL" required disabled={loading} />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">取引所</label>
                      <Input value={classFields.exchange || ''} onChange={(e) => updateClassField('exchange', e.target.value)} placeholder="例: NASDAQ" disabled={loading} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-sm font-medium mb-1 block">株数</label>
                        <Input type="number" value={classFields.quantity ?? 0} onChange={(e) => updateClassField('quantity', Number(e.target.value) || 0)} min={0} step={0.001} required disabled={loading} />
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-1 block">平均取得単価（USD）</label>
                        <Input type="number" value={classFields.avg_price_usd ?? 0} onChange={(e) => updateClassField('avg_price_usd', Number(e.target.value) || 0)} min={0} step={0.01} required disabled={loading} />
                      </div>
                    </div>
                  </>
                )}

                {/* JP Stock */}
                {common.class === 'jp_stock' && (
                  <>
                    <div>
                      <label className="text-sm font-medium mb-1 block">銘柄コード</label>
                      <Input value={classFields.code || ''} onChange={(e) => updateClassField('code', e.target.value)} placeholder="例: 7203" required disabled={loading} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-sm font-medium mb-1 block">株数</label>
                        <Input type="number" value={classFields.quantity ?? 0} onChange={(e) => updateClassField('quantity', Number(e.target.value) || 0)} min={0} step={1} required disabled={loading} />
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-1 block">平均取得単価（JPY）</label>
                        <Input type="number" value={classFields.avg_price_jpy ?? 0} onChange={(e) => updateClassField('avg_price_jpy', Number(e.target.value) || 0)} min={0} step={1} required disabled={loading} />
                      </div>
                    </div>
                  </>
                )}

                {/* Precious Metal */}
                {common.class === 'precious_metal' && (
                  <>
                    <div>
                      <label className="text-sm font-medium mb-1 block">金属</label>
                      <select className="w-full px-3 py-2 border rounded-md" value={classFields.metal || 'gold'} onChange={(e) => updateClassField('metal', e.target.value)} required disabled={loading}>
                        <option value="gold">金</option>
                        <option value="silver">銀</option>
                        <option value="platinum">プラチナ</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="text-sm font-medium mb-1 block">重量（g）</label>
                        <Input type="number" value={classFields.weight_g ?? 0} onChange={(e) => updateClassField('weight_g', Number(e.target.value) || 0)} min={0} step={0.01} required disabled={loading} />
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-1 block">純度（0-1）</label>
                        <Input type="number" value={classFields.purity ?? 0.9999} onChange={(e) => updateClassField('purity', Number(e.target.value) || 0)} min={0} max={1} step={0.0001} required disabled={loading} />
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-1 block">単価（円/g）</label>
                        <Input type="number" value={classFields.unit_price_jpy ?? 0} onChange={(e) => updateClassField('unit_price_jpy', Number(e.target.value) || 0)} min={0} step={1} required disabled={loading} />
                      </div>
                    </div>
                  </>
                )}

                {/* Minimal placeholders for other classes to keep layout consistent */}
                {common.class === 'watch' && (
                  <>
                    <div className="grid md:grid-cols-3 gap-3">
                      <Input placeholder="ブランド" value={classFields.brand || ''} onChange={(e) => updateClassField('brand', e.target.value)} disabled={loading} />
                      <Input placeholder="モデル" value={classFields.model || ''} onChange={(e) => updateClassField('model', e.target.value)} disabled={loading} />
                      <Input placeholder="Ref" value={classFields.ref || ''} onChange={(e) => updateClassField('ref', e.target.value)} disabled={loading} />
                    </div>
                  </>
                )}

                {common.class === 'real_estate' && (
                  <>
                    <Input placeholder="住所" value={classFields.address || ''} onChange={(e) => updateClassField('address', e.target.value)} disabled={loading} />
                    <div className="grid grid-cols-3 gap-3">
                      <Input type="number" placeholder="土地面積㎡" value={classFields.land_area_sqm ?? 0} onChange={(e) => updateClassField('land_area_sqm', Number(e.target.value) || 0)} disabled={loading} />
                      <Input type="number" placeholder="建物面積㎡" value={classFields.building_area_sqm ?? 0} onChange={(e) => updateClassField('building_area_sqm', Number(e.target.value) || 0)} disabled={loading} />
                      <Input placeholder="権利" value={classFields.rights || ''} onChange={(e) => updateClassField('rights', e.target.value)} disabled={loading} />
                    </div>
                  </>
                )}

                {common.class === 'collection' && (
                  <div className="grid md:grid-cols-2 gap-3">
                    <Input placeholder="カテゴリ" value={classFields.category || ''} onChange={(e) => updateClassField('category', e.target.value)} disabled={loading} />
                    <Input placeholder="バリアント" value={classFields.variant || ''} onChange={(e) => updateClassField('variant', e.target.value)} disabled={loading} />
                  </div>
                )}

                {common.class === 'cash' && (
                  <div className="grid md:grid-cols-2 gap-3">
                    <Input placeholder="通貨 (例: JPY)" value={classFields.currency || 'JPY'} onChange={(e) => updateClassField('currency', e.target.value)} disabled={loading} />
                    <Input type="number" placeholder="残高" value={classFields.balance ?? 0} onChange={(e) => updateClassField('balance', Number(e.target.value) || 0)} disabled={loading} />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>キャンセル</Button>
            <Button type="submit" disabled={loading}>
              <Save className="w-4 h-4 mr-1" />{loading ? '登録中...' : '登録'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
