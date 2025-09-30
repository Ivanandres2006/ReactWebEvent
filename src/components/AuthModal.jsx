import { useState } from 'react'
import './AuthModal.css'

const API = 'https://backendevent-etce.onrender.com'

export default function AuthModal({ onClose }) {
  const [isLogin, setIsLogin] = useState(true)
  const [step, setStep] = useState('auth')
  const [loading, setLoading] = useState(false)
  const [verificationCode, setVerificationCode] = useState('')

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    username: '',
    emailOrUsername: '',
    password: '',
  })

  async function handleAuthSubmit(e) {
    e.preventDefault()
    setLoading(true)

    try {
      const url = isLogin ? `${API}/auth/login` : `${API}/auth/register`
      const payload = isLogin
        ? { identifier: form.emailOrUsername, password: form.password }
        : {
            firstName: form.firstName,
            lastName: form.lastName,
            username: form.username,
            email: form.emailOrUsername,
            phone: '',
            password: form.password,
            useSms: false,
          }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()

      if (!res.ok) {
        alert(data.message || 'Login/Register failed')
        setLoading(false)
        return
      }

      if (isLogin) {
        const access = data.accessToken || data.token || data.jwt || ''
        if (!access) {
          alert('Login succeeded but no access token was returned.')
          setLoading(false)
          return
        }
        localStorage.setItem('token', access)
        if (data.refreshToken) localStorage.setItem('refreshToken', data.refreshToken)
        window.dispatchEvent(new Event('auth:login')) // notify others
        setLoading(false)
        onClose()
      } else {
        setLoading(false)
        setStep('verify')
      }
    } catch {
      setLoading(false)
      alert('Network error. Try again.')
    }
  }

  async function handleVerifySubmit(e) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch(`${API}/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.emailOrUsername, code: verificationCode }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.message || 'Invalid verification code')
        setLoading(false)
        return
      }
      localStorage.setItem('token', data.accessToken)
      if (data.refreshToken) localStorage.setItem('refreshToken', data.refreshToken)
      window.dispatchEvent(new Event('auth:login'))
      setLoading(false)
      onClose()
    } catch {
      setLoading(false)
      alert('Verification failed. Try again.')
    }
  }

  return (
    <div className="auth-modal-overlay">
      <div className="auth-modal-container">
        {step === 'auth' && (
          <>
            <h2>{isLogin ? 'Welcome Back' : 'Create Account'}</h2>
            <form onSubmit={handleAuthSubmit}>
              {!isLogin && (
                <>
                  <input type="text" placeholder="First Name" value={form.firstName}
                    onChange={e => setForm({ ...form, firstName: e.target.value })} required />
                  <input type="text" placeholder="Last Name" value={form.lastName}
                    onChange={e => setForm({ ...form, lastName: e.target.value })} required />
                  <input type="text" placeholder="Username" value={form.username}
                    onChange={e => setForm({ ...form, username: e.target.value })} required />
                </>
              )}
              <input type="text" placeholder="Email or Username" value={form.emailOrUsername}
                onChange={e => setForm({ ...form, emailOrUsername: e.target.value })} required />
              <input type="password" placeholder="Password" value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })} required />
              <button type="submit" disabled={loading}>
                {loading ? 'Loading...' : isLogin ? 'Login' : 'Sign Up'}
              </button>
            </form>

            <p className="toggle-text">
              {isLogin ? "Don't have an account?" : 'Already have an account?'}{' '}
              <span onClick={() => { setIsLogin(!isLogin); setStep('auth'); }}>
                {isLogin ? 'Sign Up' : 'Login'}
              </span>
            </p>
          </>
        )}

        {step === 'verify' && (
          <>
            <h2>Verify Your Email</h2>
            <p className="subtext">We’ve sent a 6-digit code to <strong>{form.emailOrUsername}</strong></p>
            <form onSubmit={handleVerifySubmit}>
              <input type="text" maxLength="6" placeholder="Enter verification code"
                value={verificationCode} onChange={e => setVerificationCode(e.target.value)} required />
              <button type="submit" disabled={loading}>
                {loading ? 'Verifying...' : 'Verify'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
