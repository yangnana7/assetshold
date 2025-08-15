import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card-simple';
import { Button } from '@/components/ui/button-simple';
import { Badge } from '@/components/ui/badge-simple';
import { Input } from '@/components/ui/input-simple';
import { Pencil, Save, X } from 'lucide-react';

// BDD-compliant AssetEditModal v2 (Single Screen, Single Transaction)
export default function AssetEditModalBDD({ asset, isOpen, onClose, onSave }) {
  // Common fields state
  const [common, setCommon] = useState({
    name: '',
    note: '',
    acquired_at: '',
    book_value_jpy: 0,
    valuation_source: 'manual',
    liquidity_tier: 'L2',
    tags: ''
  });

  // Class-specific fields state
  const [classFields, setClassFields] = useState({});

  // Recalculation mode
  const [recalcMode, setRecalcMode] = useState('auto'); // auto|scale|unit

  // Loading state
  const [loading, setLoading] = useState(false);

  // Initialize form data when asset changes
  useEffect(() => {
    if (asset) {
      setCommon({
        name: asset.name || '',
        note: asset.note || '',
        acquired_at: asset.acquired_at || '',
        book_value_jpy: asset.book_value_jpy || 0,
        valuation_source: asset.valuation_source || 'manual',
        liquidity_tier: asset.liquidity_tier || 'L2',
        tags: asset.tags || ''
      });

      // Set class-specific fields based on asset class
      switch (asset.class) {
        case 'us_stock':
          setClassFields({
            ticker: asset.ticker || '',
            exchange: asset.exchange || 'NYSE',
            quantity: asset.quantity || 0,
            avg_price_usd: asset.avg_price_usd || 0
          });
          break;
        case 'jp_stock':
          setClassFields({
            code: asset.code || '',
            quantity: asset.quantity || 0,
            avg_price_jpy: asset.avg_price_jpy || 0
          });
          break;
        case 'precious_metal':
          setClassFields({
            metal: asset.metal || 'gold',
            weight_g: asset.weight_g || 0,
            purity: asset.purity || 0.9999,
            unit_price_jpy: asset.unit_price_jpy || 0
          });
          break;
        case 'watch':
          setClassFields({
            brand: asset.brand || '',
            model: asset.model || '',
            ref: asset.ref || '',
            box_papers: asset.box_papers || false
          });
          break;
        case 'real_estate':
          setClassFields({
            address: asset.address || '',
            land_area_sqm: asset.land_area_sqm || 0,
            building_area_sqm: asset.building_area_sqm || 0,
            rights: asset.rights || ''
          });
          break;
        case 'collection':
          setClassFields({
            category: asset.category || '',
            variant: asset.variant || ''
          });
          break;
        case 'cash':
          setClassFields({
            currency: asset.currency || 'JPY',
            balance: asset.balance || 0
          });
          break;
        default:
          setClassFields({});
      }
    }
  }, [asset]);

  // Handle save action
  const handleSave = async () => {
    if (!asset?.id) return;
    
    setLoading(true);
    try {
      // Prepare payload for unified PATCH API
      const payload = {
        // Common fields
        ...common,
        // Class-specific fields
        ...classFields,
        // Recalculation mode
        recalc_mode: recalcMode,
        // Asset class
        class: asset.class
      };

      // Call unified PATCH API (BDD requirement: single transaction)
      const response = await fetch(`/api/assets/${asset.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const updatedAsset = await response.json();
        onSave?.(updatedAsset);
        onClose?.();
      } else {
        const error = await response.json();
        alert(`保存に失敗しました: ${error.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to save asset:', error);
      alert('保存に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  // Update common field
  const updateCommon = (field, value) => {
    setCommon(prev => ({ ...prev, [field]: value }));
  };

  // Update class-specific field
  const updateClassField = (field, value) => {
    setClassFields(prev => ({ ...prev, [field]: value }));
  };

  if (!isOpen || !asset) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto m-4">
        <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Pencil className="w-5 h-5" />
            <h2 className="text-xl font-semibold">資産編集（統一）</h2>
            <Badge variant="outline">{asset.class}</Badge>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="p-6 space-y-6">
          <div className="text-sm text-muted-foreground">
            単一画面・単一トランザクション で共通フィールド + クラス別フィールドを編集
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Common Fields */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">共通フィールド</CardTitle>
                <CardDescription>全資産共通の属性</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">名称</label>
                  <Input
                    value={common.name}
                    onChange={(e) => updateCommon('name', e.target.value)}
                    placeholder="資産名称"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium mb-1 block">取得日</label>
                  <Input
                    type="date"
                    value={common.acquired_at}
                    onChange={(e) => updateCommon('acquired_at', e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium mb-1 block">簿価（円）</label>
                  <Input
                    type="number"
                    value={common.book_value_jpy}
                    onChange={(e) => updateCommon('book_value_jpy', Number(e.target.value) || 0)}
                    min={0}
                    step={1}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium mb-1 block">評価ソース</label>
                  <select
                    className="w-full px-3 py-2 border rounded-md"
                    value={common.valuation_source}
                    onChange={(e) => updateCommon('valuation_source', e.target.value)}
                  >
                    <option value="manual">手動</option>
                    <option value="market">市場価格</option>
                    <option value="comps">参考価格</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium mb-1 block">流動性Tier</label>
                  <select
                    className="w-full px-3 py-2 border rounded-md"
                    value={common.liquidity_tier}
                    onChange={(e) => updateCommon('liquidity_tier', e.target.value)}
                  >
                    <option value="L1">L1 (高)</option>
                    <option value="L2">L2 (中)</option>
                    <option value="L3">L3 (低)</option>
                    <option value="L4">L4 (極低)</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium mb-1 block">メモ</label>
                  <textarea
                    className="w-full px-3 py-2 border rounded-md resize-none"
                    rows={3}
                    value={common.note}
                    onChange={(e) => updateCommon('note', e.target.value)}
                    placeholder="資産に関するメモ"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium mb-1 block">タグ (JSON)</label>
                  <Input
                    value={common.tags}
                    onChange={(e) => updateCommon('tags', e.target.value)}
                    placeholder='{"category": "growth", "sector": "tech"}'
                  />
                </div>
              </CardContent>
            </Card>

            {/* Class-Specific Fields */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{asset.class} 詳細</CardTitle>
                <CardDescription>クラス固有の属性</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {asset.class === 'us_stock' && (
                  <>
                    <div>
                      <label className="text-sm font-medium mb-1 block">ティッカーシンボル</label>
                      <Input
                        value={classFields.ticker || ''}
                        onChange={(e) => updateClassField('ticker', e.target.value)}
                        placeholder="AAPL"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">取引所</label>
                      <select
                        className="w-full px-3 py-2 border rounded-md"
                        value={classFields.exchange || 'NYSE'}
                        onChange={(e) => updateClassField('exchange', e.target.value)}
                      >
                        <option value="NYSE">NYSE</option>
                        <option value="NASDAQ">NASDAQ</option>
                        <option value="AMEX">AMEX</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">数量</label>
                      <Input
                        type="number"
                        step="0.001"
                        value={classFields.quantity || 0}
                        onChange={(e) => updateClassField('quantity', Number(e.target.value) || 0)}
                        min={0}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">平均取得単価 (USD)</label>
                      <Input
                        type="number"
                        step="0.01"
                        value={classFields.avg_price_usd || 0}
                        onChange={(e) => updateClassField('avg_price_usd', Number(e.target.value) || 0)}
                        min={0}
                      />
                    </div>
                  </>
                )}

                {asset.class === 'jp_stock' && (
                  <>
                    <div>
                      <label className="text-sm font-medium mb-1 block">銘柄コード</label>
                      <Input
                        value={classFields.code || ''}
                        onChange={(e) => updateClassField('code', e.target.value)}
                        placeholder="7203"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">数量</label>
                      <Input
                        type="number"
                        step="1"
                        value={classFields.quantity || 0}
                        onChange={(e) => updateClassField('quantity', Number(e.target.value) || 0)}
                        min={0}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">平均取得単価 (円)</label>
                      <Input
                        type="number"
                        step="0.01"
                        value={classFields.avg_price_jpy || 0}
                        onChange={(e) => updateClassField('avg_price_jpy', Number(e.target.value) || 0)}
                        min={0}
                      />
                    </div>
                  </>
                )}

                {asset.class === 'precious_metal' && (
                  <>
                    <div>
                      <label className="text-sm font-medium mb-1 block">金属種別</label>
                      <select
                        className="w-full px-3 py-2 border rounded-md"
                        value={classFields.metal || 'gold'}
                        onChange={(e) => updateClassField('metal', e.target.value)}
                      >
                        <option value="gold">金</option>
                        <option value="silver">銀</option>
                        <option value="platinum">プラチナ</option>
                        <option value="palladium">パラジウム</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">重量 (g)</label>
                      <Input
                        type="number"
                        step="0.1"
                        value={classFields.weight_g || 0}
                        onChange={(e) => updateClassField('weight_g', Number(e.target.value) || 0)}
                        min={0}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">純度 (0-1)</label>
                      <Input
                        type="number"
                        step="0.0001"
                        value={classFields.purity || 0.9999}
                        onChange={(e) => updateClassField('purity', Number(e.target.value) || 0)}
                        min={0}
                        max={1}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">単価 (円/g)</label>
                      <Input
                        type="number"
                        step="0.01"
                        value={classFields.unit_price_jpy || 0}
                        onChange={(e) => updateClassField('unit_price_jpy', Number(e.target.value) || 0)}
                        min={0}
                      />
                    </div>
                  </>
                )}

                {asset.class === 'watch' && (
                  <>
                    <div>
                      <label className="text-sm font-medium mb-1 block">ブランド</label>
                      <Input
                        value={classFields.brand || ''}
                        onChange={(e) => updateClassField('brand', e.target.value)}
                        placeholder="Rolex"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">モデル</label>
                      <Input
                        value={classFields.model || ''}
                        onChange={(e) => updateClassField('model', e.target.value)}
                        placeholder="GMT-Master II"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">リファレンス</label>
                      <Input
                        value={classFields.ref || ''}
                        onChange={(e) => updateClassField('ref', e.target.value)}
                        placeholder="126710BLRO"
                      />
                    </div>
                    <div>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={classFields.box_papers || false}
                          onChange={(e) => updateClassField('box_papers', e.target.checked)}
                        />
                        箱・保証書あり
                      </label>
                    </div>
                  </>
                )}

                {asset.class === 'real_estate' && (
                  <>
                    <div>
                      <label className="text-sm font-medium mb-1 block">所在地</label>
                      <Input
                        value={classFields.address || ''}
                        onChange={(e) => updateClassField('address', e.target.value)}
                        placeholder="東京都渋谷区..."
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">土地面積 (㎡)</label>
                      <Input
                        type="number"
                        step="0.01"
                        value={classFields.land_area_sqm || 0}
                        onChange={(e) => updateClassField('land_area_sqm', Number(e.target.value) || 0)}
                        min={0}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">建物面積 (㎡)</label>
                      <Input
                        type="number"
                        step="0.01"
                        value={classFields.building_area_sqm || 0}
                        onChange={(e) => updateClassField('building_area_sqm', Number(e.target.value) || 0)}
                        min={0}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">権利</label>
                      <Input
                        value={classFields.rights || ''}
                        onChange={(e) => updateClassField('rights', e.target.value)}
                        placeholder="所有権/借地権/定借権"
                      />
                    </div>
                  </>
                )}

                {asset.class === 'collection' && (
                  <>
                    <div>
                      <label className="text-sm font-medium mb-1 block">カテゴリ</label>
                      <Input
                        value={classFields.category || ''}
                        onChange={(e) => updateClassField('category', e.target.value)}
                        placeholder="絵画/彫刻/陶磁器"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">バリエーション</label>
                      <Input
                        value={classFields.variant || ''}
                        onChange={(e) => updateClassField('variant', e.target.value)}
                        placeholder="作品詳細・型番など"
                      />
                    </div>
                  </>
                )}

                {asset.class === 'cash' && (
                  <>
                    <div>
                      <label className="text-sm font-medium mb-1 block">通貨</label>
                      <select
                        className="w-full px-3 py-2 border rounded-md"
                        value={classFields.currency || 'JPY'}
                        onChange={(e) => updateClassField('currency', e.target.value)}
                      >
                        <option value="JPY">JPY</option>
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                        <option value="CNY">CNY</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">残高</label>
                      <Input
                        type="number"
                        step="0.01"
                        value={classFields.balance || 0}
                        onChange={(e) => updateClassField('balance', Number(e.target.value) || 0)}
                        min={0}
                      />
                    </div>
                  </>
                )}

                {!['us_stock', 'jp_stock', 'precious_metal', 'watch', 'real_estate', 'collection', 'cash'].includes(asset.class) && (
                  <div className="text-center py-8 text-muted-foreground">
                    このクラス ({asset.class}) の専用フィールドは未定義です
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recalculation Mode */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">簿価再計算モード</CardTitle>
              <CardDescription>数量・単価変更時の簿価更新方法</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  {['auto', 'scale', 'unit'].map((mode) => (
                    <Button
                      key={mode}
                      variant={recalcMode === mode ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setRecalcMode(mode)}
                    >
                      {mode}
                    </Button>
                  ))}
                </div>
                <div className="text-xs text-muted-foreground max-w-md">
                  <div><strong>auto:</strong> クラス別既定</div>
                  <div><strong>scale:</strong> 比例調整</div>
                  <div><strong>unit:</strong> 単価×数量</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={onClose} disabled={loading}>
              キャンセル
            </Button>
            <Button onClick={handleSave} disabled={loading}>
              <Save className="w-4 h-4 mr-1" />
              {loading ? '保存中...' : '保存'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}