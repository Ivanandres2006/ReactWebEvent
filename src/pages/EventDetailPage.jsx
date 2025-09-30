import { useParams, useSearchParams } from 'react-router-dom'
import { useEffect, useState, useRef } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements } from '@stripe/react-stripe-js'
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
const API = 'https://backendevent-etce.onrender.com'

export default function EventDetailPage() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const rawRef = searchParams.get('ref')
  const refCode = rawRef ? decodeURIComponent(rawRef) : null

  const [event, setEvent] = useState(null)
  const [error, setError] = useState(false)
  const [showAuth, setShowAuth] = useState(false)
  const [email, setEmail] = useState('')
  const [selectedTierId, setSelectedTierId] = useState(null)
  const [quantity, setQuantity] = useState(1)
  const [showPopup, setShowPopup] = useState(false)
  const [clientSecret, setClientSecret] = useState(null)

  // tiers
  const [tiers, setTiers] = useState([])
  const [tiersLoading, setTiersLoading] = useState(false)
  const [tiersErr, setTiersErr] = useState(null)

  // one-shot checkout lock
  const [checkingOut, setCheckingOut] = useState(false)
  const clickedOnceRef = useRef(false)

  const token = localStorage.getItem('token')
  const isLoggedIn = !!(token && token.length > 0)

  useEffect(() => {
    if (refCode) localStorage.setItem('wknd_ref', refCode)
  }, [refCode])

  // Load user email
  useEffect(() => {
    if (!isLoggedIn) return
    fetch(`${API}/user/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async res => {
        if (res.status === 401) {
          const txt = await res.text()
          if (txt.includes('JWT expired')) localStorage.removeItem('token')
          setShowAuth(true)
          throw new Error('401')
        }
        if (!res.ok) throw new Error('Failed to fetch user')
        return res.json()
      })
      .then(d => {
        if (d?.email) {
          setEmail(d.email)
          localStorage.setItem('email', d.email)
        }
      })
      .catch(() => {})
  }, [isLoggedIn, token])

  // Load event
  useEffect(() => {
    if (!id) return
    ;(async () => {
      try {
        const res = await fetch(`${API}/events/${id}`)
        if (!res.ok) throw new Error(`Failed to fetch event: ${res.status}`)
        const data = await res.json()
        if (!data?.title) throw new Error('Invalid event data')
        setEvent(data)
      } catch (e) {
        console.error('❌ Event load error:', e)
        setError(true)
      }
    })()
  }, [id])

  // Load tiers when popup opens
  useEffect(() => {
    if (!showPopup || !id) return
    const lsKey = `lastTier:${id}`

    const loadTiers = async () => {
      setTiersLoading(true)
      setTiersErr(null)

      // helpers
      const isSoldOut = (t) => Number(t?.availableQuantity ?? 0) <= 0
      const hasNotStarted = (t, now) => t?.startTime ? now < new Date(t.startTime) : false
      const hasEnded = (t, now) => t?.endTime ? now > new Date(t.endTime) : false
      const isLockedByTime = (t, now) => (!t?.forceOpen && hasNotStarted(t, now)) || hasEnded(t, now)

      const pickDefault = (list) => {
        const finalList = Array.isArray(list) ? list : []
        setTiers(finalList)

        const now = Date.now()
        const saved = parseInt(localStorage.getItem(lsKey) || 'NaN', 10)
        const savedObj = finalList.find(t => t?.id === saved)
        const savedOk = savedObj && !isSoldOut(savedObj) && !isLockedByTime(savedObj, now)

        if (savedOk) return setSelectedTierId(saved)

        const sorted = finalList.slice().sort((a,b) => (a.tierOrder ?? 0) - (b.tierOrder ?? 0))
        const next = sorted.find(t => !isSoldOut(t) && !isLockedByTime(t, now))
        setSelectedTierId(next?.id ?? (finalList[0]?.id ?? null))
      }

      try {
        const res = await fetch(`${API}/events/${id}/tiers`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })

        if (res.status === 401) { setShowAuth(true); return }

        if (res.status === 404) {
          pickDefault(event?.ticketTiers || [])
          return
        }

        if (!res.ok) throw new Error(`Tiers fetch failed: ${res.status}`)

        const data = await res.json()
        const list = Array.isArray(data) ? data : []
        pickDefault(list.length ? list : (event?.ticketTiers || []))
      } catch (e) {
        console.warn('⚠️ tiers error, using fallback:', e.message)
        setTiersErr(e.message)
        pickDefault(event?.ticketTiers || [])
      } finally {
        setTiersLoading(false)
      }
    }

    loadTiers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPopup, id, token])

  // Build dynamic payment options for the popup
  const payments = event ? {
    zelle: {
      enabled: !!(event.zelleEmail || event.zellePhone),
      email: event.zelleEmail || '',
      phone: event.zellePhone || '',
    },
    pagoMovil: {
      enabled: (String(event.country || '').toLowerCase() === 'venezuela') && !!event.allowPagoMovil,
      phone: event.pagoMovilPhone || '',
      ci: event.pagoMovilCi || '',
      bank: event.pagoMovilBank || '',
    },
    cash: {
      enabled: !!event.allowCash,
      note: event.cashNote || '',
    },
  } : null

  // Handle checkout
  const handleBuy = async (method = 'card') => {
    if (checkingOut || clickedOnceRef.current) return
    clickedOnceRef.current = true
    setCheckingOut(true)

    try {
      if (!isLoggedIn) { setShowAuth(true); return }
      if (!email) { alert('Email not available. Please log in again.'); setShowAuth(true); return }
      if (!selectedTierId) { alert('Please select a ticket tier'); return }

      const storedRef = localStorage.getItem('wknd_ref')
      const body = {
        eventId: parseInt(id),
        ticketTierId: selectedTierId,
        quantity,
        email,
        ref: refCode || storedRef || null,
        paymentMethod: typeof method === 'string' ? method : 'card',
      }

      const res = await fetch(`${API}/api/tickets/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })

      const data = await res.json()

      // free
      if (data.free === true || data.free === 'true') {
        window.location.href = `/#/success?eventId=${id}`
        return
      }

      // manual methods
      if (data.manual === true) {
        setShowPopup(false)
        const methodLower = String(method || 'card').toLowerCase()
        const since = Date.now()
        window.location.href =
          `/#/success?eventId=${id}&pending=${encodeURIComponent(methodLower)}&since=${since}`
        return
      }

      // stripe card
      if (data.clientSecret) {
        setClientSecret(data.clientSecret)
        setShowPopup(false)
        return
      }

      alert(data.error || 'Unexpected server response')
    } catch (err) {
      console.error('❌ Checkout failed:', err)
      alert('Checkout error. Try again.')
    } finally {
      setCheckingOut(false)
      clickedOnceRef.current = false
    }
  }

  if (showAuth && !isLoggedIn) {
    return (
      <AuthModal
        onClose={() => {
          setShowAuth(false)
          window.location.reload()
        }}
      />
    )
  }

  if (error) return <div className="event-error">Failed to load event. Please try again later.</div>
  if (!event) return <div className="event-loading">Loading event...</div>

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
          <button className="btn-primary" onClick={() => setShowPopup(true)}>
            Register
          </button>
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

      {/* Footer */}
      <footer className="site-footer">
        <div className="footer-inner">
          <div className="brand">
            <span className="logo-dot" />
            <span>WKND</span>
          </div>

          <div className="links">
            <a
              className="footer-link"
              href="https://www.instagram.com/wknd.app/"
              target="_blank"
              rel="noreferrer"
              aria-label="Instagram"
              title="Instagram"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path fill="currentColor" d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5m0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7m5 3a5 5 0 1 1 0 10a5 5 0 0 1 0-10m0 2a3 3 0 1 0 0 6a3 3 0 0 0 0-6m5.5-.75a1.25 1.25 0 1 1 0 2.5a1.25 1.25 0 0 1 0-2.5Z"/>
              </svg>
              <span>@wknd</span>
            </a>

            <a
              className="footer-link"
              href="mailto:support@wknd.events?subject=WKND%20Support"
              title="Contact support"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path fill="currentColor" d="M20 4H4a2 2 0 0 0-2 2v.4l10 6.25L22 6.4V6a2 2 0 0 0-2-2Zm2 5.25L12.52 15a1 1 0 0 1-1 0L2 9.25V18a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9.25Z"/>
              </svg>
              <span>support@wkndevent.com</span>
            </a>
          </div>

          <div className="copy">© {new Date().getFullYear()} WKND — All rights reserved</div>
        </div>
      </footer>

      {showPopup && (
        <RegisterPopup
          eventId={id}
          tiers={tiers.length ? tiers : (event.ticketTiers || [])}
          loading={tiersLoading}
          error={tiersErr}
          selectedTierId={selectedTierId}
          quantity={quantity}
          submitting={checkingOut}
          payments={payments}
          onClose={() => {
            setShowPopup(false)
            setSelectedTierId(null)
            setCheckingOut(false)
            clickedOnceRef.current = false
          }}
          onSelectTier={(tierId) => {
            setSelectedTierId(tierId)
            try { localStorage.setItem(`lastTier:${id}`, String(tierId)) } catch {}
          }}
          onQuantityChange={setQuantity}
          onPay={(method) => handleBuy(method ?? 'card')}
        />
      )}

      {clientSecret && (
        <div className="popup-overlay" onClick={() => setClientSecret(null)}>
          <div className="popup-modal" onClick={(e) => e.stopPropagation()}>
            <Elements stripe={stripePromise} options={{ clientSecret }}>
              <StripeCardForm
                clientSecret={clientSecret}
                email={email}
                onSuccess={async (paymentIntentId) => {
                  const token = localStorage.getItem('token') || ''
                  await fetch(`${API}/api/tickets/confirm?paymentIntentId=${encodeURIComponent(paymentIntentId)}`, {
                    method: 'POST',
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                  })
                  window.location.href = `/#/success?eventId=${id}&pi=${encodeURIComponent(paymentIntentId)}`
                }}
              />
            </Elements>
          </div>
        </div>
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
