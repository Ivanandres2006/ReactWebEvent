// RegisterPopup.jsx
import React, { useMemo, useState, useEffect } from 'react'
import './RegisterPopup.css'
import { fetchWithAuth, getAccessToken } from '../lib/authClient'

const API = 'https://backendevent-etce.onrender.com'
const FALLBACK_VES_RATE = 179.43
const ENV_VES_RATE = Number(import.meta?.env?.VITE_VES_PER_USD || 0)
const LS_VES_RATE = Number(localStorage.getItem('ves_rate') || 0)
const BCV_RATE_KEY = 'ves_rate_bcv'
const BCV_TS_KEY = 'ves_rate_bcv_ts'
const BCV_TTL_MS = 30 * 60 * 1000

export default function RegisterPopup({
  eventId, tiers, loading=false, error=null,
  selectedTierId, quantity, submitting=false, payments=null,
  onClose, onSelectTier, onQuantityChange, onPay
}) {
  const [method, setMethod] = useState('card')
  const [fee, setFee] = useState(null)
  const [feeLoading, setFeeLoading] = useState(false)
  const [feeHadError, setFeeHadError] = useState(false)
  const [bcvRate, setBcvRate] = useState(0)
  const [bcvSource, setBcvSource] = useState('')
  const [token, setToken] = useState(getAccessToken())
  const [message, setMessage] = useState('')

  // 🧾 Receipt upload
  const [receiptFile, setReceiptFile] = useState(null)
  const [receiptPreview, setReceiptPreview] = useState(null)
  const [receiptError, setReceiptError] = useState(null)
  const [uploadingProof, setUploadingProof] = useState(false)

  useEffect(() => {
    const onAuth = () => setToken(getAccessToken())
    window.addEventListener('auth:login', onAuth)
    return () => window.removeEventListener('auth:login', onAuth)
  }, [])

  // === Country detection ===
  const isVenezuela = useMemo(() => {
    const country = String(payments?.country || payments?.pagoMovil?.country || '').toLowerCase()
    const currency = String(payments?.currency || '').toUpperCase()
    return country === 'venezuela' || currency === 'VES' || !!payments?.pagoMovil?.enabled
  }, [payments])

  const showZelle = !!payments?.zelle?.enabled
  const showPM = !!payments?.pagoMovil?.enabled
  const showCash = !!payments?.cash?.enabled
  const showCard = !isVenezuela

  // === BCV Fetch ===
  useEffect(() => {
    let cancelled = false
    const readCache = () => {
      const cached = Number(localStorage.getItem(BCV_RATE_KEY) || 0)
      const ts = Number(localStorage.getItem(BCV_TS_KEY) || 0)
      const fresh = cached > 0 && Date.now() - ts < BCV_TTL_MS
      if (fresh) { setBcvRate(cached); setBcvSource('cache') }
      return fresh
    }
    const fetchLive = async () => {
      try {
        const res = await fetch(`${API}/api/fx/ves-per-usd`)
        if (!res.ok) return
        const json = await res.json()
        const rate = Number(json?.vesPerUsd || 0)
        if (!cancelled && rate > 0) {
          setBcvRate(rate)
          setBcvSource(json?.overrideActive ? 'override' : (json?.source || 'bcv'))
          localStorage.setItem(BCV_RATE_KEY, String(rate))
          localStorage.setItem(BCV_TS_KEY, String(Date.now()))
          localStorage.setItem('ves_rate', String(rate))
        }
      } catch {}
    }
    readCache()
    fetchLive()
    const id = setInterval(fetchLive, BCV_TTL_MS)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  useEffect(() => {
    if (!showCard && method === 'card') {
      if (showPM) setMethod('pagoMovil')
      else if (showZelle) setMethod('zelle')
      else if (showCash) setMethod('cash')
    }
  }, [showCard, showPM, showZelle, showCash])

  const useVES = method === 'pagoMovil'
  const vesRate = useMemo(() => bcvRate || ENV_VES_RATE || LS_VES_RATE || FALLBACK_VES_RATE, [bcvRate])
  const fmtUSD = (x) => `$${Number(x || 0).toFixed(2)}`
  const fmtVES = (x) => `Bs. ${Number(x || 0).toFixed(2)}`
  const fmtCents = (c) => {
    const usd = Number(c || 0) / 100
    return useVES ? fmtVES(usd * vesRate) : fmtUSD(usd)
  }

  // === Receipt Handling ===
  const handleReceiptChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setReceiptFile(file)
    setReceiptError(null)
    const reader = new FileReader()
    reader.onload = (ev) => setReceiptPreview(ev.target.result)
    reader.readAsDataURL(file)
  }
  const removeReceipt = () => {
    setReceiptFile(null)
    setReceiptPreview(null)
  }

  // === Fee Fetch ===
  useEffect(() => {
    if (!eventId || !selectedTierId || quantity < 1) return
    let cancelled = false
    const controller = new AbortController()
    const fetchFee = async () => {
      try {
        setFeeLoading(true)
        const params = new URLSearchParams({
          eventId, ticketTierId: selectedTierId, quantity, paymentMethod: method
        })
        const url = `${API}/api/tickets/quote?${params}`
        let res = await fetchWithAuth(url, { signal: controller.signal })
        if (!res.ok && res.status !== 401) res = await fetch(url)
        if (!res.ok) throw new Error()
        const data = await res.json()
        if (!cancelled) setFee(data)
      } catch { if (!cancelled) setFeeHadError(true) }
      finally { if (!cancelled) setFeeLoading(false) }
    }
    fetchFee()
    return () => { cancelled = true; controller.abort() }
  }, [eventId, selectedTierId, quantity, method, token])

  const selectedTier = useMemo(() => (tiers||[]).find(t=>t.id===selectedTierId), [tiers, selectedTierId])
  const maxQty = useMemo(() => Math.max(1, Math.min(10, selectedTier?.availableQuantity || 10)), [selectedTier])
  const canPay = !!selectedTierId && quantity>=1 && quantity<=maxQty && !submitting

  // === Proof upload helper ===
  async function uploadProof(ticketId, file) {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`${API}/api/tickets/${ticketId}/proof`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form
    })
    return res.ok
  }

  async function uploadAllProofs(ticketIds, file) {
    let success = 0
    for (const id of ticketIds) {
      const ok = await uploadProof(id, file)
      if (ok) success++
    }
    return success
  }

  // === Handle payment ===
  const handleConfirm = async () => {
    if (!canPay) return
    if ((method === 'pagoMovil' || method === 'zelle') && !receiptFile) {
      setReceiptError('Please attach your payment receipt.')
      return
    }

    setMessage('')
    try {
      const params = { eventId, ticketTierId: selectedTierId, quantity, paymentMethod: method }
      const res = await fetchWithAuth(`${API}/api/tickets/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      })
      if (!res.ok) throw new Error()
      const data = await res.json()

      // === Handle manual flow like SwiftUI ===
      if (data.manual) {
        const ticketIds = data.ticketIds || (data.ticketId ? [data.ticketId] : [])
        if (receiptFile && ticketIds.length) {
          setUploadingProof(true)
          const ok = await uploadAllProofs(ticketIds, receiptFile)
          setUploadingProof(false)
          setMessage(`📸 Receipt uploaded for ${ok}/${ticketIds.length} ticket(s).`)
        } else {
          setMessage('✅ Payment recorded. Organizer will confirm soon.')
        }
        onClose?.()
        return
      }

      // === Stripe flow ===
      if (data.clientSecret) {
        setMessage('Opening Stripe checkout...')
        await onPay?.(method, data.clientSecret)
        onClose?.()
      }
    } catch (e) {
      console.error(e)
      setMessage('Payment failed. Try again.')
    }
  }

  // === Fee rows ===
  const feeRows = useMemo(() => {
    if (!fee) return []
    const rows = []
    if (fee.originalSubtotalCents && fee.discountCentsApplied > 0) {
      rows.push({ label: 'Subtotal', value: fmtCents(fee.originalSubtotalCents) })
      const code = fee.discountCodeApplied ? ` (${fee.discountCodeApplied})` : ''
      rows.push({ label: `Discount${code}`, value: `− ${fmtCents(fee.discountCentsApplied)}` })
      rows.push({ label: 'New subtotal', value: fmtCents(fee.subtotalCents) })
    } else {
      rows.push({ label: 'Subtotal', value: fmtCents(fee.subtotalCents) })
    }
    if (fee.serviceFeeCents>0)
      rows.push({ label: 'Service fee', value: fmtCents(fee.serviceFeeCents) })
    if (method==='card' && fee.stripeFeeCents>0)
      rows.push({ label: 'Stripe fee', value: fmtCents(fee.stripeFeeCents) })
    rows.push({ label: 'Total', value: fmtCents(fee.totalCents), strong: true })
    return rows
  }, [fee, method, useVES, vesRate])

  return (
    <div className="popup-overlay" onClick={onClose}>
      <div className="popup-modal" onClick={(e)=>e.stopPropagation()}>
        <h3>Select Your Ticket</h3>

        {/* Tiers */}
        {loading ? <div className="empty-tiers">Loading...</div> :
         error ? <div className="empty-tiers">Couldn’t load tiers.</div> :
         (tiers||[]).map(t => {
          const unavailable = (t.availableQuantity||0)<=0
          return (
            <div key={t.id}
              className={`ticket-tier ${selectedTierId===t.id?'selected':''} ${unavailable?'disabled':''}`}
              onClick={()=>!unavailable && onSelectTier(t.id)}>
              <div className="tier-row">
                <div className="tier-name">{t.name}</div>
                <div className="tier-price">{fmtUSD(t.price)}</div>
              </div>
            </div>
          )
        })}

        {/* Quantity */}
        <div className="ticket-quantity">
          <label>Quantity</label>
          <input type="number" min="1" max={maxQty} value={quantity}
            onChange={e=>onQuantityChange(Math.min(maxQty,Math.max(1,parseInt(e.target.value||'1',10))))}/>
        </div>

        {/* Fees */}
        {selectedTierId && (
          <div className="fee-box">
            {feeLoading ? <div className="fee-row muted">Calculating fees…</div> :
              feeRows.map((r,i)=>(
                <div key={i} className={`fee-row ${r.strong?'total':''}`}>
                  <span>{r.label}</span><span>{r.value}</span>
                </div>
              ))
            }
          </div>
        )}

        {/* Payment tabs */}
        <div className="method-tabs">
          {showCard && <button className={`tab ${method==='card'?'active':''}`} onClick={()=>setMethod('card')}>Card</button>}
          {showPM && <button className={`tab ${method==='pagoMovil'?'active':''}`} onClick={()=>setMethod('pagoMovil')}>Pago Móvil</button>}
          {showZelle && <button className={`tab ${method==='zelle'?'active':''}`} onClick={()=>setMethod('zelle')}>Zelle</button>}
          {showCash && <button className={`tab ${method==='cash'?'active':''}`} onClick={()=>setMethod('cash')}>Cash</button>}
        </div>

        {/* Manual info */}
        {method!=='card' && (
          <div className="alt-details">
            {method==='pagoMovil' && showPM && (
              <div className="alt-box">
                {payments?.pagoMovil?.phone && <div>📱 {payments.pagoMovil.phone}</div>}
                {payments?.pagoMovil?.ci && <div>🪪 CI: {payments.pagoMovil.ci}</div>}
                {payments?.pagoMovil?.bank && <div>🏦 {payments.pagoMovil.bank}</div>}
                <div className="alt-note">After paying, attach receipt and press Pay.</div>
              </div>
            )}
            {method==='zelle' && showZelle && (
              <div className="alt-box">
                {payments?.zelle?.email && <div>📧 {payments.zelle.email}</div>}
                {payments?.zelle?.phone && <div>📞 {payments.zelle.phone}</div>}
                <div className="alt-note">After paying, attach receipt and press Pay.</div>
              </div>
            )}
            {method==='cash' && showCash && (
              <div className="alt-box">
                {payments?.cash?.note && <div>📝 {payments.cash.note}</div>}
                <div className="alt-note">Press Pay to notify organizer.</div>
              </div>
            )}

            {(method==='pagoMovil'||method==='zelle') && (
              <div className="receipt-upload">
                {receiptPreview ? (
                  <div className="receipt-preview">
                    <img src={receiptPreview} alt="Receipt" />
                    <button onClick={removeReceipt} className="remove-receipt">✕</button>
                  </div>
                ) : (
                  <label className="upload-btn">
                    <input type="file" accept="image/*" onChange={handleReceiptChange} hidden />
                    Attach Receipt
                  </label>
                )}
                {receiptError && <div style={{color:'red',fontSize:12}}>{receiptError}</div>}
              </div>
            )}
          </div>
        )}

        {/* Pay Button */}
        <div className="pay-buttons">
          <button className="buy-button" disabled={!canPay||uploadingProof} onClick={handleConfirm}>
            {uploadingProof ? 'Uploading…' : (method==='card'?'Pay with card':`Pay (${method})`)}
          </button>
          {method!=='card' && <p className="pay-hint">You’ll get your ticket after organizer confirmation.</p>}
        </div>

        {message && <div className="fee-hint" style={{marginTop:8}}>{message}</div>}
      </div>
    </div>
  )
}
