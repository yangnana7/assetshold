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
  async mergeDuplicates(assetIds, keepAssetId, userId) {
    return new Promise((resolve, reject) => {
      if (!assetIds.includes(keepAssetId)) {
        return reject(new Error('Keep asset ID must be in the list of assets to merge'));
      }

      this.db.serialize(() => {
        this.db.run('BEGIN TRANSACTION');

        try {
          // Get all assets to be merged
          this.getAssetDetails(assetIds).then(assets => {
            const keepAsset = assets.find(a => a.id === keepAssetId);
            const mergeAssets = assets.filter(a => a.id !== keepAssetId);

            // Combine notes from all assets
            const combinedNotes = [];
            if (keepAsset.note && keepAsset.note.trim()) {
              combinedNotes.push(keepAsset.note.trim());
            }
            
            mergeAssets.forEach(asset => {
              if (asset.note && asset.note.trim() && !combinedNotes.includes(asset.note.trim())) {
                combinedNotes.push(asset.note.trim());
              }
            });

            // Update the keep asset with combined information
            const updatedNote = combinedNotes.join('; ');
            this.db.run(
              'UPDATE assets SET note = ?, updated_at = ? WHERE id = ?',
              [updatedNote, new Date().toISOString(), keepAssetId],
              (err) => {
                if (err) {
                  this.db.run('ROLLBACK');
                  return reject(err);
                }

                // Transfer valuations from merged assets to keep asset
                const mergeIds = mergeAssets.map(a => a.id);
                if (mergeIds.length > 0) {
                  const placeholders = mergeIds.map(() => '?').join(',');
                  this.db.run(
                    `UPDATE valuations SET asset_id = ? WHERE asset_id IN (${placeholders})`,
                    [keepAssetId, ...mergeIds],
                    (err) => {
                      if (err) {
                        this.db.run('ROLLBACK');
                        return reject(err);
                      }

                      // Delete the merged assets
                      this.db.run(
                        `DELETE FROM assets WHERE id IN (${placeholders})`,
                        mergeIds,
                        (err) => {
                          if (err) {
                            this.db.run('ROLLBACK');
                            return reject(err);
                          }

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
                              JSON.stringify({ merged_into: keepAssetId }),
                              userId,
                              'duplicate_merge'
                            );
                          });

                          auditStmt.finalize();

                          this.db.run('COMMIT');
                          resolve({
                            success: true,
                            kept_asset_id: keepAssetId,
                            merged_asset_ids: mergeIds,
                            combined_note: updatedNote
                          });
                        }
                      );
                    }
                  );
                }
              }
            );
          }).catch(err => {
            this.db.run('ROLLBACK');
            reject(err);
          });

        } catch (error) {
          this.db.run('ROLLBACK');
          reject(error);
        }
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