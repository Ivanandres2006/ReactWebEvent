// src/pages/SuccessPage.jsx
import { useEffect, useState, useMemo } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import WebTicketCard from '../components/WebTicketCard'

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

  // Load my tickets and filter by event
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

  // Fail-safe: if nothing shows, auto-return after 10s
  useEffect(() => {
    if (tickets.length) return
    const t = setTimeout(() => navigate(`/event/${eventId}`), 10000)
    return () => clearTimeout(t)
  }, [tickets.length, eventId, navigate])

  //— UI —//
  return (
    <div
      className="min-h-screen text-white"
      style={{
        backgroundColor: '#0A0F2C',
        backgroundImage: 'none',              // ← hard kill any old bg art
      }}
    >
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* compact status bar */}
        <div className="rounded-xl bg-white/5 border border-white/10 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* tiny dot, not a huge check */}
            <span className="h-2.5 w-2.5 rounded-full bg-[#00E676]" />
            <div className="leading-tight">
              <div className="font-semibold">Payment successful</div>
              <div className="text-xs text-white/70">
                Confirmation sent to <span className="text-white">{email || 'your email'}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              className="text-xs px-3 py-1.5 rounded-lg bg-white/10 border border-white/10 hover:bg-white/15 transition"
              href={`https://mail.google.com/mail/u/0/?ogbl#search/from:(wknd)+to:(${encodeURIComponent(email)})`}
              target="_blank" rel="noreferrer"
            >
              Open Gmail
            </a>
            <Link
              className="text-xs px-3 py-1.5 rounded-lg bg-[#00E676] text-black font-semibold hover:brightness-95 transition"
              to={`/event/${eventId}`}
            >
              Back to event
            </Link>
          </div>
        </div>

        {/* tickets */}
        <div className="mt-5">
          {loading && <p className="text-white/70 text-sm">Loading your ticket…</p>}
          {error && <p className="text-red-400 text-sm">{error}</p>}
          {!loading && !error && tickets.length === 0 && (
            <p className="text-white/80 text-sm">We couldn’t display your ticket here, but it’s in your email.</p>
          )}

          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {tickets.map(t => (
              <WebTicketCard key={t.id} ticket={t} apiBase={API} token={token} />
            ))}
          </div>

          {tickets.length > 0 && (
            <p className="text-white/60 text-xs mt-6 text-center">
              Present this QR at the door. You can also add to Apple Wallet or print.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
