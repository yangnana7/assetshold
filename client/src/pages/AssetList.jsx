import React, { useState, useEffect, useMemo } from 'react'
import axios from 'axios'
import { formatCurrency, formatUsd, formatDate, formatAssetName } from '../utils/format'
import AssetEditModalBDD from '../components/AssetEditModalBDD'
import AssetEditModal from '../components/AssetEditModal'
import AssetCreateModal from '../components/AssetCreateModal'
import ValuationEditModal from '../components/ValuationEditModal'

function AssetList({ classFilter = '', onClearClassFilter }) {
  const [assets, setAssets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editingAsset, setEditingAsset] = useState(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [filter, setFilter] = useState('')
  const [page, setPage] = useState(1)
  const [limit] = useState(20)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [activeClass, setActiveClass] = useState(classFilter)
  const [valAsset, setValAsset] = useState(null)
  
  // Unified edit modal (BDD)
  const [isEditOpen, setIsEditOpen] = useState(false)

  useEffect(() => {
    fetchAssets(page)
  }, [page, activeClass])

  useEffect(() => {
    // Sync external classFilter (e.g., from dashboard drill-down)
    setActiveClass(classFilter || '')
    setPage(1)
  }, [classFilter])

  const fetchAssets = async (targetPage = 1) => {
    try {
      const response = await axios.get('/api/assets', { 
        withCredentials: true,
        params: activeClass ? { page: targetPage, limit, class: activeClass } : { page: targetPage, limit }
      })

      // API returns { assets, pagination } when paginated
      if (Array.isArray(response.data)) {
        setAssets(response.data)
        setTotalPages(1)
        setTotal(response.data.length)
      } else {
        setAssets(response.data.assets || [])
        const p = response.data.pagination || { page: 1, limit, total: 0, totalPages: 1 }
        setTotalPages(p.totalPages || 1)
        setTotal(p.total || 0)
      }
    } catch (error) {
      setError('資産データの取得に失敗しました')
      console.error('Assets fetch error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = (asset) => {
    setEditingAsset(asset)
    setIsEditOpen(true)
  }

  const handleDelete = async (asset) => {
    if (!window.confirm(`「${asset.name}」を削除してもよろしいですか？`)) {
      return
    }

    try {
      await axios.delete(`/api/assets/${asset.id}`, { withCredentials: true })
      // 再取得（ページングを維持）
      await fetchAssets(page)
    } catch (error) {
      setError('削除に失敗しました')
      console.error('Delete error:', error)
    }
  }

  const handleClearValuation = async (asset) => {
    if (!window.confirm(`「${asset.name}」の最新の手動評価を無効化し、簿価ベースに戻します。よろしいですか？`)) {
      return
    }
    try {
      await axios.delete(`/api/valuations/manual/latest/${asset.id}`, { withCredentials: true })
      await fetchAssets(page)
    } catch (e) {
      alert('評価の無効化に失敗しました（権限または評価未登録の可能性）')
    }
  }

  const handleAssetUpdated = (updatedAsset) => {
    setAssets(assets.map(a => a.id === updatedAsset.id ? updatedAsset : a))
    setIsEditOpen(false)
    setEditingAsset(null)
  }

  const handleAssetCreated = (newAsset) => {
    // 先頭ページに戻って最新を確認
    setShowCreateModal(false)
    setPage(1)
  }

  const isEditableAsset = (asset) => ['us_stock', 'jp_stock', 'precious_metal', 'watch', 'real_estate', 'collection', 'cash'].includes(asset.class)
  const isNewEditableAsset = (asset) => ['us_stock', 'jp_stock'].includes(asset.class)

  const filteredAssets = useMemo(() => {
    const f = (filter || '').toLowerCase()
    if (!f) return assets
    return assets.filter(asset =>
      (asset.name || '').toLowerCase().includes(f) ||
      (asset.note || '').toLowerCase().includes(f) ||
      getAssetClassName(asset.class).toLowerCase().includes(f)
    )
  }, [assets, filter])

  const canPrev = page > 1
  const canNext = page < totalPages
  const goToPage = (p) => {
    if (p < 1 || p > totalPages || p === page) return
    setLoading(true)
    setPage(p)
  }

  const renderPagination = () => {
    if (totalPages <= 1) return null

    // Build compact page list: first, prev, current neighbors, last
    const pages = new Set([1, page - 1, page, page + 1, totalPages])
    const normalized = [...pages].filter(p => p >= 1 && p <= totalPages).sort((a,b)=>a-b)

    const items = []
    for (let i = 0; i < normalized.length; i++) {
      const p = normalized[i]
      items.push(
        <button
          key={p}
          className={`pagination-btn ${p === page ? 'active' : ''}`}
          onClick={() => goToPage(p)}
        >{p}</button>
      )
      if (i < normalized.length - 1 && normalized[i+1] - p > 1) {
        items.push(<span className="pagination-ellipsis" key={`e-${p}`}>…</span>)
      }
    }

    return (
      <div className="pagination">
        <button className={`pagination-btn ${!canPrev ? 'disabled' : ''}`} onClick={() => canPrev && goToPage(page - 1)} disabled={!canPrev}>前</button>
        {items}
        <button className={`pagination-btn ${!canNext ? 'disabled' : ''}`} onClick={() => canNext && goToPage(page + 1)} disabled={!canNext}>次</button>
      </div>
    )
  }

  if (loading) return <div className="p-6 max-w-6xl mx-auto">Loading...</div>
  if (error) return <div className="p-6 max-w-6xl mx-auto"><div className="error">{error}</div></div>

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2>資産一覧</h2>
        <button 
          className="btn btn-primary"
          onClick={() => setShowCreateModal(true)}
        >
          新規登録
        </button>
      </div>

      {activeClass && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <span style={{ padding: '4px 8px', background: '#eef2ff', color: '#3730a3', borderRadius: '12px', fontSize: '12px' }}>クラス: {getAssetClassName(activeClass)}</span>
          <button className="btn" onClick={() => { setActiveClass(''); setPage(1); onClearClassFilter && onClearClassFilter(); }}>フィルタ解除</button>
        </div>
      )}

      <div style={{ marginBottom: '1rem' }}>
        <input
          type="text"
          placeholder="検索..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ 
            padding: '0.5rem', 
            border: '1px solid #ddd', 
            borderRadius: '4px',
            width: '300px'
          }}
        />
      </div>

      <table className="table">
        <thead>
          <tr>
            <th>クラス</th>
            <th>資産名</th>
            <th>取得日</th>
            <th>簿価</th>
            <th>評価額</th>
            <th>流動性</th>
            <th>アクション</th>
          </tr>
        </thead>
        <tbody>
          {filteredAssets.map(asset => (
            <React.Fragment key={asset.id}>
              <tr>
                <td>{getAssetClassName(asset.class)}</td>
                <td>
                  <div>
                    {formatAssetName(asset.name, asset.note)}
                    {renderEvaluationDetails(asset)}
                  </div>
                </td>
                <td>{formatDate(asset.acquired_at)}</td>
                <td className="format-number">{formatCurrency(asset.book_value_jpy)}</td>
                <td className="format-number">{renderEvaluationAmount(asset)}</td>
                <td>{asset.liquidity_tier}</td>
                <td>
                  {isEditableAsset(asset) && (
                  <button 
                    className="btn"
                    onClick={() => handleEdit(asset)}
                    style={{ marginRight: '0.5rem' }}
                  >
                    編集
                  </button>
                  )}
                  <button 
                    className="btn"
                    onClick={() => setValAsset(asset)}
                    style={{ marginRight: '0.5rem' }}
                  >
                    評価編集
                  </button>
                  <button
                    className="btn"
                    onClick={() => handleClearValuation(asset)}
                    style={{ marginRight: '0.5rem' }}
                  >
                    評価解除
                  </button>
                  <button 
                    className="btn btn-danger"
                    onClick={() => handleDelete(asset)}
                  >
                    削除
                  </button>
                </td>
              </tr>
              {/* Inline edit row removed per BDD (unified modal) */}
            </React.Fragment>
          ))}
        </tbody>
      </table>

      {filteredAssets.length === 0 && (
        <p style={{ textAlign: 'center', margin: '2rem 0', color: '#666' }}>
          資産が見つかりませんでした
        </p>
      )}

      {/* Pagination */}
      {renderPagination()}

      {editingAsset && (
        <>
          {isNewEditableAsset(editingAsset) ? (
            <AssetEditModal
              asset={editingAsset}
              isOpen={isEditOpen}
              onClose={() => { setIsEditOpen(false); setEditingAsset(null); }}
              onAssetUpdated={async (result) => {
                // Refresh list then close
                await fetchAssets()
                handleAssetUpdated(result.asset || result)
              }}
            />
          ) : (
            <AssetEditModalBDD
              asset={editingAsset}
              isOpen={isEditOpen}
              onClose={() => { setIsEditOpen(false); setEditingAsset(null); }}
              onSave={async (updated) => {
                // Refresh list then close
                await fetchAssets()
                handleAssetUpdated(updated)
              }}
            />
          )}
        </>
      )}

      {showCreateModal && (
        <AssetCreateModal
          onClose={() => setShowCreateModal(false)}
          onAssetCreated={handleAssetCreated}
        />
      )}

      {valAsset && (
        <ValuationEditModal
          asset={valAsset}
          isOpen={!!valAsset}
          onClose={() => setValAsset(null)}
          onSaved={async () => { await fetchAssets(page); setValAsset(null); }}
        />
      )}
    </div>
  )
}

function renderEvaluationDetails(asset) {
  if (asset.class === 'us_stock' || asset.class === 'jp_stock') {
    const details = asset.stock_details;
    if (details) {
      const priceField = asset.class === 'us_stock' ? 'avg_price_usd' : 'avg_price_jpy';
      const currency = asset.class === 'us_stock' ? 'USD' : 'JPY';
      const price = details[priceField] || 0;
      const quantity = details.quantity || 0;
      
      const jsx = (
        <div style={{ fontSize: '0.85em', color: '#666', marginTop: '4px' }}>
          取得単価: {currency === 'USD' ? '$' : '¥'}{price.toFixed(2)} × {quantity}株
        </div>
      );
      return jsx;
    }
  } else if (asset.class === 'precious_metal') {
    const details = asset.precious_metal_details;
    if (details) {
      const unitPrice = details.unit_price_jpy || 0;
      const weight = details.weight_g || 0;
      
      const jsx = (
        <div style={{ fontSize: '0.85em', color: '#666', marginTop: '4px' }}>
          単価: ¥{unitPrice.toFixed(2)} × {weight.toFixed(1)}g
        </div>
      );
      return jsx;
    }
  }
  return null;
}

function renderEvaluationAmount(asset) {
  if (asset.class === 'us_stock') {
    const details = asset.stock_details;
    if (details) {
      const qty = Number(details.quantity || 0)
      if (Number.isFinite(details.market_price_usd) && qty > 0) {
        const totalUsd = details.market_price_usd * qty
        return formatUsd(totalUsd)
      }
    }
    // フォールバック: 円表示
    return formatCurrency(asset.current_value_jpy || asset.book_value_jpy)
  }

  if (asset.class === 'jp_stock') {
    const details = asset.stock_details;
    if (details && details.evaluation !== undefined) {
      return formatCurrency(details.evaluation);
    }
  } else if (asset.class === 'precious_metal') {
    const details = asset.precious_metal_details;
    if (details && details.evaluation !== undefined) {
      return formatCurrency(details.evaluation);
    }
  }
  return formatCurrency(asset.book_value_jpy);
}

function getAssetClassName(classKey) {
  const classNames = {
    us_stock: '米国株',
    jp_stock: '日本株',
    watch: '時計',
    precious_metal: '貴金属',
    real_estate: '不動産',
    collection: 'コレクション',
    cash: '現金・預金'
  }
  
  return classNames[classKey] || classKey
}

export default AssetList
