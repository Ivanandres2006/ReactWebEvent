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
  // currently selected method tab (does NOT trigger payment)
  const [method, setMethod] = useState('card')

  const fmtPrice = (n) => `$${Number(n || 0).toFixed(2)}`
  const splitDescription = (txt) =>
    !txt ? [] :
      [...new Set(
        txt.split(/[\n•;]| - |\u2022/g)
          .map(s => s.replace(/^[-•\u2022]\s*/, '').trim())
          .filter(Boolean)
      )]

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

  const methodPretty =
    method === 'pagoMovil' ? 'Pago Móvil' :
    method === 'zelle' ? 'Zelle' :
    method === 'cash' ? 'Cash' : 'card'

  const handleConfirm = () => {
    if (!canPay) return
    onPay?.(method)         // <- fire only when user hits the bottom Pay button
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

        {/* Payment method selector (tab-like) */}
        <div className="method-tabs">
          <button
            className={`tab ${method==='card' ? 'active' : ''}`}
            onClick={() => setMethod('card')}
            disabled={!canPay && method!=='card'}
          >
            Card
          </button>

          {showPM && (
            <button
              className={`tab ${method==='pagoMovil' ? 'active' : ''}`}
              onClick={() => setMethod('pagoMovil')}
              disabled={!canPay && method!=='pagoMovil'}
            >
              Pago Móvil
            </button>
          )}

          {showZelle && (
            <button
              className={`tab ${method==='zelle' ? 'active' : ''}`}
              onClick={() => setMethod('zelle')}
              disabled={!canPay && method!=='zelle'}
            >
              Zelle
            </button>
          )}

          {showCash && (
            <button
              className={`tab ${method==='cash' ? 'active' : ''}`}
              onClick={() => setMethod('cash')}
              disabled={!canPay && method!=='cash'}
            >
              Cash
            </button>
          )}
        </div>

        {/* Method details */}
        {method !== 'card' && (
          <div className="alt-details">
            {method === 'pagoMovil' && showPM && (
              <div className="alt-box">
                {payments.pagoMovil.phone && <div>📱 {payments.pagoMovil.phone}</div>}
                {payments.pagoMovil.ci && <div>🪪 CI: {payments.pagoMovil.ci}</div>}
                {payments.pagoMovil.bank && <div>🏦 {payments.pagoMovil.bank}</div>}
                <div className="alt-note">
                  After paying via Pago Móvil, press <strong>Pay</strong> to notify the organizer.
                </div>
              </div>
            )}
            {method === 'zelle' && showZelle && (
              <div className="alt-box">
                {payments.zelle.email && <div>📧 {payments.zelle.email}</div>}
                {payments.zelle.phone && <div>📞 {payments.zelle.phone}</div>}
                <div className="alt-note">
                  After sending your Zelle payment, press <strong>Pay</strong> to notify the organizer.
                </div>
              </div>
            )}
            {method === 'cash' && showCash && (
              <div className="alt-box">
                {payments.cash.note && <div>📝 {payments.cash.note}</div>}
                <div className="alt-note">
                  Press <strong>Pay</strong> to notify the organizer that you’ll pay in cash.
                </div>
              </div>
            )}
          </div>
        )}

        {/* Final action: one button that triggers the selected method */}
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
