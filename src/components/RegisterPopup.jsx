import React, { useMemo, useState, useEffect } from 'react'
import './RegisterPopup.css'

export default function RegisterPopup({
  tiers,
  loading = false,
  error = null,
  selectedTierId,
  quantity,
  submitting = false,          // disables every pay button while posting
  payments = null,             // { zelle:{enabled,email,phone}, pagoMovil:{enabled,phone,ci,bank}, cash:{enabled,note} }
  onClose,
  onSelectTier,
  onQuantityChange,
  onPay,                        // onPay(method?: 'card'|'zelle'|'pagoMovil'|'cash')
}) {
  const [method, setMethod] = useState('card')

  const fmtPrice = (n) => `$${Number(n || 0).toFixed(2)}`
  const splitDescription = (txt) => {
    if (!txt) return []
    const parts = txt
      .split(/[\n•;]| - |\u2022/g)
      .map(s => s.replace(/^[-•\u2022]\s*/, '').trim())
      .filter(Boolean)
    return [...new Set(parts)]
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

  // Which methods are available for this event
  const zelleOn = !!payments?.zelle?.enabled
  const pagoOn  = !!payments?.pagoMovil?.enabled
  const cashOn  = !!payments?.cash?.enabled

  // Snap back to card if a now-disabled method is selected
  useEffect(() => {
    if (method === 'zelle' && !zelleOn) setMethod('card')
    if (method === 'pagoMovil' && !pagoOn) setMethod('card')
    if (method === 'cash' && !cashOn) setMethod('card')
  }, [method, zelleOn, pagoOn, cashOn])

  const Details = () => {
    if (method === 'pagoMovil' && pagoOn) {
      const { phone, ci, bank } = payments.pagoMovil
      return (
        <div className="pay-hint" style={{marginTop: 10}}>
          <div>📱 <strong>Pago Móvil</strong></div>
          {phone ? <div>Phone: {phone}</div> : null}
          {ci ?    <div>C.I.: {ci}</div>     : null}
          {bank ?  <div>Bank: {bank}</div>   : null}
          <div style={{opacity:.8, marginTop:6}}>After sending Pago Móvil, press <em>Pay</em> to notify the organizer.</div>
        </div>
      )
    }
    if (method === 'cash' && cashOn) {
      const note = payments.cash.note
      return (
        <div className="pay-hint" style={{marginTop: 10}}>
          <div>💵 <strong>Cash</strong></div>
          {note ? <div>{note}</div> : null}
          <div style={{opacity:.8, marginTop:6}}>Press <em>Pay</em> to notify the organizer you’ll pay in cash.</div>
        </div>
      )
    }
    if (method === 'zelle' && zelleOn) {
      const { email, phone } = payments.zelle
      return (
        <div className="pay-hint" style={{marginTop: 10}}>
          <div>🏦 <strong>Zelle</strong></div>
          {email ? <div>Email: {email}</div> : null}
          {phone ? <div>Phone: {phone}</div> : null}
          <div style={{opacity:.8, marginTop:6}}>After sending Zelle, press <em>Pay</em> to notify the organizer.</div>
        </div>
      )
    }
    return null
  }

  const payNow = () => {
    if (!canPay) return
    onPay?.(method)
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

        {/* Payment buttons */}
        <div className="pay-buttons">
          {/* Card (immediate) */}
          <button
            className="buy-button"
            disabled={!canPay}
            onClick={() => { setMethod('card'); onPay?.('card') }}
            style={submitting ? { pointerEvents: 'none', opacity: 0.6 } : {}}
          >
            {submitting ? 'Processing…' : 'Pay with card'}
          </button>

          {(zelleOn || pagoOn || cashOn) && (
            <>
              <div className="alt-grid">
                {pagoOn && (
                  <button
                    className="btn-alt"
                    disabled={!canPay}
                    onClick={() => setMethod('pagoMovil')}
                  >Pago Móvil</button>
                )}

                {zelleOn && (
                  <button
                    className="btn-alt"
                    disabled={!canPay}
                    onClick={() => setMethod('zelle')}
                  >Zelle</button>
                )}

                {cashOn && (
                  <button
                    className="btn-alt"
                    disabled={!canPay}
                    onClick={() => setMethod('cash')}
                  >Cash</button>
                )}
              </div>

              {/* Show details for the chosen manual method */}
              <Details />

              {/* Confirm/notify button for manual methods */}
              {method !== 'card' && (
                <button
                  className="buy-button"
                  disabled={!canPay}
                  onClick={payNow}
                  style={{ marginTop: 10, background: '#1ecf66' }}
                >
                  {submitting ? 'Sending…' : 'Pay'}
                </button>
              )}

              <p className="pay-hint">
                Manual methods notify the organizer. You’ll get your ticket by email once they confirm.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
