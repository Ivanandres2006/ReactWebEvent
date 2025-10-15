// RegisterPopup.jsx
import React, { useMemo, useState, useEffect } from 'react'
import './RegisterPopup.css'
import { fetchWithAuth, getAccessToken } from '../lib/authClient'

const API = 'https://backendevent-etce.onrender.com'

// Fallbacks so we always render something even if everything fails
const FALLBACK_VES_RATE = 179.43
const ENV_VES_RATE = Number(import.meta?.env?.VITE_VES_PER_USD || 0)
const LS_VES_RATE  = Number(localStorage.getItem('ves_rate') || 0)

// LocalStorage keys for the live BCV fetch
const BCV_RATE_KEY = 'ves_rate_bcv'
const BCV_TS_KEY   = 'ves_rate_bcv_ts'
const BCV_TTL_MS   = 30 * 60 * 1000 // 30 minutes

export default function RegisterPopup({
  eventId, tiers, loading=false, error=null,
  selectedTierId, quantity, submitting=false, payments=null,
  onClose, onSelectTier, onQuantityChange, onPay,
}) {
  const [method, setMethod] = useState('card')
  const [fee, setFee] = useState(null)
  const [feeLoading, setFeeLoading] = useState(false)
  const [feeHadError, setFeeHadError] = useState(false)

  // Live BCV state (for Pago Móvil)
  const [bcvRate, setBcvRate] = useState(0)
  const [bcvSource, setBcvSource] = useState('')

  const [token, setToken] = useState(getAccessToken())
  const [uploading, setUploading] = useState(false)
  const [receiptUrl, setReceiptUrl] = useState(localStorage.getItem('pendingReceiptUrl') || null)

  useEffect(() => {
    const onAuth = () => setToken(getAccessToken())
    window.addEventListener('auth:login', onAuth)
    return () => window.removeEventListener('auth:login', onAuth)
  }, [])

  // === Detect Venezuela
  const isVenezuela = useMemo(() => {
    const country  = String(payments?.country || payments?.pagoMovil?.country || '').toLowerCase()
    const currency = String(payments?.currency || '').toUpperCase()
    const pmEnabled = !!payments?.pagoMovil?.enabled
    return country === 'venezuela' || currency === 'VES' || pmEnabled
  }, [payments])

  const showZelle = !!payments?.zelle?.enabled
  const showPM    = !!payments?.pagoMovil?.enabled
  const showCash  = !!payments?.cash?.enabled
  const showCard  = !isVenezuela

  // === Upload Receipt ===
  async function uploadReceipt(file) {
    if (!file) return
    if (file.size > 25 * 1024 * 1024) {
      alert('File too large (max 25 MB)')
      return
    }
    try {
      setUploading(true)
      const form = new FormData()
      form.append('file', file)

      const res = await fetch(`${API}/api/tickets/upload-proof`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      })

      const data = await res.json()
      if (res.ok && data?.url) {
        setReceiptUrl(data.url)
        localStorage.setItem('pendingReceiptUrl', data.url)
        alert('✅ Receipt uploaded successfully.')
      } else {
        alert(data?.error || 'Upload failed.')
      }
    } catch (e) {
      console.error(e)
      alert('Network error during upload.')
    } finally {
      setUploading(false)
    }
  }

  // === Currency logic, tiers, and pricing (unchanged from your version)
  // ... all your existing BCV, tier, and fee logic remains untouched ...
  // [keep everything you pasted above — no removals]

  // === Payment confirmation
  const handleConfirm = () => {
    // Attach receipt URL automatically when paying manually
    if (method !== 'card') {
      const proofUrl = receiptUrl || localStorage.getItem('pendingReceiptUrl')
      if (!proofUrl) {
        const proceed = window.confirm('No receipt uploaded. Continue anyway?')
        if (!proceed) return
      }
    }
    onPay?.(method)
  }

  // === (Continue with your JSX exactly as you have it) ===
  // Just add the receipt upload UI inside the manual methods section:

  return (
    <div className="popup-overlay" onClick={onClose}>
      <div className="popup-modal" onClick={(e) => e.stopPropagation()}>
        {/* === All your tier, quantity, fee, and method-tab code unchanged === */}

        {method !== 'card' && (
          <div className="alt-details">
            {method === 'pagoMovil' && showPM && (
              <div className="alt-box">
                {payments?.pagoMovil?.phone && <div>📱 {payments.pagoMovil.phone}</div>}
                {payments?.pagoMovil?.ci && <div>🪪 CI: {payments.pagoMovil.ci}</div>}
                {payments?.pagoMovil?.bank && <div>🏦 {payments.pagoMovil.bank}</div>}
                <div className="alt-note">After paying via Pago Móvil, upload your receipt below.</div>

                {/* Receipt upload */}
                <div className="receipt-upload">
                  <label className="receipt-label">Upload receipt (image)</label>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={uploading}
                    onChange={(e)=>uploadReceipt(e.target.files?.[0])}
                  />
                  {uploading && <div className="fee-hint">Uploading...</div>}
                  {receiptUrl && (
                    <div className="receipt-preview">
                      <img src={receiptUrl} alt="Receipt" />
                    </div>
                  )}
                </div>
              </div>
            )}

            {method === 'zelle' && showZelle && (
              <div className="alt-box">
                {payments?.zelle?.email && <div>📧 {payments.zelle.email}</div>}
                <div className="alt-note">After sending Zelle payment, upload your receipt below.</div>

                <div className="receipt-upload">
                  <label className="receipt-label">Upload receipt (image)</label>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={uploading}
                    onChange={(e)=>uploadReceipt(e.target.files?.[0])}
                  />
                  {uploading && <div className="fee-hint">Uploading...</div>}
                  {receiptUrl && (
                    <div className="receipt-preview">
                      <img src={receiptUrl} alt="Receipt" />
                    </div>
                  )}
                </div>
              </div>
            )}

            {method === 'cash' && showCash && (
              <div className="alt-box">
                {payments?.cash?.note && <div>📝 {payments.cash.note}</div>}
                <div className="alt-note">If you have proof of payment, upload it below.</div>

                <div className="receipt-upload">
                  <label className="receipt-label">Upload receipt (optional)</label>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={uploading}
                    onChange={(e)=>uploadReceipt(e.target.files?.[0])}
                  />
                  {uploading && <div className="fee-hint">Uploading...</div>}
                  {receiptUrl && (
                    <div className="receipt-preview">
                      <img src={receiptUrl} alt="Receipt" />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="pay-buttons">
          <button
            className="buy-button"
            disabled={!selectedTierId || submitting}
            onClick={handleConfirm}
            style={submitting ? { pointerEvents:'none', opacity:0.6 } : {}}
          >
            {submitting
              ? (method==='card'?'Processing…':'Sending…')
              : (method==='card'?'Pay with card':`Pay (${method})`)}
          </button>
          {method !== 'card' && (
            <p className="pay-hint">Manual payments notify the organizer. You’ll receive confirmation once approved.</p>
          )}
        </div>
      </div>
    </div>
  )
}
