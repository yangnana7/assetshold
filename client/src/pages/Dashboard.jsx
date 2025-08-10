import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { formatCurrency, formatAssetName } from '../utils/format'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'

function Dashboard() {
  const [dashboardData, setDashboardData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchDashboardData()
  }, [])

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

  return (
    <div className="container">
      <div className="dashboard-grid">
        <div className="card">
          <h3>資産サマリー</h3>
          <div className="metric">
            <span>総資産数:</span>
            <span className="metric-value">{totalAssets}件</span>
          </div>
          <div className="metric">
            <span>総評価額:</span>
            <span className="metric-value">{formatCurrency(totalValue)}</span>
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
                    {formatCurrency(asset.book_value_jpy)}
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

export default Dashboard