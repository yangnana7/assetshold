import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { formatCurrency, formatAssetName } from '../utils/format'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, BarChart, Bar } from 'recharts'

function Dashboard() {
  const [dashboardData, setDashboardData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
  // Asset list states
  const [assets, setAssets] = useState([])
  const [assetsLoading, setAssetsLoading] = useState(false)
  const [assetsError, setAssetsError] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalAssetCount, setTotalAssetCount] = useState(0)
  const ASSETS_PER_PAGE = 30

  // Market data states
  const [marketStatus, setMarketStatus] = useState(null)
  const [marketLoading, setMarketLoading] = useState(false)

  // Class summary states
  const [classSummary, setClassSummary] = useState(null)
  const [classSummaryLoading, setClassSummaryLoading] = useState(false)

  // Asset editing states
  const [editingAssetId, setEditingAssetId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [editPreview, setEditPreview] = useState(null)
  const [isUpdating, setIsUpdating] = useState(false)

  useEffect(() => {
    fetchDashboardData()
    fetchAssets(1)
    fetchMarketStatus()
    fetchClassSummary()
  }, [])

  useEffect(() => {
    fetchAssets(currentPage)
  }, [currentPage])

  const fetchDashboardData = async () => {
    try {
      const response = await axios.get('/api/dashboard')
      setDashboardData(response.data)
    } catch (error) {
      setError('データの取得に失敗しました')
      console.error('Dashboard fetch error:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchAssets = async (page) => {
    try {
      setAssetsLoading(true)
      setAssetsError(null)
      const response = await axios.get(`/api/assets?page=${page}&limit=${ASSETS_PER_PAGE}`)
      
      if (response.data.assets) {
        // Paginated response
        setAssets(response.data.assets)
        setCurrentPage(response.data.pagination.page)
        setTotalPages(response.data.pagination.totalPages)
        setTotalAssetCount(response.data.pagination.total)
      } else {
        // Legacy response (non-paginated)
        setAssets(response.data)
        setTotalPages(1)
        setTotalAssetCount(response.data.length)
      }
    } catch (error) {
      setAssetsError('資産データの取得に失敗しました')
      console.error('Assets fetch error:', error)
    } finally {
      setAssetsLoading(false)
    }
  }

  const fetchMarketStatus = async () => {
    try {
      setMarketLoading(true)
      const response = await axios.get('/api/market/status')
      setMarketStatus(response.data)
    } catch (error) {
      console.error('Market status fetch error:', error)
    } finally {
      setMarketLoading(false)
    }
  }

  const fetchClassSummary = async () => {
    try {
      setClassSummaryLoading(true)
      const response = await axios.get('/api/dashboard/class-summary')
      setClassSummary(response.data)
    } catch (error) {
      console.error('Class summary fetch error:', error)
    } finally {
      setClassSummaryLoading(false)
    }
  }

  const startEditing = (asset) => {
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

  const cancelEditing = () => {
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

  const saveEdit = async () => {
    if (!editPreview || !editPreview.valid) return

    setIsUpdating(true)
    try {
      const response = await axios.patch(`/api/assets/${editingAssetId}`, editForm)
      
      if (response.data.ok) {
        // Refresh the assets list
        await fetchAssets(currentPage)
        await fetchDashboardData()
        await fetchClassSummary()
        
        // Close edit mode
        cancelEditing()
        
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

  const refreshAllMarketData = async () => {
    try {
      setMarketLoading(true)
      const response = await axios.post('/api/valuations/refresh-all')
      console.log('All market data refreshed:', response.data)
      
      // Show success message
      alert(`市場データを更新しました。更新件数: ${response.data.updated || 0}件`)
      
      // Refresh the assets list and dashboard data
      await fetchAssets(currentPage)
      await fetchDashboardData()
      await fetchClassSummary()
    } catch (error) {
      console.error('Bulk valuation refresh error:', error)
      // Handle different error codes
      if (error.response?.data?.code === 'market_disabled') {
        alert('市場データが無効になっています')
      } else if (error.response?.data?.code === 'upstream_unavailable') {
        alert('市場データの取得に失敗しました')
      } else {
        alert('市場データの更新に失敗しました')
      }
    } finally {
      setMarketLoading(false)
    }
  }

  if (loading) return <div className="container">Loading...</div>
  if (error) return <div className="container"><div className="error">{error}</div></div>
  if (!dashboardData) return <div className="container">データがありません</div>

  const totalAssets = dashboardData.totalAssets?.[0]?.count || 0
  const totalValue = dashboardData.totalValue?.[0]?.total || 0
  const assetsByClass = dashboardData.assetsByClass || []
  const topAssets = dashboardData.topAssets || []
  const monthlyTrend = dashboardData.monthlyTrend || []

  // Prepare data for pie chart
  const pieData = assetsByClass.map((item) => ({
    name: getAssetClassName(item.class),
    value: item.total_value,
    percentage: totalValue > 0 ? ((item.total_value / totalValue) * 100).toFixed(1) : 0
  }))

  // Prepare data for line chart (reverse to show chronological order)
  const lineData = monthlyTrend.reverse().map(item => ({
    month: item.month,
    簿価総額: item.book_value_total,
    評価額総額: item.market_value_total
  }))

  // Colors for pie chart
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658']

  // Pagination handlers
  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage)
    }
  }

  const renderPagination = () => {
    if (totalPages <= 1) return null

    const pages = []
    const startPage = Math.max(1, currentPage - 2)
    const endPage = Math.min(totalPages, currentPage + 2)

    // Previous button
    pages.push(
      <button
        key="prev"
        onClick={() => handlePageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className={`pagination-btn ${currentPage === 1 ? 'disabled' : ''}`}
      >
        &lt;
      </button>
    )

    // First page
    if (startPage > 1) {
      pages.push(
        <button
          key={1}
          onClick={() => handlePageChange(1)}
          className={`pagination-btn ${currentPage === 1 ? 'active' : ''}`}
        >
          1
        </button>
      )
      if (startPage > 2) {
        pages.push(<span key="ellipsis1" className="pagination-ellipsis">...</span>)
      }
    }

    // Page numbers
    for (let i = startPage; i <= endPage; i++) {
      pages.push(
        <button
          key={i}
          onClick={() => handlePageChange(i)}
          className={`pagination-btn ${i === currentPage ? 'active' : ''}`}
        >
          {i}
        </button>
      )
    }

    // Last page
    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        pages.push(<span key="ellipsis2" className="pagination-ellipsis">...</span>)
      }
      pages.push(
        <button
          key={totalPages}
          onClick={() => handlePageChange(totalPages)}
          className={`pagination-btn ${currentPage === totalPages ? 'active' : ''}`}
        >
          {totalPages}
        </button>
      )
    }

    // Next button
    pages.push(
      <button
        key="next"
        onClick={() => handlePageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className={`pagination-btn ${currentPage === totalPages ? 'disabled' : ''}`}
      >
        &gt;
      </button>
    )

    return pages
  }

  const renderEditForm = (asset) => {
    if (asset.class === 'us_stock') {
      return (
        <div className="edit-form-fields">
          <div className="field-group">
            <label>株数:</label>
            <input
              type="number"
              min="1"
              step="1"
              value={editForm.quantity || ''}
              onChange={(e) => handleFormChange('quantity', parseInt(e.target.value) || 0)}
              placeholder="株数を入力"
            />
          </div>
          <div className="field-group">
            <label>平均取得単価 (USD) (任意):</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={editForm.avg_price_usd || ''}
              onChange={(e) => handleFormChange('avg_price_usd', parseFloat(e.target.value) || '')}
              placeholder="単価を入力"
            />
          </div>
          <div className="field-group">
            <label>再計算方法:</label>
            <select
              value={editForm.recalc || 'auto'}
              onChange={(e) => handleFormChange('recalc', e.target.value)}
            >
              <option value="auto">自動</option>
              <option value="scale">比例</option>
              <option value="unit">単価</option>
            </select>
          </div>
        </div>
      )
    } else if (asset.class === 'jp_stock') {
      return (
        <div className="edit-form-fields">
          <div className="field-group">
            <label>株数:</label>
            <input
              type="number"
              min="1"
              step="1"
              value={editForm.quantity || ''}
              onChange={(e) => handleFormChange('quantity', parseInt(e.target.value) || 0)}
              placeholder="株数を入力"
            />
          </div>
          <div className="field-group">
            <label>平均取得単価 (JPY) (任意):</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={editForm.avg_price_jpy || ''}
              onChange={(e) => handleFormChange('avg_price_jpy', parseFloat(e.target.value) || '')}
              placeholder="単価を入力"
            />
          </div>
          <div className="field-group">
            <label>再計算方法:</label>
            <select
              value={editForm.recalc || 'auto'}
              onChange={(e) => handleFormChange('recalc', e.target.value)}
            >
              <option value="auto">自動</option>
              <option value="scale">比例</option>
              <option value="unit">単価</option>
            </select>
          </div>
        </div>
      )
    } else if (asset.class === 'precious_metal') {
      return (
        <div className="edit-form-fields">
          <div className="field-group">
            <label>重量 (g):</label>
            <input
              type="number"
              min="0.1"
              step="0.1"
              value={editForm.weight_g || ''}
              onChange={(e) => handleFormChange('weight_g', parseFloat(e.target.value) || 0)}
              placeholder="重量を入力"
            />
          </div>
          <div className="field-group">
            <label>単価 (JPY/g) (任意):</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={editForm.unit_book_cost_jpy_per_gram || ''}
              onChange={(e) => handleFormChange('unit_book_cost_jpy_per_gram', parseFloat(e.target.value) || '')}
              placeholder="単価を入力"
            />
          </div>
          <div className="field-group">
            <label>再計算方法:</label>
            <select
              value={editForm.recalc || 'auto'}
              onChange={(e) => handleFormChange('recalc', e.target.value)}
            >
              <option value="auto">自動</option>
              <option value="scale">比例</option>
              <option value="unit">単価</option>
            </select>
          </div>
        </div>
      )
    }
    return null
  }

  const renderAssetDetails = (asset) => {
    if (asset.class === 'us_stock' && asset.stock_details) {
      const { quantity, avg_price_usd, ticker } = asset.stock_details
      return (
        <div className="asset-detail-info">
          <div className="detail-line">
            <span className="detail-label">ティッカー:</span>
            <span className="detail-value">{ticker}</span>
          </div>
          <div className="detail-line">
            <span className="detail-label">株数:</span>
            <span className="detail-value">{quantity?.toLocaleString()}株</span>
          </div>
          <div className="detail-line">
            <span className="detail-label">取得単価:</span>
            <span className="detail-value">${avg_price_usd?.toFixed(2)}</span>
          </div>
        </div>
      )
    }
    
    if (asset.class === 'jp_stock' && asset.stock_details) {
      const { quantity, avg_price_jpy, code } = asset.stock_details
      return (
        <div className="asset-detail-info">
          <div className="detail-line">
            <span className="detail-label">コード:</span>
            <span className="detail-value">{code}</span>
          </div>
          <div className="detail-line">
            <span className="detail-label">株数:</span>
            <span className="detail-value">{quantity?.toLocaleString()}株</span>
          </div>
          <div className="detail-line">
            <span className="detail-label">取得単価:</span>
            <span className="detail-value">¥{avg_price_jpy?.toLocaleString()}</span>
          </div>
        </div>
      )
    }
    
    if (asset.class === 'precious_metal' && asset.precious_metal_details) {
      const { metal, weight_g, unit_price_jpy, purity } = asset.precious_metal_details
      return (
        <div className="asset-detail-info">
          <div className="detail-line">
            <span className="detail-label">金属:</span>
            <span className="detail-value">{metal}</span>
          </div>
          <div className="detail-line">
            <span className="detail-label">重量:</span>
            <span className="detail-value">{weight_g}g</span>
          </div>
          <div className="detail-line">
            <span className="detail-label">取得単価:</span>
            <span className="detail-value">¥{unit_price_jpy?.toLocaleString()}/g</span>
          </div>
          {purity && (
            <div className="detail-line">
              <span className="detail-label">純度:</span>
              <span className="detail-value">{purity}</span>
            </div>
          )}
        </div>
      )
    }
    
    return <div className="no-details">詳細情報なし</div>
  }

  return (
    <div className="container">
      {/* Market Data Status */}
      {marketStatus && (
        <div className="market-status-bar">
          <div className={`market-status-indicator ${marketStatus.enabled ? 'enabled' : 'disabled'}`}>
            市場データ: {marketStatus.enabled ? '有効' : '無効'}
          </div>
          <div className="market-status-controls">
            {marketStatus.enabled && (
              <div className="market-providers">
                Stock: {marketStatus.provider.stock} | FX: {marketStatus.provider.fx} | Precious Metal: {marketStatus.provider.precious_metal}
              </div>
            )}
            {marketStatus.enabled && (
              <button 
                className="market-refresh-all-btn"
                onClick={refreshAllMarketData}
                disabled={marketLoading}
                title="全ての市場データを更新（米国株・日本株・貴金属）"
              >
                {marketLoading ? '更新中...' : '市場更新'}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="dashboard-grid">
        <div className="card">
          <h3>資産サマリー</h3>
          <div className="metric">
            <span>総資産数:</span>
            <span className="metric-value">{totalAssets}件</span>
          </div>
          <div className="metric">
            <span>簿価総額:</span>
            <span className="metric-value">{formatCurrency(classSummary?.items ? classSummary.items.reduce((sum, item) => sum + item.book_total_jpy, 0) : totalValue)}</span>
          </div>
          <div className="metric">
            <span>総評価額:</span>
            <span className="metric-value">{formatCurrency(classSummary?.items ? classSummary.items.reduce((sum, item) => sum + item.market_total_jpy, 0) : totalValue)}</span>
          </div>
        </div>

        <div className="card">
          <h3>高額資産 Top 3</h3>
          {topAssets.length > 0 ? (
            <ul className="top-assets-list">
              {topAssets.map((asset, index) => (
                <li key={index}>
                  <span className="asset-name">
                    {formatAssetName(asset.name, asset.note)}
                  </span>
                  <span className="asset-value">
                    {formatCurrency(asset.current_value_jpy || asset.book_value_jpy)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p>データがありません</p>
          )}
        </div>
      </div>

      {/* Charts Section */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))', gap: '2rem', marginTop: '2rem' }}>
        {/* Asset Class Distribution Pie Chart */}
        <div className="card">
          <h3>アセットクラス別配分</h3>
          {pieData.length > 0 ? (
            <div style={{ width: '100%', height: '350px' }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percentage }) => `${name} ${percentage}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatCurrency(value)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p>データがありません</p>
          )}
        </div>

        {/* Monthly Trend Line Chart */}
        <div className="card">
          <h3>資産総額の推移</h3>
          {lineData.length > 0 ? (
            <div style={{ width: '100%', height: '350px' }}>
              <ResponsiveContainer>
                <LineChart data={lineData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="month" 
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis 
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value) => `¥${(value / 1000000).toFixed(1)}M`}
                  />
                  <Tooltip 
                    formatter={(value, name) => [formatCurrency(value), name]}
                    labelFormatter={(label) => `${label}`}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="簿価総額" 
                    stroke="#8884d8" 
                    strokeWidth={2}
                    dot={{ r: 4 }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="評価額総額" 
                    stroke="#82ca9d" 
                    strokeWidth={2}
                    dot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p>データがありません</p>
          )}
        </div>
      </div>

      {/* Class Summary Section - Book vs Market Value Comparison */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))', gap: '2rem', marginTop: '2rem' }}>
        {/* Bar Chart for Book vs Market Value by Asset Class */}
        <div className="card">
          <h3>アセットクラス別：簿価 vs 時価</h3>
          {classSummaryLoading ? (
            <div className="loading">読み込み中...</div>
          ) : classSummary && classSummary.items.length > 0 ? (
            <div style={{ width: '100%', height: '350px' }}>
              <ResponsiveContainer>
                <BarChart data={classSummary.items.map(item => ({
                  class: getAssetClassName(item.class),
                  簿価: item.book_total_jpy,
                  時価: item.market_total_jpy
                }))}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="class" 
                    tick={{ fontSize: 12 }}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis 
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value) => `¥${(value / 1000000).toFixed(1)}M`}
                  />
                  <Tooltip 
                    formatter={(value, name) => [formatCurrency(value), name]}
                    labelFormatter={(label) => `${label}`}
                  />
                  <Legend />
                  <Bar dataKey="簿価" fill="#8884d8" />
                  <Bar dataKey="時価" fill="#82ca9d" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p>データがありません</p>
          )}
        </div>

        {/* Comparison Table */}
        <div className="card">
          <h3>アセットクラス別比較表</h3>
          {classSummaryLoading ? (
            <div className="loading">読み込み中...</div>
          ) : classSummary && classSummary.items.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #dee2e6' }}>
                    <th style={{ padding: '8px', textAlign: 'left', border: '1px solid #dee2e6' }}>クラス</th>
                    <th style={{ padding: '8px', textAlign: 'right', border: '1px solid #dee2e6' }}>点数</th>
                    <th style={{ padding: '8px', textAlign: 'right', border: '1px solid #dee2e6' }}>簿価合計</th>
                    <th style={{ padding: '8px', textAlign: 'right', border: '1px solid #dee2e6' }}>時価合計</th>
                    <th style={{ padding: '8px', textAlign: 'right', border: '1px solid #dee2e6' }}>乖離</th>
                    <th style={{ padding: '8px', textAlign: 'right', border: '1px solid #dee2e6' }}>乖離率(%)</th>
                  </tr>
                </thead>
                <tbody>
                  {classSummary.items.map((item, index) => {
                    const deviation = item.market_total_jpy - item.book_total_jpy;
                    const deviationRate = item.book_total_jpy > 0 
                      ? ((deviation / item.book_total_jpy) * 100).toFixed(1) 
                      : '0.0';
                    const isPositive = deviation >= 0;
                    
                    return (
                      <tr key={item.class} style={{ 
                        backgroundColor: index % 2 === 0 ? '#fff' : '#f8f9fa',
                        borderBottom: '1px solid #dee2e6'
                      }}>
                        <td style={{ padding: '8px', border: '1px solid #dee2e6' }}>
                          <span className={`asset-class-badge class-${item.class}`}>
                            {getAssetClassName(item.class)}
                          </span>
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right', border: '1px solid #dee2e6' }}>
                          {item.count.toLocaleString()}件
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right', border: '1px solid #dee2e6' }}>
                          {formatCurrency(item.book_total_jpy)}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right', border: '1px solid #dee2e6' }}>
                          {formatCurrency(item.market_total_jpy)}
                        </td>
                        <td style={{ 
                          padding: '8px', 
                          textAlign: 'right', 
                          border: '1px solid #dee2e6',
                          color: isPositive ? '#dc3545' : '#28a745',
                          fontWeight: 'bold'
                        }}>
                          {formatCurrency(deviation)}
                        </td>
                        <td style={{ 
                          padding: '8px', 
                          textAlign: 'right', 
                          border: '1px solid #dee2e6',
                          color: isPositive ? '#dc3545' : '#28a745',
                          fontWeight: 'bold'
                        }}>
                          {isPositive ? '+' : ''}{deviationRate}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p>データがありません</p>
          )}
        </div>
      </div>

      {/* Assets List Section */}
      <div className="card" style={{ marginTop: '2rem' }}>
        <h3>資産一覧</h3>
        <div className="assets-list-info">
          <span>総件数: {totalAssetCount}件</span>
          <span>ページ: {currentPage} / {totalPages}</span>
        </div>
        
        {assetsLoading ? (
          <div className="loading">読み込み中...</div>
        ) : assetsError ? (
          <div className="error">{assetsError}</div>
        ) : assets.length === 0 ? (
          <div className="no-data">資産データがありません</div>
        ) : (
          <>
            <div className="assets-card-container">
              {assets.map((asset) => (
                <div key={asset.id} className="asset-card">
                  <div className="asset-card-left">
                    <div className="asset-main-info">
                      <h3 className="asset-name">
                        {formatAssetName(asset.name, asset.note)}
                      </h3>
                      <span className={`asset-class-badge class-${asset.class}`}>
                        {getAssetClassName(asset.class)}
                      </span>
                    </div>
                    <div className="asset-details-block">
                      {renderAssetDetails(asset)}
                    </div>
                    <div className="asset-meta-info">
                      <div className="meta-item">
                        <span className="meta-label">取得日:</span>
                        <span className="meta-value">
                          {asset.acquired_at ? new Date(asset.acquired_at).toLocaleDateString() : '-'}
                        </span>
                      </div>
                      <div className="meta-item">
                        <span className="meta-label">流動性:</span>
                        <span className={`meta-value liquidity-tier tier-${asset.liquidity_tier}`}>
                          {getLiquidityTierName(asset.liquidity_tier)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="asset-card-right">
                    {editingAssetId === asset.id ? (
                      // Edit mode
                      <div className="asset-edit-form">
                        <div className="edit-form-header">
                          <h4>数量/重量編集</h4>
                          <button onClick={cancelEditing} className="cancel-btn">✕</button>
                        </div>
                        
                        {renderEditForm(asset)}
                        
                        {editPreview && (
                          <div className="edit-preview">
                            <div className="preview-item">
                              <span>新簿価:</span>
                              <span className="preview-value">{formatCurrency(editPreview.newBook)}</span>
                            </div>
                            <div className="preview-item">
                              <span>差額:</span>
                              <span className={`preview-value ${editPreview.deltaBook >= 0 ? 'positive' : 'negative'}`}>
                                {editPreview.deltaBook >= 0 ? '+' : ''}{formatCurrency(editPreview.deltaBook)}
                              </span>
                            </div>
                          </div>
                        )}
                        
                        <div className="edit-actions">
                          <button 
                            onClick={saveEdit} 
                            disabled={!editPreview || !editPreview.valid || isUpdating}
                            className="save-btn"
                          >
                            {isUpdating ? '更新中...' : '保存'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      // Normal display mode
                      <>
                        <div className="asset-current-value-label">
                          評価額：
                        </div>
                        <div className={`asset-current-value ${(asset.gain_loss_jpy || 0) >= 0 ? 'positive' : 'negative'}`}>
                          {formatCurrency(asset.current_value_jpy || asset.book_value_jpy)}
                        </div>
                        <div className="asset-book-value">
                          簿価: {formatCurrency(asset.book_value_jpy)}
                        </div>
                        <div className={`asset-gain-loss ${(asset.gain_loss_jpy || 0) >= 0 ? 'positive' : 'negative'}`}>
                          <div>{formatCurrency(asset.gain_loss_jpy || 0)}</div>
                          <div className="percentage">({asset.gain_loss_percentage || '0.00'}%)</div>
                        </div>
                        {(asset.class === 'us_stock' || asset.class === 'jp_stock' || asset.class === 'precious_metal') && getMarketUnitPrice(asset) && (
                          <div className="asset-unit-price">
                            時価：{getMarketUnitPrice(asset)}
                          </div>
                        )}
                        {isEditableAsset(asset) && (
                          <button 
                            onClick={() => startEditing(asset)} 
                            className="edit-btn"
                            disabled={editingAssetId !== null}
                          >
                            編集
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
            
            {/* Pagination */}
            <div className="pagination">
              {renderPagination()}
            </div>
          </>
        )}
      </div>
    </div>
  )
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

function getMarketUnitPrice(asset) {
  // Calculate market unit price for stocks and precious metals
  if (asset.class === 'us_stock' && asset.stock_details) {
    const { quantity } = asset.stock_details
    if (quantity > 0) {
      const totalValue = asset.current_value_jpy || asset.book_value_jpy
      const unitPrice = totalValue / quantity
      return `¥${unitPrice.toLocaleString()} /株`
    }
  }
  
  if (asset.class === 'jp_stock' && asset.stock_details) {
    const { quantity } = asset.stock_details
    if (quantity > 0) {
      const totalValue = asset.current_value_jpy || asset.book_value_jpy
      const unitPrice = totalValue / quantity
      return `¥${unitPrice.toLocaleString()} /株`
    }
  }
  
  if (asset.class === 'precious_metal' && asset.precious_metal_details) {
    const { weight_g, purity, metal } = asset.precious_metal_details
    if (weight_g > 0) {
      // Use market unit price calculation if available
      if (asset.market_unit_price_jpy) {
        return `¥${asset.market_unit_price_jpy.toLocaleString()} /g`
      }
      
      // Calculate correct unit price based on purity and base market price
      // Base prices from Tanaka Kikinzoku (providers/tanaka.js)
      const baseMarketPrices = {
        'gold': 17752,
        'platinum': 7033,
        'silver': 202.29,
        'palladium': 6500
      }
      
      const basePrice = baseMarketPrices[metal?.toLowerCase()] || 0
      if (basePrice > 0 && purity > 0) {
        const purityAdjustedPrice = basePrice * purity
        return `¥${purityAdjustedPrice.toLocaleString()} /g`
      }
      
      // Fallback to legacy calculation if base price not available
      const totalValue = asset.current_value_jpy || asset.book_value_jpy
      const unitPrice = totalValue / weight_g
      return `¥${unitPrice.toLocaleString()} /g`
    }
  }
  
  return null
}

function getLiquidityTierName(tier) {
  const tierNames = {
    'high': '高',
    'medium': '中',
    'low': '低',
    'very-low': '極低'
  }
  
  return tierNames[tier] || tier
}

export default Dashboard