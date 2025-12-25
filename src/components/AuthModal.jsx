import { useEffect, useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import './AuthModal.css'
import { saveTokens } from '../lib/authClient'

const API = 'https://backendevent-etce.onrender.com'

// ---- i18n
const LANG_KEY = 'wknd_lang'
const getInitialLang = () => {
  const saved = localStorage.getItem(LANG_KEY)
  if (saved === 'en' || saved === 'es') return saved
  const nav = (navigator.language || '').toLowerCase()
  return nav.startsWith('es') ? 'es' : 'en'
}
const DICT = {
  en: {
    dismiss: 'Dismiss',
    welcomeBack: 'Welcome Back',
    createAccount: 'Create Account',
    firstName: 'First Name',
    lastName: 'Last Name',
    username: 'Username',
    email: 'Email',
    password: 'Password',
    loading: 'Loading...',
    login: 'Login',
    signUp: 'Sign Up',
    noAccount: "Don't have an account?",
    haveAccount: 'Already have an account?',
    verifyEmail: 'Verify Your Email',
    sentCode: "We’ve sent a 6-digit code to",
    enterCode: 'Enter verification code',
    verifying: 'Verifying...',
    verify: 'Verify',
    loginFailed: 'Login failed. Please try again.',
    registerFailed: 'Registration failed. Please try again.',
    tokenMissing: 'Login succeeded but no access token was returned.',
    verifyTokenMissing: 'Verification succeeded but no access token was returned.',
    networkError: 'Network error. Please try again.',
    verifyFailed: 'Verification failed. Please try again.',
    invalidCode: 'Invalid verification code.',
  },
  es: {
    dismiss: 'Cerrar',
    welcomeBack: 'Bienvenido de nuevo',
    createAccount: 'Crear cuenta',
    firstName: 'Nombre',
    lastName: 'Apellido',
    username: 'Usuario',
    email: 'Email',
    password: 'Contraseña',
    loading: 'Cargando…',
    login: 'Entrar',
    signUp: 'Crear',
    noAccount: '¿No tienes cuenta?',
    haveAccount: '¿Ya tienes cuenta?',
    verifyEmail: 'Verifica tu email',
    sentCode: 'Enviamos un código de 6 dígitos a',
    enterCode: 'Ingresa el código',
    verifying: 'Verificando…',
    verify: 'Verificar',
    loginFailed: 'No se pudo iniciar sesión. Intenta de nuevo.',
    registerFailed: 'No se pudo registrar. Intenta de nuevo.',
    tokenMissing: 'Inició sesión pero no llegó el token.',
    verifyTokenMissing: 'Verificado pero no llegó el token.',
    networkError: 'Error de red. Intenta de nuevo.',
    verifyFailed: 'No se pudo verificar. Intenta de nuevo.',
    invalidCode: 'Código inválido.',
  },
}
const useT = (lang) => (key) => DICT[lang]?.[key] ?? DICT.en[key] ?? key

function compactPayload(obj) {
  const out = {}
  Object.entries(obj).forEach(([k, v]) => {
    if (v === undefined || v === null) return
    if (typeof v === 'string' && v.trim() === '') return
    out[k] = typeof v === 'string' ? v.trim() : v
  })
  return out
}

function InlineError({ message, onDismiss, dismissLabel = 'Dismiss' }) {
  if (!message) return null
  return (
    <div className="auth-error">
      <div className="auth-error-row">
        <span>{message}</span>
        <button className="auth-error-btn" onClick={onDismiss} type="button">
          {dismissLabel}
        </button>
      </div>
    </div>
  )
}

export default function AuthModal({ isOpen, onClose }) {
  const [lang, setLang] = useState(getInitialLang())
  const t = useMemo(() => useT(lang), [lang])

  const toggleLang = () => {
    const next = lang === 'en' ? 'es' : 'en'
    setLang(next)
    localStorage.setItem(LANG_KEY, next)
    window.dispatchEvent(new Event('wknd:lang'))
  }

  useEffect(() => {
    const onLang = () => setLang(getInitialLang())
    window.addEventListener('wknd:lang', onLang)
    return () => window.removeEventListener('wknd:lang', onLang)
  }, [])

  const [isLogin, setIsLogin] = useState(true)
  const [step, setStep] = useState('auth')
  const [loading, setLoading] = useState(false)
  const [verificationCode, setVerificationCode] = useState('')
  const [errMsg, setErrMsg] = useState(null)

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    username: '',
    emailOrUsername: '',
    password: '',
  })

  useEffect(() => {
    if (!isOpen) return
    document.body.classList.add('body-no-scroll')
    return () => document.body.classList.remove('body-no-scroll')
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    setErrMsg(null)
    setLoading(false)
  }, [isOpen])

  if (!isOpen) return null

  async function handleAuthSubmit(e) {
    e.preventDefault()
    if (loading) return
    setLoading(true)
    setErrMsg(null)

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

        let data = null
        try {
          data = await res.json()
        } catch {
          data = null
        }

        if (!res.ok) {
          setErrMsg(data?.message || t('loginFailed'))
          setLoading(false)
          return
        }

        const access = data?.accessToken || data?.token || data?.jwt || ''
        if (!access) {
          setErrMsg(t('tokenMissing'))
          setLoading(false)
          return
        }

        saveTokens({ accessToken: access, refreshToken: data?.refreshToken })
        window.dispatchEvent(new Event('auth:login'))

        setLoading(false)
        onClose()
        return
      }

      const raw = {
        firstName: form.firstName,
        lastName: form.lastName,
        username: form.username,
        email: form.emailOrUsername,
        password: form.password,
        useSms: false,
      }
      const payload = compactPayload(raw)

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      let data = null
      try {
        data = await res.json()
      } catch {
        data = null
      }

      if (!res.ok) {
        setErrMsg(data?.message || t('registerFailed'))
        setLoading(false)
        return
      }

      setLoading(false)
      setStep('verify')
    } catch {
      setLoading(false)
      setErrMsg(t('networkError'))
    }
  }

  async function handleVerifySubmit(e) {
    e.preventDefault()
    if (loading) return
    setLoading(true)
    setErrMsg(null)

    try {
      const res = await fetch(`${API}/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.emailOrUsername.trim(),
          code: verificationCode.trim(),
        }),
      })

      let data = null
      try {
        data = await res.json()
      } catch {
        data = null
      }

      if (!res.ok) {
        setErrMsg(data?.message || t('invalidCode'))
        setLoading(false)
        return
      }

      const access = data?.accessToken || data?.token || data?.jwt || ''
      if (!access) {
        setErrMsg(t('verifyTokenMissing'))
        setLoading(false)
        return
      }

      saveTokens({ accessToken: access, refreshToken: data?.refreshToken })
      window.dispatchEvent(new Event('auth:login'))

      setLoading(false)
      onClose()
    } catch {
      setLoading(false)
      setErrMsg(t('verifyFailed'))
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
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <button className="auth-error-btn" onClick={toggleLang} type="button">
            {lang === 'en' ? 'ES' : 'EN'}
          </button>
        </div>

        <InlineError message={errMsg} onDismiss={() => setErrMsg(null)} dismissLabel={t('dismiss')} />

        {step === 'auth' && (
          <>
            <h2>{isLogin ? t('welcomeBack') : t('createAccount')}</h2>
            <form onSubmit={handleAuthSubmit}>
              {!isLogin && (
                <>
                  <input
                    type="text"
                    placeholder={t('firstName')}
                    value={form.firstName}
                    onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                    required
                  />
                  <input
                    type="text"
                    placeholder={t('lastName')}
                    value={form.lastName}
                    onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                    required
                  />
                  <input
                    type="text"
                    placeholder={t('username')}
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    required
                  />
                </>
              )}

              <input
                type="text"
                placeholder={t('email')}
                value={form.emailOrUsername}
                onChange={(e) => setForm({ ...form, emailOrUsername: e.target.value })}
                required
              />
              <input
                type="password"
                placeholder={t('password')}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />

              <button type="submit" disabled={loading}>
                {loading ? t('loading') : isLogin ? t('login') : t('signUp')}
              </button>
            </form>

            <p className="toggle-text">
              {isLogin ? t('noAccount') : t('haveAccount')}{' '}
              <span
                onClick={() => {
                  setIsLogin(!isLogin)
                  setStep('auth')
                  setErrMsg(null)
                }}
              >
                {isLogin ? t('signUp') : t('login')}
              </span>
            </p>
          </>
        )}

        {step === 'verify' && (
          <>
            <h2>{t('verifyEmail')}</h2>
            <p className="subtext">
              {t('sentCode')} <strong>{form.emailOrUsername}</strong>
            </p>
            <form onSubmit={handleVerifySubmit}>
              <input
                type="text"
                maxLength="6"
                placeholder={t('enterCode')}
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                required
              />
              <button type="submit" disabled={loading}>
                {loading ? t('verifying') : t('verify')}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )

  return createPortal(content, document.body)
}
