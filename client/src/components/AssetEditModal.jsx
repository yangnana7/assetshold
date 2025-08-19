import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './edit-modal.css';

const AssetEditModal = ({ isOpen, onClose, asset, onAssetUpdated }) => {
  const isStock = asset?.class && ['us_stock', 'jp_stock'].includes(asset.class);
  const needsAccount = isStock;
  const [formData, setFormData] = useState({
    name: '',
    note: '',
    acquired_at: '',
    liquidity_tier: 'L1',
    tags: '',
    account_id: '',
    // US株専用
    ticker: '',
    exchange: 'NASDAQ',
    quantity: '',
    avg_price_usd: '',
    fx_at_acq: '',
    // JP株専用
    code: '',
    avg_price_jpy: '',
    // 再計算モード
    recalc: 'auto'
  });

  const [accounts, setAccounts] = useState([]);
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [newAccount, setNewAccount] = useState({ broker: '', account_type: 'tokutei', name: '' });

  // アセットデータをフォームに設定
  useEffect(() => {
    if (asset) {
      setFormData({
        name: asset.name || '',
        note: asset.note || '',
        acquired_at: asset.acquired_at || '',
        liquidity_tier: asset.liquidity_tier || 'L1',
        tags: asset.tags || '',
        account_id: asset.account_id || '',
        ticker: asset.ticker || '',
        exchange: asset.exchange || 'NASDAQ',
        quantity: asset.quantity || '',
        avg_price_usd: asset.avg_price_usd || '',
        fx_at_acq: '',
        code: asset.code || '',
        avg_price_jpy: asset.avg_price_jpy || '',
        recalc: 'auto'
      });
    }
  }, [asset]);

  // アセット詳細（stock_details）からフォーム値を補完
  useEffect(() => {
    if (!asset || !asset.stock_details) return;
    const sd = asset.stock_details;
    const isUS = asset.class === 'us_stock';
    const isJP = asset.class === 'jp_stock';
    setFormData(prev => ({
      ...prev,
      account_id: (sd.account_id ?? prev.account_id) || '',
      ticker: isUS ? (sd.ticker || prev.ticker) : prev.ticker,
      exchange: isUS ? (sd.exchange || prev.exchange || 'NASDAQ') : prev.exchange,
      quantity: (isUS || isJP) ? (sd.quantity ?? prev.quantity) : prev.quantity,
      avg_price_usd: isUS ? (sd.avg_price_usd ?? prev.avg_price_usd) : prev.avg_price_usd,
      code: isJP ? (sd.code || prev.code) : prev.code,
      avg_price_jpy: isJP ? (sd.avg_price_jpy ?? prev.avg_price_jpy) : prev.avg_price_jpy,
    }));
  }, [asset]);

  // 口座一覧の取得
  useEffect(() => {
    if (isOpen) {
      fetchAccounts();
    }
  }, [isOpen]);

  const fetchAccounts = async () => {
    try {
      const response = await axios.get('/api/accounts', { withCredentials: true });
      setAccounts(response.data);
    } catch (error) {
      console.error('Failed to fetch accounts:', error);
    }
  };

  // 口座新規作成（編集モーダル内）
  const handleCreateAccount = async () => {
    if (!newAccount.broker || !newAccount.account_type) {
      setErrors(prev => ({ ...prev, account_id: '証券会社と口座種別は必須です' }));
      return;
    }
    try {
      const res = await axios.post('/api/accounts', newAccount, { withCredentials: true });
      setAccounts(prev => [res.data, ...prev]);
      setFormData(prev => ({ ...prev, account_id: res.data.id }));
      setShowAccountModal(false);
      setNewAccount({ broker: '', account_type: 'tokutei', name: '' });
    } catch (err) {
      setErrors(prev => ({ ...prev, account_id: err.response?.data?.error || '口座作成に失敗しました' }));
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // エラーをクリア
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: null
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    
    // 共通バリデーション
    if (!formData.name?.trim()) {
      newErrors.name = '名称は必須です';
    }
    if (needsAccount && !formData.account_id) {
      newErrors.account_id = '口座を選択してください';
    }

    // クラス別バリデーション
    if (asset?.class === 'us_stock') {
      if (!formData.ticker?.trim()) {
        newErrors.ticker = 'ティッカーを入力してください';
      }
      if (formData.quantity && (isNaN(formData.quantity) || Number(formData.quantity) <= 0)) {
        newErrors.quantity = '数量は正の数で入力してください';
      }
      if (formData.avg_price_usd && (isNaN(formData.avg_price_usd) || Number(formData.avg_price_usd) <= 0)) {
        newErrors.avg_price_usd = '平均取得単価(USD)は正の数で入力してください';
      }
      if (formData.fx_at_acq && (isNaN(formData.fx_at_acq) || Number(formData.fx_at_acq) <= 0)) {
        newErrors.fx_at_acq = '取得時為替(USD/JPY)は正の数で入力してください';
      }
    } else if (asset?.class === 'jp_stock') {
      if (!formData.code?.trim()) {
        newErrors.code = '銘柄コードを入力してください';
      }
      if (formData.quantity && (isNaN(formData.quantity) || Number(formData.quantity) <= 0)) {
        newErrors.quantity = '数量は正の数で入力してください';
      }
      if (formData.avg_price_jpy && (isNaN(formData.avg_price_jpy) || Number(formData.avg_price_jpy) <= 0)) {
        newErrors.avg_price_jpy = '平均取得単価(JPY)は正の数で入力してください';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handlePreview = async () => {
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    try {
      const requestData = {
        class: asset.class,
        ...formData,
        quantity: formData.quantity ? Number(formData.quantity) : undefined,
        avg_price_usd: formData.avg_price_usd ? Number(formData.avg_price_usd) : undefined,
        avg_price_jpy: formData.avg_price_jpy ? Number(formData.avg_price_jpy) : undefined,
        fx_at_acq: formData.fx_at_acq ? Number(formData.fx_at_acq) : undefined,
        ...(needsAccount && { account_id: Number(formData.account_id) }),
        dry_run: true
      };

      const response = await axios.patch(`/api/assets/${asset.id}`, requestData, {
        withCredentials: true
      });

      setPreviewData(response.data);
      setShowPreview(true);
    } catch (error) {
      console.error('Preview failed:', error);
      const errorMsg = error.response?.data?.error || 'プレビューに失敗しました';
      setErrors({ submit: errorMsg });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSave = async () => {
    if (!previewData && !validateForm()) {
      return;
    }

    setIsSubmitting(true);
    try {
      const requestData = {
        class: asset.class,
        ...formData,
        quantity: formData.quantity ? Number(formData.quantity) : undefined,
        avg_price_usd: formData.avg_price_usd ? Number(formData.avg_price_usd) : undefined,
        avg_price_jpy: formData.avg_price_jpy ? Number(formData.avg_price_jpy) : undefined,
        fx_at_acq: formData.fx_at_acq ? Number(formData.fx_at_acq) : undefined,
        ...(needsAccount && { account_id: Number(formData.account_id) }),
        dry_run: false
      };

      const response = await axios.patch(`/api/assets/${asset.id}`, requestData, {
        withCredentials: true
      });

      onAssetUpdated(response.data);
      onClose();
    } catch (error) {
      console.error('Save failed:', error);
      const errorMsg = error.response?.data?.error || '保存に失敗しました';
      setErrors({ submit: errorMsg });
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderPreviewModal = () => {
    if (!showPreview || !previewData) return null;

    return (
      <div className="modal-overlay" style={{zIndex: 1001}}>
        <div className="modal-content">
          <h2>
            {previewData.merged ? '統合プレビュー' : '編集プレビュー'}
          </h2>
          
          <div className="modal-form">
            {previewData.merged ? (
              <>
                <div className="section-title">統合対象</div>
                <p>対象: {asset.class} / {asset?.class === 'us_stock' ? formData.ticker : formData.code}{needsAccount ? ` / 口座ID:${formData.account_id}` : ''}</p>
                <p>統合方式: {previewData.method}（{previewData.method === 'unit' ? '取得時為替を使用' : '比例スケール'}）</p>
                
                <div className="section-title">変更内容</div>
                <div className="merge-preview">
                  <div>数量: {previewData.before.qty} → {previewData.after.qty}</div>
                  <div>
                    平均単価: {asset.class === 'us_stock' ? 'USD' : 'JPY'} {
                      asset.class === 'us_stock' ? previewData.before.avg_usd : previewData.before.avg_jpy
                    } → {
                      asset.class === 'us_stock' ? previewData.after.avg_usd : previewData.after.avg_jpy
                    }
                  </div>
                  <div>簿価(円): {previewData.before.book_jpy.toLocaleString()} → {previewData.after.book_jpy.toLocaleString()}</div>
                </div>
                
                <div className="modal-buttons">
                  <button type="button" onClick={() => setShowPreview(false)}>
                    キャンセル
                  </button>
                  <button type="button" onClick={handleSave} disabled={isSubmitting}>
                    この内容で統合する
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="section-title">編集内容確認</div>
                <div className="edit-preview">
                  <div>クラス: {previewData.preview.class}</div>
                  <div>名称: {formData.name}</div>
                  {needsAccount && <div>口座ID: {formData.account_id}</div>}
                  {asset.class === 'us_stock' && (
                    <>
                      <div>ティッカー: {formData.ticker}</div>
                      <div>数量: {formData.quantity}</div>
                      <div>平均取得単価(USD): {formData.avg_price_usd}</div>
                    </>
                  )}
                  {asset.class === 'jp_stock' && (
                    <>
                      <div>銘柄コード: {formData.code}</div>
                      <div>数量: {formData.quantity}</div>
                      <div>平均取得単価(JPY): {formData.avg_price_jpy}</div>
                    </>
                  )}
                </div>
                
                <div className="modal-buttons">
                  <button type="button" onClick={() => setShowPreview(false)}>
                    キャンセル
                  </button>
                  <button type="button" onClick={handleSave} disabled={isSubmitting}>
                    この内容で保存する
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  if (!isOpen || !asset) return null;

  return (
    <>
      <div className="modal-overlay">
        <div className="modal-content">
          <h2>資産を編集</h2>
          
          <form onSubmit={(e) => e.preventDefault()}>
            {/* 共通フィールド */}
            <div className="form-row">
              <label>クラス:</label>
              <input type="text" value={asset.class} disabled />
            </div>

            {needsAccount && (
              <div className="form-row">
                <label>口座:</label>
                <div className="form-row-buttons">
                  <select
                    name="account_id"
                    value={formData.account_id}
                    onChange={handleInputChange}
                    className={errors.account_id ? 'error' : ''}
                  >
                    <option value="">口座を選択してください</option>
                    {accounts.map(account => (
                      <option key={account.id} value={account.id}>
                        {account.name || `${account.broker}/${account.account_type}`}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={() => setShowAccountModal(true)}>
                    口座を新規作成
                  </button>
                </div>
                {errors.account_id && <span className="error-text">{errors.account_id}</span>}
              </div>
            )}

            <div className="form-row">
              <label>名称:</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                className={errors.name ? 'error' : ''}
              />
              {errors.name && <span className="error-text">{errors.name}</span>}
            </div>

            <div className="form-row">
              <label>取得日:</label>
              <input
                type="date"
                name="acquired_at"
                value={formData.acquired_at}
                onChange={handleInputChange}
              />
            </div>

            <div className="form-row">
              <label>メモ:</label>
              <textarea
                name="note"
                value={formData.note}
                onChange={handleInputChange}
                rows="3"
              />
            </div>

            <div className="form-row">
              <label>流動性:</label>
              <select
                name="liquidity_tier"
                value={formData.liquidity_tier}
                onChange={handleInputChange}
              >
                <option value="L1">L1</option>
                <option value="L2">L2</option>
                <option value="L3">L3</option>
                <option value="L4">L4</option>
              </select>
            </div>

            <div className="form-row">
              <label>タグ:</label>
              <input
                type="text"
                name="tags"
                value={formData.tags}
                onChange={handleInputChange}
              />
            </div>

            {/* US株専用フィールド */}
            {asset.class === 'us_stock' && (
              <>
                <div className="form-row">
                  <label>ティッカー:</label>
                  <input
                    type="text"
                    name="ticker"
                    value={formData.ticker}
                    onChange={handleInputChange}
                    className={errors.ticker ? 'error' : ''}
                  />
                  {errors.ticker && <span className="error-text">{errors.ticker}</span>}
                </div>

                <div className="form-row">
                  <label>取引所:</label>
                  <select
                    name="exchange"
                    value={formData.exchange}
                    onChange={handleInputChange}
                  >
                    <option value="NASDAQ">NASDAQ</option>
                    <option value="NYSE">NYSE</option>
                  </select>
                </div>

                <div className="form-row">
                  <label>数量:</label>
                  <input
                    type="number"
                    step="0.1"
                    name="quantity"
                    value={formData.quantity}
                    onChange={handleInputChange}
                    className={errors.quantity ? 'error' : ''}
                  />
                  {errors.quantity && <span className="error-text">{errors.quantity}</span>}
                </div>

                <div className="form-row">
                  <label>平均取得単価(USD):</label>
                  <input
                    type="number"
                    step="0.01"
                    name="avg_price_usd"
                    value={formData.avg_price_usd}
                    onChange={handleInputChange}
                    className={errors.avg_price_usd ? 'error' : ''}
                  />
                  {errors.avg_price_usd && <span className="error-text">{errors.avg_price_usd}</span>}
                </div>

                <div className="form-row">
                  <label>取得時為替 USD/JPY(任意):</label>
                  <input
                    type="number"
                    step="0.01"
                    name="fx_at_acq"
                    value={formData.fx_at_acq}
                    onChange={handleInputChange}
                    className={errors.fx_at_acq ? 'error' : ''}
                  />
                  {errors.fx_at_acq && <span className="error-text">{errors.fx_at_acq}</span>}
                </div>
              </>
            )}

            {/* JP株専用フィールド */}
            {asset.class === 'jp_stock' && (
              <>
                <div className="form-row">
                  <label>銘柄コード:</label>
                  <input
                    type="text"
                    name="code"
                    value={formData.code}
                    onChange={handleInputChange}
                    className={errors.code ? 'error' : ''}
                  />
                  {errors.code && <span className="error-text">{errors.code}</span>}
                </div>

                <div className="form-row">
                  <label>数量:</label>
                  <input
                    type="number"
                    name="quantity"
                    value={formData.quantity}
                    onChange={handleInputChange}
                    className={errors.quantity ? 'error' : ''}
                  />
                  {errors.quantity && <span className="error-text">{errors.quantity}</span>}
                </div>

                <div className="form-row">
                  <label>平均取得単価(JPY):</label>
                  <input
                    type="number"
                    step="0.01"
                    name="avg_price_jpy"
                    value={formData.avg_price_jpy}
                    onChange={handleInputChange}
                    className={errors.avg_price_jpy ? 'error' : ''}
                  />
                  {errors.avg_price_jpy && <span className="error-text">{errors.avg_price_jpy}</span>}
                </div>
              </>
            )}

            <div className="form-row">
              <label>再計算モード:</label>
              <select
                name="recalc"
                value={formData.recalc}
                onChange={handleInputChange}
              >
                <option value="auto">auto</option>
                <option value="unit">unit</option>
                <option value="scale">scale</option>
              </select>
            </div>

            {errors.submit && (
              <div className="error-message">{errors.submit}</div>
            )}

            <div className="modal-buttons">
              <button type="button" onClick={onClose}>キャンセル</button>
              <button
                type="button"
                onClick={handlePreview}
                disabled={isSubmitting}
              >
                プレビューを表示
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSubmitting}
              >
                この内容で保存する
              </button>
            </div>
          </form>
        </div>
      </div>

      {renderPreviewModal()}

      {showAccountModal && (
        <div className="modal-overlay" style={{ zIndex: 1002 }}>
          <div className="modal-content">
            <h2>新規口座作成</h2>
            <form onSubmit={(e) => e.preventDefault()}>
              <div className="form-row">
                <label>証券会社</label>
                <input
                  type="text"
                  value={newAccount.broker}
                  onChange={(e) => setNewAccount(prev => ({ ...prev, broker: e.target.value }))}
                  placeholder="例: SBI証券"
                  required
                />
              </div>
              <div className="form-row">
                <label>口座種別</label>
                <select
                  value={newAccount.account_type}
                  onChange={(e) => setNewAccount(prev => ({ ...prev, account_type: e.target.value }))}
                  required
                >
                  <option value="tokutei">特定</option>
                  <option value="ippan">一般</option>
                  <option value="nisa">NISA</option>
                </select>
              </div>
              <div className="form-row">
                <label>表示名（任意）</label>
                <input
                  type="text"
                  value={newAccount.name}
                  onChange={(e) => setNewAccount(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="例: SBI/特定"
                />
              </div>
              <div className="modal-buttons">
                <button type="button" onClick={() => setShowAccountModal(false)}>
                  キャンセル
                </button>
                <button type="button" onClick={handleCreateAccount}>
                  作成
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default AssetEditModal;
