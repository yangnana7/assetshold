import React, { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Header from './components/Header'
import Dashboard from './pages/Dashboard'
import AssetList from './pages/AssetList'
import ImportExport from './pages/Import'
import Login from './pages/Login'
import UserManagement from './pages/UserManagement'
import Duplicates from './pages/Duplicates'
// BDD-compliant components
import CompsBDD from './pages/CompsBDD'
import RebalanceBDD from './pages/RebalanceBDD'
import PortfolioUIKitsDemo from './components/PortfolioUIKitsDemo'
import { useAuth } from './hooks/useAuth'

function App() {
  const { user, loading, login, logout } = useAuth()
  const [currentPage, setCurrentPage] = useState('dashboard')

  // Redirect admin users to assets page after login
  useEffect(() => {
    if (user && user.role === 'admin' && currentPage === 'login') {
      setCurrentPage('assets')
    }
  }, [user, currentPage])

  if (loading) {
    return <div className="app">Loading...</div>
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'assets':
        return user && user.role === 'admin' ? <AssetList /> : <Dashboard />
      case 'import':
        return user && user.role === 'admin' ? <ImportExport /> : <Dashboard />
      case 'users':
        return user && user.role === 'admin' ? <UserManagement /> : <Dashboard />
      case 'duplicates':
        return user && user.role === 'admin' ? <Duplicates /> : <Dashboard />
      case 'rebalance':
        return <RebalanceBDD />
      case 'comps':
        return <CompsBDD />
      case 'ui-demo':
        return <PortfolioUIKitsDemo />
      case 'login':
        return <Login onLogin={login} />
      default:
        return <Dashboard />
    }
  }

  return (
    <div className="app">
      <Header 
        user={user} 
        currentPage={currentPage} 
        onPageChange={setCurrentPage}
        onLogout={logout}
      />
      {renderPage()}
    </div>
  )
}

export default App