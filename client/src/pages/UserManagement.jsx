import React, { useState, useEffect } from 'react'
import axios from 'axios'

function UserManagement() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [editingUser, setEditingUser] = useState(null)
  const [newUser, setNewUser] = useState({
    username: '',
    password: '',
    role: 'viewer'
  })

  useEffect(() => {
    loadUsers()
  }, [])

  const loadUsers = async () => {
    try {
      const response = await axios.get('/api/users', { withCredentials: true })
      setUsers(response.data)
    } catch (error) {
      setError('Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateUser = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    
    if (!newUser.username || !newUser.password || !newUser.role) {
      setError('All fields are required')
      return
    }
    
    try {
      const response = await axios.post('/api/users', newUser, { withCredentials: true })
      setUsers([response.data, ...users])
      setNewUser({ username: '', password: '', role: 'viewer' })
      setSuccess('User created successfully')
    } catch (error) {
      setError(error.response?.data?.error || 'Failed to create user')
    }
  }

  const handleEditUser = (user) => {
    setEditingUser({
      ...user,
      newPassword: ''
    })
  }

  const handleUpdateUser = async () => {
    setError('')
    setSuccess('')
    
    try {
      const { id, username, role } = editingUser
      const response = await axios.patch(`/api/users/${id}`, {
        username,
        role
      }, { withCredentials: true })
      
      setUsers(users.map(user => user.id === id ? response.data : user))
      setEditingUser(null)
      setSuccess('User updated successfully')
    } catch (error) {
      setError(error.response?.data?.error || 'Failed to update user')
    }
  }

  const handleChangePassword = async (userId, newPassword) => {
    if (!newPassword || newPassword.length < 4) {
      setError('Password must be at least 4 characters')
      return
    }
    
    setError('')
    setSuccess('')
    
    try {
      await axios.patch(`/api/users/${userId}/password`, {
        password: newPassword
      }, { withCredentials: true })
      
      setEditingUser(null)
      setSuccess('Password changed successfully')
    } catch (error) {
      setError(error.response?.data?.error || 'Failed to change password')
    }
  }

  const handleDeleteUser = async (userId) => {
    if (!window.confirm('Are you sure you want to delete this user?')) {
      return
    }
    
    setError('')
    setSuccess('')
    
    try {
      await axios.delete(`/api/users/${userId}`, { withCredentials: true })
      setUsers(users.filter(user => user.id !== userId))
      setSuccess('User deleted successfully')
    } catch (error) {
      setError(error.response?.data?.error || 'Failed to delete user')
    }
  }

  const handleCancelEdit = () => {
    setEditingUser(null)
  }

  if (loading) {
    return <div className="user-management">Loading users...</div>
  }

  return (
    <div className="user-management">
      <div className="page-header">
        <h1>User Management</h1>
        <p>Manage system users and their roles</p>
      </div>

      {error && (
        <div className="alert alert-error">
          {error}
        </div>
      )}

      {success && (
        <div className="alert alert-success">
          {success}
        </div>
      )}

      <div className="user-sections">
        <section className="create-user-section">
          <h2>Create New User</h2>
          <form onSubmit={handleCreateUser} className="user-form">
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="new-username">Username</label>
                <input
                  type="text"
                  id="new-username"
                  value={newUser.username}
                  onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="new-password">Password</label>
                <input
                  type="password"
                  id="new-password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  required
                  minLength={4}
                />
              </div>
              <div className="form-group">
                <label htmlFor="new-role">Role</label>
                <select
                  id="new-role"
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                >
                  <option value="viewer">Viewer</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <button type="submit" className="btn btn-primary">
                Create User
              </button>
            </div>
          </form>
        </section>

        <section className="users-list-section">
          <h2>Existing Users</h2>
          {users.length === 0 ? (
            <div className="no-users">No users found</div>
          ) : (
            <div className="users-table">
              <div className="table-header">
                <div>Username</div>
                <div>Role</div>
                <div>Created</div>
                <div>Actions</div>
              </div>
              {users.map(user => (
                <div key={user.id} className="table-row">
                  {editingUser && editingUser.id === user.id ? (
                    <>
                      <div>
                        <input
                          type="text"
                          value={editingUser.username}
                          onChange={(e) => setEditingUser({ ...editingUser, username: e.target.value })}
                          className="edit-input"
                        />
                      </div>
                      <div>
                        <select
                          value={editingUser.role}
                          onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value })}
                          className="edit-select"
                        >
                          <option value="viewer">Viewer</option>
                          <option value="admin">Admin</option>
                        </select>
                      </div>
                      <div>{new Date(user.created_at).toLocaleDateString()}</div>
                      <div className="action-buttons">
                        <button 
                          onClick={handleUpdateUser}
                          className="btn btn-sm btn-success"
                        >
                          Save
                        </button>
                        <button 
                          onClick={handleCancelEdit}
                          className="btn btn-sm btn-secondary"
                        >
                          Cancel
                        </button>
                        <div className="password-change">
                          <input
                            type="password"
                            placeholder="New password"
                            value={editingUser.newPassword || ''}
                            onChange={(e) => setEditingUser({ ...editingUser, newPassword: e.target.value })}
                            className="password-input"
                          />
                          <button
                            onClick={() => handleChangePassword(user.id, editingUser.newPassword)}
                            className="btn btn-sm btn-warning"
                            disabled={!editingUser.newPassword}
                          >
                            Change Password
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>{user.username}</div>
                      <div className={`role-badge role-${user.role}`}>
                        {user.role === 'admin' ? 'Admin' : 'Viewer'}
                      </div>
                      <div>{new Date(user.created_at).toLocaleDateString()}</div>
                      <div className="action-buttons">
                        <button 
                          onClick={() => handleEditUser(user)}
                          className="btn btn-sm btn-primary"
                        >
                          Edit
                        </button>
                        <button 
                          onClick={() => handleDeleteUser(user.id)}
                          className="btn btn-sm btn-danger"
                          disabled={user.username === 'admin'}
                        >
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export default UserManagement