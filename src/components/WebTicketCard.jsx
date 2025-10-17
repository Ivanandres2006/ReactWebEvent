// components/WebTicketCard.jsx
import { useEffect, useState } from 'react'
import './WebTicketCard.css'

export default function WebTicketCard({ ticket, apiBase, token }) {
  const [qrUrl, setQrUrl] = useState(null)
  const [qrIsBlob, setQrIsBlob] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState(null)

  // Prefer authed QR when we have a token; otherwise/public fallback
  useEffect(() => {
    let revoke
    ;(async () => {
      try {
        setError(null)

        if (token) {
          // Try private QR first
          const res = await fetch(`${apiBase}/api/tickets/qr/${ticket.id}`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          if (res.ok) {
            const blob = await res.blob()
            const url = URL.createObjectURL(blob)
            setQrUrl(url)
            setQrIsBlob(true)
            revoke = url
            return
          }
        }

        // Fallback to public QR
        setQrUrl(`${apiBase}/api/tickets/qr/public/${ticket.id}`)
        setQrIsBlob(false)
      } catch {
        // Final fallback text
        setError('Could not load QR')
      }
    })()
    return () => { if (revoke) URL.revokeObjectURL(revoke) }
  }, [apiBase, token, ticket.id])

  const downloadPkPass = async () => {
    try {
      setDownloading(true)
      setError(null)
      const res = await fetch(`${apiBase}/api/passes/ticket/${ticket.id}`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), Accept: 'application/vnd.apple.pkpass' },
      })
      if (!res.ok) throw new Error('pkpass error')
      let buf = await res.arrayBuffer()
      // optional { pkpass: base64 }
      try {
        const text = new TextDecoder().decode(buf)
        const j = JSON.parse(text)
        if (j?.pkpass) buf = Uint8Array.from(atob(j.pkpass), c => c.charCodeAt(0)).buffer
      } catch { /* already bytes */ }
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

  const onImgError = () => {
    // If authed blob failed somehow, switch to public URL once
    if (!qrUrl || qrUrl.includes('/qr/')) {
      setQrUrl(`${apiBase}/api/tickets/qr/public/${ticket.id}`)
      setQrIsBlob(false)
    }
  }

  return (
    <div className="ticket-card">
      <div className="ticket-head">
        <div>
          <div className="ticket-label">Ticket</div>
          <div className="ticket-tier">{ticket.tierName || 'General'}</div>
        </div>
        <div className="ticket-id">#{ticket.id}</div>
      </div>

      <div className="qr-wrapper">
        {qrUrl ? (
          <img src={qrUrl} alt="Ticket QR" className="qr-img" onError={onImgError} />
        ) : (
          <div className="qr-placeholder">{error || 'Loading QR…'}</div>
        )}
      </div>

      <div className="ticket-actions">
        <button className="btn btn-primary" onClick={downloadPkPass} disabled={downloading}>
          {downloading ? 'Preparing…' : 'Add to Wallet'}
        </button>
        <button className="btn btn-outline" onClick={() => window.print()}>
          Print
        </button>
      </div>

      <p className="ticket-note">
        Present this QR at the entrance. Keep the Wallet pass or email as backup.
      </p>
    </div>
  )
}
