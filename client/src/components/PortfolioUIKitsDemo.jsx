import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card-simple';
import { Button } from '@/components/ui/button-simple';
import { Badge } from '@/components/ui/badge-simple';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs-simple';
import { Input } from '@/components/ui/input-simple';
import { 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  Wand2, 
  SlidersHorizontal,
  BarChart3,
  Settings2,
  Sparkles,
  Undo2,
  FileDown,
  Download,
  Plus,
  LinkIcon as Link,
  UploadCloud,
  Pencil,
  Scale
} from 'lucide-react';

const PortfolioUIKitsDemo = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [compsStep, setCompsStep] = useState(1);
  const [rebalanceStep, setRebalanceStep] = useState(1);

  // Mock data for demonstration
  const mockDashboardData = {
    totalValue: 12345678,
    gainLoss: 1234567,
    assetCount: 42,
    lastUpdate: '14:30 JST',
    marketEnabled: true,
    staleCount: 2,
    providers: 'Yahoo → Google → Tanaka'
  };

  const mockAssets = [
    { name: 'Apple Inc.', class: 'US株', value: '¥1,234,567', source: 'Yahoo', stale: false },
    { name: '金地金 100g', class: '貴金属', value: '¥890,123', source: 'Tanaka', stale: true },
    { name: 'Rolex GMT', class: '時計', value: '¥2,345,678', source: 'Manual', stale: false }
  ];

  // Format currency
  const formatJPY = (amount) => {
    return new Intl.NumberFormat('ja-JP', { 
      style: 'currency', 
      currency: 'JPY',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  // Dashboard Components
  const DashboardCard = ({ title, value, subtitle, badge }) => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {badge && <Badge variant="outline">{badge}</Badge>}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold font-mono">{value}</div>
        {subtitle && (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );

  const MarketStatusBar = () => (
    <div className="flex justify-between items-center p-4 bg-muted rounded-lg mb-6">
      <div className="flex items-center gap-4">
        <Badge variant={mockDashboardData.marketEnabled ? "default" : "secondary"}>
          市場データ: {mockDashboardData.marketEnabled ? "有効" : "無効"}
        </Badge>
        <span className="text-sm text-muted-foreground">
          最終更新: {mockDashboardData.lastUpdate}
        </span>
        {mockDashboardData.staleCount > 0 && (
          <Badge variant="outline" className="text-orange-600">
            <AlertTriangle className="w-3 h-3 mr-1" />
            stale: {mockDashboardData.staleCount}
          </Badge>
        )}
      </div>
      <div className="text-xs text-muted-foreground font-mono">
        プロバイダ: {mockDashboardData.providers}
      </div>
    </div>
  );

  const TopAssetsCard = () => (
    <Card>
      <CardHeader>
        <CardTitle>上位資産 Top 3</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {mockAssets.map((asset, i) => (
            <div key={i} className="flex justify-between items-center">
              <div>
                <p className="font-medium">{asset.name}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-xs">{asset.class}</Badge>
                  <Badge variant={asset.stale ? "secondary" : "default"} className="text-xs">
                    {asset.source}
                  </Badge>
                </div>
              </div>
              <div className="text-right">
                <p className="font-mono font-semibold">{asset.value}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );

  // Comps (Comparable Sales) Components
  const CompsStepIndicator = ({ currentStep }) => (
    <div className="flex items-center justify-between mb-6">
      {['事例を集める', '推定する', '評価に反映'].map((label, i) => (
        <div key={i} className="flex items-center">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
            i + 1 <= currentStep ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          }`}>
            {i + 1}
          </div>
          <span className={`ml-2 text-sm ${
            i + 1 === currentStep ? "font-medium" : "text-muted-foreground"
          }`}>
            {label}
          </span>
          {i < 2 && <div className="flex-1 h-px bg-border mx-4" />}
        </div>
      ))}
    </div>
  );

  const CompsDataEntry = () => {
    const [url, setUrl] = useState('');
    
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link className="w-5 h-5" />
            ① 事例を集める
          </CardTitle>
          <CardDescription>URL貼付・CSV・画像ドロップで自動抽出</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="オークション・マーケットプレイスのURL"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="flex-1"
            />
            <Button>
              <Plus className="w-4 h-4 mr-1" />
              自動抽出
            </Button>
          </div>

          <div className="border-2 border-dashed border-muted rounded-lg p-6 text-center">
            <UploadCloud className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground mb-2">CSV・画像をドロップまたは選択</p>
            <Button variant="outline">
              ファイル選択
            </Button>
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-medium">登録済み事例（カード表示＋チップ）</h4>
            <div className="text-sm text-muted-foreground">
              TODO: 事例のカード表示・フィルタ・並び替え機能
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const CompsEstimation = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5" />
          ② 推定する
        </CardTitle>
        <CardDescription>MAD+加重中央値で外れ値を自動除外</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-sm font-medium mb-2 block">推定モード</label>
          <div className="flex gap-2">
            <Button size="sm">おまかせ</Button>
            <Button size="sm" variant="outline">保守的</Button>
            <Button size="sm" variant="outline">強気</Button>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">データの幅（慎重 ←→ 幅広く）</label>
          <div className="space-y-2">
            <input type="range" className="w-full" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>慎重</span>
              <span>幅広く</span>
            </div>
          </div>
        </div>

        <Card className="border-primary">
          <CardContent className="pt-6">
            <div className="text-center space-y-3">
              <div className="text-3xl font-bold font-mono">¥1,250,000</div>
              <div className="flex items-center justify-center gap-2">
                <span className="text-sm">信頼度</span>
                <div className="w-20 h-2 bg-muted rounded-full">
                  <div className="h-2 bg-primary rounded-full" style={{width: '78%'}} />
                </div>
                <span className="text-sm font-medium">78%</span>
              </div>
              <p className="text-sm text-muted-foreground">
                採用 8/12件（外れ値4件除外）
              </p>
              <div className="h-32 bg-muted rounded flex items-center justify-center">
                <span className="text-sm text-muted-foreground">TODO: 箱ひげ図 + 推定ライン</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </CardContent>
    </Card>
  );

  const CompsCommit = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="w-5 h-5" />
          ③ 評価に反映
        </CardTitle>
        <CardDescription>差分プレビュー＆UNDO機能付き</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-4 border rounded-lg space-y-2">
          <h4 className="font-medium">変更プレビュー</h4>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">簿価</p>
              <p className="font-mono">¥980,000</p>
            </div>
            <div>
              <p className="text-muted-foreground">現在評価</p>
              <p className="font-mono">¥1,100,000</p>
            </div>
            <div>
              <p className="text-muted-foreground">新評価</p>
              <p className="font-mono font-bold">¥1,250,000</p>
            </div>
          </div>
          <div className="flex items-center gap-1 text-sm font-medium text-red-600">
            <TrendingUp className="w-4 h-4" />
            +¥150,000
          </div>
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">反映メモ（必須）</label>
          <Input placeholder="出典・期間・件数など" />
        </div>

        <div className="flex gap-2">
          <Button className="flex-1">
            <Sparkles className="w-4 h-4 mr-1" />
            評価に反映
          </Button>
          <Button variant="outline">
            <Undo2 className="w-4 h-4 mr-1" />
            UNDO
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  // Rebalance Components
  const RebalanceStepIndicator = ({ currentStep }) => (
    <div className="flex items-center justify-between mb-6">
      {['目標を決める', 'ルールを選ぶ', '提案を見る'].map((label, i) => (
        <div key={i} className="flex items-center">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
            i + 1 <= currentStep ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          }`}>
            {i + 1}
          </div>
          <span className={`ml-2 text-sm ${
            i + 1 === currentStep ? "font-medium" : "text-muted-foreground"
          }`}>
            {label}
          </span>
          {i < 2 && <div className="flex-1 h-px bg-border mx-4" />}
        </div>
      ))}
    </div>
  );

  const RebalanceTargets = () => (
    <div className="grid grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>現状配分</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48 flex items-center justify-center">
            <span className="text-muted-foreground">TODO: 現状ドーナツチャート</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>目標配分（自動100%正規化）</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {['US株', '日本株', '貴金属', '現金'].map((asset, i) => (
            <div key={i} className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium">{asset}</label>
                <span className="text-sm font-mono">{[40, 20, 15, 25][i]}%</span>
              </div>
              <input 
                type="range" 
                className="w-full" 
                defaultValue={[40, 20, 15, 25][i]}
                max={100}
              />
            </div>
          ))}

          <div className="pt-4 border-t">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" defaultChecked />
              低流動性資産（L3/L4）をロック（売買対象外）
            </label>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const RebalanceRules = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings2 className="w-5 h-5" />
          ② ルールを選ぶ
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-sm font-medium mb-2 block">許容幅（どれくらいずれたら直す？）</label>
          <div className="flex gap-2">
            <Button size="sm">±3%</Button>
            <Button size="sm" variant="outline">±5%</Button>
            <Button size="sm" variant="outline">±10%</Button>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">調整方式</label>
          <div className="flex gap-2">
            <Button size="sm">目標（ど真ん中へ）</Button>
            <Button size="sm" variant="outline">中間（半分だけ戻す）</Button>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">最小取引額（円）</label>
          <Input type="number" defaultValue={10000} />
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">対象チップ</label>
          <div className="flex gap-2 flex-wrap">
            <Badge variant="outline">L1/L2のみ</Badge>
            <Badge variant="outline">外貨現金含む</Badge>
            <Badge variant="outline">端株・端数丸め</Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const RebalanceProposal = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scale className="w-5 h-5" />
          ③ 提案を見る
        </CardTitle>
        <CardDescription>CSV出力・案の保存（実行はアプリ外）</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-sm text-muted-foreground">必要売買総額</p>
                <p className="text-lg font-mono">¥500,000</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">手数料概算</p>
                <p className="text-lg font-mono">¥2,500</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">実行後偏差</p>
                <p className="text-lg font-mono">1.2%</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <h4 className="font-medium">売買提案（初心者向け文言）</h4>
          <Card>
            <CardContent className="pt-4">
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">売却</Badge>
                  <span className="font-medium">US株</span>
                </div>
                <span className="font-mono">¥300,000</span>
              </div>
              <p className="text-sm text-muted-foreground mb-2">
                目標を上回っているため
              </p>
              <div className="text-xs text-muted-foreground">
                • AAPL (L1): ¥150,000<br/>
                • MSFT (L1): ¥150,000
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-4">
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">購入</Badge>
                  <span className="font-medium">日本株</span>
                </div>
                <span className="font-mono">¥200,000</span>
              </div>
              <p className="text-sm text-muted-foreground mb-2">
                目標を下回っているため
              </p>
              <div className="text-xs text-muted-foreground">
                • トヨタ (L1): ¥200,000
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1">
            <FileDown className="w-4 h-4 mr-1" />
            CSV出力
          </Button>
          <Button className="flex-1">
            <Download className="w-4 h-4 mr-1" />
            この案を保存
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  // Asset Edit Modal Component
  const AssetEditModal = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Pencil className="w-5 h-5" />
          AssetEditModal v2（単一画面・単一トランザクション）
        </CardTitle>
        <CardDescription>
          共通＋クラス別フィールドを同一モーダルで編集
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="space-y-3">
            <h4 className="font-medium">共通フィールド</h4>
            <Input placeholder="名称" defaultValue="Apple Inc." />
            <Input type="date" defaultValue="2024-01-01" />
            <Input placeholder="簿価（円）" defaultValue="123,456" />
            <Input placeholder="流動性Tier" defaultValue="L1" />
          </div>
          
          <div className="space-y-3">
            <h4 className="font-medium">US株 詳細</h4>
            <Input placeholder="ティッカー" defaultValue="AAPL" />
            <Input placeholder="取引所" defaultValue="NASDAQ" />
            <Input placeholder="数量" defaultValue="10" />
            <Input placeholder="平均単価（USD）" defaultValue="180" />
          </div>
        </div>

        <div className="p-3 border rounded mb-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">再計算モード</span>
            <div className="flex gap-2">
              <Button size="sm">auto</Button>
              <Button size="sm" variant="outline">scale</Button>
              <Button size="sm" variant="outline">unit</Button>
            </div>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          TODO: PATCH /api/assets/:id で統一更新（トランザクション保証）
        </p>
      </CardContent>
    </Card>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">資産ポートフォリオ UIコンポーネント</h1>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="dashboard">ダッシュボード</TabsTrigger>
          <TabsTrigger value="comps">参考価格（コンプ）</TabsTrigger>
          <TabsTrigger value="rebalance">配分調整</TabsTrigger>
          <TabsTrigger value="edit">編集UI</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-6 mt-6">
          <MarketStatusBar />
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <DashboardCard
              title="純資産総額"
              value={formatJPY(mockDashboardData.totalValue)}
              subtitle="前日比 +2.3%"
              badge="market:enabled"
            />
            <DashboardCard
              title="評価損益"
              value={formatJPY(mockDashboardData.gainLoss)}
              subtitle="(+12.3%)"
              badge={`stale: ${mockDashboardData.staleCount}`}
            />
            <DashboardCard
              title="資産数"
              value={mockDashboardData.assetCount.toString()}
              subtitle="8クラス"
            />
            <DashboardCard
              title="最終更新"
              value={mockDashboardData.lastUpdate}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>クラス配分（ドーナツ）</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64 flex items-center justify-center text-muted-foreground">
                  TODO: Recharts ドーナツチャート
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>月次推移</CardTitle>
                <CardDescription>簿価 vs 評価額</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64 flex items-center justify-center text-muted-foreground">
                  TODO: 線グラフ（簿価・評価額）
                </div>
              </CardContent>
            </Card>
          </div>

          <TopAssetsCard />
        </TabsContent>

        <TabsContent value="comps" className="space-y-6 mt-6">
          <CompsStepIndicator currentStep={compsStep} />
          
          {compsStep === 1 && <CompsDataEntry />}
          {compsStep === 2 && <CompsEstimation />}
          {compsStep === 3 && <CompsCommit />}
          
          <div className="flex justify-center gap-2">
            <Button 
              variant="outline" 
              onClick={() => setCompsStep(Math.max(1, compsStep - 1))}
              disabled={compsStep === 1}
            >
              前へ
            </Button>
            <Button 
              onClick={() => setCompsStep(Math.min(3, compsStep + 1))}
              disabled={compsStep === 3}
            >
              次へ
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="rebalance" className="space-y-6 mt-6">
          <RebalanceStepIndicator currentStep={rebalanceStep} />
          
          {rebalanceStep === 1 && <RebalanceTargets />}
          {rebalanceStep === 2 && <RebalanceRules />}
          {rebalanceStep === 3 && <RebalanceProposal />}
          
          <div className="flex justify-center gap-2">
            <Button 
              variant="outline" 
              onClick={() => setRebalanceStep(Math.max(1, rebalanceStep - 1))}
              disabled={rebalanceStep === 1}
            >
              前へ
            </Button>
            <Button 
              onClick={() => setRebalanceStep(Math.min(3, rebalanceStep + 1))}
              disabled={rebalanceStep === 3}
            >
              次へ
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="edit" className="space-y-6 mt-6">
          <AssetEditModal />
        </TabsContent>
      </Tabs>

      <div className="mt-8 p-4 bg-muted rounded-lg">
        <h2 className="font-medium mb-2">API結線ポイント（TODO）</h2>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>• <code>/api/assets/:assetId/comps/commit</code> - コンプ推定の評価反映</li>
          <li>• <code>/api/rebalance/plan</code> - リバランス提案の取得</li>
          <li>• <code>PATCH /api/assets/:id</code> - 資産の統一編集（共通+クラス別）</li>
          <li>• <code>/api/dashboard</code> - ダッシュボードデータ</li>
          <li>• <code>/api/market/status</code> - 市場データ状態</li>
        </ul>
      </div>
    </div>
  );
};

export default PortfolioUIKitsDemo;