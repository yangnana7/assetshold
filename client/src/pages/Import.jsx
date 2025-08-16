import React, { useState } from 'react'
import axios from 'axios'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card-simple'
import { Button } from '@/components/ui/button-simple'
import { Input } from '@/components/ui/input-simple'

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
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">インポート・エクスポート</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>CSVインポート</CardTitle>
          <CardDescription>資産データをCSVから一括登録・更新します</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground">
            既存の資産と同じ「名称＋クラス」は更新、新規は追加されます。
          </div>

          <div className="space-y-2">
            <label htmlFor="csvFile" className="text-sm font-medium">CSVファイルを選択</label>
            <Input id="csvFile" type="file" accept=".csv,text/csv" onChange={handleFileChange} disabled={uploading} />
            {selectedFile && (
              <div className="text-xs text-emerald-600">選択されたファイル: {selectedFile.name}</div>
            )}
          </div>

          <div className="flex gap-2">
            <Button onClick={handleUpload} disabled={!selectedFile || uploading}>
              {uploading ? 'インポート中...' : 'インポート実行'}
            </Button>
            <Button variant="outline" onClick={downloadTemplate} disabled={uploading}>テンプレートダウンロード</Button>
          </div>

          {message && (
            <div className="text-sm border rounded p-3 bg-green-50 border-green-200">
              <div>{message}</div>
              {importResult && (
                <div className="mt-2 text-sm">
                  <div className="font-medium">処理結果</div>
                  <ul className="list-disc pl-5 mt-1">
                    <li>総件数: {importResult.total}件</li>
                    <li>新規追加: {importResult.inserted}件</li>
                    <li>更新: {importResult.updated}件</li>
                  </ul>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="text-sm border rounded p-3 bg-rose-50 border-rose-200 whitespace-pre-line">
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>CSVファイル仕様</CardTitle>
          <CardDescription>カラム仕様とサンプル</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="font-medium text-sm mb-1">必須カラム</div>
            <ul className="list-disc pl-5 text-sm text-muted-foreground">
              <li><span className="font-medium text-foreground">class</span>: アセットクラス (us_stock, jp_stock, watch, precious_metal, real_estate, collection, cash)</li>
              <li><span className="font-medium text-foreground">name</span>: 資産名</li>
              <li><span className="font-medium text-foreground">book_value_jpy</span>: 簿価（円）</li>
              <li><span className="font-medium text-foreground">liquidity_tier</span>: 流動性階層 (L1, L2, L3, L4)</li>
            </ul>
          </div>

          <div>
            <div className="font-medium text-sm mb-1">オプションカラム</div>
            <ul className="list-disc pl-5 text-sm text-muted-foreground">
              <li><span className="font-medium text-foreground">note</span>: 備考</li>
              <li><span className="font-medium text-foreground">acquired_at</span>: 取得日 (YYYY-MM-DD)</li>
              <li><span className="font-medium text-foreground">valuation_source</span>: 評価方法 (manual, market_api, formula)</li>
              <li><span className="font-medium text-foreground">tags</span>: タグ (JSON)</li>
            </ul>
          </div>

          <div>
            <div className="font-medium text-sm mb-2">サンプル</div>
            <pre className="bg-muted rounded p-3 text-xs overflow-auto">{`class,name,note,acquired_at,book_value_jpy,valuation_source,liquidity_tier,tags
us_stock,Alphabet C,GOOGL,2024-06-15,405600,manual,L2,"{""ticker"": ""GOOGL""}"
watch,Kudoke 2 Indigo,,2024-12-01,850000,manual,L3,"{""brand"": ""Kudoke""}"
precious_metal,純金小判,50g,2025-01-15,268000,manual,L3,"{""metal"": ""gold""}"`}</pre>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>一括エクスポート</CardTitle>
          <CardDescription>データベース内の全データをCSVでダウンロード</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground">
            全ての資産情報、詳細データ、評価履歴が含まれます。
          </div>
          <div>
            <Button onClick={downloadFullDatabase} disabled={uploading}>データベース全体をダウンロード</Button>
          </div>
          {message && (
            <div className="text-sm border rounded p-3 bg-green-50 border-green-200">{message}</div>
          )}
          {error && (
            <div className="text-sm border rounded p-3 bg-rose-50 border-rose-200 whitespace-pre-line">{error}</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default ImportExport
