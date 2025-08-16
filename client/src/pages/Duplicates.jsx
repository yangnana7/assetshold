import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import DuplicateMergeModal from '@/components/DuplicateMergeModal';

const Duplicates = () => {
  const { user } = useAuth();
  const [duplicateGroups, setDuplicateGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);
  const [mergeGroup, setMergeGroup] = useState(null);
  const [isMergeOpen, setIsMergeOpen] = useState(false);

  useEffect(() => {
    fetchDuplicates();
  }, []);

  const fetchDuplicates = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/duplicates', {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('重複データの取得に失敗しました');
      }
      
      const data = await response.json();
      setDuplicateGroups(data.duplicate_groups || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleMerge = async (assetIds, keepAssetId) => {
    if (!confirm('選択した資産を統合しますか？この操作は取り消せません。')) {
      return;
    }

    try {
      setProcessing(true);
      const response = await fetch('/api/duplicates/merge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          asset_ids: assetIds,
          keep_asset_id: keepAssetId
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '統合に失敗しました');
      }

      const result = await response.json();
      alert(`資産が正常に統合されました。保持資産ID: ${result.kept_asset_id}`);
      fetchDuplicates(); // Refresh the list
    } catch (err) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const openMergeSelector = (group) => {
    setMergeGroup(group);
    setIsMergeOpen(true);
  }

  const handleIgnore = async (assetIds) => {
    if (!confirm('この重複グループを無視しますか？今後の重複検出対象から除外されます。')) {
      return;
    }

    try {
      setProcessing(true);
      const response = await fetch('/api/duplicates/ignore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          asset_ids: assetIds
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '無視設定に失敗しました');
      }

      alert('重複グループを無視リストに追加しました');
      fetchDuplicates(); // Refresh the list
    } catch (err) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency: 'JPY',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const getConfidenceColor = (confidence) => {
    if (confidence >= 0.9) return 'text-red-600 font-bold';
    if (confidence >= 0.7) return 'text-orange-600 font-semibold';
    return 'text-yellow-600';
  };

  const getConfidenceText = (confidence) => {
    if (confidence >= 0.9) return '高信頼度';
    if (confidence >= 0.7) return '中信頼度';
    return '低信頼度';
  };

  if (loading) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2">重複データを検出中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <strong>エラー:</strong> {error}
        </div>
        <button
          onClick={fetchDuplicates}
          className="mt-4 bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        >
          再読み込み
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">重複データ統合</h1>
        <button
          onClick={fetchDuplicates}
          disabled={processing}
          className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
        >
          {processing ? '処理中...' : '再検出'}
        </button>
      </div>

      {duplicateGroups.length === 0 ? (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
          <p className="font-bold">✓ 重複データは見つかりませんでした</p>
          <p>全ての資産データは一意です。</p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded">
            <p><strong>{duplicateGroups.length}</strong> 件の重複グループが見つかりました。</p>
          </div>

          {duplicateGroups.map((group, groupIndex) => (
            <div key={groupIndex} className="bg-white shadow-lg rounded-lg p-6 border">
              <div className="mb-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{group.criteria}</h3>
                    <p className="text-sm text-gray-600">
                      検出タイプ: {group.type} | 
                      <span className={`ml-1 ${getConfidenceColor(group.confidence)}`}>
                        {getConfidenceText(group.confidence)} ({(group.confidence * 100).toFixed(0)}%)
                      </span>
                    </p>
                  </div>
                  {user?.role === 'admin' && (
                    <div className="flex space-x-2">
                      <button
                        onClick={() => openMergeSelector(group)}
                        disabled={processing}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-1 rounded disabled:opacity-50"
                      >
                        選択して統合
                      </button>
                      <button
                        onClick={() => handleIgnore(group.assets.map(a => a.id))}
                        disabled={processing}
                        className="bg-gray-500 hover:bg-gray-700 text-white text-sm px-3 py-1 rounded disabled:opacity-50"
                      >
                        無視
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {group.assets.map((asset, assetIndex) => (
                  <div key={asset.id} className="border rounded-lg p-4 hover:bg-gray-50">
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-semibold text-gray-900">{asset.name}</h4>
                      <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                        ID: {asset.id}
                      </span>
                    </div>
                    
                    <div className="text-sm space-y-1">
                      <p><span className="font-medium">クラス:</span> {asset.class}</p>
                      <p><span className="font-medium">簿価:</span> {formatCurrency(asset.book_value_jpy)}</p>
                      {asset.note && (
                        <p><span className="font-medium">備考:</span> {asset.note}</p>
                      )}
                      <p><span className="font-medium">作成日:</span> {new Date(asset.created_at).toLocaleDateString('ja-JP')}</p>
                      
                      {/* Stock-specific details */}
                      {asset.ticker && (
                        <p><span className="font-medium">ティッカー:</span> {asset.ticker}</p>
                      )}
                      {asset.code && (
                        <p><span className="font-medium">証券コード:</span> {asset.code}</p>
                      )}
                      {asset.us_quantity && (
                        <p><span className="font-medium">株数:</span> {asset.us_quantity}</p>
                      )}
                      {asset.jp_quantity && (
                        <p><span className="font-medium">株数:</span> {asset.jp_quantity}</p>
                      )}
                      
                      {/* Precious metal details */}
                      {asset.metal && (
                        <p><span className="font-medium">金属:</span> {asset.metal}</p>
                      )}
                      {asset.weight_g && (
                        <p><span className="font-medium">重量:</span> {asset.weight_g}g</p>
                      )}
                      {asset.purity && (
                        <p><span className="font-medium">純度:</span> {asset.purity}</p>
                      )}
                    </div>

                    {user?.role === 'admin' && (
                      <button
                        onClick={() => handleMerge(group.assets.map(a => a.id), asset.id)}
                        disabled={processing}
                        className="mt-3 w-full bg-blue-500 hover:bg-blue-700 text-white text-sm font-bold py-2 px-4 rounded disabled:opacity-50"
                      >
                        これを保持して統合
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {isMergeOpen && (
            <DuplicateMergeModal
              isOpen={isMergeOpen}
              group={mergeGroup}
              onClose={() => { setIsMergeOpen(false); setMergeGroup(null); }}
              onMerged={() => { setIsMergeOpen(false); setMergeGroup(null); fetchDuplicates(); }}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default Duplicates;
