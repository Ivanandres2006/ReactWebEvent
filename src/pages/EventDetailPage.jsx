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

import { API, fetchWithAuth, getAccessToken } from '../lib/authClient'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
})

const stripePromise = loadStripe(
  'pk_test_51RcVeBBU1Fa59mBKHvngFVDwq8gBiZ863TKO6okEHBj28VjLiYAUQ5OhDs0k1WEyfqXRmtziurmLYBqlQfyOOl6C007EKiWppc'
)

const isApplePlatform = () => {
  const ua = navigator.userAgent || ''
  return /iPhone|iPad|iPod|Macintosh/.test(ua)
}
const canShowAppleWallet = () => isApplePlatform()
const PASS_URL_FOR_EVENT = (eventId) => `${API}/api/passes/event/${encodeURIComponent(eventId)}`

// ---- i18n (local, no library)
const LANG_KEY = 'wknd_lang'
const getInitialLang = () => {
  const saved = localStorage.getItem(LANG_KEY)
  if (saved === 'en' || saved === 'es') return saved
  const nav = (navigator.language || '').toLowerCase()
  return nav.startsWith('es') ? 'es' : 'en'
}

const DICT = {
  en: {
    loadingEvent: 'Loading event',
    loadingSub: 'Fetching details, tiers, and location…',
    couldntLoadTitle: "Couldn’t load this event",
    couldntLoadBody: 'We couldn’t load this event. Please try again.',
    retry: 'Retry',
    reload: 'Reload',
    shared: 'Shared!',
    linkCopied: 'Link copied!',
    copyFailed: 'Copy failed — please copy from the address bar.',
    shareFailed: 'Could not share. Try copying the link.',
    register: 'Register',
    buy: 'Buy',
    share: 'Share',
    sharing: 'Sharing…',
    about: 'About',
    location: 'Location',
    mapNA: 'Map not available.',
    listOnly: 'List-only event',
    approved: 'Approved',
    pending: 'Pending approval',
    denied: 'Access denied',
    requestAccess: 'Request Access',
    requestPending: 'Request Pending',
    accessDenied: 'Access Denied',
    listOnlyAccess: 'List-Only Access',
    approvedMsg: "✅ You’re approved. You can register now.",
    pendingMsg: "⏳ Your request is pending. We’ll notify you when the organizer approves.",
    deniedMsg: '❌ The organizer denied access for this event.',
    needsApprovalMsg: 'This event requires approval. Request access to continue.',
    sending: 'Sending…',
    close: 'Close',
    dismiss: 'Dismiss',
    selectTierErr: 'Please select a ticket tier.',
    needEmailErr: 'We couldn’t read your email. Please log in again.',
    checkoutFailed: 'Checkout failed. Please try again.',
    unexpected: 'Unexpected server response. Please try again.',
    checkoutError: 'Checkout error. Please try again.',
    walletFail: 'Unable to generate Apple Wallet pass yet.',
    walletProblem: 'Problem downloading Apple Wallet pass.',
  },
  es: {
    loadingEvent: 'Cargando evento',
    loadingSub: 'Obteniendo detalles, tickets y ubicación…',
    couldntLoadTitle: 'No se pudo cargar este evento',
    couldntLoadBody: 'No pudimos cargar este evento. Intenta de nuevo.',
    retry: 'Reintentar',
    reload: 'Recargar',
    shared: '¡Compartido!',
    linkCopied: '¡Link copiado!',
    copyFailed: 'No se pudo copiar — copia desde la barra de dirección.',
    shareFailed: 'No se pudo compartir. Intenta copiar el link.',
    register: 'Registrarse',
    buy: 'Comprar',
    share: 'Compartir',
    sharing: 'Compartiendo…',
    about: 'Descripción',
    location: 'Ubicación',
    mapNA: 'Mapa no disponible.',
    listOnly: 'Evento con lista',
    approved: 'Aprobado',
    pending: 'Pendiente',
    denied: 'Acceso denegado',
    requestAccess: 'Pedir acceso',
    requestPending: 'Solicitud pendiente',
    accessDenied: 'Acceso denegado',
    listOnlyAccess: 'Acceso por lista',
    approvedMsg: '✅ Estás aprobado. Ya puedes registrarte.',
    pendingMsg: '⏳ Tu solicitud está pendiente. Te avisaremos cuando el organizador apruebe.',
    deniedMsg: '❌ El organizador negó el acceso a este evento.',
    needsApprovalMsg: 'Este evento requiere aprobación. Pide acceso para continuar.',
    sending: 'Enviando…',
    close: 'Cerrar',
    dismiss: 'Cerrar',
    selectTierErr: 'Selecciona un tipo de ticket.',
    needEmailErr: 'No pudimos leer tu email. Inicia sesión otra vez.',
    checkoutFailed: 'El pago falló. Intenta de nuevo.',
    unexpected: 'Respuesta inesperada del servidor. Intenta de nuevo.',
    checkoutError: 'Error de pago. Intenta de nuevo.',
    walletFail: 'Aún no se pudo generar el pase de Apple Wallet.',
    walletProblem: 'Problema descargando el pase de Apple Wallet.',
  },
}

const useT = (lang) => (key) => DICT[lang]?.[key] ?? DICT.en[key] ?? key

function formatDate(isoString, lang) {
  const date = new Date(isoString)
  const locale = lang === 'es' ? 'es-VE' : 'en-US'
  return date.toLocaleString(locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function Notice({ type = 'error', message, onRetry, onDismiss, dismissLabel = 'Dismiss', retryLabel = 'Retry' }) {
  if (!message) return null
  const cls = type === 'error' ? 'notice notice-error' : type === 'info' ? 'notice notice-info' : 'notice'
  return (
    <div className={cls} style={{ margin: '12px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <div>{message}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {onRetry && (
            <button className="btn-secondary" onClick={onRetry} type="button">
              {retryLabel}
            </button>
          )}
          {onDismiss && (
            <button className="btn-secondary" onClick={onDismiss} type="button">
              {dismissLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function LanguageButton({ lang, onToggle, size = 'normal' }) {
  const label = `🌐 Language · ${lang === 'en' ? 'EN' : 'ES'}`
  return (
    <button
      className={`btn-secondary lang-toggle ${size === 'small' ? 'lang-toggle--sm' : ''}`}
      onClick={onToggle}
      type="button"
      aria-label="Change language"
      title="Change language"
    >
      {label}
    </button>
  )
}

export default function EventDetailPage() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const rawRef = searchParams.get('ref')
  const refCode = rawRef ? decodeURIComponent(rawRef) : null

  const [lang, setLang] = useState(getInitialLang())
  const t = useMemo(() => useT(lang), [lang])

  const toggleLang = () => {
    const next = lang === 'en' ? 'es' : 'en'
    setLang(next)
    localStorage.setItem(LANG_KEY, next)
    window.dispatchEvent(new Event('wknd:lang'))
  }

  const [event, setEvent] = useState(null)
  const [eventLoading, setEventLoading] = useState(true)
  const [eventErrMsg, setEventErrMsg] = useState(null)

  const [showAuth, setShowAuth] = useState(false)
  const [email, setEmail] = useState('')
  const [selectedTierId, setSelectedTierId] = useState(null)
  const [quantity, setQuantity] = useState(1)
  const [showPopup, setShowPopup] = useState(false)
  const [clientSecret, setClientSecret] = useState(null)

  const [tiers, setTiers] = useState([])
  const [tiersLoading, setTiersLoading] = useState(false)
  const [tiersErr, setTiersErr] = useState(null)

  const [checkingOut, setCheckingOut] = useState(false)
  const clickedOnceRef = useRef(false)
  const [checkoutErrMsg, setCheckoutErrMsg] = useState(null)

  const [waitlistStatus, setWaitlistStatus] = useState(null)
  const [waitlistModal, setWaitlistModal] = useState(false)
  const [waitlistBusy, setWaitlistBusy] = useState(false)

  const [shareMsg, setShareMsg] = useState(null)
  const [shareBusy, setShareBusy] = useState(false)

  const token = getAccessToken()
  const isLoggedIn = !!token
  const requiresWaitlist = !!event?.listOnly

  // ✅ THE IMPORTANT PART:
  // Cedula required ONLY for Venezuela events
  const requireCedula = useMemo(() => {
    return String(event?.country || '').trim().toLowerCase() === 'venezuela'
  }, [event?.country])

  useEffect(() => {
    const onLang = () => setLang(getInitialLang())
    window.addEventListener('wknd:lang', onLang)
    return () => window.removeEventListener('wknd:lang', onLang)
  }, [])

  useEffect(() => {
    const ua = navigator.userAgent || ''
    const isIOSSafari = /iP(hone|od|ad)/.test(ua) && /WebKit/.test(ua) && !/CriOS|FxiOS/.test(ua)
    if (isIOSSafari) document.documentElement.classList.add('ios-safari')
  }, [])

  useEffect(() => {
    if (refCode) localStorage.setItem('wknd_ref', refCode)
  }, [refCode])

  useEffect(() => {
    const open = showAuth || waitlistModal || showPopup || !!clientSecret
    document.body.classList.toggle('body-no-scroll', open)
    return () => document.body.classList.remove('body-no-scroll')
  }, [showAuth, waitlistModal, showPopup, clientSecret])

  // Load user info (store email + cedula)
  useEffect(() => {
    if (!isLoggedIn) return
    fetchWithAuth(`${API}/user/me`)
      .then(async (res) => {
        if (res.status === 401) {
          setShowAuth(true)
          throw new Error('401')
        }
        if (!res.ok) throw new Error('Failed to fetch user')
        return res.json()
      })
      .then((d) => {
        if (d?.email) {
          setEmail(d.email)
          localStorage.setItem('email', d.email)
          if (d?.fullName) localStorage.setItem('fullName', d.fullName)
          if (d?.cedula) localStorage.setItem('cedula', String(d.cedula))
        } else {
          setShowAuth(true)
        }
      })
      .catch(() => {})
  }, [isLoggedIn])

  const loadEvent = async () => {
    if (!id) return
    setEventLoading(true)
    setEventErrMsg(null)
    try {
      const res = await fetch(`${API}/events/${id}`)
      if (!res.ok) throw new Error(`Failed to fetch event: ${res.status}`)
      const data = await res.json()
      if (!data?.title) throw new Error('Invalid event data')
      setEvent(data)
    } catch (e) {
      console.error('❌ Event load error:', e)
      setEventErrMsg(t('couldntLoadBody'))
    } finally {
      setEventLoading(false)
    }
  }

  useEffect(() => {
    loadEvent()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const getShareUrl = () => {
    const origin = window.location.origin
    const path = `/#/event/${id}`
    const qs = refCode ? `?ref=${encodeURIComponent(refCode)}` : ''
    return `${origin}${path}${qs}`
  }

  const handleShare = async () => {
    const url = getShareUrl()
    const title = event?.title ? `WKND — ${event.title}` : 'WKND Event'
    const text = event?.title
      ? lang === 'es'
        ? `Mira este evento: ${event.title}`
        : `Check out: ${event.title}`
      : lang === 'es'
      ? 'Mira este evento de WKND'
      : 'Check out this WKND event'

    setShareMsg(null)
    setShareBusy(true)

    try {
      if (navigator.share) {
        await navigator.share({ title, text, url })
        setShareMsg(t('shared'))
        return
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
        setShareMsg(t('linkCopied'))
        return
      }

      const ta = document.createElement('textarea')
      ta.value = url
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.left = '-9999px'
      document.body.appendChild(ta)
      ta.select()
      ta.setSelectionRange(0, url.length)

      const ok = document.execCommand('copy')
      ta.remove()
      setShareMsg(ok ? t('linkCopied') : t('copyFailed'))
    } catch (e) {
      if (String(e?.name || '').toLowerCase() === 'aborterror') return
      setShareMsg(t('shareFailed'))
    } finally {
      setShareBusy(false)
      setTimeout(() => setShareMsg(null), 1600)
    }
  }

  useEffect(() => {
    if (!event?.listOnly || !isLoggedIn) return
    ;(async () => {
      try {
        const res = await fetchWithAuth(`${API}/events/${id}/waitlist/status`)
        if (!res.ok) {
          setWaitlistStatus(null)
          return
        }
        const text = await res.text()
        if (!text || text === 'null') {
          setWaitlistStatus(null)
          return
        }
        let payload = null
        try {
          payload = JSON.parse(text)
        } catch {}
        const status = payload?.status || (typeof text === 'string' ? text : null)
        setWaitlistStatus(String(status || '').toLowerCase() || null)
      } catch {
        setWaitlistStatus(null)
      }
    })()
  }, [event?.listOnly, isLoggedIn, id])

  useEffect(() => {
    if (!showPopup || !id) return
    const lsKey = `lastTier:${id}`

    const isSoldOut = (t) => Number(t?.availableQuantity ?? 0) <= 0
    const hasNotStarted = (t, now) => (t?.startTime ? now < new Date(t.startTime) : false)
    const hasEnded = (t, now) => (t?.endTime ? now > new Date(t.endTime) : false)
    const isLockedByTime = (t, now) => (!t?.forceOpen && hasNotStarted(t, now)) || hasEnded(t, now)

    const pickDefault = (list) => {
      const finalList = Array.isArray(list) ? list : []
      setTiers(finalList)
      const now = Date.now()
      const saved = parseInt(localStorage.getItem(lsKey) || 'NaN', 10)
      const savedObj = finalList.find((t) => t?.id === saved)
      const savedOk = savedObj && !isSoldOut(savedObj) && !isLockedByTime(savedObj, now)
      if (savedOk) return setSelectedTierId(saved)
      const sorted = finalList.slice().sort((a, b) => (a.tierOrder ?? 0) - (b.tierOrder ?? 0))
      const next = sorted.find((t) => !isSoldOut(t) && !isLockedByTime(t, now))
      setSelectedTierId(next?.id ?? (finalList[0]?.id ?? null))
    }

    const load = async () => {
      setTiersLoading(true)
      setTiersErr(null)
      try {
        let res = await fetchWithAuth(`${API}/events/${id}/tiers`)
        if (res.status === 404) {
          pickDefault(event?.ticketTiers || [])
          return
        }
        if (!res.ok) throw new Error(`Tiers fetch failed: ${res.status}`)
        const data = await res.json()
        const list = Array.isArray(data) ? data : []
        pickDefault(list.length ? list : event?.ticketTiers || [])
      } catch (e) {
        console.warn('⚠️ tiers error, using fallback:', e.message)
        setTiersErr(lang === 'es' ? 'No se pudieron cargar los tickets. Reintenta.' : 'Couldn’t load ticket tiers. You can retry.')
        pickDefault(event?.ticketTiers || [])
      } finally {
        setTiersLoading(false)
      }
    }

    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPopup, id, lang])

  async function uploadProof(ticketId, file, token) {
    const fd = new FormData()
    fd.append('file', file, file.name || 'receipt.jpg')
    try {
      const res = await fetch(`${API}/api/tickets/${ticketId}/proof`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      })
      return res.ok
    } catch {
      return false
    }
  }

  const openWaitlistModal = () => setWaitlistModal(true)
  const closeWaitlistModal = () => setWaitlistModal(false)

  const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()))

  const requestWaitlistAccess = async () => {
    if (!isLoggedIn || waitlistBusy) {
      if (!isLoggedIn) setShowAuth(true)
      return
    }
    try {
      setWaitlistBusy(true)
      await nextFrame()
      const name = (localStorage.getItem('fullName') || 'AnonymousUser').trim()
      const storedRef = localStorage.getItem('wknd_ref')
      const ref = (refCode || storedRef || '').trim()

      const body = new URLSearchParams()
      body.set('fullName', name)
      if (ref) body.set('ref', ref)

      const res = await fetchWithAuth(`${API}/events/${id}/waitlist/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      })

      if ([200, 201, 204, 409].includes(res.status)) {
        setWaitlistStatus('pending')
        return
      }
      if (res.status === 401) {
        setShowAuth(true)
        return
      }

      if ([400, 415].includes(res.status)) {
        const retry = await fetchWithAuth(`${API}/events/${id}/waitlist/request`, { method: 'POST' })
        if (retry.ok) {
          setWaitlistStatus('pending')
          return
        }
      }
    } finally {
      setWaitlistBusy(false)
    }
  }

  const handleBuy = async (method = 'card', extras = {}) => {
    if (checkingOut || clickedOnceRef.current) return
    clickedOnceRef.current = true
    setCheckingOut(true)
    setCheckoutErrMsg(null)

    try {
      if (!isLoggedIn) {
        setShowAuth(true)
        return
      }
      if (!email) {
        setCheckoutErrMsg(t('needEmailErr'))
        setShowAuth(true)
        return
      }
      if (!selectedTierId) {
        setCheckoutErrMsg(t('selectTierErr'))
        return
      }

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

      // ✅ BEST UX: only attach cedula if Venezuela requires it
      if (requireCedula) {
        const cedula = String(extras?.cedula || localStorage.getItem('cedula') || '').trim()
        if (cedula) body.cedula = cedula
      }

      const res = await fetchWithAuth(`${API}/api/tickets/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      let data = null
      try {
        data = await res.json()
      } catch {
        data = null
      }

      if (!res.ok) {
        const msg = data?.error || data?.message || t('checkoutFailed')
        setCheckoutErrMsg(msg)
        return
      }

      if (data?.free === true || data?.free === 'true') {
        window.location.href = `/#/success?eventId=${id}`
        return
      }

      if (data?.manual === true) {
        const ids =
          Array.isArray(data.ticketIds) && data.ticketIds.length
            ? data.ticketIds
            : data.ticketId != null
            ? [data.ticketId]
            : []

        const file = extras?.receiptFile
        if (file && ids.length > 0) {
          try {
            await Promise.all(ids.map((tid) => uploadProof(tid, file, token)))
          } catch {}
        }

        setShowPopup(false)
        const methodLower = String(method || 'card').toLowerCase()
        const since = Date.now()
        window.location.href = `/#/success?eventId=${id}&pending=${encodeURIComponent(methodLower)}&since=${since}`
        return
      }

      if (data?.clientSecret) {
        setClientSecret(data.clientSecret)
        setShowPopup(false)
        return
      }

      setCheckoutErrMsg(data?.error || t('unexpected'))
    } catch (err) {
      console.error('❌ Checkout failed:', err)
      setCheckoutErrMsg(t('checkoutError'))
    } finally {
      setCheckingOut(false)
      clickedOnceRef.current = false
    }
  }

  const handleAddToAppleWallet = async () => {
    if (!isLoggedIn) {
      setShowAuth(true)
      return
    }
    try {
      const res = await fetchWithAuth(PASS_URL_FOR_EVENT(id), { method: 'GET' })
      if (!res.ok) {
        const ttxt = await res.text().catch(() => '')
        setCheckoutErrMsg(ttxt || t('walletFail'))
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
      setTimeout(() => URL.revokeObjectURL(url), 2500)
    } catch (e) {
      console.error(e)
      setCheckoutErrMsg(t('walletProblem'))
    }
  }

  if (eventLoading) {
    return (
      <div className="event-loading">
        <div className="loader-card">
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <LanguageButton lang={lang} onToggle={toggleLang} size="small" />
          </div>

          <div className="loader-top">
            <div className="loader-spinner" aria-hidden="true" />
            <div>
              <div className="loader-title">{t('loadingEvent')}</div>
              <div className="loader-sub">{t('loadingSub')}</div>
            </div>
          </div>

          <div className="loader-bar">
            <span />
          </div>

          <div className="loader-dots" aria-label="Loading">
            <span />
            <span />
            <span />
          </div>
        </div>
      </div>
    )
  }

  if (eventErrMsg) {
    return (
      <div className="event-error">
        <div className="loader-card">
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <LanguageButton lang={lang} onToggle={toggleLang} size="small" />
          </div>

          <div className="loader-title">{t('couldntLoadTitle')}</div>
          <div className="loader-sub">{eventErrMsg}</div>

          <div className="loader-actions">
            <button className="btn-primary" onClick={loadEvent} type="button">
              {t('retry')}
            </button>
            <button className="btn-secondary" onClick={() => window.location.reload()} type="button">
              {t('reload')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!event) return <div className="event-loading">{t('loadingEvent')}...</div>

  const registerLabel = requiresWaitlist
    ? waitlistStatus === 'approved'
      ? t('buy')
      : waitlistStatus === 'pending'
      ? t('requestPending')
      : waitlistStatus === 'denied'
      ? t('accessDenied')
      : t('requestAccess')
    : t('register')

  const onRegisterClick = () => {
    if (!isLoggedIn) {
      setShowAuth(true)
      return
    }
    if (requiresWaitlist && waitlistStatus !== 'approved') {
      openWaitlistModal()
      return
    }
    setShowPopup(true)
  }

  const popupPayments2 = event
    ? {
        country: event.country || '',
        currency: event.currency || '',
        zelle: {
          enabled: !!(event.zelleEmail || event.zellePhone),
          email: event.zelleEmail || '',
          phone: event.zellePhone || '',
        },
        pagoMovil: {
          enabled:
            (String(event.country || '').toLowerCase() === 'venezuela' ||
              String(event.currency || '').toUpperCase() === 'VES') &&
            !!event.allowPagoMovil,
          phone: event.pagoMovilPhone || '',
          ci: event.pagoMovilCi || '',
          bank: event.pagoMovilBank || '',
          country: event.country || '',
        },
        cash: { enabled: !!event.allowCash, note: event.cashNote || '' },
      }
    : null

  const hasLatLng = typeof event.latitude === 'number' && typeof event.longitude === 'number'

  return (
    <div className="event-fullscreen">
      <div className="event-top-section">
        <img
          src={event?.imageUrl && event.imageUrl !== 'null' ? event.imageUrl : defaultEvent}
          alt="Event"
          className="event-hero-image"
          onError={(e) => {
            e.currentTarget.onerror = null
            e.currentTarget.src = defaultEvent
          }}
        />
      </div>

      <div className="event-content">
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <LanguageButton lang={lang} onToggle={toggleLang} />
        </div>

        <h1 className="event-title">{event?.title}</h1>
        <p className="event-date">📅 {event?.dateTime ? formatDate(event.dateTime, lang) : ''}</p>
        <p className="event-location">📍 {event?.location || ''}</p>

        <Notice type="error" message={checkoutErrMsg} onDismiss={() => setCheckoutErrMsg(null)} dismissLabel={t('dismiss')} />
        <Notice type="info" message={shareMsg} onDismiss={() => setShareMsg(null)} dismissLabel={t('dismiss')} />

        {requiresWaitlist && (
          <div className="waitlist-banner">
            {waitlistStatus === 'approved' && <span className="chip ok">✅ {t('approved')}</span>}
            {waitlistStatus === 'pending' && <span className="chip warn">⏳ {t('pending')}</span>}
            {waitlistStatus === 'denied' && <span className="chip bad">❌ {t('denied')}</span>}
            {!waitlistStatus && <span className="chip info">📝 {t('listOnly')}</span>}
          </div>
        )}

        <div className="event-actions">
          <button className="btn-primary" onClick={onRegisterClick}>
            {registerLabel}
          </button>
          <button className="btn-secondary" onClick={handleShare} disabled={shareBusy}>
            {shareBusy ? t('sharing') : t('share')}
          </button>
        </div>

        <div className="event-about">
          <h3>{t('about')}</h3>
          <p>{event?.description || (lang === 'es' ? 'Sin descripción.' : 'No description provided.')}</p>
        </div>

        <div className="event-map">
          <h3>{t('location')}</h3>
          {hasLatLng ? (
            <div style={{ height: '300px', borderRadius: '16px', overflow: 'hidden', marginTop: '12px' }}>
              <MapContainer center={[event.latitude, event.longitude]} zoom={15} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
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
            <div className="map-placeholder">{t('mapNA')}</div>
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
            <a className="footer-link" href="https://www.instagram.com/wknd.app/" target="_blank" rel="noreferrer" aria-label="Instagram" title="Instagram">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5m0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7m5 3a5 5 0 1 1 0 10a5 5 0 0 1 0-10m0 2a3 3 0 1 0 0 6a3 3 0 0 0 0-6m5.5-.75a1.25 1.25 0 1 1 0 2.5a1.25 1.25 0 0 1 0-2.5Z"
                />
              </svg>
              <span>@wknd</span>
            </a>

            <a className="footer-link" href="mailto:support@wknd.events?subject=WKND%20Support" title="Contact support">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M20 4H4a2 2 0 0 0-2 2v.4l10 6.25L22 6.4V6a2 2 0 0 0-2-2Zm2 5.25L12.52 15a1 1 0 0 1-1 0L2 9.25V18a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9.25Z"
                />
              </svg>
              <span>support@wkndevent.com</span>
            </a>
          </div>

          <div className="copy">© {new Date().getFullYear()} WKND — All rights reserved</div>
        </div>
      </footer>

      <AuthModal
        isOpen={showAuth && !isLoggedIn}
        onClose={() => {
          setShowAuth(false)
          window.location.reload()
        }}
      />

      {waitlistModal && (
        <div className="popup-overlay" onClick={closeWaitlistModal}>
          <div className="popup-modal small" onClick={(e) => e.stopPropagation()}>
            <h3>{t('listOnlyAccess')}</h3>
            {waitlistStatus === 'approved' && <p className="muted">{t('approvedMsg')}</p>}
            {waitlistStatus === 'pending' && <p className="muted">{t('pendingMsg')}</p>}
            {waitlistStatus === 'denied' && <p className="muted">{t('deniedMsg')}</p>}
            {!waitlistStatus && <p className="muted">{t('needsApprovalMsg')}</p>}

            <div className="waitlist-actions">
              {!waitlistStatus && (
                <button className="btn-primary" disabled={waitlistBusy} onClick={requestWaitlistAccess}>
                  {waitlistBusy ? t('sending') : t('requestAccess')}
                </button>
              )}
              <button className="btn-secondary" onClick={closeWaitlistModal}>
                {t('close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPopup && (
        <RegisterPopup
          lang={lang}
          eventId={id}
          tiers={tiers.length ? tiers : event.ticketTiers || []}
          loading={tiersLoading}
          error={tiersErr}
          selectedTierId={selectedTierId}
          quantity={quantity}
          submitting={checkingOut}
          payments={popupPayments2}

          // ✅ FIX: only Venezuela shows cedula
          requireCedula={requireCedula}

          onClose={() => {
            setShowPopup(false)
            setSelectedTierId(null)
            setCheckingOut(false)
            clickedOnceRef.current = false
          }}
          onSelectTier={(tierId) => {
            setSelectedTierId(tierId)
            try {
              localStorage.setItem(`lastTier:${id}`, String(tierId))
            } catch {}
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
                  await fetchWithAuth(`${API}/api/tickets/confirm?paymentIntentId=${encodeURIComponent(paymentIntentId)}`, { method: 'POST' })
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
