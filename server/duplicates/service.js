/**
 * Duplicate Asset Detection and Management Service
 * Implements BDD requirements for duplicate data integration
 */

const sqlite3 = require('sqlite3').verbose();

class DuplicateDetectionService {
  constructor(db) {
    this.db = db;
  }

  /**
   * Find duplicate assets based on various criteria
   * @returns {Promise<Array>} Array of duplicate groups
   */
  async findDuplicates() {
    return new Promise((resolve, reject) => {
      const duplicateGroups = [];

      // 1. Find duplicates by class and name (exact match)
      const nameQuery = `
        SELECT class, name, 
               GROUP_CONCAT(id) as asset_ids,
               COUNT(*) as count
        FROM assets 
        GROUP BY class, LOWER(TRIM(name))
        HAVING count > 1
        ORDER BY count DESC, class, name
      `;

      this.db.all(nameQuery, async (err, nameResults) => {
        if (err) return reject(err);

        // Process name-based duplicates
        for (const group of nameResults) {
          const assetIds = group.asset_ids.split(',').map(id => parseInt(id));
          const assets = await this.getAssetDetails(assetIds);
          
          duplicateGroups.push({
            type: 'name_match',
            criteria: `${group.class} - ${group.name}`,
            count: group.count,
            assets: assets,
            confidence: 0.9
          });
        }

        // 2. Find stock duplicates by ticker/code
        try {
          const stockDuplicates = await this.findStockDuplicates();
          duplicateGroups.push(...stockDuplicates);

          // 3. Find precious metal duplicates by type and similar weight
          const metalDuplicates = await this.findPreciousMetalDuplicates();
          duplicateGroups.push(...metalDuplicates);

          resolve(duplicateGroups);
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  /**
   * Find stock duplicates by ticker symbol or code
   */
  async findStockDuplicates() {
    return new Promise((resolve, reject) => {
      const duplicateGroups = [];

      // US stocks by ticker
      const usStockQuery = `
        SELECT us.ticker, 
               GROUP_CONCAT(a.id) as asset_ids,
               COUNT(*) as count
        FROM us_stocks us
        JOIN assets a ON us.asset_id = a.id
        GROUP BY UPPER(TRIM(us.ticker))
        HAVING count > 1
      `;

      this.db.all(usStockQuery, async (err, usResults) => {
        if (err) return reject(err);

        for (const group of usResults) {
          const assetIds = group.asset_ids.split(',').map(id => parseInt(id));
          const assets = await this.getAssetDetails(assetIds);
          
          duplicateGroups.push({
            type: 'us_stock_ticker',
            criteria: `US Stock - ${group.ticker}`,
            count: group.count,
            assets: assets,
            confidence: 0.95
          });
        }

        // JP stocks by code
        const jpStockQuery = `
          SELECT jp.code, 
                 GROUP_CONCAT(a.id) as asset_ids,
                 COUNT(*) as count
          FROM jp_stocks jp
          JOIN assets a ON jp.asset_id = a.id
          GROUP BY UPPER(TRIM(jp.code))
          HAVING count > 1
        `;

        this.db.all(jpStockQuery, async (err, jpResults) => {
          if (err) return reject(err);

          for (const group of jpResults) {
            const assetIds = group.asset_ids.split(',').map(id => parseInt(id));
            const assets = await this.getAssetDetails(assetIds);
            
            duplicateGroups.push({
              type: 'jp_stock_code',
              criteria: `JP Stock - ${group.code}`,
              count: group.count,
              assets: assets,
              confidence: 0.95
            });
          }

          resolve(duplicateGroups);
        });
      });
    });
  }

  /**
   * Find precious metal duplicates by type and similar weight
   */
  async findPreciousMetalDuplicates() {
    return new Promise((resolve, reject) => {
      const duplicateGroups = [];

      const metalQuery = `
        SELECT pm.metal, pm.weight_g, a.id, a.name, a.note
        FROM precious_metals pm
        JOIN assets a ON pm.asset_id = a.id
        ORDER BY pm.metal, pm.weight_g
      `;

      this.db.all(metalQuery, (err, results) => {
        if (err) return reject(err);

        // Group by metal type and find similar weights
        const metalGroups = {};
        
        results.forEach(item => {
          if (!metalGroups[item.metal]) {
            metalGroups[item.metal] = [];
          }
          metalGroups[item.metal].push(item);
        });

        // Find duplicates within each metal type
        Object.entries(metalGroups).forEach(([metal, items]) => {
          const duplicateSubgroups = this.findSimilarWeights(items);
          
          duplicateSubgroups.forEach(async (subgroup) => {
            if (subgroup.length > 1) {
              const assetIds = subgroup.map(item => item.id);
              const assets = await this.getAssetDetails(assetIds);
              
              duplicateGroups.push({
                type: 'precious_metal_similar',
                criteria: `${metal} - Similar Weight (${subgroup[0].weight_g}g)`,
                count: subgroup.length,
                assets: assets,
                confidence: 0.7
              });
            }
          });
        });

        resolve(duplicateGroups);
      });
    });
  }

  /**
   * Group items with similar weights (within 5% tolerance)
   */
  findSimilarWeights(items) {
    const groups = [];
    const processed = new Set();

    items.forEach(item => {
      if (processed.has(item.id)) return;

      const similarGroup = [item];
      processed.add(item.id);

      items.forEach(other => {
        if (other.id !== item.id && !processed.has(other.id)) {
          const weightDiff = Math.abs(item.weight_g - other.weight_g);
          const tolerance = Math.max(item.weight_g, other.weight_g) * 0.05; // 5% tolerance
          
          if (weightDiff <= tolerance) {
            similarGroup.push(other);
            processed.add(other.id);
          }
        }
      });

      if (similarGroup.length > 1) {
        groups.push(similarGroup);
      }
    });

    return groups;
  }

  /**
   * Get detailed asset information for given IDs
   */
  async getAssetDetails(assetIds) {
    return new Promise((resolve, reject) => {
      const placeholders = assetIds.map(() => '?').join(',');
      const query = `
        SELECT a.*, 
               us.ticker, us.exchange, us.quantity as us_quantity, us.avg_price_usd,
               jp.code, jp.quantity as jp_quantity, jp.avg_price_jpy,
               pm.metal, pm.weight_g, pm.purity, pm.unit_price_jpy
        FROM assets a
        LEFT JOIN us_stocks us ON a.id = us.asset_id
        LEFT JOIN jp_stocks jp ON a.id = jp.asset_id
        LEFT JOIN precious_metals pm ON a.id = pm.asset_id
        WHERE a.id IN (${placeholders})
        ORDER BY a.created_at DESC
      `;

      this.db.all(query, assetIds, (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });
  }

  /**
   * Merge duplicate assets by combining data and keeping the most recent
   * @param {Array} assetIds - IDs of assets to merge
   * @param {number} keepAssetId - ID of asset to keep as primary
   * @param {string} userId - User performing the merge
   */
  async mergeDuplicates(assetIds, keepAssetId, userId, mergePlan = {}) {
    return new Promise((resolve, reject) => {
      if (!assetIds.includes(keepAssetId)) {
        return reject(new Error('Keep asset ID must be in the list of assets to merge'));
      }

      this.db.serialize(() => {
        this.db.run('BEGIN TRANSACTION');

        // Get all assets to be merged
        this.getAssetDetails(assetIds).then(assets => {
          const keepAsset = assets.find(a => a.id === keepAssetId);
          const mergeAssets = assets.filter(a => a.id !== keepAssetId);

          const choose = (field, fallback) => {
            const fromId = mergePlan && mergePlan[field];
            if (fromId) {
              const src = assets.find(a => a.id === fromId);
              if (src && src[field] !== undefined) return src[field];
            }
            return fallback;
          };

          // Build common field update
          const name = choose('name', keepAsset.name);
          const noteSelected = choose('note', keepAsset.note);
          const acquired_at = choose('acquired_at', keepAsset.acquired_at);
          const book_value_jpy = Number(choose('book_value_jpy', keepAsset.book_value_jpy)) || 0;
          const valuation_source = choose('valuation_source', keepAsset.valuation_source || 'manual');
          const liquidity_tier = choose('liquidity_tier', keepAsset.liquidity_tier || null);
          const tags = choose('tags', keepAsset.tags || '');

          this.db.run(
            'UPDATE assets SET name=?, note=?, acquired_at=?, book_value_jpy=?, valuation_source=?, liquidity_tier=?, tags=?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [name, noteSelected || '', acquired_at || null, book_value_jpy, valuation_source, liquidity_tier, tags || '', keepAssetId],
            (err) => {
              if (err) {
                this.db.run('ROLLBACK');
                return reject(err);
              }

              // Class-specific tables
              const cls = keepAsset.class;
              const updateNext = (cb) => cb();
              updateNext(() => {
                if (cls === 'us_stock') {
                  const ticker = choose('ticker', keepAsset.ticker);
                  const exchange = choose('exchange', keepAsset.exchange);
                  const quantity = Number(choose('us_quantity', keepAsset.us_quantity)) || 0;
                  const avg_price_usd = choose('avg_price_usd', keepAsset.avg_price_usd);
                  this.db.run(
                    'UPDATE us_stocks SET ticker=?, exchange=?, quantity=?, avg_price_usd=? WHERE asset_id=?',
                    [ticker || null, exchange || null, quantity, avg_price_usd != null ? Number(avg_price_usd) : null, keepAssetId],
                    (err) => {
                      if (err) { this.db.run('ROLLBACK'); return reject(err); }
                      proceed();
                    }
                  );
                } else if (cls === 'jp_stock') {
                  const code = choose('code', keepAsset.code);
                  const quantity = Number(choose('jp_quantity', keepAsset.jp_quantity)) || 0;
                  const avg_price_jpy = choose('avg_price_jpy', keepAsset.avg_price_jpy);
                  this.db.run(
                    'UPDATE jp_stocks SET code=?, quantity=?, avg_price_jpy=? WHERE asset_id=?',
                    [code || null, quantity, avg_price_jpy != null ? Number(avg_price_jpy) : null, keepAssetId],
                    (err) => {
                      if (err) { this.db.run('ROLLBACK'); return reject(err); }
                      proceed();
                    }
                  );
                } else if (cls === 'precious_metal') {
                  const metal = choose('metal', keepAsset.metal);
                  const weight_g = Number(choose('weight_g', keepAsset.weight_g)) || 0;
                  const purity = choose('purity', keepAsset.purity);
                  const unit_price_jpy = choose('unit_price_jpy', keepAsset.unit_price_jpy);
                  this.db.run(
                    'UPDATE precious_metals SET metal=?, weight_g=?, purity=?, unit_price_jpy=? WHERE asset_id=?',
                    [metal || null, weight_g, purity != null ? Number(purity) : null, unit_price_jpy != null ? Number(unit_price_jpy) : null, keepAssetId],
                    (err) => {
                      if (err) { this.db.run('ROLLBACK'); return reject(err); }
                      proceed();
                    }
                  );
                } else {
                  proceed();
                }
              });

              function proceed() {
                const mergeIds = mergeAssets.map(a => a.id);
                if (mergeIds.length === 0) {
                  return finalizeMerge(mergeIds);
                }
                const placeholders = mergeIds.map(() => '?').join(',');
                // Transfer valuations to keep asset
                const transfer = (sql, params=[]) => new Promise((res, rej)=>{
                  // eslint-disable-next-line
                  this.db.run(sql, params, (err)=> err?rej(err):res());
                });

                transfer(`UPDATE valuations SET asset_id = ? WHERE asset_id IN (${placeholders})`, [keepAssetId, ...mergeIds])
                  .then(() => transfer(`DELETE FROM us_stocks WHERE asset_id IN (${placeholders})`, mergeIds))
                  .then(() => transfer(`DELETE FROM jp_stocks WHERE asset_id IN (${placeholders})`, mergeIds))
                  .then(() => transfer(`DELETE FROM precious_metals WHERE asset_id IN (${placeholders})`, mergeIds))
                  .then(() => transfer(`DELETE FROM attachments WHERE asset_id IN (${placeholders})`, mergeIds).catch(()=>{}))
                  .then(() => transfer(`DELETE FROM comparable_sales WHERE asset_id IN (${placeholders})`, mergeIds).catch(()=>{}))
                  .then(() => transfer(`DELETE FROM assets WHERE id IN (${placeholders})`, mergeIds))
                  .then(() => finalizeMerge(mergeIds))
                  .catch(err => { this.db.run('ROLLBACK'); reject(err); });
              }

              const finalizeMerge = (mergeIds) => {
                // Log audit trail
                const auditStmt = this.db.prepare(`
                  INSERT INTO audit_log (table_name, record_id, action, old_values, new_values, user_id, source) 
                  VALUES (?, ?, ?, ?, ?, ?, ?)
                `);
                mergeAssets.forEach(asset => {
                  auditStmt.run(
                    'assets',
                    asset.id,
                    'MERGE_DUPLICATE',
                    JSON.stringify(asset),
                    JSON.stringify({ merged_into: keepAssetId, merge_plan: mergePlan }),
                    userId,
                    'duplicate_merge'
                  );
                });
                auditStmt.finalize();

                this.db.run('COMMIT');
                resolve({ success: true, kept_asset_id: keepAssetId, merged_asset_ids: mergeIds });
              };
            }
          );
        }).catch(err => { this.db.run('ROLLBACK'); reject(err); });
      });
    });
  }

  /**
   * Mark assets as not duplicates to prevent future detection
   * @param {Array} assetIds - IDs of assets to mark as not duplicates
   * @param {string} userId - User performing the action
   */
  async markAsNotDuplicates(assetIds, userId) {
    return new Promise((resolve, reject) => {
      // Create a record in audit log to track ignored duplicates
      const auditStmt = this.db.prepare(`
        INSERT INTO audit_log (table_name, record_id, action, old_values, new_values, user_id, source) 
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      try {
        const assetIdsStr = assetIds.join(',');
        auditStmt.run(
          'assets',
          null,
          'IGNORE_DUPLICATES',
          null,
          JSON.stringify({ asset_ids: assetIds, reason: 'marked_not_duplicate' }),
          userId,
          'duplicate_ignore'
        );

        auditStmt.finalize();
        resolve({ success: true, ignored_assets: assetIds });
      } catch (error) {
        reject(error);
      }
    });
  }
}

module.exports = DuplicateDetectionService;
