// RegisterPopup.jsx
import React, { useMemo, useState, useEffect } from 'react'
import './RegisterPopup.css'
import { fetchWithAuth, getAccessToken } from '../lib/authClient'

const API = 'https://backendevent-etce.onrender.com'

// Fallbacks so we always render something even if everything fails
const FALLBACK_VES_RATE = 179.43
const ENV_VES_RATE = Number(import.meta?.env?.VITE_VES_PER_USD || 0)
const LS_VES_RATE  = Number(localStorage.getItem('ves_rate') || 0)

// LocalStorage keys for the live BCV fetch
const BCV_RATE_KEY = 'ves_rate_bcv'
const BCV_TS_KEY   = 'ves_rate_bcv_ts'
const BCV_TTL_MS   = 30 * 60 * 1000 // 30 minutes

export default function RegisterPopup({
  eventId, tiers, loading=false, error=null,
  selectedTierId, quantity, submitting=false, payments=null,
  onClose, onSelectTier, onQuantityChange, onPay,
}) {
  const [method, setMethod] = useState('card')

  const [fee, setFee] = useState(null)
  const [feeLoading, setFeeLoading] = useState(false)
  const [feeHadError, setFeeHadError] = useState(false)

  // ==== Live BCV state (preferred source for Pago Móvil) ====
  const [bcvRate, setBcvRate] = useState(0)
  const [bcvSource, setBcvSource] = useState('') // 'override' | 'bcv' | 'cache' | ''

  // Re-read token when login happens in modal
  const [token, setToken] = useState(getAccessToken())
  const [uploading, setUploading] = useState(false)
  const [receiptUrl, setReceiptUrl] = useState(null)

  useEffect(() => {
    const onAuth = () => setToken(getAccessToken())
    window.addEventListener('auth:login', onAuth)
    return () => window.removeEventListener('auth:login', onAuth)
  }, [])

  // ===== Detect Venezuela -> hide Card =====
  const isVenezuela = useMemo(() => {
    const country  = String(payments?.country || payments?.pagoMovil?.country || '').toLowerCase()
    const currency = String(payments?.currency || '').toUpperCase()
    const pmEnabled = !!payments?.pagoMovil?.enabled
    return country === 'venezuela' || currency === 'VES' || pmEnabled
  }, [payments])

  const showZelle = !!payments?.zelle?.enabled
  const showPM    = !!payments?.pagoMovil?.enabled
  const showCash  = !!payments?.cash?.enabled
  const showCard  = !isVenezuela

  // ==== Fetch BCV on mount; refresh every 30 minutes; also on focus; react to storage ====
  useEffect(() => {
    let cancelled = false
    let intervalId

    const isBadCache = (val) =>
      val === FALLBACK_VES_RATE || (ENV_VES_RATE > 0 && val === ENV_VES_RATE)

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
          setBcvSource(json?.overrideActive ? 'override' : (json?.source || 'bcv'))
          localStorage.setItem(BCV_RATE_KEY, String(rate))
          localStorage.setItem(BCV_TS_KEY, String(Date.now()))
          // legacy key compatibility
          localStorage.setItem('ves_rate', String(rate))
        }
      } catch { /* ignore; UI will use fallbacks */ }
    }

    // on focus, refresh
    const onFocus = () => { fetchLive() }

    // from other tabs (e.g., admin)
    const onStorage = (e) => {
      if (e.key === BCV_RATE_KEY && e.newValue) {
        const n = Number(e.newValue)
        if (Number.isFinite(n) && n > 0) {
          setBcvRate(n)
          setBcvSource('cache')
        }
      }
    }

    // Try cache (if good) then ALWAYS fetch to refresh
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

  // ===== Currency / formatting
  const useVES = method === 'pagoMovil'

  // 🔑 Priority: for Pago Móvil use the freshest live BCV; for others use fee.fx first.
  const incomingRate = useMemo(() => {
    if (method === 'pagoMovil') {
      if (Number.isFinite(bcvRate) && bcvRate > 0) return bcvRate
      const fromFeePM = fee && Number(fee.fxVesPerUsd)
      if (Number.isFinite(fromFeePM) && fromFeePM > 0) return fromFeePM
    } else {
      const fromFee = fee && Number(fee.fxVesPerUsd)
      if (Number.isFinite(fromFee) && fromFee > 0) return fromFee
      if (Number.isFinite(bcvRate) && bcvRate > 0) return bcvRate
    }

    const organizer = payments?.pagoMovil && Number(payments.pagoMovil.rate)
    if (Number.isFinite(organizer) && organizer > 0) return organizer

    if (ENV_VES_RATE > 0) return ENV_VES_RATE
    if (LS_VES_RATE  > 0) return LS_VES_RATE
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
    !txt ? [] : [...new Set(
      txt.split(/[\n•;]| - |\u2022/g)
         .map(s => s.replace(/^[-•\u2022]\s*/, '').trim())
         .filter(Boolean)
    )]

  const selectedTier = useMemo(
    () => (tiers || []).find((t) => t?.id === selectedTierId),
    [tiers, selectedTierId]
  )

  const canPay = !!selectedTierId && !submitting

  const handleConfirm = () => { if (canPay) onPay?.(method) }

  return (
    <div className="popup-overlay" onClick={onClose}>
      <div className="popup-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Select Your Ticket</h3>

        {method !== 'card' && (
          <div className="alt-details">
            {method === 'pagoMovil' && showPM && (
              <div className="alt-box">
                {payments?.pagoMovil?.phone && <div>📱 {payments.pagoMovil.phone}</div>}
                {payments?.pagoMovil?.ci    && <div>🪪 CI: {payments.pagoMovil.ci}</div>}
                {payments?.pagoMovil?.bank  && <div>🏦 {payments.pagoMovil.bank}</div>}
                <div className="alt-note">After paying via Pago Móvil, press <strong>Pay</strong> to notify the organizer.</div>

                {/* RECEIPT UPLOAD ADDED */}
                <label>Upload receipt (image)</label>
                <input type="file" accept="image/*" disabled={uploading}
                  onChange={async(e)=>{
                    const file=e.target.files?.[0]
                    if(!file)return
                    if(file.size>25*1024*1024){alert('File too large (max 25 MB)');return}
                    try{
                      setUploading(true)
                      const f=new FormData();f.append('file',file)
                      const res=await fetch(`${API}/api/tickets/${selectedTierId}/proof`,{
                        method:'POST',
                        headers:token?{Authorization:`Bearer ${token}`}:{},
                        body:f,
                      })
                      const data=await res.json()
                      if(res.ok&&data?.proofUrl){
                        setReceiptUrl(data.proofUrl)
                        alert('✅ Receipt uploaded successfully.')
                      }else alert(data?.error||'Upload failed.')
                    }catch(err){console.error(err);alert('Network error')}
                    finally{setUploading(false)}
                  }}/>
                {uploading&&<div>Uploading…</div>}
                {receiptUrl&&<img src={receiptUrl} alt="receipt" style={{marginTop:'8px',maxWidth:'100%',borderRadius:'6px'}}/>}
              </div>
            )}
            {method === 'zelle' && showZelle && (
              <div className="alt-box">
                {payments?.zelle?.email && <div>📧 {payments.zelle.email}</div>}
                {payments?.zelle?.phone && <div>📞 {payments.zelle.phone}</div>}
                <div className="alt-note">After sending your Zelle payment, press <strong>Pay</strong> to notify the organizer.</div>

                {/* RECEIPT UPLOAD ADDED */}
                <label>Upload receipt (image)</label>
                <input type="file" accept="image/*" disabled={uploading}
                  onChange={async(e)=>{
                    const file=e.target.files?.[0]
                    if(!file)return
                    if(file.size>25*1024*1024){alert('File too large (max 25 MB)');return}
                    try{
                      setUploading(true)
                      const f=new FormData();f.append('file',file)
                      const res=await fetch(`${API}/api/tickets/${selectedTierId}/proof`,{
                        method:'POST',
                        headers:token?{Authorization:`Bearer ${token}`}:{},
                        body:f,
                      })
                      const data=await res.json()
                      if(res.ok&&data?.proofUrl){
                        setReceiptUrl(data.proofUrl)
                        alert('✅ Receipt uploaded successfully.')
                      }else alert(data?.error||'Upload failed.')
                    }catch(err){console.error(err);alert('Network error')}
                    finally{setUploading(false)}
                  }}/>
                {uploading&&<div>Uploading…</div>}
                {receiptUrl&&<img src={receiptUrl} alt="receipt" style={{marginTop:'8px',maxWidth:'100%',borderRadius:'6px'}}/>}
              </div>
            )}
            {method === 'cash' && showCash && (
              <div className="alt-box">
                {payments?.cash?.note && <div>📝 {payments.cash.note}</div>}
                <div className="alt-note">Press <strong>Pay</strong> to notify the organizer that you’ll pay in cash.</div>

                {/* RECEIPT UPLOAD ADDED */}
                <label>Upload receipt (optional)</label>
                <input type="file" accept="image/*" disabled={uploading}
                  onChange={async(e)=>{
                    const file=e.target.files?.[0]
                    if(!file)return
                    if(file.size>25*1024*1024){alert('File too large (max 25 MB)');return}
                    try{
                      setUploading(true)
                      const f=new FormData();f.append('file',file)
                      const res=await fetch(`${API}/api/tickets/${selectedTierId}/proof`,{
                        method:'POST',
                        headers:token?{Authorization:`Bearer ${token}`}:{},
                        body:f,
                      })
                      const data=await res.json()
                      if(res.ok&&data?.proofUrl){
                        setReceiptUrl(data.proofUrl)
                        alert('✅ Receipt uploaded successfully.')
                      }else alert(data?.error||'Upload failed.')
                    }catch(err){console.error(err);alert('Network error')}
                    finally{setUploading(false)}
                  }}/>
                {uploading&&<div>Uploading…</div>}
                {receiptUrl&&<img src={receiptUrl} alt="receipt" style={{marginTop:'8px',maxWidth:'100%',borderRadius:'6px'}}/>}
              </div>
            )}
          </div>
        )}

        <div className="pay-buttons">
          <button
            className="buy-button"
            disabled={!canPay}
            onClick={handleConfirm}
            style={submitting ? { pointerEvents: 'none', opacity: 0.6 } : {}}
          >
            {submitting
              ? (method==='card' ? 'Processing…' : 'Sending…')
              : (method==='card' ? 'Pay with card' : `Pay (${method})`)}
          </button>
        </div>
      </div>
    </div>
  )
}
