import React, { useMemo, useState, useEffect } from 'react'
import './RegisterPopup.css'

const API = 'https://backendevent-etce.onrender.com'

// ---- tiny helpers to read/refresh token ----
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
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('auth:login', onAuth)
    }
  }, [])
  return tok
}

export default function RegisterPopup({
  eventId,
  tiers,
  loading = false,
  error = null,
  selectedTierId,
  quantity,
  submitting = false,
  payments = null,
  onClose,
  onSelectTier,
  onQuantityChange,
  onPay,
}) {
  const [method, setMethod] = useState('card')

  // --- Fee state ---
  const [fee, setFee] = useState(null)
  const [feeLoading, setFeeLoading] = useState(false)
  const [feeAuthNeeded, setFeeAuthNeeded] = useState(false)
  const [feeHadError, setFeeHadError] = useState(false)

  const token = useAuthToken()

  const fmtPrice = (n) => `$${Number(n || 0).toFixed(2)}`
  const centsToUSD = (c) => `$${((Number(c || 0)) / 100).toFixed(2)}`
  const usdToCents = (n) => Math.round(Number(n || 0) * 100)

  const splitDescription = (txt) =>
    !txt ? [] : [...new Set(
      txt.split(/[\n•;]| - |\u2022/g)
         .map((s) => s.replace(/^[-•\u2022]\s*/, '').trim())
         .filter(Boolean)
    )]

  // ---------- Availability helpers ----------
  const isSoldOut      = (t) => Number(t?.availableQuantity ?? 0) <= 0
  const hasNotStarted  = (t, now) => (t?.startTime ? now < new Date(t.startTime) : false)
  const hasEnded       = (t, now) => (t?.endTime ? now > new Date(t.endTime) : false)
  const isLockedByTime = (t, now) => {
    const force = !!t?.forceOpen
    const startLocked = !force && hasNotStarted(t, now)
    const endLocked   = hasEnded(t, now)
    return startLocked || endLocked
  }

  const nextAvailableTierId = (list) => {
    const now = Date.now()
    const sorted = (list || []).slice().sort((a, b) => (a.tierOrder ?? 0) - (b.tierOrder ?? 0))
    for (const t of sorted) {
      if (!isSoldOut(t) && !isLockedByTime(t, now)) return t.id
    }
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

  // ----- Quantity cap: min(10, tier stock), auto-clamp -----
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
    !!selectedTierId &&
    quantity >= 1 &&
    quantity <= maxQty &&
    !selectedDisabled &&
    !submitting

  const showZelle = !!payments?.zelle?.enabled
  const showPM = !!payments?.pagoMovil?.enabled
  const showCash = !!payments?.cash?.enabled

  const methodPretty =
    method === 'pagoMovil' ? 'Pago Móvil' : method === 'zelle' ? 'Zelle' : method === 'cash' ? 'Cash' : 'card'

  const handleConfirm = () => {
    if (!canPay) return
    onPay?.(method)
  }

  // === Fee quote fetch ===
  useEffect(() => {
    setFeeHadError(false)
    setFeeAuthNeeded(false)

    if (!eventId || !selectedTierId || quantity < 1) {
      setFee(null); setFeeLoading(false)
      return
    }

    // If not logged in, don't call the API; show an estimate
    if (!token) {
      setFee(null)
      setFeeLoading(false)
      setFeeAuthNeeded(true)
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
        const res = await fetch(url, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        })

        if (res.status === 401) {
          if (!cancelled) {
            setFee(null)
            setFeeAuthNeeded(true)
          }
          return
        }

        if (!res.ok) throw new Error(`fee ${res.status}`)
        const data = await res.json()
        if (!cancelled) setFee(data || null)
      } catch {
        if (!cancelled) {
          setFee(null)
          setFeeHadError(true)
        }
      } finally {
        if (!cancelled) setFeeLoading(false)
      }
    }

    fetchFee()
    return () => { cancelled = true; controller.abort() }
  }, [eventId, selectedTierId, quantity, method, token])

  // Build rows from either live fee or local estimate
  const feeRows = useMemo(() => {
    const rows = []
    const hasLive = !!fee && typeof fee.totalCents === 'number'
    const price = Number(selectedTier?.price ?? 0)

    if (hasLive) {
      const qtyText = selectedTier ? `${selectedTier.name} ×${quantity}` : 'Subtotal'
      if (typeof fee.subtotalCents === 'number') {
        rows.push({ label: qtyText, value: centsToUSD(fee.subtotalCents), strong: false })
      }
      if (typeof fee.serviceFeeCents === 'number' && fee.serviceFeeCents > 0) {
        rows.push({ label: 'Service fee', value: centsToUSD(fee.serviceFeeCents), strong: false })
      }
      if (method === 'card' && typeof fee.stripeFeeCents === 'number' && fee.stripeFeeCents > 0) {
        rows.push({ label: 'Stripe fee', value: centsToUSD(fee.stripeFeeCents), strong: false })
      }
      if (typeof fee.platformFeeCents === 'number' && fee.platformFeeCents > 0) {
        rows.push({ label: 'Platform fee', value: centsToUSD(fee.platformFeeCents), strong: false })
      }
      rows.push({ label: 'Total', value: centsToUSD(fee.totalCents), strong: true })
      return { rows, isEstimate: false }
    }

    // Fallback: local estimate (no fees)
    const subtotalCents = usdToCents(price * quantity)
    rows.push({
      label: selectedTier ? `${selectedTier.name} ×${quantity}` : 'Subtotal',
      value: centsToUSD(subtotalCents),
      strong: false
    })
    rows.push({ label: 'Total (est.)', value: centsToUSD(subtotalCents), strong: true })
    return { rows, isEstimate: true }
  }, [fee, selectedTier, quantity, method])

  return (
    <div className="popup-overlay" onClick={onClose}>
      <div className="popup-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Select Your Ticket</h3>

        {loading ? (
          <div className="empty-tiers">Loading tiers…</div>
        ) : error ? (
          <div className="empty-tiers">Couldn’t load tiers. Try again.</div>
        ) : tiers?.length ? (
          tiers
            .slice()
            .sort((a, b) => (a.tierOrder ?? 0) - (b.tierOrder ?? 0))
            .map((tier) => {
              const selected = selectedTierId === tier.id
              const unavailable = isUnavailable(tier)
              const desc = splitDescription(tier.description)

              return (
                <div
                  key={tier.id}
                  className={['ticket-tier', 'rich', selected ? 'selected' : '', unavailable ? 'disabled' : '']
                    .join(' ')
                    .trim()}
                  onClick={() => { if (!unavailable) onSelectTier(tier.id) }}
                >
                  <div className="tier-row">
                    <div className="tier-name">{tier.name}</div>
                    <div className="tier-price">{fmtPrice(tier.price)}</div>
                  </div>

                  {desc.length > 0 && (
                    <ul className="tier-desc">
                      {desc.map((li, i) => <li key={i}>{li}</li>)}
                    </ul>
                  )}

                  <div className="tier-meta">
                    <span className="chip">{availabilityText(tier)}</span>
                    {hasWindow(tier) && <span className="chip light">🕒 {fmtWindow(tier)}</span>}
                    {isLockedByOrder(tier) &&
                      !tier.forceOpen &&
                      !isSoldOut(tier) &&
                      !hasNotStarted(tier, Date.now()) &&
                      !hasEnded(tier, Date.now()) && (
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
          <label>
            Quantity <span style={{ opacity: 0.6, marginLeft: 6 }}>(max {maxQty})</span>
          </label>
          <input
            type="number"
            min="1"
            max={maxQty}
            step="1"
            value={quantity}
            onChange={(e) => {
              const n = parseInt(e.target.value || '1', 10)
              const clamped = isNaN(n) ? 1 : Math.max(1, Math.min(maxQty, n))
              onQuantityChange(clamped)
            }}
            onBlur={(e) => {
              const n = parseInt(e.target.value || '1', 10)
              const clamped = isNaN(n) ? 1 : Math.max(1, Math.min(maxQty, n))
              if (clamped !== quantity) onQuantityChange(clamped)
            }}
          />
        </div>

        {/* Fee box */}
        {selectedTierId && quantity >= 1 && (
          <div className="fee-box" aria-live="polite">
            {feeLoading ? (
              <div className="fee-row muted">Calculating fees…</div>
            ) : (
              <>
                {feeRows.rows.slice(0, -1).map((r, idx) => (
                  <div className="fee-row" key={idx}>
                    <span className="fee-label">{r.label}</span>
                    <span className="fee-value">{r.value}</span>
                  </div>
                ))}
                <div className="fee-divider" />
                {feeRows.rows.slice(-1).map((r, idx) => (
                  <div className={`fee-row ${r.strong ? 'total' : ''}`} key={`t-${idx}`}>
                    <span className="fee-label">{r.label}</span>
                    <span className="fee-value">{r.value}</span>
                  </div>
                ))}
                {(feeAuthNeeded || feeHadError) && (
                  <div className="fee-hint">
                    {feeAuthNeeded
                      ? 'Sign in to see final fees.'
                      : 'Showing estimate. Final fees will appear at checkout.'}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Method tabs */}
        <div className="method-tabs">
          <button className={`tab ${method==='card' ? 'active' : ''}`} onClick={() => setMethod('card')} disabled={!canPay && method!=='card'}>Card</button>
          {showPM   && <button className={`tab ${method==='pagoMovil' ? 'active' : ''}`} onClick={() => setMethod('pagoMovil')} disabled={!canPay && method!=='pagoMovil'}>Pago Móvil</button>}
          {showZelle&& <button className={`tab ${method==='zelle' ? 'active' : ''}`} onClick={() => setMethod('zelle')} disabled={!canPay && method!=='zelle'}>Zelle</button>}
          {showCash && <button className={`tab ${method==='cash' ? 'active' : ''}`} onClick={() => setMethod('cash')} disabled={!canPay && method!=='cash'}>Cash</button>}
        </div>

        {method !== 'card' && (
          <div className="alt-details">
            {method === 'pagoMovil' && showPM && (
              <div className="alt-box">
                {payments.pagoMovil.phone && <div>📱 {payments.pagoMovil.phone}</div>}
                {payments.pagoMovil.ci && <div>🪪 CI: {payments.pagoMovil.ci}</div>}
                {payments.pagoMovil.bank && <div>🏦 {payments.pagoMovil.bank}</div>}
                <div className="alt-note">After paying via Pago Móvil, press <strong>Pay</strong> to notify the organizer.</div>
              </div>
            )}
            {method === 'zelle' && showZelle && (
              <div className="alt-box">
                {payments.zelle.email && <div>📧 {payments.zelle.email}</div>}
                {payments.zelle.phone && <div>📞 {payments.zelle.phone}</div>}
                <div className="alt-note">After sending your Zelle payment, press <strong>Pay</strong> to notify the organizer.</div>
              </div>
            )}
            {method === 'cash' && showCash && (
              <div className="alt-box">
                {payments.cash.note && <div>📝 {payments.cash.note}</div>}
                <div className="alt-note">Press <strong>Pay</strong> to notify the organizer that you’ll pay in cash.</div>
              </div>
            )}
          </div>
        )}

        <div className="pay-buttons">
          <button
            className="buy-button"
            disabled={!canPay}
            onClick={handleConfirm}
            style={submitting ? { pointerEvents: 'none', opacity: 0.6 } : {}}
          >
            {submitting
              ? (method === 'card' ? 'Processing…' : 'Sending…')
              : (method === 'card' ? 'Pay with card' : `Pay (${methodPretty})`)
            }
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
