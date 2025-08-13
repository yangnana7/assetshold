import React, { useState } from 'react'
import axios from 'axios'

function AssetEditModal({ asset, onClose, onAssetUpdated }) {
  const [formData, setFormData] = useState({
    name: asset.name || '',
    note: asset.note || '',
    acquired_at: asset.acquired_at || '',
    book_value_jpy: asset.book_value_jpy || '',
    valuation_source: asset.valuation_source || 'manual',
    liquidity_tier: asset.liquidity_tier || '',
    tags: asset.tags || '',
    // Class-specific fields
    ticker: asset.stock_details?.ticker || '',
    exchange: asset.stock_details?.exchange || '',
    code: asset.stock_details?.code || '',
    quantity: asset.stock_details?.quantity || '',
    avg_price_usd: asset.stock_details?.avg_price_usd || '',
    avg_price_jpy: asset.stock_details?.avg_price_jpy || '',
    metal: asset.precious_metal_details?.metal || '',
    weight_g: asset.precious_metal_details?.weight_g || '',
    purity: asset.precious_metal_details?.purity || '',
    unit_price_jpy: asset.precious_metal_details?.unit_price_jpy || ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      // Prepare update data - only send changed fields
      const updateData = {}
      
      // Basic asset fields
      const basicFields = ['name', 'note', 'acquired_at', 'book_value_jpy', 'valuation_source', 'liquidity_tier', 'tags']
      basicFields.forEach(key => {
        if (formData[key] !== asset[key]) {
          updateData[key] = formData[key]
        }
      })
      
      // Class-specific fields
      if (asset.class === 'us_stock' && asset.stock_details) {
        const stockFields = ['ticker', 'exchange', 'quantity', 'avg_price_usd']
        stockFields.forEach(key => {
          const currentValue = asset.stock_details[key]
          const newValue = formData[key]
          
          // Convert to appropriate types for comparison
          let convertedNew = newValue
          let convertedCurrent = currentValue
          
          if (key === 'quantity' || key === 'avg_price_usd') {
            convertedNew = parseFloat(newValue) || 0
            convertedCurrent = parseFloat(currentValue) || 0
          }
          
          if (convertedNew !== convertedCurrent) {
            updateData[key] = key === 'quantity' || key === 'avg_price_usd' ? convertedNew : newValue
          }
        })
      } else if (asset.class === 'jp_stock' && asset.stock_details) {
        const stockFields = ['code', 'quantity', 'avg_price_jpy']
        stockFields.forEach(key => {
          const currentValue = asset.stock_details[key]
          const newValue = formData[key]
          
          // Convert to appropriate types for comparison
          let convertedNew = newValue
          let convertedCurrent = currentValue
          
          if (key === 'quantity' || key === 'avg_price_jpy') {
            convertedNew = parseFloat(newValue) || 0
            convertedCurrent = parseFloat(currentValue) || 0
          }
          
          if (convertedNew !== convertedCurrent) {
            updateData[key] = key === 'quantity' || key === 'avg_price_jpy' ? convertedNew : newValue
          }
        })
      } else if (asset.class === 'precious_metal' && asset.precious_metal_details) {
        const metalFields = ['metal', 'weight_g', 'purity', 'unit_price_jpy']
        metalFields.forEach(key => {
          const currentValue = asset.precious_metal_details[key]
          const newValue = formData[key]
          
          // Convert to appropriate types for comparison
          let convertedNew = newValue
          let convertedCurrent = currentValue
          
          if (key === 'weight_g' || key === 'purity' || key === 'unit_price_jpy') {
            convertedNew = parseFloat(newValue) || 0
            convertedCurrent = parseFloat(currentValue) || 0
          }
          
          if (convertedNew !== convertedCurrent) {
            updateData[key] = key === 'weight_g' || key === 'purity' || key === 'unit_price_jpy' ? convertedNew : newValue
          }
        })
      }

      // Ensure note is empty string if empty, not null
      if (updateData.hasOwnProperty('note') && !updateData.note) {
        updateData.note = ""
      }

      if (Object.keys(updateData).length === 0) {
        onClose()
        return
      }

      console.log('Update data being sent:', updateData)

      const response = await axios.patch(`/api/assets/${asset.id}`, updateData, {
        withCredentials: true
      })

      onAssetUpdated(response.data)
    } catch (error) {
      setError(error.response?.data?.error || '更新に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>資産編集</h2>
        
        {error && <div className="error">{error}</div>}
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>資産名</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label>備考</label>
            <input
              type="text"
              name="note"
              value={formData.note}
              onChange={handleChange}
              placeholder="備考・品名等"
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label>取得日</label>
            <input
              type="date"
              name="acquired_at"
              value={formData.acquired_at}
              onChange={handleChange}
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label>簿価（円）</label>
            <input
              type="number"
              name="book_value_jpy"
              value={formData.book_value_jpy}
              onChange={handleChange}
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label>評価方法</label>
            <select
              name="valuation_source"
              value={formData.valuation_source}
              onChange={handleChange}
              disabled={loading}
            >
              <option value="manual">手動</option>
              <option value="market_api">市場API</option>
              <option value="formula">計算式</option>
            </select>
          </div>

          <div className="form-group">
            <label>流動性階層</label>
            <select
              name="liquidity_tier"
              value={formData.liquidity_tier}
              onChange={handleChange}
              required
              disabled={loading}
            >
              <option value="">選択してください</option>
              <option value="L1">L1 (超流動)</option>
              <option value="L2">L2 (株式等)</option>
              <option value="L3">L3 (貴金属・時計等)</option>
              <option value="L4">L4 (不動産等)</option>
            </select>
          </div>

          <div className="form-group">
            <label>タグ (JSON)</label>
            <input
              type="text"
              name="tags"
              value={formData.tags}
              onChange={handleChange}
              placeholder='{"tag1": "value1", "tag2": "value2"}'
              disabled={loading}
            />
          </div>

          {/* US Stock specific fields */}
          {asset.class === 'us_stock' && (
            <>
              <div className="form-group">
                <label>ティッカー</label>
                <input
                  type="text"
                  name="ticker"
                  value={formData.ticker}
                  onChange={handleChange}
                  disabled={loading}
                />
              </div>
              <div className="form-group">
                <label>取引所</label>
                <input
                  type="text"
                  name="exchange"
                  value={formData.exchange}
                  onChange={handleChange}
                  disabled={loading}
                />
              </div>
              <div className="form-group">
                <label>株数</label>
                <input
                  type="number"
                  step="0.001"
                  name="quantity"
                  value={formData.quantity}
                  onChange={handleChange}
                  disabled={loading}
                />
              </div>
              <div className="form-group">
                <label>平均取得価格（USD）</label>
                <input
                  type="number"
                  step="0.01"
                  name="avg_price_usd"
                  value={formData.avg_price_usd}
                  onChange={handleChange}
                  disabled={loading}
                />
              </div>
            </>
          )}

          {/* JP Stock specific fields */}
          {asset.class === 'jp_stock' && (
            <>
              <div className="form-group">
                <label>証券コード</label>
                <input
                  type="text"
                  name="code"
                  value={formData.code}
                  onChange={handleChange}
                  disabled={loading}
                />
              </div>
              <div className="form-group">
                <label>株数</label>
                <input
                  type="number"
                  step="0.001"
                  name="quantity"
                  value={formData.quantity}
                  onChange={handleChange}
                  disabled={loading}
                />
              </div>
              <div className="form-group">
                <label>平均取得価格（JPY）</label>
                <input
                  type="number"
                  step="0.01"
                  name="avg_price_jpy"
                  value={formData.avg_price_jpy}
                  onChange={handleChange}
                  disabled={loading}
                />
              </div>
            </>
          )}

          {/* Precious Metal specific fields */}
          {asset.class === 'precious_metal' && (
            <>
              <div className="form-group">
                <label>金属種類</label>
                <select
                  name="metal"
                  value={formData.metal}
                  onChange={handleChange}
                  disabled={loading}
                >
                  <option value="">選択してください</option>
                  <option value="gold">金</option>
                  <option value="silver">銀</option>
                  <option value="platinum">プラチナ</option>
                  <option value="palladium">パラジウム</option>
                </select>
              </div>
              <div className="form-group">
                <label>重量（グラム）</label>
                <input
                  type="number"
                  step="0.001"
                  name="weight_g"
                  value={formData.weight_g}
                  onChange={handleChange}
                  disabled={loading}
                />
              </div>
              <div className="form-group">
                <label>純度</label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  max="1"
                  name="purity"
                  value={formData.purity}
                  onChange={handleChange}
                  placeholder="0.999 (99.9%の場合)"
                  disabled={loading}
                />
              </div>
              <div className="form-group">
                <label>単価（円/グラム）</label>
                <input
                  type="number"
                  step="0.01"
                  name="unit_price_jpy"
                  value={formData.unit_price_jpy}
                  onChange={handleChange}
                  disabled={loading}
                />
              </div>
            </>
          )}

          <div className="modal-buttons">
            <button
              type="button"
              className="btn"
              onClick={onClose}
              disabled={loading}
            >
              キャンセル
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
            >
              {loading ? '更新中...' : '更新'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default AssetEditModal