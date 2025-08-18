import React from 'react';
import './cards.css';

export default function AssetCard({ asset, onEdit }) {
  const note = asset.note ? `（${asset.note}）` : '';
  
  // 編集対象クラスかチェック
  const isEditable = asset.class === 'us_stock' || asset.class === 'jp_stock';
  
  return (
    <div className="asset-card">
      <div className="asset-main">
        <div className="asset-title">
          {asset.name}{note}
          {isEditable && onEdit && (
            <button 
              className="edit-button" 
              onClick={() => onEdit(asset)}
              title="編集"
            >
              ✏️
            </button>
          )}
        </div>
        <dl className="asset-meta">
          {asset.class && <><dt>区分</dt><dd>{asset.class}</dd></>}
          {asset.ticker && <><dt>ティッカー</dt><dd>{asset.ticker}</dd></>}
          {asset.code && <><dt>コード</dt><dd>{asset.code}</dd></>}
          {asset.metal && <><dt>金属</dt><dd>{asset.metal}{asset.weight_g ? ` / ${asset.weight_g}g` : ''}</dd></>}
          {asset.acquired_at && <><dt>取得日</dt><dd>{asset.acquired_at}</dd></>}
          {asset.liquidity_tier && <><dt>流動性</dt><dd>{asset.liquidity_tier}</dd></>}
          {asset.quantity && <><dt>数量</dt><dd>{asset.quantity}</dd></>}
          {asset.avg_price_usd && <><dt>平均単価</dt><dd>USD {asset.avg_price_usd}</dd></>}
          {asset.avg_price_jpy && <><dt>平均単価</dt><dd>JPY {asset.avg_price_jpy}</dd></>}
        </dl>
      </div>
      <div className="asset-fin">
        <div className="asset-valuation">{Intl.NumberFormat('ja-JP').format(asset.valuation_jpy || 0)}<span> 円</span></div>
        <div className="asset-book">簿価 {Intl.NumberFormat('ja-JP').format(asset.book_value_jpy || 0)} 円</div>
        <div className={`asset-pl ${((asset.valuation_jpy||0)-(asset.book_value_jpy||0))>=0 ? 'pos':'neg'}`}>
          {Intl.NumberFormat('ja-JP').format((asset.valuation_jpy||0)-(asset.book_value_jpy||0))} 円
        </div>
        {asset.valuation_source && <div className="badge">src: {asset.valuation_source}</div>}
        {asset.market_status && <div className={`badge ${asset.market_status.stale?'stale':''}`}>market: {asset.market_status.enabled?'on':'off'}</div>}
      </div>
    </div>
  );
}