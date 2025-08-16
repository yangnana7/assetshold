import React, { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card-simple';
import { Button } from '@/components/ui/button-simple';
import { Badge } from '@/components/ui/badge-simple';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs-simple';
import { Input } from '@/components/ui/input-simple';
import { 
  SlidersHorizontal,
  Settings2,
  Scale,
  FileDown,
  Download
} from 'lucide-react';

// BDD-compliant Rebalance UI (3-step wizard)
export default function RebalanceBDDPage() {
  // State for 3-step wizard
  const [currentStep, setCurrentStep] = useState('targets');
  
  // Current allocation and targets
  const [currentAllocation, setCurrentAllocation] = useState({});
  const [targetAllocation, setTargetAllocation] = useState({});
  const [originalTargets, setOriginalTargets] = useState([]);
  
  // Rules and parameters
  const [tolerance, setTolerance] = useState(5);
  const [method, setMethod] = useState('target'); // target | mid
  const [minTradeAmount, setMinTradeAmount] = useState(10000);
  const [lockIlliquid, setLockIlliquid] = useState(true);
  const [useBook, setUseBook] = useState(true);
  
  // Results
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);

  // Default asset classes
  const DEFAULT_CLASSES = ['US株', '日本株', '貴金属', '現金', '時計', '不動産'];

  // Format currency
  const formatJPY = (amount) => {
    return new Intl.NumberFormat('ja-JP', { 
      style: 'currency', 
      currency: 'JPY',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount || 0);
  };

  // Normalize allocations to sum to 100%
  const normalizeAllocations = (allocations) => {
    const total = Object.values(allocations).reduce((sum, val) => sum + (Number(val) || 0), 0);
    if (total === 0) return allocations;
    
    const normalized = {};
    Object.entries(allocations).forEach(([key, value]) => {
      normalized[key] = (Number(value) || 0) / total * 100;
    });
    return normalized;
  };

  // Get normalized target allocation
  const normalizedTargets = useMemo(() => normalizeAllocations(targetAllocation), [targetAllocation]);

  // Load current targets from API
  const loadTargets = async () => {
    try {
      const response = await fetch('/api/rebalance/targets');
      const data = await response.json();
      
      if (data.targets) {
        const targetMap = {};
        data.targets.forEach(target => {
          targetMap[target.class] = target.pct || 0;
        });
        setTargetAllocation(targetMap);
        setOriginalTargets(data.targets);
      }
      
      if (typeof data.tolerance_pct === 'number') {
        setTolerance(data.tolerance_pct);
      }
    } catch (error) {
      console.error('Failed to load targets:', error);
    }
  };

  // Save targets to API
  const saveTargets = async () => {
    try {
      const targets = Object.entries(normalizedTargets).map(([className, pct]) => ({
        class: className,
        pct: Number(pct.toFixed(2))
      }));

      const payload = {
        targets,
        tolerance_pct: tolerance
      };

      const response = await fetch('/api/rebalance/targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        alert('目標配分を保存しました');
        await loadTargets();
      } else {
        throw new Error('Failed to save targets');
      }
    } catch (error) {
      console.error('Failed to save targets:', error);
      alert('目標配分の保存に失敗しました');
    }
  };

  // Generate rebalance plan
  const generatePlan = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        to: method,
        tol: String(tolerance),
        min_trade: String(minTradeAmount),
        use_book: useBook ? '1' : '0'
      });

      const response = await fetch(`/api/rebalance/plan?${params}`);
      const data = await response.json();
      
      setPlan(data.plan);
      if (data.current) {
        setCurrentAllocation(data.current);
      }
    } catch (error) {
      console.error('Failed to generate plan:', error);
      alert('リバランス案の生成に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  // Export plan to CSV
  const exportPlanCSV = () => {
    if (!plan || !plan.trades || plan.trades.length === 0) {
      alert('出力するリバランス案がありません');
      return;
    }

    const csvRows = [
      ['Action', 'Class', 'Amount(JPY)', 'Reason'],
      ...plan.trades.map(trade => [
        trade.action || 'REBALANCE',
        trade.from_class && trade.to_class ? `${trade.from_class} → ${trade.to_class}` : trade.class || 'Unknown',
        trade.amount_jpy || 0,
        trade.reason || 'リバランスのため'
      ])
    ];

    const csv = csvRows.map(row => 
      row.map(cell => typeof cell === 'string' && cell.includes(',') ? `"${cell}"` : cell).join(',')
    ).join('\n');

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `rebalance_plan_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Save plan (for audit purposes)
  const savePlan = async () => {
    try {
      // TODO: Implement plan saving API
      console.log('Save plan for audit - TODO: Implement API');
      alert('リバランス案を記録しました（audit_log）');
    } catch (error) {
      console.error('Failed to save plan:', error);
    }
  };

  // Handle target allocation slider changes
  const handleTargetChange = (className, value) => {
    setTargetAllocation(prev => ({
      ...prev,
      [className]: Math.max(0, Math.min(100, Number(value) || 0))
    }));
  };

  // Initialize default targets if empty
  useEffect(() => {
    loadTargets();
  }, []);

  useEffect(() => {
    if (Object.keys(targetAllocation).length === 0 && originalTargets.length === 0) {
      // Set default allocations if none exist
      const defaultTargets = {
        'US株': 40,
        '日本株': 20,
        '貴金属': 15,
        '現金': 25
      };
      setTargetAllocation(defaultTargets);
    }
  }, [originalTargets, targetAllocation]);

  // Step indicator component
  const StepIndicator = ({ currentStep }) => (
    <div className="flex items-center justify-between mb-6">
      {['目標を決める', 'ルールを選ぶ', '提案を見る'].map((label, i) => {
        const stepKey = ['targets', 'rules', 'plan'][i];
        const isActive = stepKey === currentStep;
        const isCompleted = ['targets', 'rules', 'plan'].indexOf(stepKey) < ['targets', 'rules', 'plan'].indexOf(currentStep);
        
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

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-6 h-6" />
          <h1 className="text-2xl font-bold">配分調整（リバランス）</h1>
        </div>
      </div>

      <StepIndicator currentStep={currentStep} />

      <Tabs value={currentStep} onValueChange={setCurrentStep} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="targets">① 目標を決める</TabsTrigger>
          <TabsTrigger value="rules">② ルールを選ぶ</TabsTrigger>
          <TabsTrigger value="plan">③ 提案を見る</TabsTrigger>
        </TabsList>

        {/* Step 1: Set Targets */}
        <TabsContent value="targets" className="space-y-6 mt-6">
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>現状配分</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-48 flex items-center justify-center text-muted-foreground">
                  TODO: 現状ドーナツチャート（Recharts）
                </div>
                {Object.keys(currentAllocation).length > 0 && (
                  <div className="mt-4 space-y-2">
                    {Object.entries(currentAllocation).map(([className, percentage]) => (
                      <div key={className} className="flex justify-between text-sm">
                        <span>{className}</span>
                        <span>{Number(percentage).toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>目標配分（自動で合計100%正規化）</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-48 flex items-center justify-center text-muted-foreground mb-4">
                  TODO: 目標ドーナツチャート（Recharts）
                </div>
                
                <div className="space-y-4">
                  {DEFAULT_CLASSES.map((className) => (
                    <div key={className} className="space-y-2">
                      <div className="flex justify-between items-center">
                        <label className="text-sm font-medium">{className}</label>
                        <span className="text-sm font-mono">
                          {(normalizedTargets[className] || 0).toFixed(1)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={targetAllocation[className] || 0}
                        onChange={(e) => handleTargetChange(className, e.target.value)}
                        className="w-full"
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={lockIlliquid}
                    onChange={(e) => setLockIlliquid(e.target.checked)}
                  />
                  低流動性資産（L3/L4）をロック（売買対象から除外）
                </label>
                <Button onClick={saveTargets}>
                  <Settings2 className="w-4 h-4 mr-1" />
                  目標を保存
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Step 2: Set Rules */}
        <TabsContent value="rules" className="space-y-6 mt-6">
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings2 className="w-5 h-5" />
                  許容幅とルール
                </CardTitle>
                <CardDescription>どれくらいずれたら調整するかを設定</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">許容幅（±%）</label>
                  <div className="flex gap-2">
                    {[3, 5, 10].map(value => (
                      <Button
                        key={value}
                        variant={tolerance === value ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setTolerance(value)}
                      >
                        ±{value}%
                      </Button>
                    ))}
                  </div>
                  <Input
                    type="number"
                    value={tolerance}
                    onChange={(e) => setTolerance(Number(e.target.value) || 5)}
                    className="mt-2 w-24"
                    min={1}
                    max={50}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">調整方式</label>
                  <div className="flex gap-2">
                    <Button
                      variant={method === 'target' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setMethod('target')}
                    >
                      目標（ど真ん中へ）
                    </Button>
                    <Button
                      variant={method === 'mid' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setMethod('mid')}
                    >
                      中間（半分だけ戻す）
                    </Button>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">最小取引額（円）</label>
                  <Input
                    type="number"
                    value={minTradeAmount}
                    onChange={(e) => setMinTradeAmount(Number(e.target.value) || 0)}
                    min={0}
                    step={1000}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>対象設定</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">対象チップ</label>
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant="outline">L1/L2のみ</Badge>
                    <Badge variant="outline">外貨現金含む</Badge>
                    <Badge variant="outline">端株・端数丸め</Badge>
                  </div>
                </div>

                <div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={useBook}
                      onChange={(e) => setUseBook(e.target.checked)}
                    />
                    評価がない資産は簿価で代用
                  </label>
                </div>

                <Button onClick={generatePlan} className="w-full" disabled={loading}>
                  {loading ? 'プラン計算中...' : 'リバランス案を計算'}
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Step 3: View Plan */}
        <TabsContent value="plan" className="space-y-6 mt-6">
          {/* Summary Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Scale className="w-5 h-5" />
                提案サマリ
              </CardTitle>
              <CardDescription>CSV出力・案の保存（実行はアプリ外）</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-4 gap-4 text-sm">
                <div className="border rounded-lg p-3 text-center">
                  <div className="text-muted-foreground">許容幅</div>
                  <div className="font-medium">±{tolerance}%</div>
                </div>
                <div className="border rounded-lg p-3 text-center">
                  <div className="text-muted-foreground">方式</div>
                  <div className="font-medium">{method === 'mid' ? '中間' : '目標'}</div>
                </div>
                <div className="border rounded-lg p-3 text-center">
                  <div className="text-muted-foreground">最小取引</div>
                  <div className="font-medium">{formatJPY(minTradeAmount)}</div>
                </div>
                <div className="border rounded-lg p-3 text-center">
                  <div className="text-muted-foreground">L3/L4ロック</div>
                  <div className="font-medium">{lockIlliquid ? 'ON' : 'OFF'}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Current vs Target Table */}
          {plan && plan.rows && (
            <Card>
              <CardHeader>
                <CardTitle>配分比較（現状 vs 目標）</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted-foreground border-b">
                        <th className="p-2">クラス</th>
                        <th className="p-2 text-right">現状(円)</th>
                        <th className="p-2 text-right">現状(%)</th>
                        <th className="p-2 text-right">目標(%)</th>
                        <th className="p-2 text-right">許容範囲</th>
                        <th className="p-2 text-right">ドリフト(%)</th>
                        <th className="p-2 text-center">逸脱</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.rows.map((row, i) => (
                        <tr key={i} className="border-b">
                          <td className="p-2 font-medium">{row.class}</td>
                          <td className="p-2 text-right font-mono">{formatJPY(row.cur_value_jpy)}</td>
                          <td className="p-2 text-right">{row.cur_pct?.toFixed(1)}%</td>
                          <td className="p-2 text-right">{row.target_pct?.toFixed(1)}%</td>
                          <td className="p-2 text-right text-xs">
                            {row.min_pct?.toFixed(1)}%-{row.max_pct?.toFixed(1)}%
                          </td>
                          <td className={`p-2 text-right ${Math.abs(row.drift_pct || 0) >= tolerance ? 'font-bold text-red-600' : ''}`}>
                            {row.drift_pct?.toFixed(2)}%
                          </td>
                          <td className="p-2 text-center">
                            {row.breach && <span className="text-red-600">⚠</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Trade Proposals */}
          <Card>
            <CardHeader>
              <CardTitle>売買提案（初心者向け文言）</CardTitle>
            </CardHeader>
            <CardContent>
              {!plan || !plan.trades || plan.trades.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {!plan ? 'リバランス案を計算してください' : '調整が必要な逸脱はありません'}
                </div>
              ) : (
                <div className="space-y-4">
                  {plan.trades.map((trade, i) => (
                    <Card key={i} className="border-l-4 border-l-primary">
                      <CardContent className="pt-4">
                        <div className="flex justify-between items-center mb-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">
                              {trade.from_class && trade.to_class 
                                ? `${trade.from_class} → ${trade.to_class}` 
                                : trade.action || 'REBALANCE'
                              }
                            </Badge>
                          </div>
                          <span className="font-mono font-bold">
                            {formatJPY(trade.amount_jpy)}
                          </span>
                        </div>
                        
                        <p className="text-sm text-muted-foreground mb-3">
                          {trade.reason || '目標配分に調整するため'}
                          {lockIlliquid && trade.note && (
                            <span className="ml-2 text-orange-600">({trade.note})</span>
                          )}
                        </p>

                        {trade.sells && trade.sells.length > 0 && (
                          <div className="mb-3">
                            <h4 className="text-xs font-medium text-muted-foreground mb-1">売却候補</h4>
                            <div className="space-y-1">
                              {trade.sells.map((sell, j) => (
                                <div key={j} className="text-xs">
                                  • {sell.name} ({sell.liquidity_tier || 'L?'}): {formatJPY(sell.amount_jpy)}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {trade.buys && trade.buys.length > 0 && (
                          <div>
                            <h4 className="text-xs font-medium text-muted-foreground mb-1">購入候補</h4>
                            <div className="space-y-1">
                              {trade.buys.map((buy, j) => (
                                <div key={j} className="text-xs">
                                  • {buy.name} ({buy.liquidity_tier || 'L?'}): {formatJPY(buy.amount_jpy)}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={exportPlanCSV} disabled={!plan || !plan.trades || plan.trades.length === 0}>
                  <FileDown className="w-4 h-4 mr-1" />
                  CSV出力
                </Button>
                <Button onClick={savePlan} disabled={!plan || !plan.trades || plan.trades.length === 0}>
                  <Download className="w-4 h-4 mr-1" />
                  この案を保存
                </Button>
              </div>
              
              <div className="mt-4 p-3 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">
                  <strong>重要:</strong> このアプリはリバランス案の提示のみを行います。
                  実際の売買執行はお客様ご自身で証券会社等を通じて行ってください。
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
