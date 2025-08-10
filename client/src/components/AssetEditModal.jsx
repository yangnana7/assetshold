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
    tags: asset.tags || ''
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
      Object.keys(formData).forEach(key => {
        if (formData[key] !== asset[key]) {
          updateData[key] = formData[key]
        }
      })

      // Ensure note is empty string if empty, not null
      if (updateData.hasOwnProperty('note') && !updateData.note) {
        updateData.note = ""
      }

      if (Object.keys(updateData).length === 0) {
        onClose()
        return
      }

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