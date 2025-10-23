import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import './AuthModal.css'
import { saveTokens } from '../lib/authClient'

const API = 'https://backendevent-etce.onrender.com'

function compactPayload(obj) {
  const out = {}
  Object.entries(obj).forEach(([k, v]) => {
    if (v === undefined || v === null) return
    if (typeof v === 'string' && v.trim() === '') return
    out[k] = typeof v === 'string' ? v.trim() : v
  })
  return out
}

export default function AuthModal({ isOpen, onClose }) {
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
    // NOTE: we are NOT asking for phone here; do not send it
  })

  useEffect(() => {
    if (!isOpen) return
    document.body.classList.add('body-no-scroll')
    return () => document.body.classList.remove('body-no-scroll')
  }, [isOpen])

  if (!isOpen) return null

  async function handleAuthSubmit(e) {
    e.preventDefault()
    if (loading) return
    setLoading(true)

    try {
      const url = isLogin ? `${API}/auth/login` : `${API}/auth/register`

      if (isLogin) {
        const payload = {
          identifier: form.emailOrUsername.trim(),
          password: form.password,
        }

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = await res.json()

        if (!res.ok) {
          alert(data.message || 'Login failed')
          setLoading(false)
          return
        }

        const access = data.accessToken || data.token || data.jwt || ''
        if (!access) {
          alert('Login succeeded but no access token was returned.')
          setLoading(false)
          return
        }
        saveTokens({ accessToken: access, refreshToken: data.refreshToken })
        setLoading(false)
        onClose()
        return
      }

      // Register (omit phone entirely unless you actually collect it)
      const raw = {
        firstName: form.firstName,
        lastName: form.lastName,
        username: form.username,
        email: form.emailOrUsername,
        password: form.password,
        useSms: false,
        // phone: undefined  // DO NOT send empty phone
      }
      const payload = compactPayload(raw)

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()

      if (!res.ok) {
        // Many backends send “phone already in use” when they get empty string. We are not sending it anymore,
        // but just in case the API still responds that way:
        const msg = String(data.message || '').toLowerCase()
        if (msg.includes('phone') && msg.includes('already')) {
          alert('That account’s phone is already in use. Since we’re not collecting phone here, please try again or log in if you’ve already registered.')
        } else {
          alert(data.message || 'Registration failed')
        }
        setLoading(false)
        return
      }

      // If your backend requires email verification step:
      setLoading(false)
      setStep('verify')
    } catch (err) {
      setLoading(false)
      alert('Network error. Try again.')
    }
  }

  async function handleVerifySubmit(e) {
    e.preventDefault()
    if (loading) return
    setLoading(true)
    try {
      const res = await fetch(`${API}/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.emailOrUsername.trim(),
          code: verificationCode.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.message || 'Invalid verification code')
        setLoading(false)
        return
      }
      const access = data.accessToken || data.token || data.jwt || ''
      saveTokens({ accessToken: access, refreshToken: data.refreshToken })
      setLoading(false)
      onClose()
    } catch {
      setLoading(false)
      alert('Verification failed. Try again.')
    }
  }

  const content = (
    <div className="auth-overlay-safe" onClick={onClose} role="presentation">
      <div
        className="auth-modal-container"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={step === 'auth' ? (isLogin ? 'Login' : 'Sign Up') : 'Verify Email'}
      >
        {step === 'auth' && (
          <>
            <h2>{isLogin ? 'Welcome Back' : 'Create Account'}</h2>
            <form onSubmit={handleAuthSubmit}>
              {!isLogin && (
                <>
                  <input
                    type="text"
                    placeholder="First Name"
                    value={form.firstName}
                    onChange={e => setForm({ ...form, firstName: e.target.value })}
                    required
                  />
                  <input
                    type="text"
                    placeholder="Last Name"
                    value={form.lastName}
                    onChange={e => setForm({ ...form, lastName: e.target.value })}
                    required
                  />
                  <input
                    type="text"
                    placeholder="Username"
                    value={form.username}
                    onChange={e => setForm({ ...form, username: e.target.value })}
                    required
                  />
                </>
              )}

              <input
                type="text"
                placeholder="Email"
                value={form.emailOrUsername}
                onChange={e => setForm({ ...form, emailOrUsername: e.target.value })}
                required
              />
              <input
                type="password"
                placeholder="Password"
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                required
              />

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
              <input
                type="text"
                maxLength="6"
                placeholder="Enter verification code"
                value={verificationCode}
                onChange={e => setVerificationCode(e.target.value)}
                required
              />
              <button type="submit" disabled={loading}>
                {loading ? 'Verifying...' : 'Verify'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )

  return createPortal(content, document.body)
}
