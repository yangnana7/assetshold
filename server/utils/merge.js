/**
 * 統合ロジック（mergeUsPosition, mergeJpPosition）の実装
 * 改修案の 6.2 擬似コードをベースに実装
 */

function floor2(x) { 
  return Math.floor(x * 100) / 100; 
}

/**
 * US株ポジション統合
 * @param {Object} params - 統合パラメータ
 * @param {number} params.oldQty - 既存数量
 * @param {number} params.oldAvgUsd - 既存平均単価(USD)
 * @param {number} params.oldBookJpy - 既存簿価(JPY)
 * @param {number} params.addQty - 追加数量
 * @param {number} params.addAvgUsd - 追加平均単価(USD)
 * @param {number} params.fxAtAcq - 取得時為替レート(USD/JPY、任意)
 * @returns {Object} 統合結果 {newQty, newAvgUsd, newBookJpy, method}
 */
function mergeUsPosition({ oldQty, oldAvgUsd, oldBookJpy, addQty, addAvgUsd, fxAtAcq }) {
  if (!(addQty > 0) || !(addAvgUsd > 0)) {
    throw new Error('invalid_input');
  }
  
  const newQty = oldQty + addQty;
  const newAvgUsd = (oldAvgUsd * oldQty + addAvgUsd * addQty) / newQty;

  let method = 'unit';
  let newBookJpy;
  
  if (Number.isFinite(fxAtAcq) && fxAtAcq > 0) {
    // unit法: 取得時為替を使用
    newBookJpy = Math.floor((oldBookJpy + floor2(addQty * addAvgUsd * fxAtAcq)));
  } else {
    // scale法: 比例スケール
    method = 'scale';
    const unitBook = oldQty > 0 ? oldBookJpy / oldQty : 0;
    newBookJpy = Math.floor(floor2(unitBook * newQty));
  }
  
  return { newQty, newAvgUsd, newBookJpy, method };
}

/**
 * JP株ポジション統合
 * @param {Object} params - 統合パラメータ
 * @param {number} params.oldQty - 既存数量
 * @param {number} params.oldAvgJpy - 既存平均単価(JPY)
 * @param {number} params.oldBookJpy - 既存簿価(JPY)
 * @param {number} params.addQty - 追加数量
 * @param {number} params.addAvgJpy - 追加平均単価(JPY)
 * @returns {Object} 統合結果 {newQty, newAvgJpy, newBookJpy, method}
 */
function mergeJpPosition({ oldQty, oldAvgJpy, oldBookJpy, addQty, addAvgJpy }) {
  if (!(addQty > 0) || !(addAvgJpy > 0)) {
    throw new Error('invalid_input');
  }
  
  const newQty = oldQty + addQty;
  const newAvgJpy = (oldAvgJpy * oldQty + addAvgJpy * addQty) / newQty;
  const newBookJpy = Math.floor(floor2(oldBookJpy + addAvgJpy * addQty));
  
  return { newQty, newAvgJpy, newBookJpy, method: 'unit' };
}

/**
 * 統合キーの生成（クラス + 識別子 + 口座ID）
 * @param {string} assetClass - 資産クラス (us_stock, jp_stock)
 * @param {string} identifier - 識別子 (ticker または code)
 * @param {number} accountId - 口座ID
 * @returns {string} 統合キー
 */
function generateMergeKey(assetClass, identifier, accountId) {
  // 正規化: 大文字化 + 前後空白除去
  const normalizedIdentifier = identifier ? identifier.toString().trim().toUpperCase() : '';
  return `${assetClass}:${normalizedIdentifier}:${accountId}`;
}

/**
 * 統合対象の検索
 * @param {Object} db - SQLiteデータベース接続
 * @param {string} assetClass - 資産クラス
 * @param {string} identifier - 識別子
 * @param {number} accountId - 口座ID
 * @returns {Promise<Object|null>} 既存ポジション
 */
async function findMergeTarget(db, assetClass, identifier, accountId) {
  return new Promise((resolve, reject) => {
    const normalizedIdentifier = identifier ? identifier.toString().trim().toUpperCase() : '';
    
    if (assetClass === 'us_stock') {
      const query = `
        SELECT a.*, us.ticker, us.exchange, us.quantity, us.avg_price_usd
        FROM assets a
        JOIN us_stocks us ON a.id = us.asset_id
        WHERE a.class = 'us_stock' 
          AND UPPER(TRIM(us.ticker)) = ?
          AND us.account_id = ?
        LIMIT 1
      `;
      db.get(query, [normalizedIdentifier, accountId], (err, row) => {
        if (err) return reject(err);
        resolve(row || null);
      });
    } else if (assetClass === 'jp_stock') {
      const query = `
        SELECT a.*, jp.code, jp.quantity, jp.avg_price_jpy
        FROM assets a
        JOIN jp_stocks jp ON a.id = jp.asset_id
        WHERE a.class = 'jp_stock' 
          AND UPPER(TRIM(jp.code)) = ?
          AND jp.account_id = ?
        LIMIT 1
      `;
      db.get(query, [normalizedIdentifier, accountId], (err, row) => {
        if (err) return reject(err);
        resolve(row || null);
      });
    } else {
      resolve(null); // その他のクラスは統合対象外
    }
  });
}

module.exports = {
  mergeUsPosition,
  mergeJpPosition,
  generateMergeKey,
  findMergeTarget,
  floor2
};