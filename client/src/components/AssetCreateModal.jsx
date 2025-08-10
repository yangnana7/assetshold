import React, { useState } from 'react'
import axios from 'axios'

function AssetCreateModal({ onClose, onAssetCreated }) {
  const [formData, setFormData] = useState({
    class: '',
    name: '',
    note: '',
    acquired_at: '',
    book_value_jpy: '',
    valuation_source: 'manual',
    liquidity_tier: '',
    tags: ''
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
      const submitData = { ...formData }
      
      // Ensure note is empty string if empty, not null
      if (!submitData.note) {
        submitData.note = ""
      }

      const response = await axios.post('/api/assets', submitData, {
        withCredentials: true
      })

      onAssetCreated(response.data)
    } catch (error) {
      setError(error.response?.data?.error || '登録に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>新規資産登録</h2>
        
        {error && <div className="error">{error}</div>}
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>アセットクラス</label>
            <select
              name="class"
              value={formData.class}
              onChange={handleChange}
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

          <div className="form-group">
            <label>資産名</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              disabled={loading}
              placeholder="例: Alphabet C, 純金小判, Kudoke 2 Indigo"
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
              min="0"
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
              {loading ? '登録中...' : '登録'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default AssetCreateModal