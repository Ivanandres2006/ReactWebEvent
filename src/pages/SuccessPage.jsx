import { useEffect, useState, useRef } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import WebTicketCard from '../components/WebTicketCard'
import './SuccessPage.css'

const API = 'https://backendevent-etce.onrender.com'

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
      ? 'Cash'
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
    if (pi) {
      return list.filter((t) => (t.paymentIntentId || '') === pi)
    }
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
        setError('Couldn’t load your ticket. Check your email for the receipt + QR.')
      } finally {
        setLoading(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, pi, since, token, email])

  // ✅ Exponential backoff polling (max attempts, stop early)
  const attemptsRef = useRef(0)
  const timeoutRef = useRef(null)

  useEffect(() => {
    const needPoll =
      (pi && visible.length === 0) ||
      (pendingParam && since && visible.length === 0)

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
          return // ✅ stop polling once we have tickets
        }
      } catch {
        // ignore; keep trying within max attempts
      }

      if (attemptsRef.current >= 8) {
        // ✅ stop after max attempts
        return
      }

      const delay = Math.round(2000 * Math.pow(1.7, attemptsRef.current)) // exponential backoff
      timeoutRef.current = setTimeout(tick, delay)
    }

    tick()

    return () => {
      stopped = true
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pi, pendingParam, since, visible.length, showPendingBanner])

  // If nothing to show and not pending, return after 10s
  useEffect(() => {
    if (showPendingBanner || loading || error || visible.length > 0) return
    const t = setTimeout(() => navigate(`/events/${eventId}`), 10000)
    return () => clearTimeout(t)
  }, [showPendingBanner, loading, error, visible.length, eventId, navigate])

  return (
    <div className="success-page">
      <div className="success-shell">
        <div className="status-bar">
          <span className="status-dot" />
          <div className="status-text">
            <div className="status-strong">
              {showPendingBanner
                ? 'Payment request sent'
                : visible.length > 0
                ? 'Payment successful'
                : 'Finalizing payment…'}
            </div>
            <div className="status-sub">
              {showPendingBanner ? (
                <>
                  We <strong>notified the organizer</strong> about your {pendingPretty || 'payment'}.
                  You’ll receive an email with your ticket as soon as they confirm it.
                </>
              ) : visible.length > 0 ? (
                <>
                  Confirmation sent to <span className="status-email">{email || 'your email'}</span>
                </>
              ) : (
                <>We’re checking for your ticket…</>
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
              Open Gmail
            </a>
            <Link className="btn btn-xs btn-accent" to={`/events/${eventId}`}>
              Back to event
            </Link>
          </div>
        </div>

        <div className="tickets-grid">
          {loading && <p className="hint">Checking for your ticket…</p>}
          {error && <p className="hint hint-error">{error}</p>}
          {!loading && !error && visible.length === 0 && (
            <p className="hint">
              {showPendingBanner
                ? 'Your ticket will appear here after the organizer confirms your payment.'
                : 'We couldn’t display your ticket here yet.'}
            </p>
          )}

          {visible.map((t) => (
            <WebTicketCard key={t.id} ticket={t} apiBase={API} token={token} />
          ))}
        </div>
      </div>
    </div>
  )
}
