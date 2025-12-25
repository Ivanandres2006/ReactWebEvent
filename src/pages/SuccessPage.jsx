import { useEffect, useState, useRef, useMemo } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import WebTicketCard from '../components/WebTicketCard'
import './SuccessPage.css'

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
    paymentRequestSent: 'Payment request sent',
    paymentSuccessful: 'Payment successful',
    finalizing: 'Finalizing payment…',
    notifiedOrganizer: 'We notified the organizer',
    pendingTextA: 'about your',
    pendingTextB: 'payment. You’ll receive an email with your ticket as soon as they confirm it.',
    confirmationSentTo: 'Confirmation sent to',
    checkingTicket: 'We’re checking for your ticket…',
    openGmail: 'Open Gmail',
    backToEvent: 'Back to event',
    checkingForTicket: 'Checking for your ticket…',
    couldntLoad: 'Couldn’t load your ticket. Check your email for the receipt + QR.',
    pendingAppear: 'Your ticket will appear here after the organizer confirms your payment.',
    couldntDisplay: 'We couldn’t display your ticket here yet.',
    langBtn: 'ES',
  },
  es: {
    paymentRequestSent: 'Solicitud de pago enviada',
    paymentSuccessful: 'Pago exitoso',
    finalizing: 'Finalizando pago…',
    notifiedOrganizer: 'Notificamos al organizador',
    pendingTextA: 'sobre tu pago con',
    pendingTextB: '. Te llegará un email con tu ticket cuando confirmen.',
    confirmationSentTo: 'Confirmación enviada a',
    checkingTicket: 'Estamos buscando tu ticket…',
    openGmail: 'Abrir Gmail',
    backToEvent: 'Volver al evento',
    checkingForTicket: 'Buscando tu ticket…',
    couldntLoad: 'No pudimos cargar tu ticket. Revisa tu email para el recibo + QR.',
    pendingAppear: 'Tu ticket aparecerá aquí cuando el organizador confirme el pago.',
    couldntDisplay: 'Aún no podemos mostrar tu ticket aquí.',
    langBtn: 'EN',
  },
}
const useT = (lang) => (key) => DICT[lang]?.[key] ?? DICT.en[key] ?? key

// Legacy fallback: newest “batch” if we truly have no identifiers.
function pickNewestBatch(eventTickets) {
  if (!Array.isArray(eventTickets) || eventTickets.length === 0) return []
  const groups = new Map()
  const key = (t) =>
    t.paymentIntentId
      ? `pi:${t.paymentIntentId}`
      : t.orderId
      ? `order:${t.orderId}`
      : t.createdAt
      ? `min:${new Date(t.createdAt).toISOString().slice(0, 16)}`
      : `id:${t.id}`

  for (const t of eventTickets) {
    const k = key(t)
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(t)
  }

  const score = (arr) => ({
    createdMax: arr.reduce((m, t) => Math.max(m, t.createdAt ? new Date(t.createdAt).getTime() || 0 : 0), 0),
    idMax: arr.reduce((m, t) => Math.max(m, Number(t.id) || 0), 0),
  })

  let best = null
  for (const [, arr] of groups) {
    const s = score(arr)
    if (!best || s.createdMax > best.createdMax || (s.createdMax === best.createdMax && s.idMax > best.idMax)) {
      best = { arr, ...s }
    }
  }
  return best?.arr ?? []
}

export default function SuccessPage() {
  const [params, setParams] = useSearchParams()
  const eventId = Number(params.get('eventId'))
  const pi = params.get('pi') || ''
  const pendingParam = (params.get('pending') || '').toLowerCase()
  const sinceParam = params.get('since')

  const navigate = useNavigate()

  const token = localStorage.getItem('token') || ''
  const email = localStorage.getItem('email') || ''

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

  // If pending was passed but since is missing, set it to now so we never show old tickets.
  useEffect(() => {
    if (pendingParam && !sinceParam) {
      const next = new URLSearchParams(params)
      next.set('since', String(Date.now()))
      setParams(next, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const since = sinceParam ? parseInt(sinceParam, 10) : null

  const [visible, setVisible] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showPendingBanner, setShowPendingBanner] = useState(Boolean(pendingParam))

  const pendingPretty =
    pendingParam === 'pagomovil'
      ? 'Pago Móvil'
      : pendingParam === 'zelle'
      ? 'Zelle'
      : pendingParam === 'cash'
      ? (lang === 'es' ? 'Efectivo' : 'Cash')
      : ''

  const fetchForEvent = async () => {
    if (!email) throw new Error('Missing email')
    const res = await fetch(`${API}/api/tickets/my?email=${encodeURIComponent(email)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) throw new Error(`Tickets ${res.status}`)
    const all = await res.json()
    return (all || []).filter((t) => Number(t.eventId) === Number(eventId))
  }

  const filterForThisCheckout = (list) => {
    if (pi) return list.filter((t) => (t.paymentIntentId || '') === pi)
    if (pendingParam) {
      if (!since) return []
      const cutoff = since - 10_000
      return list.filter((t) => {
        const ts = t.createdAt ? new Date(t.createdAt).getTime() : NaN
        return Number.isFinite(ts) && ts >= cutoff
      })
    }
    return pickNewestBatch(list)
  }

  // First load
  useEffect(() => {
    ;(async () => {
      try {
        const list = await fetchForEvent()
        setVisible(filterForThisCheckout(list))
      } catch {
        setError(t('couldntLoad'))
      } finally {
        setLoading(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, pi, since, token, email, lang])

  // ✅ Exponential backoff polling (max attempts, stop early)
  const attemptsRef = useRef(0)
  const timeoutRef = useRef(null)

  useEffect(() => {
    const needPoll = (pi && visible.length === 0) || (pendingParam && since && visible.length === 0)
    if (!needPoll) return

    let stopped = false
    attemptsRef.current = 0

    const tick = async () => {
      if (stopped) return
      attemptsRef.current += 1

      try {
        const list = await fetchForEvent()
        const filtered = filterForThisCheckout(list)

        if (!stopped && filtered.length > 0) {
          setVisible(filtered)

          if (showPendingBanner) {
            setShowPendingBanner(false)
            const next = new URLSearchParams(params)
            next.delete('pending')
            next.delete('since')
            next.delete('pi')
            setParams(next, { replace: true })
          }
          return
        }
      } catch {}

      if (attemptsRef.current >= 8) return
      const delay = Math.round(2000 * Math.pow(1.7, attemptsRef.current))
      timeoutRef.current = setTimeout(tick, delay)
    }

    tick()

    return () => {
      stopped = true
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pi, pendingParam, since, visible.length, showPendingBanner, lang])

  // If nothing to show and not pending, return after 10s
  useEffect(() => {
    if (showPendingBanner || loading || error || visible.length > 0) return
    const tt = setTimeout(() => navigate(`/events/${eventId}`), 10000)
    return () => clearTimeout(tt)
  }, [showPendingBanner, loading, error, visible.length, eventId, navigate])

  return (
    <div className="success-page">
      <div className="success-shell">
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
          <button className="btn btn-xs btn-ghost" onClick={toggleLang} type="button">
            {t('langBtn')}
          </button>
        </div>

        <div className="status-bar">
          <span className="status-dot" />
          <div className="status-text">
            <div className="status-strong">
              {showPendingBanner ? t('paymentRequestSent') : visible.length > 0 ? t('paymentSuccessful') : t('finalizing')}
            </div>
            <div className="status-sub">
              {showPendingBanner ? (
                <>
                  {t('notifiedOrganizer')} <strong>{pendingPretty || (lang === 'es' ? 'tu pago' : 'your payment')}</strong>{' '}
                  {lang === 'es' ? t('pendingTextB') : `${t('pendingTextA')} ${pendingPretty || 'payment'}. ${t('pendingTextB')}`}
                </>
              ) : visible.length > 0 ? (
                <>
                  {t('confirmationSentTo')} <span className="status-email">{email || (lang === 'es' ? 'tu email' : 'your email')}</span>
                </>
              ) : (
                <>{t('checkingTicket')}</>
              )}
            </div>
          </div>
          <div className="status-actions">
            <a
              className="btn btn-xs btn-ghost"
              href={`https://mail.google.com/mail/u/0/?ogbl#search/from:(wknd)+to:(${encodeURIComponent(email)})`}
              target="_blank"
              rel="noreferrer"
            >
              {t('openGmail')}
            </a>
            <Link className="btn btn-xs btn-accent" to={`/events/${eventId}`}>
              {t('backToEvent')}
            </Link>
          </div>
        </div>

        <div className="tickets-grid">
          {loading && <p className="hint">{t('checkingForTicket')}</p>}
          {error && <p className="hint hint-error">{error}</p>}
          {!loading && !error && visible.length === 0 && (
            <p className="hint">
              {showPendingBanner ? t('pendingAppear') : t('couldntDisplay')}
            </p>
          )}

          {visible.map((tt) => (
            <WebTicketCard key={tt.id} ticket={tt} apiBase={API} token={token} />
          ))}
        </div>
      </div>
    </div>
  )
}
