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
  return (
    <div className="popup-overlay" onClick={onClose}>
      <div className="popup-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Select Your Ticket</h3>

        {tiers.map((tier) => (
          <div
            key={tier.id}
            className={`ticket-tier ${selectedTierId === tier.id ? 'selected' : ''}`}
            onClick={() => onSelectTier(tier.id)}
          >
            <div>{tier.name}</div>
            <div>${tier.price}</div>
          </div>
        ))}

        <div className="ticket-quantity">
          <label>Quantity</label>
          <input
            type="number"
            min="1"
            value={quantity}
            onChange={(e) => onQuantityChange(parseInt(e.target.value))}
          />
        </div>

        <button className="buy-button" onClick={onPay}>
          Pay
        </button>
      </div>
    </div>
  )
}
