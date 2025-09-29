import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import WebTicketCard from '../components/WebTicketCard'
import './SuccessPage.css'

const API = 'https://backendevent-etce.onrender.com'

function pickNewestBatch(eventTickets) {
  if (!Array.isArray(eventTickets) || eventTickets.length === 0) return []

  // Normalize dates, pick best grouping key
  const groups = new Map()
  const getKey = (t) => {
    // Prefer stable “same purchase” identifiers if present
    if (t.paymentIntentId) return `pi:${t.paymentIntentId}`
    if (t.orderId) return `order:${t.orderId}`

    // Fallback: minute bucket of createdAt (many backends set same timestamp for a purchase)
    if (t.createdAt) {
      const d = new Date(t.createdAt)
      const minuteKey = isNaN(d) ? null : d.toISOString().slice(0, 16) // yyyy-mm-ddThh:mm
      if (minuteKey) return `min:${minuteKey}`
    }

    // Last resort: each ticket is its own group (will pick highest id below)
    return `id:${t.id}`
  }

  for (const t of eventTickets) {
    const k = getKey(t)
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(t)
  }

  // Rank groups: newest by createdAt (max), then by max id
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
  const [params] = useSearchParams()
  const eventId = Number(params.get('eventId'))
  const navigate = useNavigate()

  const token = localStorage.getItem('token') || ''
  const email = localStorage.getItem('email') || ''

  const [tickets, setTickets] = useState([])
  const [latestTickets, setLatestTickets] = useState([])
  const [showAll, setShowAll] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const run = async () => {
      try {
        if (!email) throw new Error('Missing email')
        const res = await fetch(`${API}/api/tickets/my?email=${encodeURIComponent(email)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        if (!res.ok) throw new Error(`Tickets ${res.status}`)
        const all = await res.json()
        const forEvent = (all || []).filter(t => Number(t.eventId) === Number(eventId))
        setTickets(forEvent)
        setLatestTickets(pickNewestBatch(forEvent))
      } catch {
        setError('Couldn’t load your ticket. Check your email for the receipt + QR.')
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [email, token, eventId])

  // Fail-safe: if nothing shows, auto-return after 10s
  useEffect(() => {
    const list = showAll ? tickets : latestTickets
    if (loading || error || (list && list.length)) return
    const t = setTimeout(() => navigate(`/event/${eventId}`), 10000)
    return () => clearTimeout(t)
  }, [loading, error, tickets, latestTickets, showAll, eventId, navigate])

  const visible = showAll ? tickets : latestTickets

  return (
    <div className="success-page">
      <div className="success-shell">
        <div className="status-bar">
          <span className="status-dot" />
          <div className="status-text">
            <div className="status-strong">Payment successful</div>
            <div className="status-sub">
              Confirmation sent to <span className="status-email">{email || 'your email'}</span>
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
            <Link className="btn btn-xs btn-accent" to={`/event/${eventId}`}>
              Back to event
            </Link>
          </div>
        </div>

        <div className="tickets-grid">
          {loading && <p className="hint">Loading your ticket…</p>}
          {error && <p className="hint hint-error">{error}</p>}
          {!loading && !error && visible.length === 0 && (
            <p className="hint">We couldn’t display your ticket here, but it’s in your email.</p>
          )}

          {visible.map(t => (
            <WebTicketCard key={t.id} ticket={t} apiBase={API} token={token} />
          ))}
        </div>

        {/* optional: quick toggle to view all historical tickets for this event */}
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
