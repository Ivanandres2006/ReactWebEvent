import { useParams, useSearchParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import AuthModal from '../components/AuthModal'
import RegisterPopup from '../components/RegisterPopup'
import StripeCardForm from '../components/StripeCardForm'
import './EventDetailPage.css'
import defaultEvent from '../assets/defaultEvent.jpg'
import appstoreIcon from '../assets/mac-os.png'
import 'leaflet/dist/leaflet.css'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
})

const stripePromise = loadStripe('pk_test_51RcVeBBU1Fa59mBKHvngFVDwq8gBiZ863TKO6okEHBj28VjLiYAUQ5OhDs0k1WEyfqXRmtziurmLYBqlQfyOOl6C007EKiWppc')

export default function EventDetailPage() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const refCode = searchParams.get('ref')

  const [event, setEvent] = useState(null)
  const [error, setError] = useState(false)
  const [showAuth, setShowAuth] = useState(false)
  const [email, setEmail] = useState('')
  const [selectedTierId, setSelectedTierId] = useState(null)
  const [quantity, setQuantity] = useState(1)
  const [showPopup, setShowPopup] = useState(false)
  const [clientSecret, setClientSecret] = useState(null)

  const token = localStorage.getItem('token')
  const isLoggedIn = token && token.length > 0

  useEffect(() => {
    if (!token) return

    fetch('https://backendevent-etce.onrender.com/user/me', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch user')
        return res.json()
      })
      .then(data => {
        if (data.email) {
          setEmail(data.email)
          localStorage.setItem('email', data.email)
        }
      })
      .catch(err => {
        console.error('❌ Failed to fetch user info:', err)
      })
  }, [token])

  useEffect(() => {
    if (!id) return
    if (!token || token.length < 10) {
      setShowAuth(true)
      return
    }

    fetch(`https://backendevent-etce.onrender.com/events/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async res => {
        if (res.status === 401) {
          const errorText = await res.text()
          if (errorText.includes('JWT expired')) {
            console.warn('🔐 JWT expired — showing auth modal')
            localStorage.removeItem('token')
            setShowAuth(true)
            return
          }
        }
        if (!res.ok) throw new Error(`Failed to fetch event: ${res.status}`)
        return res.json()
      })
      .then(data => {
        if (!data || !data.title) throw new Error('Invalid event data')
        setEvent(data)
      })
      .catch(err => {
        console.error('❌ Event load error:', err)
        if (err.message.includes('401')) {
          localStorage.removeItem('token')
          setShowAuth(true)
          return
        }
        setError(true)
      })
  }, [id, token])

  const handleBuy = async () => {
    console.log('✅ handleBuy triggered')

    if (!isLoggedIn) return setShowAuth(true)
    if (!email) {
      alert('Email not available. Please log in again.')
      setShowAuth(true)
      return
    }
    if (!selectedTierId) return alert('Please select a ticket tier')

    try {
      const body = {
        eventId: parseInt(id),
        ticketTierId: selectedTierId,
        quantity,
        email,
        ref: refCode,
      }

      console.log('Sending checkout request with body:', body)

      const res = await fetch(`https://backendevent-etce.onrender.com/api/tickets/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })

      const data = await res.json()
      console.log('💬 Checkout response:', data)

      if (data.free === 'true') {
        window.location.href = `/success?eventId=${id}`
        return
      }

      if (data.clientSecret) {
        setClientSecret(data.clientSecret)
        setShowPopup(false)
      } else {
        alert(data.error || 'Unexpected server response')
      }
    } catch (err) {
      console.error('❌ Checkout failed:', err)
      alert('Checkout error. Try again.')
    }
  }

  if (error) return <div className="event-error">Failed to load event. Please try again later.</div>
  if (!event || !email) return <div className="event-loading">Loading event...</div>

  return (
    <div className="event-fullscreen">
      <a
        href="https://apps.apple.com/app/idYOUR_APP_ID"
        target="_blank"
        rel="noopener noreferrer"
        className="event-app-download"
      >
        <img src={appstoreIcon} alt="Download on App Store" />
      </a>

      <div className="event-top-section">
        <img
          src={event?.imageUrl && event.imageUrl !== 'null' ? event.imageUrl : defaultEvent}
          alt="Event"
          className="event-hero-image"
          onError={(e) => {
            e.target.onerror = null
            e.target.src = defaultEvent
          }}
        />
      </div>

      <div className="event-content">
        <h1 className="event-title">{event?.title}</h1>
        <p className="event-date">📅 {event?.dateTime ? formatDate(event.dateTime) : ''}</p>
        <p className="event-location">📍 {event?.location || ''}</p>

        <div className="event-actions">
          <button className="btn-primary" onClick={() => setShowPopup(true)}>+ Register</button>
          <button className="btn-secondary">Contact</button>
          <button className="btn-secondary">Share</button>
        </div>

        <div className="event-about">
          <h3>About</h3>
          <p>{event?.description || 'No description provided.'}</p>
        </div>

        <div className="event-map">
          <h3>Location</h3>
          {typeof event.latitude === 'number' && typeof event.longitude === 'number' ? (
            <div style={{ height: '300px', borderRadius: '16px', overflow: 'hidden', marginTop: '12px' }}>
              <MapContainer
                center={[event.latitude, event.longitude]}
                zoom={15}
                scrollWheelZoom={false}
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <Marker position={[event.latitude, event.longitude]}>
                  <Popup>
                    {event.title} <br /> {event.address}
                  </Popup>
                </Marker>
              </MapContainer>
            </div>
          ) : (
            <div className="map-placeholder">Map not available.</div>
          )}
        </div>
      </div>

      {showPopup && (
        <RegisterPopup
          tiers={event.ticketTiers}
          selectedTierId={selectedTierId}
          quantity={quantity}
          onClose={() => {
            setShowPopup(false)
            setSelectedTierId(null)
          }}
          onSelectTier={setSelectedTierId}
          onQuantityChange={setQuantity}
          onPay={handleBuy}
        />
      )}

{clientSecret && (
  <div className="popup-overlay" onClick={() => setClientSecret(null)}>
    <div className="popup-modal" onClick={(e) => e.stopPropagation()}>
      <StripeCardForm
        clientSecret={clientSecret}
        email={email}
        onSuccess={async (paymentIntentId) => {
          await fetch(`https://backendevent-etce.onrender.com/api/tickets/confirm?paymentIntentId=${paymentIntentId}`, {
            method: 'POST',
          })
          window.location.href = `/success?eventId=${id}`
        }}
      />
    </div>
  </div>
)}


      {showAuth && (
        <AuthModal
          onClose={() => {
            setShowAuth(false)
            window.location.reload()
          }}
        />
      )}
    </div>
  )
}

function formatDate(isoString) {
  const date = new Date(isoString)
  return date.toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
