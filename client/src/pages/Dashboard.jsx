import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { formatCurrency, formatAssetName } from '../utils/format'

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
          <h3>アセットクラス別配分</h3>
          {assetsByClass.length > 0 ? (
            assetsByClass.map((item, index) => {
              const percentage = totalValue > 0 ? ((item.total_value / totalValue) * 100).toFixed(1) : 0
              return (
                <div key={index} className="metric">
                  <span>{getAssetClassName(item.class)}:</span>
                  <span className="metric-value">
                    {percentage}% ({formatCurrency(item.total_value)})
                  </span>
                </div>
              )
            })
          ) : (
            <p>データがありません</p>
          )}
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