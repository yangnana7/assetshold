import React, { useState } from 'react'
import axios from 'axios'

function ImportExport() {
  const [selectedFile, setSelectedFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [importResult, setImportResult] = useState(null)

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (file && file.type === 'text/csv') {
      setSelectedFile(file)
      setMessage('')
      setError('')
      setImportResult(null)
    } else {
      setSelectedFile(null)
      setError('CSVファイルを選択してください')
    }
  }

  const handleUpload = async () => {
    if (!selectedFile) {
      setError('CSVファイルを選択してください')
      return
    }

    setUploading(true)
    setError('')
    setMessage('')
    setImportResult(null)

    try {
      const formData = new FormData()
      formData.append('csvFile', selectedFile)

      const response = await axios.post('/api/import/csv', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        withCredentials: true
      })

      setMessage(response.data.message)
      setImportResult(response.data.details)
      setSelectedFile(null)
      
      // Reset file input
      const fileInput = document.getElementById('csvFile')
      if (fileInput) {
        fileInput.value = ''
      }
      
    } catch (error) {
      console.error('Import error:', error)
      if (error.response?.data?.error) {
        setError(error.response.data.error)
        if (error.response.data.details) {
          setError(`${error.response.data.error}\n詳細: ${error.response.data.details}`)
        }
      } else {
        setError('インポート中にエラーが発生しました')
      }
    } finally {
      setUploading(false)
    }
  }

  const downloadTemplate = async () => {
    try {
      const response = await axios.get('/api/export?format=csv', {
        responseType: 'blob',
        withCredentials: true
      })

      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', 'portfolio_template.csv')
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (error) {
      console.error('Download error:', error)
      setError('テンプレートのダウンロードに失敗しました')
    }
  }

  const downloadFullDatabase = async () => {
    try {
      setMessage('データベース全体をエクスポート中...')
      setError('')

      const response = await axios.get('/api/export/full-database', {
        responseType: 'blob',
        withCredentials: true
      })

      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      const currentDate = new Date().toISOString().slice(0, 10)
      link.setAttribute('download', `assets_database_${currentDate}.csv`)
      document.body.appendChild(link)
      link.click()
      link.remove()

      setMessage('データベース全体のエクスポートが完了しました')
    } catch (error) {
      console.error('Database export error:', error)
      setError('データベースエクスポートに失敗しました')
      setMessage('')
    }
  }

  return (
    <div className="container">
      <h2>インポート・エクスポート</h2>
      
      <div className="card" style={{ maxWidth: '800px', margin: '0 auto' }}>
        <h3>CSVファイルのインポート</h3>
        
        <div style={{ marginBottom: '2rem' }}>
          <p>資産データをCSVファイルから一括でインポートできます。</p>
          <p>既存の資産と同じ名前・クラスの場合は更新され、新しい資産は追加されます。</p>
        </div>

        <div className="form-group">
          <label htmlFor="csvFile">CSVファイルを選択</label>
          <input
            type="file"
            id="csvFile"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            disabled={uploading}
          />
          {selectedFile && (
            <p style={{ marginTop: '0.5rem', color: '#28a745' }}>
              選択されたファイル: {selectedFile.name}
            </p>
          )}
        </div>

        <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
          <button
            className="btn btn-primary"
            onClick={handleUpload}
            disabled={!selectedFile || uploading}
          >
            {uploading ? 'インポート中...' : 'インポート実行'}
          </button>
          
          <button
            className="btn"
            onClick={downloadTemplate}
            disabled={uploading}
          >
            テンプレートダウンロード
          </button>
        </div>

        {message && (
          <div className="success">
            {message}
            {importResult && (
              <div style={{ marginTop: '1rem' }}>
                <strong>処理結果:</strong>
                <ul style={{ marginTop: '0.5rem', marginLeft: '1rem' }}>
                  <li>総件数: {importResult.total}件</li>
                  <li>新規追加: {importResult.inserted}件</li>
                  <li>更新: {importResult.updated}件</li>
                </ul>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="error" style={{ whiteSpace: 'pre-line' }}>
            {error}
          </div>
        )}
      </div>

      <div className="card" style={{ maxWidth: '800px', margin: '2rem auto 0' }}>
        <h3>CSVファイル仕様</h3>
        
        <div style={{ marginBottom: '1rem' }}>
          <h4>必須カラム:</h4>
          <ul>
            <li><strong>class</strong>: アセットクラス (us_stock, jp_stock, watch, precious_metal, real_estate, collection, cash)</li>
            <li><strong>name</strong>: 資産名</li>
            <li><strong>book_value_jpy</strong>: 簿価（円）</li>
            <li><strong>liquidity_tier</strong>: 流動性階層 (L1, L2, L3, L4)</li>
          </ul>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <h4>オプションカラム:</h4>
          <ul>
            <li><strong>note</strong>: 備考</li>
            <li><strong>acquired_at</strong>: 取得日 (YYYY-MM-DD形式)</li>
            <li><strong>valuation_source</strong>: 評価方法 (manual, market_api, formula)</li>
            <li><strong>tags</strong>: タグ (JSON形式)</li>
          </ul>
        </div>

        <div>
          <h4>サンプル:</h4>
          <pre style={{ 
            background: '#f8f9fa', 
            padding: '1rem', 
            borderRadius: '4px', 
            fontSize: '0.875rem',
            overflow: 'auto'
          }}>
{`class,name,note,acquired_at,book_value_jpy,valuation_source,liquidity_tier,tags
us_stock,Alphabet C,GOOGL,2024-06-15,405600,manual,L2,"{""ticker"": ""GOOGL""}"
watch,Kudoke 2 Indigo,,2024-12-01,850000,manual,L3,"{""brand"": ""Kudoke""}"
precious_metal,純金小判,50g,2025-01-15,268000,manual,L3,"{""metal"": ""gold""}"`}
          </pre>
        </div>
      </div>

      <div className="card" style={{ maxWidth: '800px', margin: '2rem auto 0' }}>
        <h3>データベース一括エクスポート</h3>
        
        <div style={{ marginBottom: '2rem' }}>
          <p>データベース内の全データをCSV形式でダウンロードできます。</p>
          <p>全ての資産情報、詳細データ、評価履歴が含まれます。</p>
        </div>

        <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
          <button
            className="btn btn-primary"
            onClick={downloadFullDatabase}
            disabled={uploading}
          >
            データベース全体をダウンロード
          </button>
        </div>

        {message && (
          <div className="success">
            {message}
          </div>
        )}

        {error && (
          <div className="error" style={{ whiteSpace: 'pre-line' }}>
            {error}
          </div>
        )}
      </div>
    </div>
  )
}

export default ImportExport