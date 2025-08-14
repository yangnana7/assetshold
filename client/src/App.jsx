import React, { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Header from './components/Header'
import Dashboard from './pages/Dashboard'
import AssetList from './pages/AssetList'
import ImportExport from './pages/Import'
import Login from './pages/Login'
import UserManagement from './pages/UserManagement'
import Rebalance from './pages/Rebalance'
import Comps from './pages/Comps'
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
      case 'rebalance':
        return <Rebalance />
      case 'comps':
        return <Comps />
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