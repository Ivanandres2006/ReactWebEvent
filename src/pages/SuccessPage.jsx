import { useEffect, useState } from 'react'
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

  useEffect(() => {
    const load = async () => {
      try {
        if (!email) throw new Error('Missing email')
        const res = await fetch(`${API}/api/tickets/my?email=${encodeURIComponent(email)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
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
    load()
  }, [email, token, eventId])

  return (
    <div className="min-h-screen bg-[#0A0F2C] text-white">
      <div className="max-w-3xl mx-auto px-4 py-10">
        {/* Compact success header */}
        <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full grid place-items-center border-2 border-[#00E676]">
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#00E676]" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <div className="font-semibold">Payment successful</div>
              <div className="text-sm text-white/70">Confirmation sent to <span className="text-white">{email || 'your email'}</span></div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              className="text-sm px-3 py-1.5 rounded-lg bg-white/10 border border-white/10 hover:bg-white/15 transition"
              href={`https://mail.google.com/mail/u/0/?ogbl#search/from:(wknd)+to:(${encodeURIComponent(email)})`}
              target="_blank" rel="noreferrer"
            >
              Open Gmail
            </a>
            <Link
              className="text-sm px-3 py-1.5 rounded-lg bg-[#00E676] text-black font-semibold hover:brightness-95 transition"
              to={`/event/${eventId}`}
            >
              Back to event
            </Link>
          </div>
        </div>

        {/* Tickets */}
        <div className="mt-6">
          {loading && <p className="text-white/70">Loading your ticket…</p>}
          {error && <p className="text-red-400">{error}</p>}

          {!loading && !error && tickets.length === 0 && (
            <div className="text-white/80">
              We couldn’t display your ticket here, but it’s in your email.
            </div>
          )}

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {tickets.map(t => (
              <WebTicketCard key={t.id} ticket={t} apiBase={API} token={token} />
            ))}
          </div>

          {tickets.length > 0 && (
            <p className="text-white/60 text-xs mt-6 text-center">
              Present this QR at the entrance. You can also add the pass to Apple Wallet or print it.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
