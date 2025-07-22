import { useStripe, useElements, CardElement } from '@stripe/react-stripe-js'
import { useState } from 'react'
import './StripeCardForm.css'

export default function StripeCardForm({ clientSecret, email, onSuccess }) {
  const stripe = useStripe()
  const elements = useElements()
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!stripe || !elements) return

    setLoading(true)

    const result = await stripe.confirmCardPayment(clientSecret, {
      payment_method: {
        card: elements.getElement(CardElement),
        billing_details: {
          email,
        },
      },
    })

    setLoading(false)

    if (result.error) {
      alert(result.error.message)
    } else if (result.paymentIntent.status === 'succeeded') {
      onSuccess(result.paymentIntent.id)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="stripe-card-form">
      <label>Card Information</label>
      <div className="card-input">
        <CardElement options={{ hidePostalCode: true }} />
      </div>
      <button type="submit" disabled={!stripe || loading}>
        {loading ? 'Processing...' : 'Pay Now'}
      </button>
    </form>
  )
}
