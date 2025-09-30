import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import WebTicketCard from '../components/WebTicketCard'
import './SuccessPage.css'

const API = 'https://backendevent-etce.onrender.com'

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
    else {
      if (r.createdMax > best.createdMax) best = { arr, ...r }
      else if (r.createdMax === best.createdMax && r.idMax > best.idMax) best = { arr, ...r }
    }
  }
  return best?.arr ?? []
}

export default function SuccessPage() {
  const [params, setParams] = useSearchParams()
  const eventId = Number(params.get('eventId'))
  const pendingParam = (params.get('pending') || '').toLowerCase() // 'pagomovil' | 'zelle' | 'cash' | ''
  const navigate = useNavigate()

  const token = localStorage.getItem('token') || ''
  const email = localStorage.getItem('email') || ''

  const [tickets, setTickets] = useState([])
  const [latestTickets, setLatestTickets] = useState([])
  const [showAll, setShowAll] = useState(false)
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
    setTickets(forEvent)
    setLatestTickets(pickNewestBatch(forEvent))
    return forEvent
  }

  // Initial load
  useEffect(() => {
    const run = async () => {
      try { await fetchMine() }
      catch { setError('Couldn’t load your ticket. Check your email for the receipt + QR.') }
      finally { setLoading(false) }
    }
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, token, eventId])

  // Poll while pending until tickets show up; then hide banner + clean URL (?pending=)
  useEffect(() => {
    if (!pendingPretty) return
    let stop = false

    const check = async () => {
      try {
        const forEvent = await fetchMine()
        if (!stop && forEvent.length > 0) {
          setShowPendingBanner(false)
          // remove ?pending from the URL without reload
          const next = new URLSearchParams(params)
          next.delete('pending')
          setParams(next, { replace: true })
        }
      } catch {/* ignore individual poll errors */}
    }

    const id = setInterval(check, 5000)
    // also run an immediate check
    check()

    return () => { stop = true; clearInterval(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPretty, email, token, eventId])

  // If nothing to show and not pending, bounce back after 10s
  useEffect(() => {
    const list = showAll ? tickets : latestTickets
    if (showPendingBanner || loading || error || (list && list.length)) return
    const t = setTimeout(() => navigate(`/events/${eventId}`), 10000)
    return () => clearTimeout(t)
  }, [showPendingBanner, loading, error, tickets, latestTickets, showAll, eventId, navigate])

  const visible = showAll ? tickets : latestTickets

  return (
    <div className="success-page">
      <div className="success-shell">
        <div className="status-bar">
          <span className="status-dot" />
          <div className="status-text">
            <div className="status-strong">
              {showPendingBanner ? 'Payment request sent' : 'Payment successful'}
            </div>
            <div className="status-sub">
              {showPendingBanner ? (
                <>
                  We <strong>notified the organizer</strong> about your {pendingPretty} payment.
                  You’ll receive an email with your ticket as soon as they confirm it.
                </>
              ) : (
                <>Confirmation sent to <span className="status-email">{email || 'your email'}</span></>
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
                : 'We couldn’t display your ticket here, but it’s in your email.'}
            </p>
          )}

          {visible.map(t => (
            <WebTicketCard key={t.id} ticket={t} apiBase={API} token={token} />
          ))}
        </div>

        {tickets.length > latestTickets.length && (
          <div className="toggle-all">
            <button className="btn btn-ghost" onClick={() => setShowAll(v => !v)}>
              {showAll ? 'Show only newest' : `Show all (${tickets.length})`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
