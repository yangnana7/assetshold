import React from 'react'

function Header({ user, currentPage, onPageChange, onLogout }) {
  return (
    <header className="header">
      <h1>資産ポートフォリオ管理</h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        {user && user.role === 'admin' && (
          <nav className="nav">
            <button
              className={currentPage === 'dashboard' ? 'active' : ''}
              onClick={() => onPageChange('dashboard')}
            >
              ダッシュボード
            </button>
            <button
              className={currentPage === 'assets' ? 'active' : ''}
              onClick={() => onPageChange('assets')}
            >
              資産一覧
            </button>
            <button
              className={currentPage === 'import' ? 'active' : ''}
              onClick={() => onPageChange('import')}
            >
              インポート・エクスポート
            </button>
            <button
              className={currentPage === 'users' ? 'active' : ''}
              onClick={() => onPageChange('users')}
            >
              ユーザー管理
            </button>
            <button
              className={currentPage === 'duplicates' ? 'active' : ''}
              onClick={() => onPageChange('duplicates')}
            >
              重複統合
            </button>
          </nav>
        )}
        
        {user && (
          <nav className="nav">
            <button
              className={currentPage === 'rebalance' ? 'active' : ''}
              onClick={() => onPageChange('rebalance')}
            >
              リバランス
            </button>
            <button
              className={currentPage === 'rebalance-bdd' ? 'active' : ''}
              onClick={() => onPageChange('rebalance-bdd')}
              style={{ backgroundColor: currentPage === 'rebalance-bdd' ? '#28a745' : '#007bff' }}
            >
              リバランス(BDD)
            </button>
            <button
              className={currentPage === 'comps' ? 'active' : ''}
              onClick={() => onPageChange('comps')}
            >
              Comps
            </button>
            <button
              className={currentPage === 'comps-bdd' ? 'active' : ''}
              onClick={() => onPageChange('comps-bdd')}
              style={{ backgroundColor: currentPage === 'comps-bdd' ? '#28a745' : '#007bff' }}
            >
              Comps(BDD)
            </button>
            <button
              className={currentPage === 'ui-demo' ? 'active' : ''}
              onClick={() => onPageChange('ui-demo')}
              style={{ backgroundColor: currentPage === 'ui-demo' ? '#ffc107' : '#6c757d' }}
            >
              UI Demo
            </button>
          </nav>
        )}
        
        {user ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span>ようこそ、{user.username}さん ({user.role})</span>
            <button className="login-button" onClick={onLogout}>
              ログアウト
            </button>
          </div>
        ) : (
          <button 
            className="login-button" 
            onClick={() => onPageChange('login')}
          >
            ログイン
          </button>
        )}
      </div>
    </header>
  )
}

export default Header