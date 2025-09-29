import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'

const API = 'https://backendevent-etce.onrender.com'

export default function SuccessPage() {
  const [params] = useSearchParams()
  const eventId = params.get('eventId')
  const navigate = useNavigate()

  const token = localStorage.getItem('token') || ''
  const email = localStorage.getItem('email') || ''
  const [event, setEvent] = useState(null)
  const [allTickets, setAllTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [autoRedirect, setAutoRedirect] = useState(true)

  // Load the event (for title/date/location)
  useEffect(() => {
    let ignore = false
    async function go() {
      try {
        const res = await fetch(`${API}/events/${eventId}`)
        if (!res.ok) throw new Error(`Event ${res.status}`)
        const data = await res.json()
        if (!ignore) setEvent(data)
      } catch (e) {
        if (!ignore) setErr(e.message)
      }
    }
    if (eventId) go()
    return () => { ignore = true }
  }, [eventId])

  // Load all tickets for the user (by email)
  useEffect(() => {
    let ignore = false
    async function go() {
      try {
        const res = await fetch(`${API}/api/tickets/my?email=${encodeURIComponent(email)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        if (!res.ok) throw new Error(`Tickets ${res.status}`)
        const data = await res.json()
        if (!Array.isArray(data)) throw new Error('Invalid tickets response')
        if (!ignore) setAllTickets(data)
      } catch (e) {
        if (!ignore) setErr(e.message)
      } finally {
        if (!ignore) setLoading(false)
      }
    }
    if (email) go()
    else setLoading(false)
    return () => { ignore = true }
  }, [email, token])

  // Only show tickets for THIS event
  const eventTickets = useMemo(
    () => allTickets.filter(t => String(t.eventId) === String(eventId)),
    [allTickets, eventId]
  )

  // Auto redirect (can be canceled)
  useEffect(() => {
    if (!autoRedirect || !eventId) return
    const t = setTimeout(() => navigate(`/event/${eventId}`), 12000)
    return () => clearTimeout(t)
  }, [autoRedirect, eventId, navigate])

  return (
    <div className="min-h-screen bg-gradient-to-b from-black to-[#0A0F2C] flex flex-col items-center text-white text-center px-6 py-10">
      {/* check icon */}
      <div className="mb-5">
        <div className="w-20 h-20 flex items-center justify-center rounded-full border-4 border-[#00E676] shadow-lg shadow-[#00E676]/30 animate-pulse">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 text-[#00E676]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      </div>

      <h1 className="text-3xl font-extrabold mb-1">Payment Successful</h1>
      <p className="text-white/80">
        {email
          ? <>We’ve emailed your ticket to <span className="font-semibold">{email}</span>.</>
          : 'We’ve emailed your ticket.'}
      </p>

      <EmailQuickOpen email={email} />

      <div className="mt-8 w-full max-w-3xl text-left">
        <h2 className="text-xl font-bold mb-3">🎫 Your Ticket{eventTickets.length > 1 ? 's' : ''}</h2>

        {loading && <div className="text-white/70">Loading your tickets…</div>}
        {!loading && !!err && <div className="text-red-400">{String(err)}</div>}
        {!loading && !err && eventTickets.length === 0 && (
          <div className="text-white/70">
            We couldn’t find tickets for this event yet. If you just paid, give it a few seconds and
            <button className="underline ml-1" onClick={() => window.location.reload()}>refresh</button>.
          </div>
        )}

        <div className="grid gap-5">
          {eventTickets.map(t => (
            <WebTicketCard
              key={t.id}
              ticket={t}
              event={event}
              api={API}
              token={token}
            />
          ))}
        </div>
      </div>

      <div className="mt-10 flex items-center gap-3">
        <Link
          to={`/event/${eventId}`}
          className="px-5 py-3 rounded-lg bg-[#00E676] text-black font-semibold"
        >
          Back to Event
        </Link>
        <button
          className="px-4 py-3 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10"
          onClick={() => setAutoRedirect(!autoRedirect)}
          title="Toggle auto-redirect"
        >
          {autoRedirect ? 'Stop auto-redirect' : 'Enable auto-redirect'}
        </button>
      </div>

      <p className="text-white/60 text-sm mt-3">
        {autoRedirect ? 'You’ll be redirected in a few seconds…' : 'Auto-redirect paused.'}
      </p>
    </div>
  )
}

function EmailQuickOpen({ email }) {
  if (!email) return null
  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-sm">
      <span className="text-white/60">Open your email:</span>
      <a className="px-3 py-2 rounded bg-white/10 hover:bg-white/15" href="https://mail.google.com/" target="_blank" rel="noreferrer">Gmail</a>
      <a className="px-3 py-2 rounded bg-white/10 hover:bg-white/15" href="https://outlook.live.com/mail/" target="_blank" rel="noreferrer">Outlook</a>
      <a className="px-3 py-2 rounded bg-white/10 hover:bg-white/15" href="https://mail.yahoo.com/" target="_blank" rel="noreferrer">Yahoo</a>
      <a className="px-3 py-2 rounded bg-white/10 hover:bg-white/15" href={`mailto:${email}`}>Apple Mail</a>
    </div>
  )
}
