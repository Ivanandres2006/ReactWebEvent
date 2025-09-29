// src/components/WebTicketCard.jsx
import { useEffect, useState } from 'react'

export default function WebTicketCard({ ticket, apiBase, token }) {
  const [qrUrl, setQrUrl] = useState(null)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState(null)

  // Fetch QR (auth header → blob → objectURL)
  useEffect(() => {
    let revoked
    const run = async () => {
      try {
        setError(null)
        const res = await fetch(`${apiBase}/api/tickets/qr/${ticket.id}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        })
        if (!res.ok) throw new Error(`QR ${res.status}`)
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        setQrUrl(url)
        revoked = url
      } catch (e) {
        setError('Could not load QR')
      }
    }
    run()
    return () => { if (revoked) URL.revokeObjectURL(revoked) }
  }, [apiBase, token, ticket.id])

  const downloadPkPass = async () => {
    try {
      setDownloading(true)
      setError(null)
      const res = await fetch(`${apiBase}/api/passes/ticket/${ticket.id}`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          Accept: 'application/vnd.apple.pkpass'
        }
      })
      if (!res.ok) throw new Error(`pkpass ${res.status}`)
      let data = await res.arrayBuffer()

      // Server may wrap in JSON {pkpass: base64}
      try {
        const text = new TextDecoder().decode(data)
        const maybeJson = JSON.parse(text)
        if (maybeJson?.pkpass) {
          data = Uint8Array.from(atob(maybeJson.pkpass), c => c.charCodeAt(0)).buffer
        }
      } catch {
        // not JSON → already .pkpass bytes
      }

      const blob = new Blob([data], { type: 'application/vnd.apple.pkpass' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `ticket-${ticket.id}.pkpass`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError('Could not download Wallet pass')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="rounded-2xl p-5 bg-white/5 border border-white/10 text-left">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-sm uppercase tracking-wide text-white/60">Ticket</div>
          <div className="text-xl font-semibold">{ticket.tierName || 'General'}</div>
        </div>
        <div className="text-white/70">#{ticket.id}</div>
      </div>

      <div className="flex items-center justify-center">
        {qrUrl ? (
          <img
            src={qrUrl}
            alt="Ticket QR"
            className="w-56 h-56 object-contain rounded-lg bg-black/60 p-3"
          />
        ) : (
          <div className="w-56 h-56 flex items-center justify-center rounded-lg bg-black/60">
            <span className="text-white/60 text-sm">{error || 'Loading QR…'}</span>
          </div>
        )}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <button
          className="px-4 py-2 rounded-lg bg-neonGreen text-black font-semibold"
          onClick={downloadPkPass}
          disabled={downloading}
        >
          {downloading ? 'Preparing…' : 'Add to Wallet (.pkpass)'}
        </button>
        <button
          className="px-4 py-2 rounded-lg bg-white/10 border border-white/10"
          onClick={() => window.print()}
        >
          Print
        </button>
      </div>

      <p className="text-white/60 text-xs mt-3">
        Present this QR at the entrance. Keep the Wallet pass or email as backup.
      </p>
    </div>
  )
}
