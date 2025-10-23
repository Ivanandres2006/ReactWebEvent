import { useParams, useSearchParams } from 'react-router-dom'
import { useEffect, useState, useRef, useMemo } from 'react'
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
import { fetchWithAuth, getAccessToken } from '../lib/authClient'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
})

const stripePromise = loadStripe('pk_test_51RcVeBBU1Fa59mBKHvngFVDwq8gBiZ863TKO6okEHBj28VjLiYAUQ5OhDs0k1WEyfqXRmtziurmLYBqlQfyOOl6C007EKiWppc')
const API = 'https://backendevent-etce.onrender.com'

// ---------- Apple detection & Wallet helpers ----------
const isApplePlatform = () => {
  const ua = navigator.userAgent || ''
  return /iPhone|iPad|iPod|Macintosh/.test(ua)
}
const canShowAppleWallet = () => isApplePlatform()
const PASS_URL_FOR_EVENT = (eventId) => `${API}/api/passes/event/${encodeURIComponent(eventId)}`

// ---------- Pretty date ----------
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

  // Waitlist (listOnly)
  const [waitlistStatus, setWaitlistStatus] = useState(null) // null | "pending" | "approved" | "denied"
  const [waitlistModal, setWaitlistModal] = useState(false)
  const [waitlistBusy, setWaitlistBusy] = useState(false)

  const token = getAccessToken()
  const isLoggedIn = !!token

  const requiresWaitlist = !!(event?.listOnly)

  // ---- Apple Wallet visibility
  const showAppleWallet = useMemo(() => canShowAppleWallet() && isLoggedIn, [isLoggedIn])

  // save referral
  useEffect(() => {
    if (refCode) localStorage.setItem('wknd_ref', refCode)
  }, [refCode])

  // Load user info
  useEffect(() => {
    if (!isLoggedIn) return
    fetchWithAuth(`${API}/user/me`)
      .then(async res => {
        if (res.status === 401) { setShowAuth(true); throw new Error('401') }
        if (!res.ok) throw new Error('Failed to fetch user')
        return res.json()
      })
      .then(d => {
        if (d?.email) {
          setEmail(d.email)
          localStorage.setItem('email', d.email)
          if (d?.fullName) localStorage.setItem('fullName', d.fullName)
        } else {
          setShowAuth(true)
        }
      })
      .catch(() => {})
  }, [isLoggedIn])

  // Load event (public)
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

  // Load waitlist status (if listOnly + logged in)
  useEffect(() => {
    if (!event?.listOnly || !isLoggedIn) return
    ;(async () => {
      try {
        const res = await fetchWithAuth(`${API}/events/${id}/waitlist/status`)
        if (!res.ok) { setWaitlistStatus(null); return }
        const text = await res.text()
        if (!text || text === 'null') { setWaitlistStatus(null); return }
        let payload = null
        try { payload = JSON.parse(text) } catch {}
        const status = payload?.status || (typeof text === 'string' ? text : null)
        setWaitlistStatus(String(status || '').toLowerCase() || null)
      } catch {
        setWaitlistStatus(null)
      }
    })()
  }, [event?.listOnly, isLoggedIn, id])

  // Load tiers when popup opens (auth first)
  useEffect(() => {
    if (!showPopup || !id) return
    const lsKey = `lastTier:${id}`

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

    const load = async () => {
      setTiersLoading(true); setTiersErr(null)
      try {
        let res = await fetchWithAuth(`${API}/events/${id}/tiers`)
        if (res.status === 404) {
          pickDefault(event?.ticketTiers || []); return
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
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPopup, id])

  // ---- VES rate in event
  const vesRate =
    event?.vesRate ?? event?.ves_rate ?? event?.vesPerUsd ?? event?.ves_per_usd ??
    event?.fxVesPerUsd ?? event?.exchangeRateVes ?? event?.exchange_rate_ves ?? null

  // Build payment options for popup
  const payments = event ? {
    country: event.country || '',
    currency: event.currency || '',
    zelle: {
      enabled: !!(event.zelleEmail || event.zellePhone),
      email: event.zelleEmail || '',
      phone: event.zellePhone || '',
    },
    pagoMovil: {
      enabled:
        (String(event.country || '').toLowerCase() === 'venezuela' || String(event.currency || '').toUpperCase() === 'VES')
        && !!event.allowPagoMovil,
      phone: event.pagoMovilPhone || '',
      ci: event.pagoMovilCi || '',
      bank: event.pagoMovilBank || '',
      rate: typeof vesRate === 'number' ? vesRate : undefined, // VES per 1 USD
      country: event.country || ''
    },
    cash: {
      enabled: !!event.allowCash,
      note: event.cashNote || '',
    },
  } : null

  async function uploadProof(ticketId, file, token) {
    const fd = new FormData()
    fd.append('file', file, file.name || 'receipt.jpg') // field name MUST be "file"
    try {
      const res = await fetch(`${API}/api/tickets/${ticketId}/proof`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      })
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        console.warn(`Receipt upload failed for #${ticketId}: ${res.status} ${txt}`)
        return false
      }
      return true
    } catch (e) {
      console.warn(`Receipt upload error for #${ticketId}:`, e)
      return false
    }
  }

  // ---- Waitlist actions
  const openWaitlistModal = () => setWaitlistModal(true)
  const closeWaitlistModal = () => setWaitlistModal(false)

  // FIX: send JSON; accept 200/201/204; treat 409 as already requested (pending)
  const requestWaitlistAccess = async () => {
    if (!isLoggedIn || waitlistBusy) { if (!isLoggedIn) setShowAuth(true); return }
    try {
      setWaitlistBusy(true)
      const name = (localStorage.getItem('fullName') || 'AnonymousUser').trim()

      const res = await fetchWithAuth(`${API}/events/${id}/waitlist/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: name })
      })

      if (res.status === 200 || res.status === 201 || res.status === 204) {
        setWaitlistStatus('pending')
        return
      }
      if (res.status === 409) { // already requested
        setWaitlistStatus('pending')
        return
      }

      // If the backend expects no body, fall back once without a body
      if (res.status === 415 || res.status === 400) {
        const retry = await fetchWithAuth(`${API}/events/${id}/waitlist/request`, { method: 'POST' })
        if (retry.ok) { setWaitlistStatus('pending'); return }
      }

      const msg = await res.text().catch(() => '')
      alert(msg || `Could not submit request (HTTP ${res.status}).`)
    } catch (e) {
      console.error('Waitlist request error:', e)
      alert('Network error requesting access. Please try again.')
    } finally {
      setWaitlistBusy(false)
    }
  }

  // Handle checkout
  const handleBuy = async (method = 'card', extras = {}) => {
    if (checkingOut || clickedOnceRef.current) return
    clickedOnceRef.current = true
    setCheckingOut(true)

    try {
      if (!isLoggedIn) { setShowAuth(true); return }
      if (!email) { alert('Email not available. Please log in again.'); setShowAuth(true); return }
      if (!selectedTierId) { alert('Please select a ticket tier'); return }

      // Gate by waitlist
      if (requiresWaitlist && waitlistStatus !== 'approved') {
        openWaitlistModal()
        return
      }

      const storedRef = localStorage.getItem('wknd_ref')
      const body = {
        eventId: parseInt(id),
        ticketTierId: selectedTierId,
        quantity,
        email,
        ref: refCode || storedRef || null,
        paymentMethod: typeof method === 'string' ? method : 'card',
      }

      if (extras?.discountCode) body.discountCode = String(extras.discountCode).trim().toUpperCase()

      const res = await fetchWithAuth(`${API}/api/tickets/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()

      // Free flow
      if (data.free === true || data.free === 'true') {
        window.location.href = `/#/success?eventId=${id}`
        return
      }

      // Manual flow (Zelle / Pago Móvil / Cash)
      if (data.manual === true) {
        const ids = Array.isArray(data.ticketIds) && data.ticketIds.length
          ? data.ticketIds
          : (data.ticketId != null ? [data.ticketId] : [])

        const file = extras?.receiptFile
        if (file && ids.length > 0) {
          try {
            await Promise.all(ids.map(tid => uploadProof(tid, file, token)))
          } catch (e) {
            console.warn('One or more receipt uploads failed:', e)
          }
        }

        setShowPopup(false)
        const methodLower = String(method || 'card').toLowerCase()
        const since = Date.now()
        window.location.href =
          `/#/success?eventId=${id}&pending=${encodeURIComponent(methodLower)}&since=${since}`
        return
      }

      // Card flow
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

  // ---- Apple Wallet
  const handleAddToAppleWallet = async () => {
    if (!isLoggedIn) { setShowAuth(true); return }
    try {
      const res = await fetchWithAuth(PASS_URL_FOR_EVENT(id), { method: 'GET' })
      if (!res.ok) {
        const t = await res.text().catch(()=> '')
        alert(t || 'Unable to generate Apple Wallet pass yet.')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'ticket.pkpass'
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(()=> URL.revokeObjectURL(url), 2500)
    } catch (e) {
      console.error(e)
      alert('Problem downloading Apple Wallet pass.')
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

  // ---- Register visibility / label with waitlist
  const canRegister = !requiresWaitlist || waitlistStatus === 'approved'
  const registerLabel = requiresWaitlist
    ? (waitlistStatus === 'approved' ? 'Register' :
       waitlistStatus === 'pending' ? 'Request Pending' :
       waitlistStatus === 'denied' ? 'Access Denied' : 'Request Access')
    : 'Register'

  const onRegisterClick = () => {
    if (!isLoggedIn) { setShowAuth(true); return }
    if (requiresWaitlist && waitlistStatus !== 'approved') {
      openWaitlistModal()
      return
    }
    setShowPopup(true)
  }

  // ---- VES for popup (same)
  const vesRateInEvent =
    event?.vesRate ?? event?.ves_rate ?? event?.vesPerUsd ?? event?.ves_per_usd ??
    event?.fxVesPerUsd ?? event?.exchangeRateVes ?? event?.exchange_rate_ves ?? null

  const popupPayments = event ? {
    country: event.country || '',
    currency: event.currency || '',
    zelle: {
      enabled: !!(event.zelleEmail || event.zellePhone),
      email: event.zelleEmail || '',
      phone: event.zellePhone || '',
    },
    pagoMovil: {
      enabled:
        (String(event.country || '').toLowerCase() === 'venezuela' || String(event.currency || '').toUpperCase() === 'VES')
        && !!event.allowPagoMovil,
      phone: event.pagoMovilPhone || '',
      ci: event.pagoMovilCi || '',
      bank: event.pagoMovilBank || '',
      rate: typeof vesRateInEvent === 'number' ? vesRateInEvent : undefined,
      country: event.country || ''
    },
    cash: {
      enabled: !!event.allowCash,
      note: event.cashNote || '',
    },
  } : null

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

        {/* Waitlist banner */}
        {requiresWaitlist && (
          <div className="waitlist-banner">
            {waitlistStatus === 'approved' && <span className="chip ok">✅ Approved</span>}
            {waitlistStatus === 'pending' && <span className="chip warn">⏳ Pending approval</span>}
            {waitlistStatus === 'denied' && <span className="chip bad">❌ Access denied</span>}
            {!waitlistStatus && <span className="chip info">📝 List-only event</span>}
          </div>
        )}

        <div className="event-actions">
        <button className="btn-primary" onClick={onRegisterClick}>
            {registerLabel}
          </button>

          <button
            className="btn-secondary"
            onClick={() => {
              const url = window.location.href
              navigator.clipboard?.writeText(url)
              alert('Event link copied!')
            }}
          >
            Share
          </button>
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

      {/* Waitlist modal */}
      {waitlistModal && (
        <div className="popup-overlay" onClick={closeWaitlistModal}>
          <div className="popup-modal small" onClick={(e)=>e.stopPropagation()}>
            <h3>List-Only Access</h3>
            {waitlistStatus === 'approved' && (
              <p className="muted">✅ You’re approved. You can register now.</p>
            )}
            {waitlistStatus === 'pending' && (
              <p className="muted">⏳ Your request is pending. We’ll notify you when the organizer approves.</p>
            )}
            {waitlistStatus === 'denied' && (
              <p className="muted">❌ The organizer denied access for this event.</p>
            )}
            {!waitlistStatus && (
              <p className="muted">This event requires approval. Request access to continue.</p>
            )}

            <div className="waitlist-actions">
              {!waitlistStatus && (
                <button className="btn-primary" disabled={waitlistBusy} onClick={requestWaitlistAccess}>
                  {waitlistBusy ? 'Sending…' : 'Request Access'}
                </button>
              )}
              <button className="btn-secondary" onClick={closeWaitlistModal}>Close</button>
            </div>
          </div>
        </div>
      )}

      {showPopup && (
        <RegisterPopup
          eventId={id}
          tiers={tiers.length ? tiers : (event.ticketTiers || [])}
          loading={tiersLoading}
          error={tiersErr}
          selectedTierId={selectedTierId}
          quantity={quantity}
          submitting={checkingOut}
          payments={popupPayments}
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
          onPay={(method, extras) => handleBuy(method ?? 'card', extras)}
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
                  await fetchWithAuth(`${API}/api/tickets/confirm?paymentIntentId=${encodeURIComponent(paymentIntentId)}`, {
                    method: 'POST'
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
