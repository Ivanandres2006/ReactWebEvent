import { useEffect, useState } from 'react'

export default function WebTicketCard({ ticket, apiBase, token }) {
  const [qrUrl, setQrUrl] = useState(null)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState(null)

  // Fetch QR (auth header → blob → objectURL)
  useEffect(() => {
    let revoke
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
        revoke = url
      } catch {
        setError('Could not load QR')
      }
    }
    run()
    return () => { if (revoke) URL.revokeObjectURL(revoke) }
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

      // Server may wrap in JSON { pkpass: base64 }
      try {
        const text = new TextDecoder().decode(data)
        const maybe = JSON.parse(text)
        if (maybe?.pkpass) {
          data = Uint8Array.from(atob(maybe.pkpass), c => c.charCodeAt(0)).buffer
        }
      } catch {
        // not JSON
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
    } catch {
      setError('Could not download Wallet pass')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="rounded-2xl p-5 bg-white/5 border border-white/10 backdrop-blur-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-white/60">Ticket</div>
          <div className="text-lg font-semibold">{ticket.tierName || 'General'}</div>
        </div>
        <div className="text-white/60 text-sm">#{ticket.id}</div>
      </div>

      <div className="mt-4 flex items-center justify-center">
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
          className="px-4 py-2 rounded-lg bg-[#00E676] text-black font-semibold hover:brightness-95 transition"
          onClick={downloadPkPass}
          disabled={downloading}
        >
          {downloading ? 'Preparing…' : 'Add to Wallet'}
        </button>
        <button
          className="px-4 py-2 rounded-lg bg-white/10 border border-white/10 hover:bg-white/15 transition"
          onClick={() => window.print()}
        >
          Print
        </button>
      </div>

      <p className="text-white/55 text-xs mt-3">
        Present this QR at the entrance. Keep the Wallet pass or email as backup.
      </p>
    </div>
  )
}
