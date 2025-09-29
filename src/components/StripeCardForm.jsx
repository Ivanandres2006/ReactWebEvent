import { useStripe, useElements, CardElement } from '@stripe/react-stripe-js'
import { useState } from 'react'
import './StripeCardForm.css'

export default function StripeCardForm({ clientSecret, email, onSuccess }) {
  const stripe = useStripe()
  const elements = useElements()
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)

  const confirmOnBackend = async (paymentIntentId) => {
    const API = 'https://backendevent-etce.onrender.com'
    const token = localStorage.getItem('token') || ''
    const res = await fetch(`${API}/api/tickets/confirm?paymentIntentId=${encodeURIComponent(paymentIntentId)}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })

    try {
      const j = await res.json()
      if (!res.ok || j?.error) throw new Error(j?.error || `Confirm failed (${res.status})`)
    } catch {
      if (!res.ok) throw new Error(`Confirm failed (${res.status})`)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!stripe || !elements || loading) return

    setLoading(true)
    setErr(null)

    const result = await stripe.confirmCardPayment(clientSecret, {
      payment_method: {
        card: elements.getElement(CardElement),
        billing_details: { email },
      },
    })

    setLoading(false)

    if (result.error) {
      setErr(result.error.message || 'Payment failed.')
      return
    }

    const pi = result.paymentIntent
    if (!pi?.id) {
      setErr('No payment intent returned.')
      return
    }

    // Succeeded or processing -> finalize on backend
    if (pi.status === 'succeeded' || pi.status === 'processing') {
      try {
        await confirmOnBackend(pi.id)
        onSuccess(pi.id)
      } catch (e) {
        setErr(e.message || 'Could not finalize ticket.')
      }
    } else if (pi.status === 'requires_payment_method') {
      setErr('Your card was declined. Try another payment method.')
    } else {
      setErr(`Payment not completed (status: ${pi.status}).`)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="stripe-card-form">
      <label>Card Information</label>
      <div className="card-input">
        <CardElement
          options={{
            hidePostalCode: true,
            style: {
              base: {
                color: '#fff',
                iconColor: '#fff',
                '::placeholder': { color: 'rgba(255,255,255,0.7)' },
                fontWeight: 500,
                fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial',
                fontSize: '16px',
              },
              invalid: { color: '#ff5b5b', iconColor: '#ff5b5b' },
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
