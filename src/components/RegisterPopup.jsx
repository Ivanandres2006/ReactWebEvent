// RegisterPopup.jsx
import React, { useMemo, useState, useEffect } from 'react'
import './RegisterPopup.css'

const API = 'https://backendevent-etce.onrender.com'

// Optional fallback sources for a VES rate
const ENV_VES_RATE = Number(import.meta?.env?.VITE_VES_PER_USD || 0)
const LS_VES_RATE  = Number(localStorage.getItem('ves_rate') || 0)

function getValidTokenFromLS() {
  const t = localStorage.getItem('token') || ''
  if (!t || t === 'undefined') return null
  try {
    const [, b] = t.split('.')
    if (!b) return t
    const payload = JSON.parse(atob(b.replace(/-/g, '+').replace(/_/g, '/')))
    if (payload?.exp && Date.now() >= payload.exp * 1000) return null
  } catch {}
  return t
}
function useAuthToken() {
  const [tok, setTok] = useState(getValidTokenFromLS())
  useEffect(() => {
    const onFocus = () => setTok(getValidTokenFromLS())
    const onAuth = () => setTok(getValidTokenFromLS())
    window.addEventListener('focus', onFocus)
    window.addEventListener('auth:login', onAuth)
    return () => { window.removeEventListener('focus', onFocus); window.removeEventListener('auth:login', onAuth) }
  }, [])
  return tok
}

export default function RegisterPopup({
  eventId, tiers, loading=false, error=null,
  selectedTierId, quantity, submitting=false, payments=null,
  onClose, onSelectTier, onQuantityChange, onPay,
}) {
  const [method, setMethod] = useState('card')

  // fee state
  const [fee, setFee] = useState(null)
  const [feeLoading, setFeeLoading] = useState(false)
  const [feeHadError, setFeeHadError] = useState(false)

  const token = useAuthToken()

  // ====== currency / formatting ======
  // Possible VES rate inputs
  const incomingRate =
    (fee && Number(fee.fxVesPerUsd)) ||
    (payments?.pagoMovil && Number(payments.pagoMovil.rate)) ||
    ENV_VES_RATE || LS_VES_RATE || 0

  // ⬇️ Force VES display whenever Pago Móvil is selected
  const useVES = method === 'pagoMovil'

  // Effective rate (0 means "no conversion available")
  const vesRate = useMemo(() => {
    if (fee?.currency?.toUpperCase?.() === 'VES') return 1
    return incomingRate > 0 ? incomingRate : 0
  }, [fee?.currency, incomingRate])

  const fmtUSD = (amount) =>
    `$${Number(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const fmtVES = (amount) =>
    `Bs. ${Number(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  // Convert "USD cents" to display string (Bs for Pago Móvil)
  const fmtCents = (cents) => {
    const base = Number(cents || 0) / 100 // USD amount
    // If backend already says VES, treat numeric value as VES base units
    if (fee?.currency?.toUpperCase?.() === 'VES') return fmtVES(base)
    // Pago Móvil -> always show Bs.
    if (useVES) {
      if (vesRate > 0) return fmtVES(base * vesRate) // convert
      return fmtVES(base) // fallback: show same numeric amount but in Bs.
    }
    // Other methods -> USD
    return fmtUSD(base)
  }

  // Format a USD unit price according to active method (Pago Móvil -> Bs.)
  const fmtUnitPrice = (usdNumber) => {
    const usd = Number(usdNumber || 0)
    if (fee?.currency?.toUpperCase?.() === 'VES') return fmtVES(usd)
    if (useVES) {
      if (vesRate > 0) return fmtVES(usd * vesRate)
      return fmtVES(usd) // fallback when no rate available
    }
    return fmtUSD(usd)
  }

  const splitDescription = (txt) =>
    !txt ? [] : [...new Set(txt.split(/[\n•;]| - |\u2022/g)
      .map(s => s.replace(/^[-•\u2022]\s*/, '').trim()).filter(Boolean))]

  // ====== availability / selection ======
  const isSoldOut = t => Number(t?.availableQuantity ?? 0) <= 0
  const hasNotStarted = (t, now) => (t?.startTime ? now < new Date(t.startTime) : false)
  const hasEnded = (t, now) => (t?.endTime ? now > new Date(t.endTime) : false)
  const isLockedByTime = (t, now) => (!t?.forceOpen && hasNotStarted(t, now)) || hasEnded(t, now)
  const nextAvailableTierId = (list) => {
    const now = Date.now()
    const sorted = (list || []).slice().sort((a, b) => (a.tierOrder ?? 0) - (b.tierOrder ?? 0))
    for (const t of sorted) if (!isSoldOut(t) && !isLockedByTime(t, now)) return t.id
    return null
  }
  const nextId = useMemo(() => nextAvailableTierId(tiers || []), [tiers])
  const isLockedByOrder = (t) => {
    const force = !!t?.forceOpen
    if (force) return false
    if (nextId == null) return false
    return t.id !== nextId
  }
  const isUnavailable = (t) => {
    const now = Date.now()
    return isSoldOut(t) || isLockedByTime(t, now) || isLockedByOrder(t)
  }
  const hasWindow = (t) => !!t?.startTime && !!t?.endTime
  const fmtWindow = (t) => {
    const s = t?.startTime ? new Date(t.startTime) : null
    const e = t?.endTime ? new Date(t.endTime) : null
    const opts = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }
    return s && e ? `${s.toLocaleString(undefined, opts)} – ${e.toLocaleString(undefined, opts)}` : ''
  }
  const availabilityText = (t) => {
    if (isSoldOut(t)) return '❌ Sold out'
    if (hasNotStarted(t, Date.now()) && !t?.forceOpen) return '⏰ Not yet available'
    const qty = Number(t?.availableQuantity ?? 0)
    const hide = !!t?.hideQuantity
    return hide ? 'Available' : `${qty} left`
  }

  const selectedTier = useMemo(
    () => (tiers || []).find((t) => t?.id === selectedTierId),
    [tiers, selectedTierId]
  )

  // quantity clamp
  const maxQty = useMemo(() => {
    const tierLeft = Number(selectedTier?.availableQuantity ?? 10)
    return Math.max(1, Math.min(10, tierLeft))
  }, [selectedTier])
  useEffect(() => {
    if (quantity > maxQty) onQuantityChange(maxQty)
    else if (quantity < 1) onQuantityChange(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxQty])

  const selectedDisabled = useMemo(
    () => (selectedTier ? isUnavailable(selectedTier) : false),
    [selectedTier]
  )

  const canPay =
    !!selectedTierId && quantity >= 1 && quantity <= maxQty && !selectedDisabled && !submitting

  const showZelle = !!payments?.zelle?.enabled
  const showPM = !!payments?.pagoMovil?.enabled
  const showCash = !!payments?.cash?.enabled

  const methodPretty =
    method === 'pagoMovil' ? 'Pago Móvil' : method === 'zelle' ? 'Zelle' : method === 'cash' ? 'Cash' : 'card'

  const handleConfirm = () => { if (canPay) onPay?.(method) }

  // === Fee quote fetch (works with/without login)
  useEffect(() => {
    setFeeHadError(false)

    if (!eventId || !selectedTierId || quantity < 1) {
      setFee(null); setFeeLoading(false)
      return
    }

    let cancelled = false
    const controller = new AbortController()

    const fetchFee = async () => {
      try {
        setFeeLoading(true)
        const params = new URLSearchParams({
          eventId: String(eventId),
          ticketTierId: String(selectedTierId),
          quantity: String(quantity),
          paymentMethod: method,
        })
        const url = `${API}/api/tickets/quote?${params.toString()}`

        const headers = token ? { Authorization: `Bearer ${token}` } : undefined
        let res = await fetch(url, { method: 'GET', headers, signal: controller.signal })
        if (res.status === 401 && headers) {
          res = await fetch(url, { method: 'GET', signal: controller.signal })
        }

        if (!res.ok) throw new Error(`fee ${res.status}`)
        const data = await res.json()
        if (!cancelled) setFee(data || null)
      } catch {
        if (!cancelled) { setFee(null); setFeeHadError(true) }
      } finally {
        if (!cancelled) setFeeLoading(false)
      }
    }

    fetchFee()
    return () => { cancelled = true; controller.abort() }
  }, [eventId, selectedTierId, quantity, method, token])

  // Build rows (now always Bs. for Pago Móvil)
  const feeRows = useMemo(() => {
    const rows = []
    const hasLive = !!fee && typeof fee.totalCents === 'number'
    const priceUSD = Number(selectedTier?.price ?? 0)

    if (hasLive) {
      const qtyText = selectedTier ? `${selectedTier.name} ×${quantity}` : 'Subtotal'
      if (typeof fee.subtotalCents === 'number') rows.push({ label: qtyText, value: fmtCents(fee.subtotalCents), strong: false })
      if (typeof fee.serviceFeeCents === 'number' && fee.serviceFeeCents > 0) rows.push({ label: 'Service fee', value: fmtCents(fee.serviceFeeCents), strong: false })
      if (method === 'card' && typeof fee.stripeFeeCents === 'number' && fee.stripeFeeCents > 0) rows.push({ label: 'Stripe fee', value: fmtCents(fee.stripeFeeCents), strong: false })
      if (typeof fee.platformFeeCents === 'number' && fee.platformFeeCents > 0) rows.push({ label: 'Platform fee', value: fmtCents(fee.platformFeeCents), strong: false })
      rows.push({ label: 'Total', value: fmtCents(fee.totalCents), strong: true })
      return { rows, isEstimate: false }
    }

    // Fallback: subtotal from tier price
    const subtotalCents = Math.round(priceUSD * 100 * quantity)
    rows.push({ label: selectedTier ? `${selectedTier.name} ×${quantity}` : 'Subtotal', value: fmtCents(subtotalCents), strong: false })
    rows.push({ label: 'Total (est.)', value: fmtCents(subtotalCents), strong: true })
    return { rows, isEstimate: true }
  }, [fee, selectedTier, quantity, method, useVES, vesRate])

  return (
    <div className="popup-overlay" onClick={onClose}>
      <div className="popup-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Select Your Ticket</h3>

        {loading ? (
          <div className="empty-tiers">Loading tiers…</div>
        ) : error ? (
          <div className="empty-tiers">Couldn’t load tiers. Try again.</div>
        ) : tiers?.length ? (
          tiers.slice().sort((a,b)=>(a.tierOrder??0)-(b.tierOrder??0)).map((tier)=>{
            const selected = selectedTierId === tier.id
            const unavailable = isUnavailable(tier)
            const desc = splitDescription(tier.description)
            return (
              <div key={tier.id}
                   className={['ticket-tier','rich',selected?'selected':'',unavailable?'disabled':''].join(' ').trim()}
                   onClick={()=>{ if(!unavailable) onSelectTier(tier.id) }}>
                <div className="tier-row">
                  <div className="tier-name">{tier.name}</div>
                  <div className="tier-price">{fmtUnitPrice(tier.price)}</div>
                </div>
                {desc.length>0 && <ul className="tier-desc">{desc.map((li,i)=><li key={i}>{li}</li>)}</ul>}
                <div className="tier-meta">
                  <span className="chip">{availabilityText(tier)}</span>
                  {hasWindow(tier)&&<span className="chip light">🕒 {fmtWindow(tier)}</span>}
                  {isLockedByOrder(tier)&&!tier.forceOpen&&!isSoldOut(tier)&&!hasNotStarted(tier,Date.now())&&!hasEnded(tier,Date.now())&&(
                    <span className="chip warn">Next tier not open</span>
                  )}
                </div>
              </div>
            )
          })
        ) : (
          <div className="empty-tiers">No tiers available.</div>
        )}

        <div className="ticket-quantity">
          <label>Quantity <span style={{opacity:0.6,marginLeft:6}}>(max {maxQty})</span></label>
          <input type="number" min="1" max={maxQty} step="1" value={quantity}
                 onChange={(e)=>{ const n=parseInt(e.target.value||'1',10); const clamped=isNaN(n)?1:Math.max(1,Math.min(maxQty,n)); onQuantityChange(clamped) }}
                 onBlur={(e)=>{ const n=parseInt(e.target.value||'1',10); const clamped=isNaN(n)?1:Math.max(1,Math.min(maxQty,n)); if(clamped!==quantity) onQuantityChange(clamped) }}
          />
        </div>

        {/* Fee box */}
        {selectedTierId && quantity >= 1 && (
          <div className="fee-box" aria-live="polite">
            {feeLoading ? (
              <div className="fee-row muted">Calculating fees…</div>
            ) : (
              <>
                {feeRows.rows.slice(0,-1).map((r,idx)=>(
                  <div className="fee-row" key={idx}>
                    <span className="fee-label">{r.label}</span>
                    <span className="fee-value">{r.value}</span>
                  </div>
                ))}
                <div className="fee-divider" />
                {feeRows.rows.slice(-1).map((r,idx)=>(
                  <div className={`fee-row ${r.strong ? 'total' : ''}`} key={`t-${idx}`}>
                    <span className="fee-label">{r.label}</span>
                    <span className="fee-value">{r.value}</span>
                  </div>
                ))}
                {feeHadError && (
                  <div className="fee-hint">
                    Showing estimate. Final fees will appear at checkout.
                  </div>
                )}
                {method === 'pagoMovil' && (fee?.currency?.toUpperCase?.() !== 'VES') && vesRate > 0 && (
                  <div className="fee-hint">Converted at {vesRate} Bs/USD.</div>
                )}
              </>
            )}
          </div>
        )}

        {/* Method tabs */}
        <div className="method-tabs">
          <button className={`tab ${method==='card' ? 'active' : ''}`} onClick={() => setMethod('card')} disabled={!canPay && method!=='card'}>Card</button>
          {!!payments?.pagoMovil?.enabled && <button className={`tab ${method==='pagoMovil' ? 'active' : ''}`} onClick={() => setMethod('pagoMovil')} disabled={!canPay && method!=='pagoMovil'}>Pago Móvil</button>}
          {!!payments?.zelle?.enabled && <button className={`tab ${method==='zelle' ? 'active' : ''}`} onClick={() => setMethod('zelle')} disabled={!canPay && method!=='zelle'}>Zelle</button>}
          {!!payments?.cash?.enabled && <button className={`tab ${method==='cash' ? 'active' : ''}`} onClick={() => setMethod('cash')} disabled={!canPay && method!=='cash'}>Cash</button>}
        </div>

        {method !== 'card' && (
          <div className="alt-details">
            {method === 'pagoMovil' && payments?.pagoMovil?.enabled && (
              <div className="alt-box">
                {payments.pagoMovil.phone && <div>📱 {payments.pagoMovil.phone}</div>}
                {payments.pagoMovil.ci && <div>🪪 CI: {payments.pagoMovil.ci}</div>}
                {payments.pagoMovil.bank && <div>🏦 {payments.pagoMovil.bank}</div>}
                <div className="alt-note">After paying via Pago Móvil, press <strong>Pay</strong> to notify the organizer.</div>
              </div>
            )}
            {method === 'zelle' && payments?.zelle?.enabled && (
              <div className="alt-box">
                {payments.zelle.email && <div>📧 {payments.zelle.email}</div>}
                {payments.zelle.phone && <div>📞 {payments.zelle.phone}</div>}
                <div className="alt-note">After sending your Zelle payment, press <strong>Pay</strong> to notify the organizer.</div>
              </div>
            )}
            {method === 'cash' && payments?.cash?.enabled && (
              <div className="alt-box">
                {payments.cash.note && <div>📝 {payments.cash.note}</div>}
                <div className="alt-note">Press <strong>Pay</strong> to notify the organizer that you’ll pay in cash.</div>
              </div>
            )}
          </div>
        )}

        <div className="pay-buttons">
          <button className="buy-button" disabled={!canPay} onClick={handleConfirm}
                  style={submitting ? { pointerEvents: 'none', opacity: 0.6 } : {}}>
            {submitting ? (method==='card' ? 'Processing…' : 'Sending…')
                        : (method==='card' ? 'Pay with card' : `Pay (${methodPretty})`)}
          </button>
          {method !== 'card' && (
            <p className="pay-hint">
              Manual methods notify the organizer. You’ll get your ticket by email after they confirm.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
