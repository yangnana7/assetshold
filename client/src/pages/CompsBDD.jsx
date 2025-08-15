import React, { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  Wand2, 
  BarChart3,
  Sparkles,
  Undo2,
  Plus,
  LinkIcon as Link,
  UploadCloud
} from 'lucide-react';

// BDD-compliant Comparable Sales UI (3-step wizard)
export default function CompsBDDPage() {
  // State management for 3-step wizard
  const [assetId, setAssetId] = useState('');
  const [currentStep, setCurrentStep] = useState('collect');
  const [items, setItems] = useState([]); // Collected comparable sales
  const [url, setUrl] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [manualEntry, setManualEntry] = useState(false);
  const [form, setForm] = useState({
    sale_date: '',
    price: '',
    currency: 'JPY',
    price_jpy: '',
    source: '',
    source_url: '',
    marketplace: '',
    condition_grade: '',
    completeness: '',
    notes: ''
  });

  // Estimation parameters
  const [mode, setMode] = useState('auto'); // auto|conservative|aggressive  
  const [tolerance, setTolerance] = useState([50]); // 0-100 slider
  const [estimate, setEstimate] = useState(null);

  // Commit parameters
  const [memo, setMemo] = useState('');
  const [previewData, setPreviewData] = useState(null);
  const [lastCommitted, setLastCommitted] = useState(null);

  // Load comparable sales data
  const loadComps = async () => {
    if (!assetId) return;
    try {
      const response = await fetch(`/api/assets/${assetId}/comps`);
      const data = await response.json();
      setItems(data.comps || []);
      setEstimate(null);
    } catch (error) {
      console.error('Failed to load comps:', error);
    }
  };

  // Step 1: Auto-extract from URL
  const handleUrlSubmit = async () => {
    if (!url.trim()) return;
    
    setExtracting(true);
    try {
      // TODO: Implement URL extraction API
      // For now, use mock extraction
      const mockData = parseUrlMock(url);
      await addComp(mockData);
      setUrl('');
      setManualEntry(false);
    } catch (error) {
      console.error('URL extraction failed:', error);
      setManualEntry(true); // Fallback to manual entry
    } finally {
      setExtracting(false);
    }
  };

  // Mock URL parsing (replace with actual API call)
  const parseUrlMock = (urlString) => {
    const priceMatch = urlString.match(/(\d[\d,]{2,})/);
    const price = priceMatch ? Number(priceMatch[1].replace(/,/g, '')) : Math.floor(Math.random() * 50000) + 10000;
    
    return {
      sale_date: new Date().toISOString().slice(0, 10),
      price,
      currency: 'JPY',
      source: 'web',
      marketplace: 'auction',
      condition_grade: 'B',
      completeness: 'complete',
      source_url: urlString,
      notes: 'Auto-extracted from URL'
    };
  };

  // Add comparable sale
  const addComp = async (data) => {
    if (!assetId) return;
    
    try {
      const response = await fetch(`/api/assets/${assetId}/comps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      
      if (response.ok) {
        const result = await response.json();
        setItems(result.comps || []);
        setForm({
          sale_date: '',
          price: '',
          currency: 'JPY',
          price_jpy: '',
          source: '',
          source_url: '',
          marketplace: '',
          condition_grade: '',
          completeness: '',
          notes: ''
        });
      } else {
        throw new Error('Failed to add comp');
      }
    } catch (error) {
      console.error('Failed to add comp:', error);
    }
  };

  // Handle manual form submission
  const handleManualAdd = async () => {
    if (!form.price) return;
    
    const data = { ...form };
    if (!data.sale_date) {
      data.sale_date = new Date().toISOString().slice(0, 10);
    }
    
    await addComp(data);
    setManualEntry(false);
  };

  // Delete comparable sale
  const deleteComp = async (id) => {
    try {
      await fetch(`/api/comps/${id}`, { method: 'DELETE' });
      await loadComps();
    } catch (error) {
      console.error('Failed to delete comp:', error);
    }
  };

  // Step 2: Generate estimate
  const generateEstimate = async () => {
    if (!assetId || items.length === 0) return;
    
    try {
      const params = new URLSearchParams({
        method: mode === 'auto' ? 'wmad' : mode === 'conservative' ? 'wmean' : 'wmad',
        halfLifeDays: String(tolerance[0] + 30), // Convert slider to half-life
      });
      
      const response = await fetch(`/api/assets/${assetId}/comps/estimate?${params}`);
      const data = await response.json();
      setEstimate(data);
      
      // Mock preview data (replace with actual API call)
      setPreviewData({
        current_book: 980000,
        current_valuation: 1100000,
        new_valuation: data.estimate_jpy || 0,
        change: (data.estimate_jpy || 0) - 1100000
      });
      
    } catch (error) {
      console.error('Failed to generate estimate:', error);
    }
  };

  // Step 3: Commit to valuation
  const commitEstimate = async () => {
    if (!assetId || !estimate || !memo.trim()) return;
    
    try {
      const response = await fetch(`/api/assets/${assetId}/comps/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: mode === 'auto' ? 'wmad' : mode === 'conservative' ? 'wmean' : 'wmad',
          halfLifeDays: tolerance[0] + 30,
          memo
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        setLastCommitted({ 
          timestamp: Date.now(),
          estimate: result.estimate 
        });
        setMemo('');
        alert('評価額が正常に更新されました');
      } else {
        throw new Error('Failed to commit estimate');
      }
    } catch (error) {
      console.error('Failed to commit estimate:', error);
      alert('評価額の更新に失敗しました');
    }
  };

  // Undo last commit
  const undoCommit = async () => {
    if (!lastCommitted) return;
    
    try {
      // TODO: Implement undo API
      console.log('UNDO operation - TODO: Implement API');
      setLastCommitted(null);
    } catch (error) {
      console.error('Failed to undo:', error);
    }
  };

  // Handle file upload
  const handleFileUpload = async (files) => {
    // TODO: Implement file upload and OCR processing
    console.log('File upload - TODO: Implement OCR/CSV processing', files);
  };

  // Load data on asset ID change
  useEffect(() => {
    if (assetId) {
      loadComps();
    }
  }, [assetId]);

  // Step indicator component
  const StepIndicator = ({ currentStep }) => (
    <div className="flex items-center justify-between mb-6">
      {['事例を集める', '推定する', '評価に反映'].map((label, i) => {
        const stepKey = ['collect', 'estimate', 'commit'][i];
        const isActive = stepKey === currentStep;
        const isCompleted = ['collect', 'estimate', 'commit'].indexOf(stepKey) < ['collect', 'estimate', 'commit'].indexOf(currentStep);
        
        return (
          <div key={i} className="flex items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              isActive || isCompleted ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}>
              {i + 1}
            </div>
            <span className={`ml-2 text-sm ${
              isActive ? "font-medium" : "text-muted-foreground"
            }`}>
              {label}
            </span>
            {i < 2 && <div className="flex-1 h-px bg-border mx-4" />}
          </div>
        );
      })}
    </div>
  );

  // Format currency
  const formatJPY = (amount) => {
    return new Intl.NumberFormat('ja-JP', { 
      style: 'currency', 
      currency: 'JPY',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount || 0);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Wand2 className="w-6 h-6" />
          <h1 className="text-2xl font-bold">参考価格（コンプ）— BDD準拠 3ステップ</h1>
        </div>
        <Badge variant="secondary" className="rounded-full">一般向けUI</Badge>
      </div>

      {/* Asset ID Input */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex gap-2 items-center">
            <Input
              placeholder="資産ID を入力"
              value={assetId}
              onChange={(e) => setAssetId(e.target.value)}
              className="w-40"
            />
            <Button onClick={loadComps} disabled={!assetId}>
              読み込み
            </Button>
            <span className="text-sm text-muted-foreground ml-4">
              事例数: {items.length}件
            </span>
          </div>
        </CardContent>
      </Card>

      <StepIndicator currentStep={currentStep} />

      <Tabs value={currentStep} onValueChange={setCurrentStep} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="collect">① 事例を集める</TabsTrigger>
          <TabsTrigger value="estimate">② 推定する</TabsTrigger>
          <TabsTrigger value="commit">③ 評価に反映</TabsTrigger>
        </TabsList>

        {/* Step 1: Collect Data */}
        <TabsContent value="collect" className="space-y-6 mt-6">
          <div className="grid md:grid-cols-3 gap-4">
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Link className="w-5 h-5" />
                  URL 貼り付け
                </CardTitle>
                <CardDescription>オークション・マーケットプレイスのURL を貼り付けると自動抽出</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="例: https://page.auctions.yahoo.co.jp/..."
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="flex-1"
                  />
                  <Button onClick={handleUrlSubmit} disabled={extracting || !url.trim()}>
                    <Plus className="w-4 h-4 mr-1" />
                    {extracting ? '抽出中...' : '自動抽出'}
                  </Button>
                </div>

                {manualEntry && (
                  <div className="p-4 border rounded-lg space-y-3 bg-muted/50">
                    <h4 className="font-medium">手動入力（抽出失敗時のフォールバック）</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <Input 
                        placeholder="販売日 (YYYY-MM-DD)" 
                        value={form.sale_date}
                        onChange={(e) => setForm({...form, sale_date: e.target.value})}
                      />
                      <Input 
                        type="number"
                        placeholder="価格" 
                        value={form.price}
                        onChange={(e) => setForm({...form, price: e.target.value})}
                      />
                      <select 
                        className="px-3 py-2 border rounded-md" 
                        value={form.currency}
                        onChange={(e) => setForm({...form, currency: e.target.value})}
                      >
                        <option value="JPY">JPY</option>
                        <option value="USD">USD</option>
                        <option value="CNY">CNY</option>
                      </select>
                      <Input 
                        placeholder="出典 (auction/dealer)" 
                        value={form.source}
                        onChange={(e) => setForm({...form, source: e.target.value})}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={handleManualAdd} disabled={!form.price}>
                        追加
                      </Button>
                      <Button variant="outline" onClick={() => setManualEntry(false)}>
                        キャンセル
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UploadCloud className="w-5 h-5" />
                  CSV / 画像
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="border-2 border-dashed border-muted rounded-lg p-6 text-center">
                  <UploadCloud className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground mb-2">CSV・画像をドロップ</p>
                  <input
                    type="file"
                    multiple
                    accept=".csv,image/*"
                    className="hidden"
                    onChange={(e) => handleFileUpload(Array.from(e.target.files || []))}
                    id="file-upload"
                  />
                  <Button variant="outline" onClick={() => document.getElementById('file-upload')?.click()}>
                    ファイル選択
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Collected items display */}
          <Card>
            <CardHeader>
              <CardTitle>収集した事例（カード表示＋チップ）</CardTitle>
            </CardHeader>
            <CardContent>
              {items.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  まだ事例がありません。上の入力から追加してください。
                </p>
              ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {items.map((item, i) => (
                    <div key={i} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex flex-wrap gap-1">
                          <Badge variant="outline" className="text-xs">{item.currency}</Badge>
                          <Badge variant="secondary" className="text-xs">{item.source || 'unknown'}</Badge>
                          {item.condition_grade && (
                            <Badge variant="outline" className="text-xs">{item.condition_grade}</Badge>
                          )}
                        </div>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => deleteComp(item.id)}
                          className="text-xs"
                        >
                          削除
                        </Button>
                      </div>
                      <div className="space-y-1">
                        <p className="font-semibold">{formatJPY(item.price_jpy || item.price)}</p>
                        <p className="text-sm text-muted-foreground">{item.sale_date}</p>
                        <p className="text-xs text-muted-foreground">{item.marketplace || item.source_url}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Step 2: Estimation */}
        <TabsContent value="estimate" className="space-y-6 mt-6">
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  推定モード
                </CardTitle>
                <CardDescription>直近重視・外れ値は自動除外の手法で推定</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">推定手法</label>
                  <div className="flex gap-2 flex-wrap">
                    <Button 
                      variant={mode === 'auto' ? 'default' : 'outline'} 
                      size="sm"
                      onClick={() => setMode('auto')}
                    >
                      おまかせ（MAD+加重中央値）
                    </Button>
                    <Button 
                      variant={mode === 'conservative' ? 'default' : 'outline'} 
                      size="sm"
                      onClick={() => setMode('conservative')}
                    >
                      保守的（外れ値強め）
                    </Button>
                    <Button 
                      variant={mode === 'aggressive' ? 'default' : 'outline'} 
                      size="sm"
                      onClick={() => setMode('aggressive')}
                    >
                      強気（最近重視）
                    </Button>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">
                    データの幅（慎重 ←→ 幅広く）
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={tolerance[0]}
                    onChange={(e) => setTolerance([Number(e.target.value)])}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>慎重</span>
                    <span>幅広く</span>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  この設定は内部で MAD 除外と重み付け中央値に反映されます。
                </p>

                <Button onClick={generateEstimate} className="w-full" disabled={items.length === 0}>
                  推定を計算
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>推定結果</CardTitle>
              </CardHeader>
              <CardContent>
                {estimate ? (
                  <div className="space-y-4">
                    <div className="text-center">
                      <div className="text-3xl font-bold font-mono mb-2">
                        {formatJPY(estimate.estimate_jpy)}
                      </div>
                      <div className="flex items-center justify-center gap-2 mb-2">
                        <span className="text-sm">信頼度</span>
                        <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-primary rounded-full transition-all"
                            style={{ width: `${Math.min(100, estimate.confidence || 0)}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium">{estimate.confidence || 0}%</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        採用 {estimate.used_count || items.length}/{items.length}件
                        （外れ値{estimate.outliers_removed || 0}件除外）
                      </p>
                    </div>
                    
                    <div className="h-32 bg-muted rounded flex items-center justify-center">
                      <span className="text-sm text-muted-foreground">TODO: 箱ひげ図 + 推定ライン（Recharts）</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    事例を収集してから「推定を計算」を押してください
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Step 3: Commit */}
        <TabsContent value="commit" className="space-y-6 mt-6">
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>差分プレビュー</CardTitle>
              </CardHeader>
              <CardContent>
                {previewData ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">簿価</p>
                        <p className="font-mono">{formatJPY(previewData.current_book)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">現在評価</p>
                        <p className="font-mono">{formatJPY(previewData.current_valuation)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">新評価</p>
                        <p className="font-mono font-bold">{formatJPY(previewData.new_valuation)}</p>
                      </div>
                    </div>
                    <div className={`flex items-center gap-1 text-sm font-medium ${
                      previewData.change >= 0 ? 'text-red-600' : 'text-green-600'
                    }`}>
                      {previewData.change >= 0 ? (
                        <TrendingUp className="w-4 h-4" />
                      ) : (
                        <TrendingDown className="w-4 h-4" />
                      )}
                      {previewData.change >= 0 ? '+' : ''}{formatJPY(previewData.change)}
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground">推定を実行してください</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>評価反映</CardTitle>
                <CardDescription>メモ必須（出典・期間・件数）</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">反映メモ（必須）</label>
                  <textarea
                    className="w-full p-3 border rounded-md resize-none"
                    rows={4}
                    placeholder="例：2024-06〜08 / メルカリ・ヤフオク計12件 / おまかせ推定"
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={commitEstimate}
                    disabled={!memo.trim() || !estimate}
                    className="flex-1"
                  >
                    <Sparkles className="w-4 h-4 mr-1" />
                    評価に反映
                  </Button>
                  <Button
                    variant="outline"
                    onClick={undoCommit}
                    disabled={!lastCommitted}
                  >
                    <Undo2 className="w-4 h-4 mr-1" />
                    UNDO
                  </Button>
                </div>

                {lastCommitted && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                    <p className="text-sm text-green-800">
                      評価額が正常に反映されました（{new Date(lastCommitted.timestamp).toLocaleTimeString()}）
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}