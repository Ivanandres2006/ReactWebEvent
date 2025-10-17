// components/RegisterPopup.jsx
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
  onClose, onSelectTier, onQuantityChange,
  onPay,
}) {
  const [method, setMethod] = useState('card')

  const [fee, setFee] = useState(null)
  const [feeLoading, setFeeLoading] = useState(false)
  const [feeHadError, setFeeHadError] = useState(false)

  // Discount state
  const [discountCode, setDiscountCode] = useState('')
  const [discountMessage, setDiscountMessage] = useState(null)
  const [lastAppliedCode, setLastAppliedCode] = useState(null)

  // Receipt state (manual methods)
  const [receiptFile, setReceiptFile] = useState(null)
  const [receiptPreview, setReceiptPreview] = useState('')
  const [receiptError, setReceiptError] = useState('')

  // Live BCV
  const [bcvRate, setBcvRate] = useState(0)
  const [bcvSource, setBcvSource] = useState('') // 'override' | 'bcv' | 'cache' | ''

  // Re-read token when login happens in modal
  const [token, setToken] = useState(getAccessToken())
  useEffect(() => {
    const onAuth = () => setToken(getAccessToken())
    window.addEventListener('auth:login', onAuth)
    return () => window.removeEventListener('auth:login', onAuth)
  }, [])

  // clean preview URL
  useEffect(() => {
    return () => { if (receiptPreview) URL.revokeObjectURL(receiptPreview) }
  }, [receiptPreview])

  // Detect Venezuela -> hide Card
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

  // Fetch BCV live
  useEffect(() => {
    let cancelled = false
    let intervalId

    const isBadCache = (val) =>
      val === FALLBACK_VES_RATE || (ENV_VES_RATE > 0 && val === ENV_VES_RATE)

    const readCacheFresh = () => {
      const cached = Number(localStorage.getItem(BCV_RATE_KEY) || 0)
      const ts = Number(localStorage.getItem(BCV_TS_KEY) || 0)
      const fresh = cached > 0 && Date.now() - ts < BCV_TTL_MS && !isBadCache(cached)
      if (fresh) {
        setBcvRate(cached)
        setBcvSource('cache')
      } else {
        localStorage.removeItem(BCV_RATE_KEY)
        localStorage.removeItem(BCV_TS_KEY)
      }
      return fresh
    }

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
          localStorage.setItem('ves_rate', String(rate)) // legacy compat
        }
      } catch { /* ignore */ }
    }

    const onFocus = () => { fetchLive() }
    const onStorage = (e) => {
      if (e.key === BCV_RATE_KEY && e.newValue) {
        const n = Number(e.newValue)
        if (Number.isFinite(n) && n > 0) {
          setBcvRate(n)
          setBcvSource('cache')
        }
      }
    }

    readCacheFresh()
    fetchLive()
    intervalId = window.setInterval(fetchLive, BCV_TTL_MS)
    window.addEventListener('focus', onFocus)
    window.addEventListener('storage', onStorage)

    return () => {
      cancelled = true
      if (intervalId) window.clearInterval(intervalId)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  // Auto-switch off card in VE
  useEffect(() => {
    if (!showCard && method === 'card') {
      if (showPM) setMethod('pagoMovil')
      else if (showZelle) setMethod('zelle')
      else if (showCash) setMethod('cash')
    }
  }, [showCard, showPM, showZelle, showCash, method])

  // Currency helpers
  const useVES = method === 'pagoMovil'

  const incomingRate = useMemo(() => {
    if (method === 'pagoMovil') {
      if (Number.isFinite(bcvRate) && bcvRate > 0) return bcvRate
      const fromFeePM = fee && Number(fee?.fxVesPerUsd)
      if (Number.isFinite(fromFeePM) && fromFeePM > 0) return fromFeePM
    } else {
      const fromFee = fee && Number(fee?.fxVesPerUsd)
      if (Number.isFinite(fromFee) && fromFee > 0) return fromFee
      if (Number.isFinite(bcvRate) && bcvRate > 0) return bcvRate
    }
    const organizer = payments?.pagoMovil && Number(payments.pagoMovil.rate)
    if (Number.isFinite(organizer) && organizer > 0) return organizer
    if (ENV_VES_RATE > 0) return ENV_VES_RATE
    if (LS_VES_RATE  > 0) return LS_VES_RATE
    return FALLBACK_VES_RATE
  }, [fee, bcvRate, payments, method])

  const vesRate = useMemo(() => {
    if (fee?.currency?.toUpperCase?.() === 'VES') return 1
    return Math.max(0, Number(incomingRate) || 0)
  }, [fee?.currency, incomingRate])

  const fmtUSD = (x) =>
    `$${Number(x || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const fmtVES = (x) =>
    `Bs. ${Number(x || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const fmtCents = (cents) => {
    const baseUSD = Number(cents || 0) / 100
    if (fee?.currency?.toUpperCase?.() === 'VES') return fmtVES(baseUSD)
    if (useVES) return fmtVES(vesRate > 0 ? baseUSD * vesRate : baseUSD)
    return fmtUSD(baseUSD)
  }

  const fmtUnitPrice = (usdNumber) => {
    const usd = Number(usdNumber || 0)
    if (fee?.currency?.toUpperCase?.() === 'VES') return fmtVES(usd)
    if (useVES) return fmtVES(vesRate > 0 ? usd * vesRate : usd)
    return fmtUSD(usd)
  }

  const splitDescription = (txt) =>
    !txt ? [] : [...new Set(
      txt.split(/[\n•;]| - |\u2022/g)
         .map(s => s.replace(/^[-•\u2022]\s*/, '').trim())
         .filter(Boolean)
    )]

  // Availability helpers
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

  // require receipt for these
  const needsReceipt = method === 'zelle' || method === 'pagoMovil'

  const canPay =
    !!selectedTierId && quantity >= 1 && quantity <= maxQty && !selectedDisabled && !submitting

  const methodPretty =
    method === 'pagoMovil' ? 'Pago Móvil'
    : method === 'zelle'   ? 'Zelle'
    : method === 'cash'    ? 'Cash'
    : 'card'

  const handleConfirm = () => {
    if (!canPay) return
    if (needsReceipt && !receiptFile) {
      setReceiptError('Please attach the receipt image.')
      return
    }
    onPay?.(method, { discountCode: discountCode.trim() || null, receiptFile: receiptFile || null })
  }

  // Fee quote fetch (auth + retry-once logic)
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
        const sel = (tiers || []).find(t => t?.id === selectedTierId)
        const unitPriceCents = Math.round(Number(sel?.price || 0) * 100) // send unit price like iOS

        const params = new URLSearchParams({
          eventId: String(eventId),
          ticketTierId: String(selectedTierId),
          quantity: String(quantity),
          paymentMethod: method,
          unitPriceCents: String(unitPriceCents),
        })
        if (discountCode.trim()) params.append('discountCode', discountCode.trim().toUpperCase())

        const url = `${API}/api/tickets/quote?${params.toString()}`
        let res = await fetchWithAuth(url, { method: 'GET', signal: controller.signal })
        if (!res.ok && res.status !== 401) {
          res = await fetch(url, { method: 'GET', signal: controller.signal })
        }
        if (!res.ok) throw new Error(`fee ${res.status}`)
        const data = await res.json()
        if (!cancelled) {
          setFee(data || null)
          setDiscountMessage(data?.discountMessage || null)
          setLastAppliedCode(data?.discountCodeApplied || null)
        }
      } catch {
        if (!cancelled) { setFee(null); setFeeHadError(true) }
      } finally {
        if (!cancelled) setFeeLoading(false)
      }
    }
    fetchFee()
    return () => { cancelled = true; controller.abort() }
    // Re-quote when effective FX changes for Pago Móvil
  }, [eventId, selectedTierId, quantity, method, token, discountCode, (method === 'pagoMovil' ? bcvRate : undefined)])

  // Fee rows (with discount + platform fee)
  const feeRows = useMemo(() => {
    const rows = []
    const hasLive = !!fee && typeof fee.totalCents === 'number'
    const priceUSD = Number(selectedTier?.price ?? 0)

    if (hasLive) {
      const qtyText = selectedTier ? `${selectedTier.name} ×${quantity}` : 'Subtotal'

      if (typeof fee.originalSubtotalCents === 'number' && fee.originalSubtotalCents > 0 &&
          typeof fee.discountCentsApplied === 'number' && fee.discountCentsApplied > 0) {
        rows.push({ label: `${qtyText} (subtotal)`, value: fmtCents(fee.originalSubtotalCents), strong: false })
        rows.push({
          label: `Discount${(lastAppliedCode || discountCode) ? ` (${(lastAppliedCode || discountCode).toUpperCase()})` : ''}`,
          value: '− ' + fmtCents(fee.discountCentsApplied),
          strong: false
        })
        rows.push({ label: 'New subtotal', value: fmtCents(fee.subtotalCents), strong: false })
      } else {
        if (typeof fee.subtotalCents === 'number')
          rows.push({ label: qtyText, value: fmtCents(fee.subtotalCents), strong: false })
      }

      if (typeof fee.platformFeeCents === 'number' && fee.platformFeeCents > 0)
        rows.push({ label: 'Platform fee', value: fmtCents(fee.platformFeeCents), strong: false })

      if (method === 'card' && typeof fee.stripeFeeCents === 'number' && fee.stripeFeeCents > 0)
        rows.push({ label: 'Stripe fee', value: fmtCents(fee.stripeFeeCents), strong: false })

      if (typeof fee.serviceFeeCents === 'number' && fee.serviceFeeCents > 0)
        rows.push({ label: 'Service fee', value: fmtCents(fee.serviceFeeCents), strong: false })

      rows.push({ label: 'Total', value: fmtCents(fee.totalCents), strong: true })
      return { rows, isEstimate: false }
    }

    const subtotalCents = Math.round(priceUSD * 100 * quantity)
    rows.push({ label: selectedTier ? `${selectedTier.name} ×${quantity}` : 'Subtotal', value: fmtCents(subtotalCents), strong: false })
    rows.push({ label: 'Total (est.)', value: fmtCents(subtotalCents), strong: true })
    return { rows, isEstimate: true }
  }, [fee, selectedTier, quantity, method, useVES, vesRate, lastAppliedCode, discountCode])

  // Receipt selection/removal
  const onReceiptPick = (file) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setReceiptError('Only image files are allowed.')
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      setReceiptError('Image too large (max 8MB).')
      return
    }
    setReceiptError('')
    setReceiptFile(file)
    if (receiptPreview) URL.revokeObjectURL(receiptPreview)
    setReceiptPreview(URL.createObjectURL(file))
  }
  const removeReceipt = () => {
    setReceiptFile(null)
    if (receiptPreview) URL.revokeObjectURL(receiptPreview)
    setReceiptPreview('')
    setReceiptError('')
  }

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
              <div
                key={tier.id}
                className={['ticket-tier','rich',selected?'selected':'',unavailable?'disabled':''].join(' ').trim()}
                onClick={()=>{ if(!unavailable) onSelectTier(tier.id) }}
              >
                <div className="tier-row">
                  <div className="tier-name">{tier.name}</div>
                  <div className="tier-price">{fmtUnitPrice(tier.price)}</div>
                </div>
                {desc.length>0 && <ul className="tier-desc">{desc.map((li,i)=><li key={i}>{li}</li>)}</ul>}
                <div className="tier-meta">
                  <span className="chip">{availabilityText(tier)}</span>
                  {hasWindow(tier) && <span className="chip light">🕒 {fmtWindow(tier)}</span>}
                  {isLockedByOrder(tier)&&!tier.forceOpen&&!isSoldOut(tier)&&!hasNotStarted(tier,Date.now())&&!hasEnded(tier,Date.now()) && (
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
          <label>Quantity</label>
          <input
            type="number" min="1" max={maxQty} step="1" value={quantity}
            onChange={(e)=>{ const n=parseInt(e.target.value||'1',10); const clamped=isNaN(n)?1:Math.max(1,Math.min(maxQty,n)); onQuantityChange(clamped) }}
            onBlur={(e)=>{ const n=parseInt(e.target.value||'1',10); const clamped=isNaN(n)?1:Math.max(1,Math.min(maxQty,n)); if(clamped!==quantity) onQuantityChange(clamped) }}
          />
        </div>

        {/* Discount code */}
        <div className="ticket-quantity" style={{marginTop:8}}>
          <label>Discount</label>
          <div style={{display:'flex', gap:8, width:'100%'}}>
            <input
              type="text"
              placeholder="CODE"
              value={discountCode}
              onChange={e=>setDiscountCode(e.target.value)}
              style={{flex:1}}
            />
            <button
              className="tab"
              disabled={!discountCode.trim()}
              onClick={()=> setDiscountCode(discountCode.trim().toUpperCase())}
            >
              Apply
            </button>
            {!!discountCode && (
              <button
                className="tab"
                onClick={()=>{ setDiscountCode(''); setLastAppliedCode(null); setDiscountMessage(null); }}
              >
                Clear
              </button>
            )}
          </div>
          {!!discountMessage && <div className="fee-hint">{discountMessage}</div>}
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
                  <div className="fee-hint">Showing estimate. Final fees will appear at checkout.</div>
                )}
                {method === 'pagoMovil' && (fee?.currency?.toUpperCase?.() !== 'VES') && vesRate > 0 && (
                  <div className="fee-hint">
                    {bcvSource === 'override'
                      ? `Override ${vesRate.toLocaleString(undefined,{ maximumFractionDigits: 6 })} Bs/USD`
                      : (bcvSource === 'bcv' || bcvSource === 'cache')
                        ? `BCV ${vesRate.toLocaleString(undefined,{ maximumFractionDigits: 6 })} Bs/USD`
                        : `Converted at ${vesRate} Bs/USD.`}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Method tabs */}
        <div className="method-tabs">
          {showCard && (
            <button className={`tab ${method==='card' ? 'active' : ''}`} onClick={() => setMethod('card')} disabled={!canPay && method!=='card'}>
              Card
            </button>
          )}
          {showPM && (
            <button className={`tab ${method==='pagoMovil' ? 'active' : ''}`} onClick={() => setMethod('pagoMovil')} disabled={!canPay && method!=='pagoMovil'}>
              Pago Móvil
            </button>
          )}
          {showZelle && (
            <button className={`tab ${method==='zelle' ? 'active' : ''}`} onClick={() => setMethod('zelle')} disabled={!canPay && method!=='zelle'}>
              Zelle
            </button>
          )}
          {showCash && (
            <button className={`tab ${method==='cash' ? 'active' : ''}`} onClick={() => setMethod('cash')} disabled={!canPay && method!=='cash'}>
              Cash
            </button>
          )}
        </div>

        {method !== 'card' && (
          <div className="alt-details">
            {method === 'pagoMovil' && showPM && (
              <div className="alt-box">
                {payments?.pagoMovil?.phone && <div>📱 {payments.pagoMovil.phone}</div>}
                {payments?.pagoMovil?.ci    && <div>🪪 CI: {payments.pagoMovil.ci}</div>}
                {payments?.pagoMovil?.bank  && <div>🏦 {payments.pagoMovil.bank}</div>}
                <div className="alt-note">After paying via Pago Móvil, press <strong>Pay</strong> to notify the organizer.</div>
              </div>
            )}
            {method === 'zelle' && showZelle && (
              <div className="alt-box">
                {payments?.zelle?.email && <div>📧 {payments.zelle.email}</div>}
                {payments?.zelle?.phone && <div>📞 {payments.zelle.phone}</div>}
                <div className="alt-note">After sending your Zelle payment, press <strong>Pay</strong> to notify the organizer.</div>
              </div>
            )}
            {method === 'cash' && showCash && (
              <div className="alt-box">
                {payments?.cash?.note && <div>📝 {payments.cash.note}</div>}
                <div className="alt-note">Press <strong>Pay</strong> to notify the organizer that you’ll pay in cash.</div>
              </div>
            )}

            {/* Receipt uploader (Zelle/Pago Móvil) */}
            {(method === 'zelle' || method === 'pagoMovil') && (
              <div className="receipt-upload">
                <label className="receipt-label">Attach receipt (image)</label>
                {!receiptFile ? (
                  <input
                    type="file"
                    accept="image/*"
                    onChange={e => onReceiptPick(e.target.files?.[0])}
                  />
                ) : (
                  <div className="receipt-preview">
                    {receiptPreview && <img src={receiptPreview} alt="Receipt preview" />}
                    <button className="remove-receipt" onClick={removeReceipt}>×</button>
                  </div>
                )}
                {!!receiptError && <div className="error-text">{receiptError}</div>}
              </div>
            )}
          </div>
        )}

        <div className="pay-buttons">
          <button
            className="buy-button"
            disabled={!canPay || (needsReceipt && !receiptFile)}
            onClick={handleConfirm}
            style={submitting ? { pointerEvents: 'none', opacity: 0.6 } : {}}
          >
            {submitting
              ? (method==='card' ? 'Processing…' : 'Sending…')
              : (method==='card' ? 'Pay with card' : `Pay (${methodPretty})`)}
          </button>

          {method !== 'card' && (
            <p className="pay-hint">
              {needsReceipt ? 'Please attach the receipt image before paying.' : 'Manual methods notify the organizer. You’ll get your ticket by email after they confirm.'}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
