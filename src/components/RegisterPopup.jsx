import React, { useMemo, useState } from 'react'
import './RegisterPopup.css'

export default function RegisterPopup({
  tiers,
  loading = false,
  error = null,
  selectedTierId,
  quantity,
  submitting = false,
  payments = null,                  // { zelle:{enabled,email,phone}, pagoMovil:{enabled,phone,ci,bank}, cash:{enabled,note} }
  onClose,
  onSelectTier,
  onQuantityChange,
  onPay,                            // onPay('card'|'zelle'|'pagoMovil'|'cash')
}) {
  const [method, setMethod] = useState('card')

  const fmtPrice = (n) => `$${Number(n || 0).toFixed(2)}`
  const splitDescription = (txt) => {
    if (!txt) return []
    return [...new Set(
      txt.split(/[\n•;]| - |\u2022/g)
         .map(s => s.replace(/^[-•\u2022]\s*/, '').trim())
         .filter(Boolean)
    )]
  }
  const isStartLocked = (t) => {
    const force = !!t?.forceOpen
    if (force) return false
    const s = t?.startTime ? new Date(t.startTime) : null
    return s ? Date.now() < s.getTime() : false
  }
  const hasWindow = (t) => !!t?.startTime && !!t?.endTime
  const fmtWindow = (t) => {
    const s = t?.startTime ? new Date(t.startTime) : null
    const e = t?.endTime ? new Date(t.endTime) : null
    const opts = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }
    return (s && e) ? `${s.toLocaleString(undefined, opts)} – ${e.toLocaleString(undefined, opts)}` : ''
  }
  const availabilityText = (t) => {
    const qty = Number(t?.availableQuantity ?? 0)
    const hide = !!t?.hideQuantity
    if (qty <= 0) return '❌ Sold out'
    return hide ? 'Available' : `${qty} left`
  }

  const selectedTier = useMemo(
    () => (tiers || []).find(t => t?.id === selectedTierId),
    [tiers, selectedTierId]
  )
  const selectedDisabled = useMemo(() => {
    if (!selectedTier) return false
    const soldOut = Number(selectedTier.availableQuantity ?? 0) <= 0
    return soldOut || isStartLocked(selectedTier)
  }, [selectedTier])

  const canPay = !!selectedTierId && quantity > 0 && !selectedDisabled && !submitting

  const showZelle = !!payments?.zelle?.enabled
  const showPM   = !!payments?.pagoMovil?.enabled
  const showCash = !!payments?.cash?.enabled

  return (
    <div className="popup-overlay" onClick={onClose}>
      <div className="popup-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Select Your Ticket</h3>

        {loading ? (
          <div className="empty-tiers">Loading tiers…</div>
        ) : error ? (
          <div className="empty-tiers">Couldn’t load tiers. Try again.</div>
        ) : tiers?.length ? (
          tiers.map((tier) => {
            const selected = selectedTierId === tier.id
            const startLocked = isStartLocked(tier)
            const soldOut = Number(tier?.availableQuantity ?? 0) <= 0
            const desc = splitDescription(tier.description)

            return (
              <div
                key={tier.id}
                className={[
                  'ticket-tier', 'rich',
                  selected ? 'selected' : '',
                  (soldOut || startLocked) ? 'disabled' : ''
                ].join(' ').trim()}
                onClick={() => { if (!(soldOut || startLocked)) onSelectTier(tier.id) }}
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
                  {startLocked && <span className="chip warn">⏰ Not yet available</span>}
                  {hasWindow(tier) && <span className="chip light">🕒 {fmtWindow(tier)}</span>}
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
            type="number"
            min="1"
            value={quantity}
            onChange={(e) =>
              onQuantityChange(Math.max(1, parseInt(e.target.value || '1', 10)))
            }
          />
        </div>

        {/* Primary card button */}
        <button
          className="buy-button"
          disabled={!canPay}
          onClick={() => onPay?.('card')}
          style={submitting ? { pointerEvents: 'none', opacity: 0.6 } : {}}
        >
          {submitting ? 'Processing…' : 'Pay with card'}
        </button>

        {/* Alternative methods (only enabled ones) */}
        {(showZelle || showPM || showCash) && (
          <>
            <div className="alt-grid">
              {showPM && (
                <button className={`btn-alt ${method==='pagoMovil' ? 'active' : ''}`}
                        disabled={!canPay}
                        onClick={() => { setMethod('pagoMovil'); onPay?.('pagoMovil') }}>
                  Pago Móvil
                </button>
              )}
              {showZelle && (
                <button className={`btn-alt ${method==='zelle' ? 'active' : ''}`}
                        disabled={!canPay}
                        onClick={() => { setMethod('zelle'); onPay?.('zelle') }}>
                  Zelle
                </button>
              )}
              {showCash && (
                <button className={`btn-alt ${method==='cash' ? 'active' : ''}`}
                        disabled={!canPay}
                        onClick={() => { setMethod('cash'); onPay?.('cash') }}>
                  Cash
                </button>
              )}
            </div>

            {/* Inline details for the selected non-card method */}
            <div className="alt-details">
              {method === 'pagoMovil' && showPM && (
                <div className="alt-box">
                  {payments.pagoMovil.phone && <div>📱 {payments.pagoMovil.phone}</div>}
                  {payments.pagoMovil.ci && <div>🪪 CI: {payments.pagoMovil.ci}</div>}
                  {payments.pagoMovil.bank && <div>🏦 {payments.pagoMovil.bank}</div>}
                  <div className="alt-note">After paying via Pago Móvil, we’ll notify the organizer.</div>
                </div>
              )}
              {method === 'zelle' && showZelle && (
                <div className="alt-box">
                  {payments.zelle.email && <div>📧 {payments.zelle.email}</div>}
                  {payments.zelle.phone && <div>📞 {payments.zelle.phone}</div>}
                  <div className="alt-note">After sending your Zelle payment, we’ll notify the organizer.</div>
                </div>
              )}
              {method === 'cash' && showCash && (
                <div className="alt-box">
                  {payments.cash.note && <div>📝 {payments.cash.note}</div>}
                  <div className="alt-note">We’ll notify the organizer to expect your cash payment.</div>
                </div>
              )}
            </div>

            <p className="pay-hint">
              Manual methods notify the organizer. You’ll get your ticket by email after they confirm.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
