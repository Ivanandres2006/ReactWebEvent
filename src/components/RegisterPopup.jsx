import React from 'react'
import './RegisterPopup.css'

export default function RegisterPopup({
  tiers,
  selectedTierId,
  quantity,
  onClose,
  onSelectTier,
  onQuantityChange,
  onPay,
}) {
  const canPay = selectedTierId && quantity > 0

  return (
    <div className="popup-overlay" onClick={onClose}>
      <div className="popup-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Select Your Ticket</h3>

        {tiers?.length ? tiers.map((tier) => (
          <div
            key={tier.id}
            className={`ticket-tier ${selectedTierId === tier.id ? 'selected' : ''}`}
            onClick={() => onSelectTier(tier.id)}
          >
            <div>{tier.name}</div>
            <div>${tier.price}</div>
          </div>
        )) : <div className="empty-tiers">No tiers available.</div>}

        <div className="ticket-quantity">
          <label>Quantity</label>
          <input
            type="number"
            min="1"
            value={quantity}
            onChange={(e) => onQuantityChange(Math.max(1, parseInt(e.target.value || '1', 10)))}
          />
        </div>

        <button className="buy-button" disabled={!canPay} onClick={onPay}>
          {canPay ? 'Pay' : 'Select a tier'}
        </button>
      </div>
    </div>
  )
}
