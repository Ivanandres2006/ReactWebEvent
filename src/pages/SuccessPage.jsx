import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import WebTicketCard from '../components/WebTicketCard'
import './SuccessPage.css'

const API = 'https://backendevent-etce.onrender.com'

// fallback (legacy)
function pickNewestBatch(eventTickets) {
  if (!Array.isArray(eventTickets) || eventTickets.length === 0) return []
  const groups = new Map()
  const getKey = (t) => {
    if (t.paymentIntentId) return `pi:${t.paymentIntentId}`
    if (t.orderId) return `order:${t.orderId}`
    if (t.createdAt) {
      const d = new Date(t.createdAt)
      const minuteKey = isNaN(d) ? null : d.toISOString().slice(0, 16)
      if (minuteKey) return `min:${minuteKey}`
    }
    return `id:${t.id}`
  }
  for (const t of eventTickets) {
    const k = getKey(t)
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(t)
  }
  const rank = (arr) => {
    const createdMax = arr.reduce((m, t) => {
      const d = t.createdAt ? new Date(t.createdAt).getTime() : 0
      return Number.isFinite(d) ? Math.max(m, d) : m
    }, 0)
    const idMax = arr.reduce((m, t) => Math.max(m, Number(t.id) || 0), 0)
    return { createdMax, idMax }
  }
  let best = null
  for (const [, arr] of groups) {
    const r = rank(arr)
    if (!best) best = { arr, ...r }
    else if (r.createdMax > best.createdMax || (r.createdMax === best.createdMax && r.idMax > best.idMax)) {
      best = { arr, ...r }
    }
  }
  return best?.arr ?? []
}

export default function SuccessPage() {
  const [params, setParams] = useSearchParams()
  const eventId = Number(params.get('eventId'))
  const pi = params.get('pi') || ''                  // ← Stripe PaymentIntentId from this checkout
  const pendingParam = (params.get('pending') || '').toLowerCase() // 'pagomovil' | 'zelle' | 'cash' | ''
  const sinceParam = params.get('since')
  const since = sinceParam ? parseInt(sinceParam, 10) : null        // ms since manual request
  const navigate = useNavigate()

  const token = localStorage.getItem('token') || ''
  const email = localStorage.getItem('email') || ''

  const [allForEvent, setAllForEvent] = useState([])
  const [visible, setVisible] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showPendingBanner, setShowPendingBanner] = useState(Boolean(pendingParam))

  const pendingPretty =
    pendingParam === 'pagomovil' ? 'Pago Móvil'
    : pendingParam === 'zelle' ? 'Zelle'
    : pendingParam === 'cash' ? 'Cash'
    : ''

  const fetchMine = async () => {
    if (!email) throw new Error('Missing email')
    const res = await fetch(`${API}/api/tickets/my?email=${encodeURIComponent(email)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) throw new Error(`Tickets ${res.status}`)
    const all = await res.json()
    const forEvent = (all || []).filter(t => Number(t.eventId) === Number(eventId))
    setAllForEvent(forEvent)
    return forEvent
  }

  const applyFilter = (forEvent) => {
    // 1) Exact match by PI (card)
    if (pi) {
      return forEvent.filter(t => (t.paymentIntentId || '') === pi)
    }
    // 2) Newer-than moment (manual)
    if (since) {
      const cutoff = since - 10_000 // small tolerance
      return forEvent.filter(t => {
        const ts = t.createdAt ? new Date(t.createdAt).getTime() : NaN
        return Number.isFinite(ts) && ts >= cutoff
      })
    }
    // 3) Legacy (no identifiers): newest “batch”
    return pickNewestBatch(forEvent)
  }

  // Initial load
  useEffect(() => {
    const run = async () => {
      try {
        const forEvent = await fetchMine()
        setVisible(applyFilter(forEvent))
      } catch {
        setError('Couldn’t load your ticket. Check your email for the receipt + QR.')
      } finally {
        setLoading(false)
      }
    }
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, token, eventId, pi, since])

  // Poll until our *specific* tickets exist
  useEffect(() => {
    // We poll when:
    // - card flow with pi but none visible yet, or
    // - manual flow pending with since but none visible yet
    const shouldPoll = (pi && visible.length === 0) || (showPendingBanner && since && visible.length === 0)
    if (!shouldPoll) return

    let stop = false
    const tick = async () => {
      try {
        const forEvent = await fetchMine()
        const filtered = applyFilter(forEvent)
        if (!stop && filtered.length > 0) {
          setVisible(filtered)
          if (showPendingBanner) {
            setShowPendingBanner(false)
            const next = new URLSearchParams(params)
            next.delete('pending'); next.delete('since'); next.delete('pi')
            setParams(next, { replace: true })
          }
        }
      } catch {/* ignore */}
    }

    const id = setInterval(tick, 5000)
    tick()
    return () => { stop = true; clearInterval(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pi, since, showPendingBanner, visible.length])

  // If nothing to show and not pending, bounce back after 10s
  useEffect(() => {
    if (showPendingBanner || loading || error) return
    if (visible.length > 0) return
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
              {showPendingBanner ? 'Payment request sent' : (visible.length > 0 ? 'Payment successful' : 'Finalizing payment…')}
            </div>
            <div className="status-sub">
              {showPendingBanner ? (
                <>
                  We <strong>notified the organizer</strong> about your {pendingPretty || 'payment'}.
                  You’ll receive an email with your ticket as soon as they confirm it.
                </>
              ) : (
                visible.length > 0
                  ? <>Confirmation sent to <span className="status-email">{email || 'your email'}</span></>
                  : <>We’re checking for your ticket…</>
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

          {visible.map(t => (
            <WebTicketCard key={t.id} ticket={t} apiBase={API} token={token} />
          ))}
        </div>

        {/* 🔒 No "Show all" — we only ever show the current checkout’s tickets */}
      </div>
    </div>
  )
}
