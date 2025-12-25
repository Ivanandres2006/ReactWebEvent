import React, { useMemo, useState, useEffect } from 'react'
import './RegisterPopup.css'
import { fetchWithAuth, getAccessToken } from '../lib/authClient'

const API = 'https://backendevent-etce.onrender.com'

// ---- i18n
const DICT = {
  en: {
    selectTicket: 'Select Your Ticket',
    loadingTiers: 'Loading tiers…',
    noTiers: 'No tiers available.',
    quantity: 'Quantity',
    discount: 'Discount',
    clear: 'Clear',
    calculating: 'Calculating fees…',
    estimateHint: 'Showing estimate. Final totals may appear at checkout.',
    card: 'Card',
    cash: 'Cash',
    attachReceipt: 'Attach receipt (image)',
    onlyImages: 'Only image files are allowed.',
    tooLarge: 'Image too large (max 8MB).',
    needReceipt: 'Please attach the receipt image before paying.',
    manualHint: 'Manual methods notify the organizer. You’ll get your ticket by email after they confirm.',
    payCard: 'Pay with card',
    processing: 'Processing…',
    sending: 'Sending…',
    pay: 'Pay',
    afterPayNotify: 'After paying, press Pay to notify the organizer.',
    soldOut: '❌ Sold out',
    notAvailableYet: '⏰ Not yet available',
    available: 'Available',
    left: 'left',
    platformFee: 'Platform fee',
    stripeFee: 'Stripe fee',
    serviceFee: 'Service fee',
    total: 'Total',
    totalEst: 'Total (est.)',
    subtotal: 'Subtotal',
    discountLabel: 'Discount',
    newSubtotal: 'New subtotal',
    dismiss: 'Dismiss',
    feeFail: 'We couldn’t calculate fees right now. You can still continue — totals may show at checkout.',
  },
  es: {
    selectTicket: 'Selecciona tu ticket',
    loadingTiers: 'Cargando tickets…',
    noTiers: 'No hay tickets disponibles.',
    quantity: 'Cantidad',
    discount: 'Descuento',
    clear: 'Quitar',
    calculating: 'Calculando cargos…',
    estimateHint: 'Mostrando estimado. El total final puede aparecer al pagar.',
    card: 'Tarjeta',
    cash: 'Efectivo',
    attachReceipt: 'Adjuntar recibo (imagen)',
    onlyImages: 'Solo se permiten imágenes.',
    tooLarge: 'Imagen muy grande (máx 8MB).',
    needReceipt: 'Adjunta el recibo antes de pagar.',
    manualHint: 'Los métodos manuales notifican al organizador. Recibirás el ticket por email cuando confirmen.',
    payCard: 'Pagar con tarjeta',
    processing: 'Procesando…',
    sending: 'Enviando…',
    pay: 'Pagar',
    afterPayNotify: 'Después de pagar, presiona Pagar para notificar al organizador.',
    soldOut: '❌ Agotado',
    notAvailableYet: '⏰ Aún no disponible',
    available: 'Disponible',
    left: 'disponibles',
    platformFee: 'Cargo de plataforma',
    stripeFee: 'Cargo de Stripe',
    serviceFee: 'Cargo de servicio',
    total: 'Total',
    totalEst: 'Total (est.)',
    subtotal: 'Subtotal',
    discountLabel: 'Descuento',
    newSubtotal: 'Nuevo subtotal',
    dismiss: 'Cerrar',
    feeFail: 'No pudimos calcular los cargos. Igual puedes continuar — el total puede aparecer al pagar.',
  },
}
const useT = (lang) => (key) => DICT[lang]?.[key] ?? DICT.en[key] ?? key

// Fallbacks so we always render something even if everything fails
const FALLBACK_VES_RATE = 179.43
const ENV_VES_RATE = Number(import.meta?.env?.VITE_VES_PER_USD || 0)
const LS_VES_RATE = Number(localStorage.getItem('ves_rate') || 0)

// LocalStorage keys for the live BCV fetch
const BCV_RATE_KEY = 'ves_rate_bcv'
const BCV_TS_KEY = 'ves_rate_bcv_ts'
const BCV_TTL_MS = 30 * 60 * 1000 // 30 minutes

function InlineNotice({ message, onDismiss, dismissLabel = 'Dismiss' }) {
  if (!message) return null
  return (
    <div className="inline-notice">
      <div className="inline-notice-row">
        <span>{message}</span>
        <button className="inline-notice-btn" onClick={onDismiss} type="button">
          {dismissLabel}
        </button>
      </div>
    </div>
  )
}

export default function RegisterPopup({
  lang = 'en',
  eventId,
  tiers,
  loading = false,
  error = null,
  selectedTierId,
  quantity,
  submitting = false,
  payments = null,
  onClose,
  onSelectTier,
  onQuantityChange,
  onPay,
}) {
  const t = useMemo(() => useT(lang), [lang])

  const [method, setMethod] = useState('card')

  const [fee, setFee] = useState(null)
  const [feeLoading, setFeeLoading] = useState(false)
  const [feeHadError, setFeeHadError] = useState(false)
  const [uiErr, setUiErr] = useState(null)

  const [discountCode, setDiscountCode] = useState('')
  const [discountMessage, setDiscountMessage] = useState(null)
  const [lastAppliedCode, setLastAppliedCode] = useState(null)

  const [receiptFile, setReceiptFile] = useState(null)
  const [receiptPreview, setReceiptPreview] = useState('')
  const [receiptError, setReceiptError] = useState('')

  const [bcvRate, setBcvRate] = useState(0)
  const [bcvSource, setBcvSource] = useState('')

  const [token, setToken] = useState(getAccessToken())
  useEffect(() => {
    const onAuth = () => setToken(getAccessToken())
    window.addEventListener('auth:login', onAuth)
    return () => window.removeEventListener('auth:login', onAuth)
  }, [])

  useEffect(() => {
    return () => {
      if (receiptPreview) URL.revokeObjectURL(receiptPreview)
    }
  }, [receiptPreview])

  const isVenezuela = useMemo(() => {
    const country = String(payments?.country || payments?.pagoMovil?.country || '').toLowerCase()
    const currency = String(payments?.currency || '').toUpperCase()
    const pmEnabled = !!payments?.pagoMovil?.enabled
    return country === 'venezuela' || currency === 'VES' || pmEnabled
  }, [payments])

  const showZelle = !!payments?.zelle?.enabled
  const showPM = !!payments?.pagoMovil?.enabled
  const showCash = !!payments?.cash?.enabled
  const showCard = !isVenezuela

  useEffect(() => {
    let cancelled = false
    let intervalId

    const isBadCache = (val) => val === FALLBACK_VES_RATE || (ENV_VES_RATE > 0 && val === ENV_VES_RATE)

    const readCacheFresh = () => {
      const cached = Number(localStorage.getItem(BCV_RATE_KEY) || 0)
      const ts = Number(localStorage.getItem(BCV_TS_KEY) || 0)
      const fresh = cached > 0 && Date.now() - ts < BCV_TTL_MS && !isBadCache(cached)
      if (fresh) {
        setBcvRate(cached)
        setBcvSource('cache')
      } else {
        localStorage.removeItem(BCV_RATE_KEY)
        localStorage.removeItem(BCV_TS_KEY)
      }
      return fresh
    }

    const fetchLive = async () => {
      try {
        const res = await fetch(`${API}/api/fx/ves-per-usd`)
        if (!res.ok) return
        const json = await res.json()
        const rate = Number(json?.vesPerUsd || 0)
        if (!cancelled && Number.isFinite(rate) && rate > 0) {
          setBcvRate(rate)
          setBcvSource(json?.overrideActive ? 'override' : json?.source || 'bcv')
          localStorage.setItem(BCV_RATE_KEY, String(rate))
          localStorage.setItem(BCV_TS_KEY, String(Date.now()))
          localStorage.setItem('ves_rate', String(rate))
        }
      } catch {}
    }

    const onFocus = () => fetchLive()
    const onStorage = (e) => {
      if (e.key === BCV_RATE_KEY && e.newValue) {
        const n = Number(e.newValue)
        if (Number.isFinite(n) && n > 0) {
          setBcvRate(n)
          setBcvSource('cache')
        }
      }
    }

    readCacheFresh()
    fetchLive()
    intervalId = window.setInterval(fetchLive, BCV_TTL_MS)
    window.addEventListener('focus', onFocus)
    window.addEventListener('storage', onStorage)

    return () => {
      cancelled = true
      if (intervalId) window.clearInterval(intervalId)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  useEffect(() => {
    if (!showCard && method === 'card') {
      if (showPM) setMethod('pagoMovil')
      else if (showZelle) setMethod('zelle')
      else if (showCash) setMethod('cash')
    }
  }, [showCard, showPM, showZelle, showCash, method])

  const useVES = method === 'pagoMovil'

  const incomingRate = useMemo(() => {
    if (method === 'pagoMovil') {
      if (Number.isFinite(bcvRate) && bcvRate > 0) return bcvRate
      const fromFeePM = fee && Number(fee?.fxVesPerUsd)
      if (Number.isFinite(fromFeePM) && fromFeePM > 0) return fromFeePM
    } else {
      const fromFee = fee && Number(fee?.fxVesPerUsd)
      if (Number.isFinite(fromFee) && fromFee > 0) return fromFee
      if (Number.isFinite(bcvRate) && bcvRate > 0) return bcvRate
    }

    const organizer = payments?.pagoMovil && Number(payments.pagoMovil.rate)
    if (Number.isFinite(organizer) && organizer > 0) return organizer
    if (ENV_VES_RATE > 0) return ENV_VES_RATE
    if (LS_VES_RATE > 0) return LS_VES_RATE
    return FALLBACK_VES_RATE
  }, [fee, bcvRate, payments, method])

  const vesRate = useMemo(() => {
    if (fee?.currency?.toUpperCase?.() === 'VES') return 1
    return Math.max(0, Number(incomingRate) || 0)
  }, [fee?.currency, incomingRate])

  const fmtUSD = (x) =>
    `$${Number(x || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const fmtVES = (x) =>
    `Bs. ${Number(x || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const fmtCents = (cents) => {
    const baseUSD = Number(cents || 0) / 100
    if (fee?.currency?.toUpperCase?.() === 'VES') return fmtVES(baseUSD)
    if (useVES) return fmtVES(vesRate > 0 ? baseUSD * vesRate : baseUSD)
    return fmtUSD(baseUSD)
  }

  const fmtUnitPrice = (usdNumber) => {
    const usd = Number(usdNumber || 0)
    if (fee?.currency?.toUpperCase?.() === 'VES') return fmtVES(usd)
    if (useVES) return fmtVES(vesRate > 0 ? usd * vesRate : usd)
    return fmtUSD(usd)
  }

  const splitDescription = (txt) =>
    !txt
      ? []
      : [
          ...new Set(
            txt
              .split(/[\n•;]| - |\u2022/g)
              .map((s) => s.replace(/^[-•\u2022]\s*/, '').trim())
              .filter(Boolean)
          ),
        ]

  const isSoldOut = (tier) => Number(tier?.availableQuantity ?? 0) <= 0
  const hasNotStarted = (tier, now) => (tier?.startTime ? now < new Date(tier.startTime) : false)
  const hasEnded = (tier, now) => (tier?.endTime ? now > new Date(tier.endTime) : false)
  const isLockedByTime = (tier, now) => (!tier?.forceOpen && hasNotStarted(tier, now)) || hasEnded(tier, now)

  const nextAvailableTierId = (list) => {
    const now = Date.now()
    const sorted = (list || []).slice().sort((a, b) => (a.tierOrder ?? 0) - (b.tierOrder ?? 0))
    for (const tier of sorted) if (!isSoldOut(tier) && !isLockedByTime(tier, now)) return tier.id
    return null
  }
  const nextId = useMemo(() => nextAvailableTierId(tiers || []), [tiers])

  const isLockedByOrder = (tier) => {
    const force = !!tier?.forceOpen
    if (force) return false
    if (nextId == null) return false
    return tier.id !== nextId
  }

  const isUnavailable = (tier) => {
    const now = Date.now()
    return isSoldOut(tier) || isLockedByTime(tier, now) || isLockedByOrder(tier)
  }

  const hasWindow = (tier) => !!tier?.startTime && !!tier?.endTime
  const fmtWindow = (tier) => {
    const s = tier?.startTime ? new Date(tier.startTime) : null
    const e = tier?.endTime ? new Date(tier.endTime) : null
    const opts = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }
    return s && e ? `${s.toLocaleString(undefined, opts)} – ${e.toLocaleString(undefined, opts)}` : ''
  }

  const availabilityText = (tier) => {
    if (isSoldOut(tier)) return t('soldOut')
    if (hasNotStarted(tier, Date.now()) && !tier?.forceOpen) return t('notAvailableYet')
    const qty = Number(tier?.availableQuantity ?? 0)
    const hide = !!tier?.hideQuantity
    return hide ? t('available') : `${qty} ${t('left')}`
  }

  const selectedTier = useMemo(() => (tiers || []).find((x) => x?.id === selectedTierId), [tiers, selectedTierId])

  const maxQty = useMemo(() => {
    const tierLeft = Number(selectedTier?.availableQuantity ?? 10)
    return Math.max(1, Math.min(10, tierLeft))
  }, [selectedTier])

  useEffect(() => {
    if (quantity > maxQty) onQuantityChange(maxQty)
    else if (quantity < 1) onQuantityChange(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxQty])

  const selectedDisabled = useMemo(() => (selectedTier ? isUnavailable(selectedTier) : false), [selectedTier])

  const needsReceipt = method === 'zelle' || method === 'pagoMovil'
  const canPay = !!selectedTierId && quantity >= 1 && quantity <= maxQty && !selectedDisabled && !submitting

  const methodPretty =
    method === 'pagoMovil' ? 'Pago Móvil' : method === 'zelle' ? 'Zelle' : method === 'cash' ? t('cash') : t('card')

  const handleConfirm = () => {
    if (!canPay) return
    setUiErr(null)
    if (needsReceipt && !receiptFile) {
      setReceiptError(t('needReceipt'))
      return
    }
    onPay?.(method, { discountCode: discountCode.trim() || null, receiptFile: receiptFile || null })
  }

  useEffect(() => {
    setFeeHadError(false)
    setUiErr(null)

    if (!eventId || !selectedTierId || quantity < 1) {
      setFee(null)
      setFeeLoading(false)
      return
    }

    let cancelled = false
    const controller = new AbortController()

    const fetchFee = async () => {
      try {
        setFeeLoading(true)

        const sel = (tiers || []).find((x) => x?.id === selectedTierId)
        const unitPriceCents = Math.round(Number(sel?.price || 0) * 100)

        const params = new URLSearchParams({
          eventId: String(eventId),
          ticketTierId: String(selectedTierId),
          quantity: String(quantity),
          paymentMethod: method,
          unitPriceCents: String(unitPriceCents),
        })
        if (discountCode.trim()) params.append('discountCode', discountCode.trim().toUpperCase())

        const url = `${API}/api/tickets/quote?${params.toString()}`
        let res = await fetchWithAuth(url, { method: 'GET', signal: controller.signal })
        if (!res.ok && res.status !== 401) res = await fetch(url, { method: 'GET', signal: controller.signal })
        if (!res.ok) throw new Error(`fee ${res.status}`)
        const data = await res.json()
        if (!cancelled) {
          setFee(data || null)
          setDiscountMessage(data?.discountMessage || null)
          setLastAppliedCode(data?.discountCodeApplied || null)
        }
      } catch {
        if (!cancelled) {
          setFee(null)
          setFeeHadError(true)
          setUiErr(t('feeFail'))
        }
      } finally {
        if (!cancelled) setFeeLoading(false)
      }
    }

    fetchFee()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [eventId, selectedTierId, quantity, method, token, discountCode, method === 'pagoMovil' ? bcvRate : undefined])

  const feeRows = useMemo(() => {
    const rows = []
    const hasLive = !!fee && typeof fee.totalCents === 'number'
    const priceUSD = Number(selectedTier?.price ?? 0)

    if (hasLive) {
      const qtyText = selectedTier ? `${selectedTier.name} ×${quantity}` : t('subtotal')

      if (
        typeof fee.originalSubtotalCents === 'number' &&
        fee.originalSubtotalCents > 0 &&
        typeof fee.discountCentsApplied === 'number' &&
        fee.discountCentsApplied > 0
      ) {
        rows.push({ label: `${qtyText} (${t('subtotal')})`, value: fmtCents(fee.originalSubtotalCents), strong: false })
        rows.push({
          label: `${t('discountLabel')}${(lastAppliedCode || discountCode) ? ` (${(lastAppliedCode || discountCode).toUpperCase()})` : ''}`,
          value: '− ' + fmtCents(fee.discountCentsApplied),
          strong: false,
        })
        rows.push({ label: t('newSubtotal'), value: fmtCents(fee.subtotalCents), strong: false })
      } else {
        if (typeof fee.subtotalCents === 'number') rows.push({ label: qtyText, value: fmtCents(fee.subtotalCents), strong: false })
      }

      if (typeof fee.platformFeeCents === 'number' && fee.platformFeeCents > 0) rows.push({ label: t('platformFee'), value: fmtCents(fee.platformFeeCents), strong: false })
      if (method === 'card' && typeof fee.stripeFeeCents === 'number' && fee.stripeFeeCents > 0) rows.push({ label: t('stripeFee'), value: fmtCents(fee.stripeFeeCents), strong: false })
      if (typeof fee.serviceFeeCents === 'number' && fee.serviceFeeCents > 0) rows.push({ label: t('serviceFee'), value: fmtCents(fee.serviceFeeCents), strong: false })

      rows.push({ label: t('total'), value: fmtCents(fee.totalCents), strong: true })
      return { rows, isEstimate: false }
    }

    const subtotalCents = Math.round(priceUSD * 100 * quantity)
    rows.push({ label: selectedTier ? `${selectedTier.name} ×${quantity}` : t('subtotal'), value: fmtCents(subtotalCents), strong: false })
    rows.push({ label: t('totalEst'), value: fmtCents(subtotalCents), strong: true })
    return { rows, isEstimate: true }
  }, [fee, selectedTier, quantity, method, vesRate, lastAppliedCode, discountCode, t])

  const onReceiptPick = (file) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setReceiptError(t('onlyImages'))
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      setReceiptError(t('tooLarge'))
      return
    }
    setReceiptError('')
    setReceiptFile(file)
    if (receiptPreview) URL.revokeObjectURL(receiptPreview)
    setReceiptPreview(URL.createObjectURL(file))
  }

  const removeReceipt = () => {
    setReceiptFile(null)
    if (receiptPreview) URL.revokeObjectURL(receiptPreview)
    setReceiptPreview('')
    setReceiptError('')
  }

  return (
    <div className="popup-overlay" onClick={onClose}>
      <div className="popup-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{t('selectTicket')}</h3>

        <InlineNotice message={uiErr} onDismiss={() => setUiErr(null)} dismissLabel={t('dismiss')} />

        {loading ? (
          <div className="empty-tiers">{t('loadingTiers')}</div>
        ) : error ? (
          <div className="empty-tiers">{typeof error === 'string' ? error : (lang === 'es' ? 'No se pudieron cargar los tickets.' : 'Couldn’t load tiers. Try again.')}</div>
        ) : tiers?.length ? (
          tiers
            .slice()
            .sort((a, b) => (a.tierOrder ?? 0) - (b.tierOrder ?? 0))
            .map((tier) => {
              const selected = selectedTierId === tier.id
              const unavailable = isUnavailable(tier)
              const desc = splitDescription(tier.description)
              return (
                <div
                  key={tier.id}
                  className={['ticket-tier', 'rich', selected ? 'selected' : '', unavailable ? 'disabled' : ''].join(' ').trim()}
                  onClick={() => {
                    if (!unavailable) onSelectTier(tier.id)
                  }}
                >
                  <div className="tier-row">
                    <div className="tier-name">{tier.name}</div>
                    <div className="tier-price">{fmtUnitPrice(tier.price)}</div>
                  </div>
                  {desc.length > 0 && <ul className="tier-desc">{desc.map((li, i) => <li key={i}>{li}</li>)}</ul>}
                  <div className="tier-meta">
                    <span className="chip">{availabilityText(tier)}</span>
                    {hasWindow(tier) && <span className="chip light">🕒 {fmtWindow(tier)}</span>}
                  </div>
                </div>
              )
            })
        ) : (
          <div className="empty-tiers">{t('noTiers')}</div>
        )}

        <div className="ticket-quantity">
          <label>{t('quantity')}</label>
          <input
            type="number"
            min="1"
            max={maxQty}
            step="1"
            value={quantity}
            onChange={(e) => {
              const n = parseInt(e.target.value || '1', 10)
              const clamped = isNaN(n) ? 1 : Math.max(1, Math.min(maxQty, n))
              onQuantityChange(clamped)
            }}
          />
        </div>

        <div className="ticket-quantity" style={{ marginTop: 8 }}>
          <label>{t('discount')}</label>
          <div style={{ display: 'flex', gap: 8, width: '100%' }}>
            <input
              type="text"
              placeholder="CODE"
              value={discountCode}
              onChange={(e) => setDiscountCode(e.target.value)}
              style={{ flex: 1 }}
            />
            {discountCode && (
              <button
                className="tab"
                onClick={() => {
                  setDiscountCode('')
                  setLastAppliedCode(null)
                  setDiscountMessage(null)
                }}
                type="button"
              >
                {t('clear')}
              </button>
            )}
          </div>
          {!!discountMessage && <div className="fee-hint">{discountMessage}</div>}
        </div>

        {selectedTierId && quantity >= 1 && (
          <div className="fee-box" aria-live="polite">
            {feeLoading ? (
              <div className="fee-row muted">{t('calculating')}</div>
            ) : (
              <>
                {feeRows.rows.slice(0, -1).map((r, idx) => (
                  <div className="fee-row" key={idx}>
                    <span className="fee-label">{r.label}</span>
                    <span className="fee-value">{r.value}</span>
                  </div>
                ))}
                <div className="fee-divider" />
                {feeRows.rows.slice(-1).map((r, idx) => (
                  <div className={`fee-row ${r.strong ? 'total' : ''}`} key={`t-${idx}`}>
                    <span className="fee-label">{r.label}</span>
                    <span className="fee-value">{r.value}</span>
                  </div>
                ))}
                {feeHadError && <div className="fee-hint">{t('estimateHint')}</div>}
              </>
            )}
          </div>
        )}

        <div className="method-tabs">
          {showCard && (
            <button className={`tab ${method === 'card' ? 'active' : ''}`} onClick={() => setMethod('card')} type="button">
              {t('card')}
            </button>
          )}
          {showPM && (
            <button className={`tab ${method === 'pagoMovil' ? 'active' : ''}`} onClick={() => setMethod('pagoMovil')} type="button">
              Pago Móvil
            </button>
          )}
          {showZelle && (
            <button className={`tab ${method === 'zelle' ? 'active' : ''}`} onClick={() => setMethod('zelle')} type="button">
              Zelle
            </button>
          )}
          {showCash && (
            <button className={`tab ${method === 'cash' ? 'active' : ''}`} onClick={() => setMethod('cash')} type="button">
              {t('cash')}
            </button>
          )}
        </div>

        {method !== 'card' && (
          <div className="alt-details">
            {(method === 'pagoMovil' || method === 'zelle' || method === 'cash') && (
              <div className="alt-box">
                {method === 'pagoMovil' && showPM && (
                  <>
                    {payments?.pagoMovil?.phone && <div>📱 {payments.pagoMovil.phone}</div>}
                    {payments?.pagoMovil?.ci && <div>🪪 CI: {payments.pagoMovil.ci}</div>}
                    {payments?.pagoMovil?.bank && <div>🏦 {payments.pagoMovil.bank}</div>}
                    <div className="alt-note">{t('afterPayNotify')}</div>
                  </>
                )}

                {method === 'zelle' && showZelle && (
                  <>
                    {payments?.zelle?.email && <div>📧 {payments.zelle.email}</div>}
                    {payments?.zelle?.phone && <div>📞 {payments.zelle.phone}</div>}
                    <div className="alt-note">{t('afterPayNotify')}</div>
                  </>
                )}

                {method === 'cash' && showCash && (
                  <>
                    {payments?.cash?.note && <div>📝 {payments.cash.note}</div>}
                    <div className="alt-note">{t('afterPayNotify')}</div>
                  </>
                )}
              </div>
            )}

            {(method === 'zelle' || method === 'pagoMovil') && (
              <div className="receipt-upload">
                <label className="receipt-label">{t('attachReceipt')}</label>
                {!receiptFile ? (
                  <input type="file" accept="image/*" onChange={(e) => onReceiptPick(e.target.files?.[0])} />
                ) : (
                  <div className="receipt-preview">
                    {receiptPreview && <img src={receiptPreview} alt="Receipt preview" />}
                    <button className="remove-receipt" onClick={removeReceipt} type="button">
                      ×
                    </button>
                  </div>
                )}
                {!!receiptError && <div className="error-text">{receiptError}</div>}
              </div>
            )}
          </div>
        )}

        <div className="pay-buttons">
          <button
            className="buy-button"
            disabled={!canPay || (needsReceipt && !receiptFile)}
            onClick={handleConfirm}
            style={submitting ? { pointerEvents: 'none', opacity: 0.6 } : {}}
            type="button"
          >
            {submitting
              ? method === 'card'
                ? t('processing')
                : t('sending')
              : method === 'card'
              ? t('payCard')
              : `${t('pay')} (${methodPretty})`}
          </button>

          {method !== 'card' && (
            <p className="pay-hint">{needsReceipt ? t('needReceipt') : t('manualHint')}</p>
          )}
        </div>
      </div>
    </div>
  )
}
