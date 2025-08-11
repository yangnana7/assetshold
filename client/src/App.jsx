import React, { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Header from './components/Header'
import Dashboard from './pages/Dashboard'
import AssetList from './pages/AssetList'
import Import from './pages/Import'
import Login from './pages/Login'
import UserManagement from './pages/UserManagement'
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
        return user && user.role === 'admin' ? <Import /> : <Dashboard />
      case 'users':
        return user && user.role === 'admin' ? <UserManagement /> : <Dashboard />
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