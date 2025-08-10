import { useState, useEffect } from 'react'
import axios from 'axios'

export function useAuth() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    try {
      const response = await axios.get('/api/user', { withCredentials: true })
      setUser(response.data.user)
    } catch (error) {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  const login = async (username, password) => {
    try {
      const response = await axios.post('/api/login', 
        { username, password }, 
        { withCredentials: true }
      )
      setUser(response.data.user)
      return { success: true }
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.error || 'ログインに失敗しました' 
      }
    }
  }

  const logout = async () => {
    try {
      await axios.post('/api/logout', {}, { withCredentials: true })
      setUser(null)
    } catch (error) {
      console.error('Logout error:', error)
    }
  }

  return { user, loading, login, logout, checkAuth }
}