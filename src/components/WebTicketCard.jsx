import { useEffect, useState } from 'react'

/**
 * Web ticket card:
 * - Fetches QR as BLOB (so we can send Authorization header).
 * - Offers Apple Wallet (.pkpass) download using same endpoint as the iOS app.
 */
export default function WebTicketCard({ ticket, event, api, token }) {
  const [qrUrl, setQrUrl] = useState(null)
  const [downloadingPass, setDownloadingPass] = useState(false)
  const [error, setError] = useState(null)

  // build display data
  const title = ticket?.tierName || 'Ticket'
  const dateStr = event?.dateTime ? formatDate(event.dateTime) : ''
  const location = event?.location || ''
  const price = priceFromEventTier(event, ticket?.tierName)

  // Fetch QR blob with Authorization
  useEffect(() => {
    let revoke = null
    let cancelled = false

    async function go() {
      setError(null)
      try {
        const res = await fetch(`${api}/api/tickets/qr/${ticket.id}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        if (!res.ok) throw new Error(`QR ${res.status}`)
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        revoke = () => URL.revokeObjectURL(url)
        if (!cancelled) setQrUrl(url)
      } catch (e) {
        if (!cancelled) setError(e.message)
      }
    }

    go()
    return () => {
      cancelled = true
      if (revoke) revoke()
    }
  }, [api, ticket?.id, token])

  async function downloadPass() {
    setDownloadingPass(true)
    setError(null)
    try {
      const res = await fetch(`${api}/api/passes/ticket/${ticket.id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) throw new Error(`Pass ${res.status}`)
      const blob = await res.blob()
      const a = document.createElement('a')
      const url = URL.createObjectURL(blob)
      a.href = url
      a.download = `ticket-${ticket.id}.pkpass`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e.message)
    } finally {
      setDownloadingPass(false)
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-white/10 text-[#00E676] font-semibold">
            {title}
          </div>
          <div className="mt-3 text-white/85">{price != null ? (price > 0 ? `$${price.toFixed(2)}` : 'FREE') : '—'}</div>
          <div className="mt-1 text-white/70 text-sm">{dateStr}</div>
          <div className="text-white/60 text-sm">{location}</div>
          <div className="mt-2 text-white/70 text-xs">Ticket #{ticket.id}</div>
        </div>

        <div className="shrink-0">
          {qrUrl ? (
            <img
              src={qrUrl}
              alt="Ticket QR"
              className="w-[180px] h-[180px] rounded-xl border border-white/10 bg-black/60 object-contain"
            />
          ) : (
            <div className="w-[180px] h-[180px] rounded-xl border border-white/10 bg-black/60 flex items-center justify-center text-white/50">
              {error ? 'QR unavailable' : 'Loading QR…'}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          className="px-4 py-2 rounded-lg bg-[#00E676] text-black font-semibold"
          onClick={downloadPass}
          disabled={downloadingPass}
        >
          {downloadingPass ? 'Preparing Wallet Pass…' : 'Add to Apple Wallet'}
        </button>

        <a
          className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10"
          href={qrUrl || '#'}
          download={`ticket-${ticket.id}-qr.png`}
          onClick={(e) => { if (!qrUrl) e.preventDefault() }}
        >
          Download QR
        </a>

        {error && <span className="text-red-400 text-sm">{String(error)}</span>}
      </div>
    </div>
  )
}

function formatDate(isoString) {
  const date = new Date(isoString)
  return date.toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function priceFromEventTier(event, tierName) {
  const match = event?.ticketTiers?.find?.(t => t.name === tierName)
  return typeof match?.price === 'number' ? match.price : null
}
