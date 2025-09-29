import { useStripe, useElements, CardElement } from '@stripe/react-stripe-js'
import { useState } from 'react'
import './StripeCardForm.css'

export default function StripeCardForm({ clientSecret, email, onSuccess }) {
  const stripe = useStripe()
  const elements = useElements()
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!stripe || !elements || loading) return
    setLoading(true); setErr(null)

    const result = await stripe.confirmCardPayment(clientSecret, {
      payment_method: {
        card: elements.getElement(CardElement),
        billing_details: { email },
      },
    })

    setLoading(false)

    if (result.error) {
      setErr(result.error.message || 'Payment failed.')
    } else if (result.paymentIntent?.status === 'succeeded') {
      onSuccess(result.paymentIntent.id)
    } else {
      setErr('Payment not completed.')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="stripe-card-form">
      <label>Card Information</label>
      <div className="card-input">
      // StripeCardForm.jsx
<CardElement
  options={{
    hidePostalCode: true,
    style: {
      base: {
        color: '#fff',                 // input text
        iconColor: '#fff',             // brand icon color
        '::placeholder': { color: 'rgba(255,255,255,0.7)' },
        fontWeight: 500,
        fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: '16px',
      },
      invalid: {
        color: '#ff5b5b',
        iconColor: '#ff5b5b',
      },
    },
  }}
/>

      </div>
      {err && <div className="text-red-500 text-sm mt-2">{err}</div>}
      <button type="submit" disabled={!stripe || loading}>
        {loading ? 'Processing…' : 'Pay Now'}
      </button>
    </form>
  )
}
