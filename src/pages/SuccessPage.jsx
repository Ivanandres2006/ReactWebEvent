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

  // Auto-return in 15s ONLY if no ticket could be shown
  useEffect(() => {
    if (tickets.length) return
    const t = setTimeout(() => navigate(`/event/${eventId}`), 15000)
    return () => clearTimeout(t)
  }, [tickets.length, eventId, navigate])

  const eventImg = useMemo(
    () => (event?.imageUrl && event.imageUrl !== 'null') ? event.imageUrl : defaultEvent,
    [event]
  )

  return (
    <div className="min-h-screen bg-[#050816] text-white">
      <div className="mx-auto w-full max-w-5xl px-4 md:px-6 py-10">
        {/* header */}
        <div className="flex flex-col items-center text-center">
          <div className="mb-5 inline-flex items-center justify-center h-16 w-16 rounded-full border-4 border-[#00E676] shadow-[0_0_25px_rgba(0,230,118,0.35)]">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-9 w-9 text-[#00E676]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold">Payment Successful</h1>
          <p className="text-white/80 mt-2">
            We’ve emailed your confirmation to <span className="font-semibold">{email || 'your email'}</span>.
          </p>

          {/* quick actions */}
          <div className="flex flex-wrap items-center justify-center gap-3 mt-5">
            <a
              className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 transition"
              href={`https://mail.google.com/mail/u/0/?ogbl#search/from:(wknd)+to:(${encodeURIComponent(email)})`}
              target="_blank"
              rel="noreferrer"
            >
              Open Gmail
            </a>
            <a
              className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 transition"
              href={`mailto:${email}`}
            >
              Open Email App
            </a>
            <Link
              className="px-4 py-2 rounded-lg bg-[#00E676] text-black font-semibold hover:brightness-95 transition"
              to={`/event/${eventId}`}
            >
              Back to Event
            </Link>
          </div>
        </div>

        {/* event compact header */}
        <div className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-white/5">
          <div className="grid md:grid-cols-[180px,1fr]">
            <img
              src={eventImg}
              onError={(e)=>{ e.currentTarget.src = defaultEvent }}
              alt=""
              className="h-36 w-full object-cover md:h-full"
            />
            <div className="p-5">
              <div className="text-sm text-white/60 uppercase tracking-wide">Event</div>
              <h2 className="text-xl font-semibold">{event?.title || 'Your Event'}</h2>
              <p className="text-white/70 mt-1">{event?.location}</p>
            </div>
          </div>
        </div>

        {/* tickets */}
        <section className="mt-8">
          {loading && <p className="text-white/70">Loading your ticket…</p>}
          {error && <p className="text-red-400">{error}</p>}

          {!loading && !error && tickets.length === 0 && (
            <div className="text-white/80">
              <p>We couldn’t display your ticket here, but it’s in your email.</p>
              <p className="text-white/50 text-sm mt-1">You’ll be redirected to the event shortly.</p>
            </div>
          )}

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {tickets.map(t => (
              <WebTicketCard
                key={t.id}
                ticket={t}
                apiBase={API}
                token={token}
              />
            ))}
          </div>

          {tickets.length > 0 && (
            <p className="text-white/60 text-sm mt-8 text-center">
              Present any of these QR codes at the entrance. Keep the Wallet pass or email as a backup.
            </p>
          )}
        </section>
      </div>
    </div>
  )
}
