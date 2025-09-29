import React, { useMemo } from 'react'
import './RegisterPopup.css'

export default function RegisterPopup({
  tiers,
  loading = false,
  error = null,
  selectedTierId,
  quantity,
  submitting = false,          // 🟡 new
  onClose,
  onSelectTier,
  onQuantityChange,
  onPay,                        // onPay(method?: 'card'|'zelle'|'pagoMovil'|'cash')
}) {
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

        <button
          className="buy-button"
          disabled={!canPay}
          onClick={() => onPay?.('card')} // never pass the click event
          style={submitting ? { pointerEvents: 'none', opacity: 0.6 } : {}}
        >
          {submitting
            ? 'Processing…'
            : canPay
              ? 'Pay'
              : (selectedDisabled ? 'Tier unavailable' : 'Select a tier')}
        </button>
      </div>
    </div>
  )
}
