import React, { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card-simple'
import { Button } from '@/components/ui/button-simple'
import { Badge } from '@/components/ui/badge-simple'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { formatAssetName, formatUsd, formatManNumber, formatInt } from '../utils/format'

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [fx, setFx] = useState(null)
  const [market, setMarket] = useState(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState('')

  // Assets list states
  const [assets, setAssets] = useState([])
  const [assetsLoading, setAssetsLoading] = useState(false)
  const [assetsError, setAssetsError] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalAssetCount, setTotalAssetCount] = useState(0)
  const ASSETS_PER_PAGE = 30

  useEffect(() => {
    ;(async () => {
      try {
        const [d, fxr, ms] = await Promise.all([
          axios.get('/api/dashboard'),
          axios.get('/api/market/fx/USDJPY').catch(() => ({ data: null })),
          axios.get('/api/market/status').catch(() => ({ data: null })),
        ])
        setData(d.data)
        if (fxr.data?.rate) setFx({ rate: fxr.data.rate, stale: !!fxr.data.stale, asOf: fxr.data.asOf })
        setMarket(ms.data || null)
      } catch (e) {
        setError('ダッシュボードの取得に失敗しました')
      } finally {
        setLoading(false)
      }
    })()
    // initial assets
    fetchAssets(1)
  }, [])

  useEffect(() => {
    fetchAssets(currentPage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage])

  const fetchAssets = async (page) => {
    try {
      setAssetsLoading(true)
      setAssetsError('')
      const res = await axios.get(`/api/assets?page=${page}&limit=${ASSETS_PER_PAGE}`)
      if (res.data.assets) {
        setAssets(res.data.assets)
        setCurrentPage(res.data.pagination.page)
        setTotalPages(res.data.pagination.totalPages)
        setTotalAssetCount(res.data.pagination.total)
      } else {
        setAssets(res.data)
        setCurrentPage(1)
        setTotalPages(1)
        setTotalAssetCount(Array.isArray(res.data) ? res.data.length : 0)
      }
    } catch (e) {
      setAssetsError('資産データの取得に失敗しました')
    } finally {
      setAssetsLoading(false)
    }
  }

  const totals = useMemo(() => {
    if (!data) return { assets: 0, market: 0, book: 0, diff: 0 }
    const assets = data.totalAssets?.[0]?.count || 0
    const trendSorted = (data.monthlyTrend || []).slice().sort((a,b)=> (a.month > b.month ? 1 : -1))
    const latest = trendSorted.slice(-1)[0]
    const marketTotal = latest?.market_value_total ?? data.totalValue?.[0]?.total ?? 0
    const bookTotal = latest?.book_value_total ?? 0
    const diff = marketTotal - bookTotal
    return { assets, market: marketTotal, book: bookTotal, diff }
  }, [data])

  const pieData = useMemo(() => {
    const list = (data?.assetsByClass || []).map(x => ({
      name: getAssetClassName(x.class), value: x.total_value
    }))
    return list
  }, [data])

  const lineData = useMemo(() => {
    const trend = (data?.monthlyTrend || []).slice().sort((a,b)=> (a.month > b.month ? 1 : -1))
    return trend.map(it => ({ 
      month: it.month, 
      簿価総額: Math.round((it.book_value_total || 0) / 10000), 
      評価額総額: Math.round((it.market_value_total || 0) / 10000) 
    }))
  }, [data])

  const refreshAll = async () => {
    try {
      setUpdating(true)
      await axios.post('/api/valuations/refresh-all')
      const d = await axios.get('/api/dashboard')
      setData(d.data)
    } catch (e) {
      alert('市場データの更新に失敗しました')
    } finally {
      setUpdating(false)
    }
  }

  if (loading) return <div className="p-6 max-w-6xl mx-auto">Loading...</div>
  if (error) return <div className="p-6 max-w-6xl mx-auto"><div className="error">{error}</div></div>

  const COLORS = ['#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6']

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">ダッシュボード</h1>
        <Button onClick={refreshAll} disabled={updating}>{updating ? '更新中...' : '市場データ更新'}</Button>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">総評価額（NAV）</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold font-mono">{formatJPY(totals.market)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">簿価総額</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold font-mono">{formatJPY(totals.book)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">評価差額</CardTitle></CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold font-mono ${totals.diff>=0?'text-rose-600':'text-emerald-600'}`}>{(totals.diff>=0?'+':'') + formatJPY(totals.diff)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">資産数 / USDJPY</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.assets}</div>
            <div className="text-sm text-muted-foreground mt-1">USDJPY: {fx ? fx.rate.toFixed(2) : 'N/A'} {fx?.stale && <Badge variant="outline" className="ml-1">stale</Badge>}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex w-full items-center justify-between">
              <div>
                <CardTitle>クラス別配分</CardTitle>
                <CardDescription>総評価額に占める割合</CardDescription>
              </div>
              <div className="text-xs text-muted-foreground">単位：万円</div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%" cy="50%"
                    outerRadius={100}
                    label={(p) => formatManNumber(p.value)}
                  >
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v, n) => [formatManNumber(v), n]} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex w-full items-center justify-between">
              <div>
                <CardTitle>月次推移</CardTitle>
                <CardDescription>簿価 vs 評価</CardDescription>
              </div>
              <div className="text-xs text-muted-foreground">単位：万円</div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lineData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis tickFormatter={(v) => formatInt(v)} />
                  <Tooltip formatter={(value, name) => [formatInt(value), name]} />
                  <Legend />
                  <Line type="monotone" dataKey="簿価総額" stroke="#8b5cf6" />
                  <Line type="monotone" dataKey="評価額総額" stroke="#22c55e" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>資産一覧</CardTitle>
          <CardDescription>全{totalAssetCount}件のうち {Math.min((currentPage-1)*ASSETS_PER_PAGE+1, totalAssetCount)}-{Math.min(currentPage*ASSETS_PER_PAGE, totalAssetCount)}を表示</CardDescription>
        </CardHeader>
        <CardContent>
          {assetsLoading ? (
            <div>Loading assets...</div>
          ) : assetsError ? (
            <div className="text-red-600 text-sm">{assetsError}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-2 pr-4">資産名</th>
                    <th className="py-2 pr-4">クラス</th>
                    <th className="py-2 pr-4 text-right">数量</th>
                    <th className="py-2 pr-4 text-right">時価単価</th>
                    <th className="py-2 pr-4 text-right">簿価単価</th>
                    <th className="py-2 pr-4 text-right">簿価</th>
                    <th className="py-2 pr-4 text-right">評価額</th>
                    <th className="py-2 pr-4 text-right">評価損益</th>
                    <th className="py-2 pr-4">評価ソース</th>
                  </tr>
                </thead>
                <tbody>
                  {assets.map((a) => {
                    const cls = a.class
                    const qty = cls === 'us_stock' || cls === 'jp_stock'
                      ? (a.stock_details?.quantity ?? a.quantity ?? 0)
                      : (cls === 'precious_metal' ? (a.precious_metal_details?.weight_g ?? a.weight_g ?? 0) : (a.quantity ?? 0))

                    // Market and book unit prices
                    let mUnitUsd = null, bUnitUsd = null, mUnitJpy = null, bUnitJpy = null

                    if (cls === 'us_stock') {
                      // Prefer explicit fields, fall back to current_value_jpy/qty and book_value_jpy/qty
                      mUnitUsd = a.stock_details?.market_price_usd ?? a.market_price_usd ?? (a.current_value_jpy && qty > 0 && fx ? (a.current_value_jpy / fx.rate) / qty : null)
                      bUnitUsd = a.stock_details?.avg_price_usd ?? (fx && qty > 0 ? (a.book_value_jpy / fx.rate) / qty : null)
                      mUnitJpy = (mUnitUsd != null && fx) ? mUnitUsd * fx.rate : (a.current_value_jpy && qty > 0 ? a.current_value_jpy / qty : null)
                      bUnitJpy = qty > 0 ? (a.book_value_jpy / qty) : null
                    } else if (cls === 'jp_stock') {
                      mUnitJpy = (a.current_value_jpy && qty > 0) ? (a.current_value_jpy / qty) : null
                      bUnitJpy = a.stock_details?.avg_price_jpy ?? (qty > 0 ? (a.book_value_jpy / qty) : null)
                    } else if (cls === 'precious_metal') {
                      // Treat weight as quantity; unit prices may be provided
                      bUnitJpy = a.precious_metal_details?.unit_price_jpy ?? null
                      mUnitJpy = null // No live market unit in dashboard list
                    }

                    const bookTotal = a.book_value_jpy || 0
                    const currentTotal = a.current_value_jpy ?? (mUnitJpy != null && qty > 0 ? Math.floor(mUnitJpy * qty) : bookTotal)
                    const pl = currentTotal - bookTotal
                    const plPct = bookTotal > 0 ? (pl / bookTotal) * 100 : null

                    const plClass = pl > 0 ? 'text-rose-600' : (pl < 0 ? 'text-emerald-600' : 'text-muted-foreground')

                    return (
                      <tr key={a.id} className="border-t align-middle">
                        <td className="py-2 pr-4">{formatAssetName(a.name, a.note)}</td>
                        <td className="py-2 pr-4"><Badge variant="outline">{getAssetClassName(cls)}</Badge></td>
                        <td className="py-2 pr-4 text-right font-mono">{qty || '-'}</td>
                        <td className="py-2 pr-4 text-right font-mono whitespace-nowrap">
                          {cls === 'us_stock' ? (
                            <div className="flex flex-col items-end leading-tight">
                              <span>{mUnitUsd != null ? formatUsd(mUnitUsd) : '-'}</span>
                              <span className="text-xs text-muted-foreground">{mUnitJpy != null ? formatJPY(mUnitJpy) : '-'}</span>
                            </div>
                          ) : (
                            <span>{mUnitJpy != null ? formatJPY(mUnitJpy) : '-'}</span>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-right font-mono whitespace-nowrap">
                          {cls === 'us_stock' ? (
                            <div className="flex flex-col items-end leading-tight">
                              <span>{bUnitUsd != null ? formatUsd(bUnitUsd) : '-'}</span>
                              <span className="text-xs text-muted-foreground">{bUnitJpy != null ? formatJPY(bUnitJpy) : '-'}</span>
                            </div>
                          ) : (
                            <span>{bUnitJpy != null ? formatJPY(bUnitJpy) : '-'}</span>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-right font-mono">{formatJPY(bookTotal)}</td>
                        <td className="py-2 pr-4 text-right font-mono">{formatJPY(currentTotal)}</td>
                        <td className={`py-2 pr-4 text-right font-mono ${plClass}`}>
                          <div className="flex flex-col items-end leading-tight">
                            <span>{pl >= 0 ? '+' : ''}{formatJPY(pl)}</span>
                            <span className="text-xs">{plPct != null ? `${plPct >= 0 ? '+' : ''}${plPct.toFixed(2)}%` : '-'}</span>
                          </div>
                        </td>
                        <td className="py-2 pr-4">{a.valuation_source || 'manual'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {totalPages > 1 && (
                <div className="flex items-center justify-end gap-2 mt-4">
                  <Button variant="outline" size="sm" disabled={currentPage===1} onClick={() => setCurrentPage(p=>Math.max(1,p-1))}>前へ</Button>
                  <span className="text-sm">{currentPage} / {totalPages}</span>
                  <Button variant="outline" size="sm" disabled={currentPage===totalPages} onClick={() => setCurrentPage(p=>Math.min(totalPages,p+1))}>次へ</Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function getAssetClassName(cls) {
  const map = {
    us_stock: 'US株',
    jp_stock: '日本株',
    precious_metal: '貴金属',
    watch: '時計',
    real_estate: '不動産',
    collection: 'コレクション',
    cash: '現金',
  }
  return map[cls] || cls
}

function formatJPY(amount) {
  try {
    return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(amount || 0)
  } catch { return `¥${amount || 0}` }
}

// 万円の数値（カンマ区切り、単位はUIで明示）
