// src/pages/SuccessPage.jsx
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import WebTicketCard from '../components/WebTicketCard'
import defaultEvent from '../assets/defaultEvent.jpg'

const API = 'https://backendevent-etce.onrender.com'

export default function SuccessPage() {
  const [params] = useSearchParams()
  const eventId = Number(params.get('eventId'))
  const navigate = useNavigate()

  const token = localStorage.getItem('token') || ''
  const email = localStorage.getItem('email') || ''

  const [event, setEvent] = useState(null)
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Load event (public)
  useEffect(() => {
    if (!eventId) return
    fetch(`${API}/events/${eventId}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`Event ${r.status}`)))
      .then(setEvent)
      .catch(() => {})
  }, [eventId])

  // Load my tickets and filter by event
  useEffect(() => {
    if (!email) {
      setError('Missing email. Please log in again.')
      setLoading(false)
      return
    }
    const run = async () => {
      try {
        const res = await fetch(`${API}/api/tickets/my?email=${encodeURIComponent(email)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        })
        if (!res.ok) throw new Error(`Tickets ${res.status}`)
        const all = await res.json()
        const mine = (all || []).filter(t => Number(t.eventId) === Number(eventId))
        setTickets(mine)
      } catch (e) {
        setError('Could not load your ticket. Please check your email.')
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [email, token, eventId])

  // Auto-return in 12s (but only if we failed to load a ticket)
  useEffect(() => {
    if (tickets.length) return
    const t = setTimeout(() => navigate(`/event/${eventId}`), 12000)
    return () => clearTimeout(t)
  }, [tickets.length, eventId, navigate])

  const eventImg = useMemo(
    () => (event?.imageUrl && event.imageUrl !== 'null') ? event.imageUrl : defaultEvent,
    [event]
  )

  return (
    <div className="min-h-screen bg-gradient-to-b from-black to-[#0A0F2C] text-white">
      <div className="max-w-3xl mx-auto px-5 py-12 text-center">
        {/* header check */}
        <div className="mx-auto mb-6 w-20 h-20 flex items-center justify-center rounded-full border-4 border-neonGreen shadow-lg shadow-neonGreen/30 animate-pulse">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 text-neonGreen" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h1 className="text-3xl font-extrabold">Payment Successful</h1>
        <p className="text-white/80 mt-2">We’ve emailed your confirmation to <span className="font-semibold">{email || 'your email'}</span>.</p>

        {/* Quick actions */}
        <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
          <a
            className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10"
            href={`https://mail.google.com/mail/u/0/?ogbl#search/from:(wknd)%20to:(${encodeURIComponent(email)})`}
            target="_blank"
            rel="noreferrer"
          >
            Open Gmail
          </a>
          <a
            className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10"
            href="mailto:"
          >
            Open Email App
          </a>
          <Link
            className="px-4 py-2 rounded-lg bg-neonGreen text-black font-semibold"
            to={`/event/${eventId}`}
          >
            Back to Event
          </Link>
        </div>

        {/* Event preview */}
        <div className="mt-10 rounded-2xl overflow-hidden shadow-xl shadow-black/30 border border-white/5">
          <img src={eventImg} onError={(e)=>{e.currentTarget.src = defaultEvent}} alt="" className="w-full max-h-72 object-cover" />
          <div className="p-5 text-left">
            <h2 className="text-xl font-semibold">{event?.title || 'Your Event'}</h2>
            <p className="text-white/70">{event?.location}</p>
          </div>
        </div>

        {/* Ticket(s) */}
        <div className="mt-10">
          {loading && <p className="text-white/70">Loading your ticket…</p>}
          {error && <p className="text-red-400">{error}</p>}

          {!loading && !error && tickets.length === 0 && (
            <div className="text-white/80">
              <p>We couldn’t display your ticket here, but it’s in your email.</p>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-6 mt-6">
            {tickets.map(t => (
              <WebTicketCard
                key={t.id}
                ticket={t}
                apiBase={API}
                token={token}
              />
            ))}
          </div>
        </div>

        <p className="text-white/60 text-sm mt-10">
          Keep this page handy — you can present the QR at the door.
        </p>
      </div>
    </div>
  )
}
