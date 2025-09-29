import { useState } from 'react'
import { saveTokens, clearTokens } from '../lib/auth'
import './AuthModal.css'

const API = 'https://backendevent-etce.onrender.com'

export default function AuthModal({ onClose }) {
  const [mode, setMode] = useState('login') // 'login' | 'register' | 'verify' | 'forgot' | 'reset'
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  // shared fields
  const [identifier, setIdentifier] = useState('') // email or username (login)
  const [password, setPassword] = useState('')

  // register fields
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')

  // verify + forgot/reset
  const [verifyCode, setVerifyCode] = useState('')
  const [resetEmail, setResetEmail] = useState('')
  const [resetCode, setResetCode] = useState('')
  const [newPassword, setNewPassword] = useState('')

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true); setMsg('')
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || 'Login failed')

      // JwtResponse returns: token, refreshToken, hasPassword, hasUsername, username, ...
      saveTokens({ token: data.token, refreshToken: data.refreshToken })
      onClose()          // close modal
      window.location.reload() // refresh to pull /user/me, etc.
    } catch (err) {
      setMsg(err.message || 'Login error')
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    setLoading(true); setMsg('')
    try {
      const res = await fetch(`${API}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName, lastName, username, email, phone,
          password, useSms: false,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || 'Registration failed')

      // go to verify step
      setMode('verify')
      setMsg('We sent a 6-digit code to your email.')
    } catch (err) {
      setMsg(err.message || 'Registration error')
    } finally {
      setLoading(false)
    }
  }

  const handleVerify = async (e) => {
    e.preventDefault()
    setLoading(true); setMsg('')
    try {
      const res = await fetch(`${API}/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: verifyCode }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || 'Invalid code')

      // verify response returns { accessToken, refreshToken }
      saveTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken })
      onClose()
      window.location.reload()
    } catch (err) {
      setMsg(err.message || 'Verification error')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    setLoading(true); setMsg('')
    try {
      const res = await fetch(`${API}/auth/resend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, useSms: false }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || 'Failed to resend')
      setMsg('Code resent. Check your inbox.')
    } catch (err) {
      setMsg(err.message || 'Resend error')
    } finally {
      setLoading(false)
    }
  }

  const handleForgot = async (e) => {
    e.preventDefault()
    setLoading(true); setMsg('')
    try {
      const res = await fetch(`${API}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || 'Failed to send code')
      setMode('reset')
      setMsg('We emailed you a reset code.')
    } catch (err) {
      setMsg(err.message || 'Error')
    } finally {
      setLoading(false)
    }
  }

  const handleReset = async (e) => {
    e.preventDefault()
    setLoading(true); setMsg('')
    try {
      const res = await fetch(`${API}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail, code: resetCode, newPassword }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || 'Reset failed')

      setMode('login')
      setMsg('Password updated. Please log in.')
    } catch (err) {
      setMsg(err.message || 'Reset error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-modal-overlay">
      <div className="auth-modal-container">
        {/* Header tabs */}
        <div className="auth-tabs">
          <button
            className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => setMode('login')}
          >Login</button>
          <button
            className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
            onClick={() => setMode('register')}
          >Sign Up</button>
          <button className="auth-close" onClick={() => { clearTokens(); onClose(); }}>×</button>
        </div>

        {/* Messages */}
        {msg && <div className="auth-message">{msg}</div>}

        {/* LOGIN */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} className="auth-form">
            <input
              type="text"
              placeholder="Email or Username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button type="submit" disabled={loading}>
              {loading ? 'Loading…' : 'Login'}
            </button>
            <div className="auth-links">
              <span onClick={() => setMode('forgot')}>Forgot password?</span>
            </div>
          </form>
        )}

        {/* REGISTER */}
        {mode === 'register' && (
          <form onSubmit={handleRegister} className="auth-form">
            <div className="auth-grid">
              <input
                type="text" placeholder="First Name" value={firstName}
                onChange={(e) => setFirstName(e.target.value)} required
              />
              <input
                type="text" placeholder="Last Name" value={lastName}
                onChange={(e) => setLastName(e.target.value)} required
              />
            </div>
            <input
              type="text" placeholder="Username" value={username}
              onChange={(e) => setUsername(e.target.value)} required
            />
            <input
              type="email" placeholder="Email" value={email}
              onChange={(e) => setEmail(e.target.value)} required
            />
            <input
              type="tel" placeholder="Phone (optional)" value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <input
              type="password" placeholder="Password" value={password}
              onChange={(e) => setPassword(e.target.value)} required
            />
            <button type="submit" disabled={loading}>
              {loading ? 'Creating…' : 'Create Account'}
            </button>
          </form>
        )}

        {/* VERIFY */}
        {mode === 'verify' && (
          <form onSubmit={handleVerify} className="auth-form">
            <p className="subtext">We sent a 6-digit code to <b>{email}</b>.</p>
            <input
              type="text" placeholder="Enter verification code" maxLength={6}
              value={verifyCode} onChange={(e) => setVerifyCode(e.target.value)} required
            />
            <button type="submit" disabled={loading}>
              {loading ? 'Verifying…' : 'Verify'}
            </button>
            <div className="auth-links">
              <span onClick={handleResend}>Resend code</span>
              <span onClick={() => setMode('login')}>Back to login</span>
            </div>
          </form>
        )}

        {/* FORGOT */}
        {mode === 'forgot' && (
          <form onSubmit={handleForgot} className="auth-form">
            <input
              type="email" placeholder="Your email"
              value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} required
            />
            <button type="submit" disabled={loading}>
              {loading ? 'Sending…' : 'Send reset code'}
            </button>
            <div className="auth-links">
              <span onClick={() => setMode('login')}>Back to login</span>
            </div>
          </form>
        )}

        {/* RESET */}
        {mode === 'reset' && (
          <form onSubmit={handleReset} className="auth-form">
            <input
              type="text" placeholder="Reset code"
              value={resetCode} onChange={(e) => setResetCode(e.target.value)} required
            />
            <input
              type="password" placeholder="New password"
              value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required
            />
            <button type="submit" disabled={loading}>
              {loading ? 'Updating…' : 'Update password'}
            </button>
            <div className="auth-links">
              <span onClick={() => setMode('login')}>Back to login</span>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
