import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { formatCurrency, formatDate, formatAssetName } from '../utils/format'
import AssetEditModal from '../components/AssetEditModal'
import AssetCreateModal from '../components/AssetCreateModal'

function AssetList() {
  const [assets, setAssets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editingAsset, setEditingAsset] = useState(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [filter, setFilter] = useState('')
  
  // Inline editing states
  const [editingAssetId, setEditingAssetId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [editPreview, setEditPreview] = useState(null)
  const [isUpdating, setIsUpdating] = useState(false)

  useEffect(() => {
    fetchAssets()
  }, [])

  const fetchAssets = async () => {
    try {
      const response = await axios.get('/api/assets', { withCredentials: true })
      
      // Fetch detailed information for each asset
      const assetsWithDetails = await Promise.all(response.data.map(async (asset) => {
        try {
          const detailResponse = await axios.get(`/api/assets/${asset.id}`, { withCredentials: true })
          return detailResponse.data
        } catch (detailError) {
          console.warn(`Failed to fetch details for asset ${asset.id}:`, detailError)
          return asset
        }
      }))
      
      setAssets(assetsWithDetails)
    } catch (error) {
      setError('資産データの取得に失敗しました')
      console.error('Assets fetch error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = (asset) => {
    setEditingAsset(asset)
  }

  const handleDelete = async (asset) => {
    if (!window.confirm(`「${asset.name}」を削除してもよろしいですか？`)) {
      return
    }

    try {
      await axios.delete(`/api/assets/${asset.id}`, { withCredentials: true })
      setAssets(assets.filter(a => a.id !== asset.id))
    } catch (error) {
      setError('削除に失敗しました')
      console.error('Delete error:', error)
    }
  }

  const handleAssetUpdated = (updatedAsset) => {
    setAssets(assets.map(a => a.id === updatedAsset.id ? updatedAsset : a))
    setEditingAsset(null)
  }

  const handleAssetCreated = (newAsset) => {
    setAssets([newAsset, ...assets])
    setShowCreateModal(false)
  }

  // Inline editing functions
  const startInlineEdit = (asset) => {
    if (!isEditableAsset(asset)) return;
    
    setEditingAssetId(asset.id)
    
    // Initialize form with current values
    if (asset.class === 'us_stock' && asset.stock_details) {
      setEditForm({
        class: asset.class,
        quantity: asset.stock_details.quantity,
        avg_price_usd: asset.stock_details.avg_price_usd || '',
        recalc: 'auto'
      })
    } else if (asset.class === 'jp_stock' && asset.stock_details) {
      setEditForm({
        class: asset.class,
        quantity: asset.stock_details.quantity,
        avg_price_jpy: asset.stock_details.avg_price_jpy || '',
        recalc: 'auto'
      })
    } else if (asset.class === 'precious_metal' && asset.precious_metal_details) {
      setEditForm({
        class: asset.class,
        weight_g: asset.precious_metal_details.weight_g,
        unit_book_cost_jpy_per_gram: '',
        recalc: 'auto'
      })
    }
    
    setEditPreview(null)
  }

  const cancelInlineEdit = () => {
    setEditingAssetId(null)
    setEditForm({})
    setEditPreview(null)
  }

  const handleFormChange = (field, value) => {
    const newForm = { ...editForm, [field]: value }
    setEditForm(newForm)
    
    // Calculate preview
    const asset = assets.find(a => a.id === editingAssetId)
    if (asset) {
      calculatePreview(asset, newForm)
    }
  }

  const calculatePreview = (asset, form) => {
    try {
      let newBook = 0
      const oldBook = asset.book_value_jpy

      if (form.class === 'us_stock' && asset.stock_details) {
        const oldQty = asset.stock_details.quantity
        const newQty = Number(form.quantity)
        
        if (form.recalc === 'unit' && Number.isFinite(Number(form.avg_price_usd))) {
          // Unit method - simplified calculation without FX rate
          const unitBook = oldBook / oldQty
          newBook = Math.round(unitBook * newQty)
        } else {
          // Scale method
          if (oldQty > 0) {
            const unitBook = oldBook / oldQty
            newBook = Math.round(unitBook * newQty)
          }
        }
      } else if (form.class === 'jp_stock' && asset.stock_details) {
        const oldQty = asset.stock_details.quantity
        const newQty = Number(form.quantity)
        
        if (form.recalc === 'unit' && Number.isFinite(Number(form.avg_price_jpy))) {
          newBook = Math.round(Number(form.avg_price_jpy) * newQty)
        } else {
          // Scale method
          if (oldQty > 0) {
            const unitBook = oldBook / oldQty
            newBook = Math.round(unitBook * newQty)
          }
        }
      } else if (form.class === 'precious_metal' && asset.precious_metal_details) {
        const oldWeight = asset.precious_metal_details.weight_g
        const newWeight = Number(form.weight_g)
        
        if (form.recalc === 'unit' && Number.isFinite(Number(form.unit_book_cost_jpy_per_gram))) {
          newBook = Math.round(Number(form.unit_book_cost_jpy_per_gram) * newWeight)
        } else {
          // Scale method
          if (oldWeight > 0) {
            const unitBook = oldBook / oldWeight
            newBook = Math.round(unitBook * newWeight)
          }
        }
      }

      setEditPreview({
        newBook,
        deltaBook: newBook - oldBook,
        valid: newBook > 0
      })
    } catch (e) {
      setEditPreview({ valid: false, error: 'Calculation error' })
    }
  }

  const saveInlineEdit = async () => {
    if (!editPreview || !editPreview.valid) return

    setIsUpdating(true)
    try {
      
      const response = await axios.patch(`/api/assets/${editingAssetId}`, editForm, { withCredentials: true })
      
      if (response.data.ok) {
        // Refresh the assets list
        await fetchAssets()
        
        // Close edit mode
        cancelInlineEdit()
        
        alert('資産を更新しました')
      }
    } catch (error) {
      console.error('Update error:', error)
      alert(`更新エラー: ${error.response?.data?.error || error.message}`)
    } finally {
      setIsUpdating(false)
    }
  }

  const isEditableAsset = (asset) => {
    return ['us_stock', 'jp_stock', 'precious_metal'].includes(asset.class)
  }

  const renderInlineEditForm = (asset) => {
    if (asset.class === 'us_stock') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.5rem', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <label style={{ minWidth: '60px' }}>株数:</label>
            <input
              type="number"
              min="1"
              step="1"
              value={editForm.quantity || ''}
              onChange={(e) => handleFormChange('quantity', parseInt(e.target.value) || 0)}
              style={{ width: '80px', padding: '0.25rem' }}
            />
            <label style={{ minWidth: '80px' }}>単価(USD):</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={editForm.avg_price_usd || ''}
              onChange={(e) => handleFormChange('avg_price_usd', parseFloat(e.target.value) || '')}
              style={{ width: '80px', padding: '0.25rem' }}
              placeholder="任意"
            />
          </div>
          {editPreview && (
            <div style={{ fontSize: '0.85rem', color: editPreview.valid ? '#28a745' : '#dc3545' }}>
              新簿価: {formatCurrency(editPreview.newBook)} (差額: {editPreview.deltaBook >= 0 ? '+' : ''}{formatCurrency(editPreview.deltaBook)})
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button 
              onClick={saveInlineEdit} 
              disabled={!editPreview || !editPreview.valid || isUpdating}
              style={{ padding: '0.25rem 0.5rem', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px' }}
            >
              {isUpdating ? '更新中...' : '保存'}
            </button>
            <button 
              onClick={cancelInlineEdit}
              style={{ padding: '0.25rem 0.5rem', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px' }}
            >
              キャンセル
            </button>
          </div>
        </div>
      )
    } else if (asset.class === 'jp_stock') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.5rem', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <label style={{ minWidth: '60px' }}>株数:</label>
            <input
              type="number"
              min="1"
              step="1"
              value={editForm.quantity || ''}
              onChange={(e) => handleFormChange('quantity', parseInt(e.target.value) || 0)}
              style={{ width: '80px', padding: '0.25rem' }}
            />
            <label style={{ minWidth: '80px' }}>単価(JPY):</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={editForm.avg_price_jpy || ''}
              onChange={(e) => handleFormChange('avg_price_jpy', parseFloat(e.target.value) || '')}
              style={{ width: '80px', padding: '0.25rem' }}
              placeholder="任意"
            />
          </div>
          {editPreview && (
            <div style={{ fontSize: '0.85rem', color: editPreview.valid ? '#28a745' : '#dc3545' }}>
              新簿価: {formatCurrency(editPreview.newBook)} (差額: {editPreview.deltaBook >= 0 ? '+' : ''}{formatCurrency(editPreview.deltaBook)})
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button 
              onClick={saveInlineEdit} 
              disabled={!editPreview || !editPreview.valid || isUpdating}
              style={{ padding: '0.25rem 0.5rem', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px' }}
            >
              {isUpdating ? '更新中...' : '保存'}
            </button>
            <button 
              onClick={cancelInlineEdit}
              style={{ padding: '0.25rem 0.5rem', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px' }}
            >
              キャンセル
            </button>
          </div>
        </div>
      )
    } else if (asset.class === 'precious_metal') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.5rem', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <label style={{ minWidth: '60px' }}>重量(g):</label>
            <input
              type="number"
              min="0.1"
              step="0.1"
              value={editForm.weight_g || ''}
              onChange={(e) => handleFormChange('weight_g', parseFloat(e.target.value) || 0)}
              style={{ width: '80px', padding: '0.25rem' }}
            />
            <label style={{ minWidth: '80px' }}>単価/g:</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={editForm.unit_book_cost_jpy_per_gram || ''}
              onChange={(e) => handleFormChange('unit_book_cost_jpy_per_gram', parseFloat(e.target.value) || '')}
              style={{ width: '80px', padding: '0.25rem' }}
              placeholder="任意"
            />
          </div>
          {editPreview && (
            <div style={{ fontSize: '0.85rem', color: editPreview.valid ? '#28a745' : '#dc3545' }}>
              新簿価: {formatCurrency(editPreview.newBook)} (差額: {editPreview.deltaBook >= 0 ? '+' : ''}{formatCurrency(editPreview.deltaBook)})
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button 
              onClick={saveInlineEdit} 
              disabled={!editPreview || !editPreview.valid || isUpdating}
              style={{ padding: '0.25rem 0.5rem', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px' }}
            >
              {isUpdating ? '更新中...' : '保存'}
            </button>
            <button 
              onClick={cancelInlineEdit}
              style={{ padding: '0.25rem 0.5rem', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px' }}
            >
              キャンセル
            </button>
          </div>
        </div>
      )
    }
    return null
  }

  const filteredAssets = assets.filter(asset => 
    asset.name.toLowerCase().includes(filter.toLowerCase()) ||
    asset.note.toLowerCase().includes(filter.toLowerCase()) ||
    getAssetClassName(asset.class).toLowerCase().includes(filter.toLowerCase())
  )

  if (loading) return <div className="container">Loading...</div>
  if (error) return <div className="container"><div className="error">{error}</div></div>

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2>資産一覧</h2>
        <button 
          className="btn btn-primary"
          onClick={() => setShowCreateModal(true)}
        >
          新規登録
        </button>
      </div>

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
                      onClick={() => startInlineEdit(asset)}
                      style={{ marginRight: '0.5rem' }}
                      disabled={editingAssetId !== null}
                    >
                      数量編集
                    </button>
                  )}
                  <button 
                    className="btn"
                    onClick={() => handleEdit(asset)}
                    style={{ marginRight: '0.5rem' }}
                  >
                    詳細編集
                  </button>
                  <button 
                    className="btn btn-danger"
                    onClick={() => handleDelete(asset)}
                  >
                    削除
                  </button>
                </td>
              </tr>
              {editingAssetId === asset.id && (
                <tr>
                  <td colSpan="7">
                    {renderInlineEditForm(asset)}
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>

      {filteredAssets.length === 0 && (
        <p style={{ textAlign: 'center', margin: '2rem 0', color: '#666' }}>
          資産が見つかりませんでした
        </p>
      )}

      {editingAsset && (
        <AssetEditModal
          asset={editingAsset}
          onClose={() => setEditingAsset(null)}
          onAssetUpdated={handleAssetUpdated}
        />
      )}

      {showCreateModal && (
        <AssetCreateModal
          onClose={() => setShowCreateModal(false)}
          onAssetCreated={handleAssetCreated}
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
  if (asset.class === 'us_stock' || asset.class === 'jp_stock') {
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