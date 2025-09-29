import { useEffect, useState } from 'react'

export default function WebTicketCard({ ticket, apiBase, token }) {
  const [qrUrl, setQrUrl] = useState(null)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let revoke
    const run = async () => {
      try {
        setError(null)
        const res = await fetch(`${apiBase}/api/tickets/qr/${ticket.id}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        })
        if (!res.ok) throw new Error('QR error')
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
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), Accept: 'application/vnd.apple.pkpass' }
      })
      if (!res.ok) throw new Error('pkpass error')
      let buf = await res.arrayBuffer()

      // may be JSON-wrapped { pkpass: base64 }
      try {
        const text = new TextDecoder().decode(buf)
        const j = JSON.parse(text)
        if (j?.pkpass) buf = Uint8Array.from(atob(j.pkpass), c => c.charCodeAt(0)).buffer
      } catch { /* not JSON */ }

      const blob = new Blob([buf], { type: 'application/vnd.apple.pkpass' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `ticket-${ticket.id}.pkpass`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    } catch {
      setError('Could not download Wallet pass')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm">
          <div className="text-white/60 uppercase tracking-wide">Ticket</div>
          <div className="font-semibold text-lg">{ticket.tierName || 'General'}</div>
        </div>
        <div className="text-white/60 text-sm">#{ticket.id}</div>
      </div>

      <div className="mt-3 flex items-center justify-center">
        {qrUrl ? (
          <img src={qrUrl} alt="Ticket QR" className="w-44 h-44 object-contain rounded-md bg-black/60 p-2" />
        ) : (
          <div className="w-44 h-44 grid place-items-center rounded-md bg-black/60 text-white/60 text-sm">
            {error || 'Loading QR…'}
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          className="px-3 py-2 rounded-lg bg-[#00E676] text-black font-semibold hover:brightness-95 transition text-sm"
          onClick={downloadPkPass}
          disabled={downloading}
        >
          {downloading ? 'Preparing…' : 'Add to Wallet'}
        </button>
        <button
          className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 hover:bg-white/15 transition text-sm"
          onClick={() => window.print()}
        >
          Print
        </button>
      </div>
    </div>
  )
}
