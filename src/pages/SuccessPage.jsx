import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import WebTicketCard from '../components/WebTicketCard'
import './SuccessPage.css'

const API = 'https://backendevent-etce.onrender.com'

export default function SuccessPage() {
  const [params] = useSearchParams()
  const eventId = Number(params.get('eventId'))
  const navigate = useNavigate()

  const token = localStorage.getItem('token') || ''
  const email = localStorage.getItem('email') || ''

  const [tickets, setTickets] = useState([])
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
        setTickets((all || []).filter(t => Number(t.eventId) === Number(eventId)))
      } catch {
        setError('Couldn’t load your ticket. Check your email for the receipt + QR.')
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [email, token, eventId])

  useEffect(() => {
    if (tickets.length) return
    const t = setTimeout(() => navigate(`/event/${eventId}`), 10000)
    return () => clearTimeout(t)
  }, [tickets.length, eventId, navigate])

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
          {!loading && !error && tickets.length === 0 && (
            <p className="hint">We couldn’t display your ticket here, but it’s in your email.</p>
          )}

          {tickets.map(t => (
            <WebTicketCard key={t.id} ticket={t} apiBase={API} token={token} />
          ))}
        </div>
      </div>
    </div>
  )
}
