import { useState } from 'react'
import './AuthModal.css'

export default function AuthModal({ onClose }) {
  const [isLogin, setIsLogin] = useState(true)
  const [step, setStep] = useState('auth')
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    emailOrPhone: '',
    password: '',
  })
  const [verificationCode, setVerificationCode] = useState('')
  const [loading, setLoading] = useState(false)

  const handleAuthSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    const url = isLogin
      ? 'https://backendevent-etce.onrender.com/auth/login'
      : 'https://backendevent-etce.onrender.com/auth/register'

    const payload = isLogin
      ? { email: form.emailOrPhone, password: form.password }
      : {
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.emailOrPhone,
          password: form.password,
          useSms: false,
        }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      setLoading(false)

      if (res.ok && isLogin && data.token) {
        localStorage.setItem('token', data.token)
        onClose()
      } else if (res.ok && !isLogin) {
        setStep('verify')
      } else {
        alert(data.message || 'Login/Register failed')
      }
    } catch (err) {
      setLoading(false)
      alert('Network error. Try again.')
    }
  }

  const handleVerifySubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      const res = await fetch('https://backendevent-etce.onrender.com/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.emailOrPhone,
          code: verificationCode,
        }),
      })

      const data = await res.json()
      setLoading(false)

      if (res.ok && data.accessToken) {
        localStorage.setItem('token', data.accessToken)
        onClose()
      } else {
        alert(data.message || 'Invalid verification code')
      }
    } catch (err) {
      setLoading(false)
      alert('Verification failed. Try again.')
    }
  }

  return (
    <div className="auth-modal-overlay">
      <div className="auth-modal-container">
        {/* Auth Step */}
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
                </>
              )}
              <input
                type="email"
                placeholder="Email"
                value={form.emailOrPhone}
                onChange={e => setForm({ ...form, emailOrPhone: e.target.value })}
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
              <span onClick={() => {
                setIsLogin(!isLogin)
                setStep('auth')
              }}>
                {isLogin ? 'Sign Up' : 'Login'}
              </span>
            </p>
          </>
        )}

        {/* Verify Step */}
        {step === 'verify' && (
          <>
            <h2>Verify Your Email</h2>
            <p className="subtext">We’ve sent a 6-digit code to <strong>{form.emailOrPhone}</strong></p>
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
}
