import React, { useMemo, useState, useEffect } from 'react'
import './RegisterPopup.css'
import { fetchWithAuth, getAccessToken } from '../lib/authClient'

const API = 'https://backendevent-etce.onrender.com'
const FALLBACK_VES_RATE = 179.43
const ENV_VES_RATE = Number(import.meta?.env?.VITE_VES_PER_USD || 0)
const LS_VES_RATE  = Number(localStorage.getItem('ves_rate') || 0)
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

  const [bcvRate, setBcvRate] = useState(0)
  const [bcvSource, setBcvSource] = useState('')
  const [token, setToken] = useState(getAccessToken())
  const [receiptFile, setReceiptFile] = useState(null)
  const [receiptUrl, setReceiptUrl] = useState(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    const onAuth = () => setToken(getAccessToken())
    window.addEventListener('auth:login', onAuth)
    return () => window.removeEventListener('auth:login', onAuth)
  }, [])

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

  // === BCV fetcher ===
  useEffect(() => {
    let cancelled = false
    let intervalId

    const fetchLive = async () => {
      try {
        const res = await fetch(`${API}/api/fx/ves-per-usd`)
        if (!res.ok) return
        const json = await res.json()
        const rate = Number(json?.vesPerUsd || 0)
        if (!cancelled && Number.isFinite(rate) && rate > 0) {
          setBcvRate(rate)
          setBcvSource(json?.overrideActive ? 'override' : (json?.source || 'bcv'))
          localStorage.setItem(BCV_RATE_KEY, String(rate))
          localStorage.setItem(BCV_TS_KEY, String(Date.now()))
          localStorage.setItem('ves_rate', String(rate))
        }
      } catch {}
    }

    fetchLive()
    intervalId = window.setInterval(fetchLive, BCV_TTL_MS)
    return () => { cancelled = true; clearInterval(intervalId) }
  }, [])

  useEffect(() => {
    if (!showCard && method === 'card') {
      if (showPM) setMethod('pagoMovil')
      else if (showZelle) setMethod('zelle')
      else if (showCash) setMethod('cash')
    }
  }, [showCard, showPM, showZelle, showCash, method])

  const useVES = method === 'pagoMovil'
  const vesRate = bcvRate || ENV_VES_RATE || LS_VES_RATE || FALLBACK_VES_RATE

  const fmtUSD = (x) => `$${Number(x || 0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`
  const fmtVES = (x) => `Bs. ${Number(x || 0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`
  const fmtCents = (cents) => {
    const baseUSD = Number(cents || 0) / 100
    if (useVES) return fmtVES(vesRate > 0 ? baseUSD * vesRate : baseUSD)
    return fmtUSD(baseUSD)
  }

  const selectedTier = useMemo(
    () => (tiers || []).find((t) => t?.id === selectedTierId),
    [tiers, selectedTierId]
  )
  const maxQty = Math.max(1, Math.min(10, Number(selectedTier?.availableQuantity ?? 10)))
  const canPay = !!selectedTierId && quantity >= 1 && quantity <= maxQty && !submitting

  // ===== Upload Receipt =====
  async function uploadReceipt(file) {
    if (!file) return
    if (file.size > 25 * 1024 * 1024) {
      alert('File too large (max 25MB)')
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

  const handleConfirm = () => {
    onPay?.(method)
  }

  return (
    <div className="popup-overlay" onClick={onClose}>
      <div className="popup-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Select Your Ticket</h3>

        {/* Method tabs */}
        <div className="method-tabs">
          {showCard && <button className={`tab ${method==='card'?'active':''}`} onClick={()=>setMethod('card')}>Card</button>}
          {showPM && <button className={`tab ${method==='pagoMovil'?'active':''}`} onClick={()=>setMethod('pagoMovil')}>Pago Móvil</button>}
          {showZelle && <button className={`tab ${method==='zelle'?'active':''}`} onClick={()=>setMethod('zelle')}>Zelle</button>}
          {showCash && <button className={`tab ${method==='cash'?'active':''}`} onClick={()=>setMethod('cash')}>Cash</button>}
        </div>

        {method !== 'card' && (
          <div className="alt-details">
            {method === 'pagoMovil' && showPM && (
              <div className="alt-box">
                {payments?.pagoMovil?.phone && <div>📱 {payments.pagoMovil.phone}</div>}
                {payments?.pagoMovil?.ci && <div>🪪 CI: {payments.pagoMovil.ci}</div>}
                {payments?.pagoMovil?.bank && <div>🏦 {payments.pagoMovil.bank}</div>}
                <div className="alt-note">After paying, upload your receipt below and press <strong>Pay</strong>.</div>

                {/* ✅ Receipt Upload Section */}
                <div className="receipt-upload">
                  <label className="receipt-label">Upload receipt (image)</label>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={uploading}
                    onChange={(e)=>{const f=e.target.files?.[0]; setReceiptFile(f); uploadReceipt(f)}}
                  />
                  {uploading && <div className="fee-hint">Uploading...</div>}
                  {receiptUrl && (
                    <div className="receipt-preview">
                      <img src={receiptUrl} alt="Receipt" style={{maxHeight:'120px',borderRadius:'8px',marginTop:'8px'}} />
                    </div>
                  )}
                </div>
              </div>
            )}

            {method === 'zelle' && showZelle && (
              <div className="alt-box">
                {payments?.zelle?.email && <div>📧 {payments.zelle.email}</div>}
                <div className="alt-note">After sending Zelle payment, upload your receipt and press <strong>Pay</strong>.</div>

                <div className="receipt-upload">
                  <label className="receipt-label">Upload receipt (image)</label>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={uploading}
                    onChange={(e)=>{const f=e.target.files?.[0]; setReceiptFile(f); uploadReceipt(f)}}
                  />
                  {uploading && <div className="fee-hint">Uploading...</div>}
                  {receiptUrl && (
                    <div className="receipt-preview">
                      <img src={receiptUrl} alt="Receipt" style={{maxHeight:'120px',borderRadius:'8px',marginTop:'8px'}} />
                    </div>
                  )}
                </div>
              </div>
            )}

            {method === 'cash' && showCash && (
              <div className="alt-box">
                {payments?.cash?.note && <div>📝 {payments.cash.note}</div>}
                <div className="alt-note">If you have proof of reservation, upload it below.</div>

                <div className="receipt-upload">
                  <label className="receipt-label">Upload receipt (optional)</label>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={uploading}
                    onChange={(e)=>{const f=e.target.files?.[0]; setReceiptFile(f); uploadReceipt(f)}}
                  />
                  {uploading && <div className="fee-hint">Uploading...</div>}
                  {receiptUrl && (
                    <div className="receipt-preview">
                      <img src={receiptUrl} alt="Receipt" style={{maxHeight:'120px',borderRadius:'8px',marginTop:'8px'}} />
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
            disabled={!canPay}
            onClick={handleConfirm}
            style={submitting?{opacity:0.6,pointerEvents:'none'}:{}}
          >
            {submitting
              ? (method==='card'?'Processing…':'Sending…')
              : (method==='card'?'Pay with card':`Pay (${method})`)}
          </button>

          {method !== 'card' && (
            <p className="pay-hint">
              Manual methods notify the organizer. You’ll get your ticket after approval.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
