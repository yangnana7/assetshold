import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card-simple'
import { Button } from '@/components/ui/button-simple'
import { Input } from '@/components/ui/input-simple'

export default function ValuationEditModal({ asset, isOpen, onClose, onSaved }) {
  const [valueJpy, setValueJpy] = useState('')
  const [asOf, setAsOf] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isOpen && asset) {
      const current = Number(asset.current_value_jpy || asset.book_value_jpy || 0)
      setValueJpy(String(current))
      const today = new Date()
      const y = today.getFullYear()
      const m = String(today.getMonth() + 1).padStart(2, '0')
      const d = String(today.getDate()).padStart(2, '0')
      setAsOf(`${y}-${m}-${d}`)
      setError('')
      setLoading(false)
    }
  }, [isOpen, asset])

  if (!isOpen) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    const v = Number(valueJpy)
    if (!Number.isFinite(v) || v < 0) {
      setError('評価額（JPY）を正しく入力してください')
      return
    }
    try {
      setLoading(true)
      await axios.post('/api/valuations/manual', {
        asset_id: asset.id,
        value_jpy: Math.round(v),
        as_of: asOf,
      }, { withCredentials: true })
      onSaved?.()
      onClose?.()
    } catch (err) {
      setError(err.response?.data?.error || '保存に失敗しました（管理者権限が必要です）')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-md shadow-md w-full max-w-lg">
        <Card>
          <CardHeader>
            <CardTitle>評価額の編集</CardTitle>
            <CardDescription>{asset?.name}（ID: {asset?.id}）</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && <div className="text-red-600 text-sm border border-red-200 bg-red-50 rounded p-2">{error}</div>}
              <div>
                <label className="text-sm font-medium mb-1 block">評価額（JPY）</label>
                <Input type="number" value={valueJpy} onChange={e => setValueJpy(e.target.value)} min="0" step="1" required disabled={loading} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">評価日</label>
                <Input type="date" value={asOf} onChange={e => setAsOf(e.target.value)} required disabled={loading} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={onClose} disabled={loading}>キャンセル</Button>
                <Button type="submit" disabled={loading}>{loading ? '保存中...' : '保存'}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

