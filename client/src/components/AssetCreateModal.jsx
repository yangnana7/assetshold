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
    tags: '',
    // Stock-specific fields
    ticker: '',
    exchange: '',
    code: '',
    quantity: '',
    avg_price_usd: '',
    avg_price_jpy: '',
    // Precious metal-specific fields
    metal: '',
    weight_g: '',
    purity: '',
    unit_price_jpy: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleChange = (e) => {
    const { name, value } = e.target
    const newFormData = {
      ...formData,
      [name]: value
    };
    
    // Auto-calculate book value for stocks and precious metals
    if (formData.class === 'us_stock' && (name === 'quantity' || name === 'avg_price_usd')) {
      const qty = name === 'quantity' ? parseFloat(value) || 0 : parseFloat(newFormData.quantity) || 0;
      const price = name === 'avg_price_usd' ? parseFloat(value) || 0 : parseFloat(newFormData.avg_price_usd) || 0;
      if (qty > 0 && price > 0) {
        // Assume 1 USD = 150 JPY for simple calculation (should be replaced with actual FX rate)
        newFormData.book_value_jpy = Math.floor(qty * price * 150);
      }
    } else if (formData.class === 'jp_stock' && (name === 'quantity' || name === 'avg_price_jpy')) {
      const qty = name === 'quantity' ? parseFloat(value) || 0 : parseFloat(newFormData.quantity) || 0;
      const price = name === 'avg_price_jpy' ? parseFloat(value) || 0 : parseFloat(newFormData.avg_price_jpy) || 0;
      if (qty > 0 && price > 0) {
        newFormData.book_value_jpy = Math.floor(qty * price);
      }
    } else if (formData.class === 'precious_metal' && (name === 'weight_g' || name === 'unit_price_jpy')) {
      const weight = name === 'weight_g' ? parseFloat(value) || 0 : parseFloat(newFormData.weight_g) || 0;
      const unitPrice = name === 'unit_price_jpy' ? parseFloat(value) || 0 : parseFloat(newFormData.unit_price_jpy) || 0;
      if (weight > 0 && unitPrice > 0) {
        newFormData.book_value_jpy = Math.floor(weight * unitPrice);
      }
    }
    
    setFormData(newFormData);
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

          {/* US Stock specific fields */}
          {formData.class === 'us_stock' && (
            <>
              <div className="form-group">
                <label>ティッカー</label>
                <input
                  type="text"
                  name="ticker"
                  value={formData.ticker}
                  onChange={handleChange}
                  placeholder="例: GOOGL"
                  required
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
                  placeholder="例: NASDAQ"
                  disabled={loading}
                />
              </div>
              <div className="form-group">
                <label>株数</label>
                <input
                  type="number"
                  name="quantity"
                  value={formData.quantity}
                  onChange={handleChange}
                  step="0.001"
                  min="0"
                  required
                  disabled={loading}
                />
              </div>
              <div className="form-group">
                <label>平均取得単価（USD）</label>
                <input
                  type="number"
                  name="avg_price_usd"
                  value={formData.avg_price_usd}
                  onChange={handleChange}
                  step="0.01"
                  min="0"
                  required
                  disabled={loading}
                />
              </div>
            </>
          )}

          {/* JP Stock specific fields */}
          {formData.class === 'jp_stock' && (
            <>
              <div className="form-group">
                <label>銘柄コード</label>
                <input
                  type="text"
                  name="code"
                  value={formData.code}
                  onChange={handleChange}
                  placeholder="例: 7203"
                  required
                  disabled={loading}
                />
              </div>
              <div className="form-group">
                <label>株数</label>
                <input
                  type="number"
                  name="quantity"
                  value={formData.quantity}
                  onChange={handleChange}
                  step="1"
                  min="0"
                  required
                  disabled={loading}
                />
              </div>
              <div className="form-group">
                <label>平均取得単価（円）</label>
                <input
                  type="number"
                  name="avg_price_jpy"
                  value={formData.avg_price_jpy}
                  onChange={handleChange}
                  step="0.01"
                  min="0"
                  required
                  disabled={loading}
                />
              </div>
            </>
          )}

          {/* Precious Metal specific fields */}
          {formData.class === 'precious_metal' && (
            <>
              <div className="form-group">
                <label>金属種類</label>
                <select
                  name="metal"
                  value={formData.metal}
                  onChange={handleChange}
                  required
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
                <label>重量（g）</label>
                <input
                  type="number"
                  name="weight_g"
                  value={formData.weight_g}
                  onChange={handleChange}
                  step="0.1"
                  min="0"
                  required
                  disabled={loading}
                />
              </div>
              <div className="form-group">
                <label>純度</label>
                <input
                  type="number"
                  name="purity"
                  value={formData.purity}
                  onChange={handleChange}
                  step="0.01"
                  min="0"
                  max="1"
                  placeholder="例: 0.999（99.9%純金の場合）"
                  disabled={loading}
                />
              </div>
              <div className="form-group">
                <label>単価（円/g）</label>
                <input
                  type="number"
                  name="unit_price_jpy"
                  value={formData.unit_price_jpy}
                  onChange={handleChange}
                  step="0.01"
                  min="0"
                  required
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
              {loading ? '登録中...' : '登録'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default AssetCreateModal