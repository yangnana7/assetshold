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

  useEffect(() => {
    fetchAssets()
  }, [])

  const fetchAssets = async () => {
    try {
      const response = await axios.get('/api/assets', { withCredentials: true })
      setAssets(response.data)
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
            <tr key={asset.id}>
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
                <button 
                  className="btn"
                  onClick={() => handleEdit(asset)}
                  style={{ marginRight: '0.5rem' }}
                >
                  編集
                </button>
                <button 
                  className="btn btn-danger"
                  onClick={() => handleDelete(asset)}
                >
                  削除
                </button>
              </td>
            </tr>
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