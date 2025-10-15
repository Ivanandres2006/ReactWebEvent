import React, { useMemo, useState, useEffect } from 'react'
import './RegisterPopup.css'
import { fetchWithAuth, getAccessToken } from '../lib/authClient'
import { useNavigate } from 'react-router-dom'

const API = 'https://backendevent-etce.onrender.com'

const FALLBACK_VES_RATE = 179.43
const ENV_VES_RATE = Number(import.meta?.env?.VITE_VES_PER_USD || 0)
const LS_VES_RATE  = Number(localStorage.getItem('ves_rate') || 0)

const BCV_RATE_KEY = 'ves_rate_bcv'
const BCV_TS_KEY   = 'ves_rate_bcv_ts'
const BCV_TTL_MS   = 30 * 60 * 1000 // 30 min

export default function RegisterPopup({
  eventId, tiers, loading=false, error=null,
  selectedTierId, quantity, submitting=false, payments=null,
  onClose, onSelectTier, onQuantityChange
}) {
  const navigate = useNavigate()
  const [method, setMethod] = useState('card')
  const [token, setToken] = useState(getAccessToken())
  const [fee, setFee] = useState(null)
  const [feeLoading, setFeeLoading] = useState(false)
  const [feeHadError, setFeeHadError] = useState(false)
  const [bcvRate, setBcvRate] = useState(0)
  const [bcvSource, setBcvSource] = useState('')
  const [receiptFile, setReceiptFile] = useState(null)
  const [toast, setToast] = useState('')

  // listen for login refresh
  useEffect(() => {
    const onAuth = () => setToken(getAccessToken())
    window.addEventListener('auth:login', onAuth)
    return () => window.removeEventListener('auth:login', onAuth)
  }, [])

  // ========== Helpers ==========
  const isVenezuela = useMemo(() => {
    const c = String(payments?.country || '').toLowerCase()
    const cur = String(payments?.currency || '').toUpperCase()
    return c === 'venezuela' || cur === 'VES' || !!payments?.pagoMovil?.enabled
  }, [payments])

  const showZelle = !!payments?.zelle?.enabled
  const showPM = !!payments?.pagoMovil?.enabled
  const showCash = !!payments?.cash?.enabled
  const showCard = !isVenezuela

  // redirect toast util
  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 1500)
  }

  // ==== BCV live fetch ====
  useEffect(() => {
    let cancelled = false
    const fetchLive = async () => {
      try {
        const res = await fetch(`${API}/api/fx/ves-per-usd`)
        if (!res.ok) return
        const j = await res.json()
        const rate = Number(j?.vesPerUsd || 0)
        if (!cancelled && rate > 0) {
          setBcvRate(rate)
          setBcvSource(j?.overrideActive ? 'override' : (j?.source || 'bcv'))
          localStorage.setItem(BCV_RATE_KEY, rate)
          localStorage.setItem(BCV_TS_KEY, Date.now())
        }
      } catch {}
    }
    fetchLive()
    const id = setInterval(fetchLive, BCV_TTL_MS)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  // Auto-switch if card hidden
  useEffect(() => {
    if (!showCard && method === 'card') {
      if (showPM) setMethod('pagoMovil')
      else if (showZelle) setMethod('zelle')
      else if (showCash) setMethod('cash')
    }
  }, [showCard, showPM, showZelle, showCash])

  const useVES = method === 'pagoMovil'
  const vesRate = bcvRate || ENV_VES_RATE || LS_VES_RATE || FALLBACK_VES_RATE
  const fmtUSD = (x)=>`$${Number(x||0).toFixed(2)}`
  const fmtVES = (x)=>`Bs. ${Number(x||0).toFixed(2)}`
  const fmtCents = (c)=> useVES?fmtVES((c/100)*vesRate):fmtUSD(c/100)

  // ===== Tier logic =====
  const selectedTier = useMemo(()=>tiers?.find(t=>t.id===selectedTierId),[tiers,selectedTierId])
  const maxQty = Math.max(1, Math.min(10, Number(selectedTier?.availableQuantity??10)))
  const canPay = !!selectedTierId && quantity>=1 && quantity<=maxQty && !submitting

  // ===== Fee quote =====
  useEffect(()=>{
    if(!eventId||!selectedTierId||quantity<1)return
    let cancel=false
    const f=async()=>{
      try{
        setFeeLoading(true)
        const params=new URLSearchParams({eventId,ticketTierId:selectedTierId,quantity,paymentMethod:method})
        let res=await fetchWithAuth(`${API}/api/tickets/quote?${params}`)
        if(!res.ok)res=await fetch(`${API}/api/tickets/quote?${params}`)
        if(!res.ok)throw new Error()
        const d=await res.json()
        if(!cancel)setFee(d)
      }catch{ if(!cancel)setFeeHadError(true) }
      finally{ if(!cancel)setFeeLoading(false) }
    }
    f();return()=>cancel=true
  },[eventId,selectedTierId,quantity,method,token])

  // ===== Checkout handler =====
  const handleCheckout = async()=>{
    if(!canPay)return
    try{
      const payload={eventId,ticketTierId:selectedTierId,quantity,paymentMethod:method}
      const res=await fetchWithAuth(`${API}/api/tickets/checkout`,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(payload)
      })
      if(!res.ok)throw new Error('checkout failed')
      const data=await res.json()
      const ticketIds=data.ticketIds||[]
      const pending=(method!=='card')
      const since=Date.now()

      // upload proof if manual + receipt selected
      if(pending && receiptFile && ticketIds.length>0){
        const fd=new FormData()
        fd.append('file',receiptFile)
        await Promise.all(ticketIds.map(id=>
          fetch(`${API}/api/tickets/${id}/proof`,{
            method:'POST',
            headers:{Authorization:`Bearer ${getAccessToken()}`},
            body:fd
          })
        ))
        showToast('📸 Receipt uploaded successfully — redirecting...')
      }else{
        showToast('✅ Payment successful — redirecting...')
      }

      setTimeout(()=>{
        const q=new URLSearchParams({
          eventId,
          ...(pending?{pending:method,since}:{pi:data.paymentIntentId||''})
        })
        navigate(`/payment/success?${q.toString()}`)
        onClose?.()
      },1500)
    }catch(e){
      console.error(e)
      showToast('❌ Something went wrong.')
    }
  }

  return (
    <>
    <div className="popup-overlay" onClick={onClose}>
      <div className="popup-modal" onClick={e=>e.stopPropagation()}>
        <h3>Select Your Ticket</h3>

        {/* Quantity */}
        {tiers?.length>0 && (
          <>
          <div className="ticket-quantity">
            <label>Quantity</label>
            <input type="number" min="1" max={maxQty}
              value={quantity}
              onChange={e=>onQuantityChange(Math.min(maxQty,Math.max(1,parseInt(e.target.value||1))))}/>
          </div>
          </>
        )}

        {/* Method tabs */}
        <div className="method-tabs">
          {showCard && <button className={`tab ${method==='card'?'active':''}`} onClick={()=>setMethod('card')}>Card</button>}
          {showPM && <button className={`tab ${method==='pagoMovil'?'active':''}`} onClick={()=>setMethod('pagoMovil')}>Pago Móvil</button>}
          {showZelle && <button className={`tab ${method==='zelle'?'active':''}`} onClick={()=>setMethod('zelle')}>Zelle</button>}
          {showCash && <button className={`tab ${method==='cash'?'active':''}`} onClick={()=>setMethod('cash')}>Cash</button>}
        </div>

        {/* Manual details */}
        {method!=='card' && (
          <div className="alt-details">
            <div className="alt-box">
              {method==='pagoMovil'&&(
                <>
                  {payments?.pagoMovil?.phone&&<div>📱 {payments.pagoMovil.phone}</div>}
                  {payments?.pagoMovil?.bank&&<div>🏦 {payments.pagoMovil.bank}</div>}
                  <div className="alt-note">After paying via Pago Móvil, attach a receipt and press Pay.</div>
                </>
              )}
              {method==='zelle'&&(
                <>
                  {payments?.zelle?.email&&<div>📧 {payments.zelle.email}</div>}
                  <div className="alt-note">After sending Zelle, attach a receipt and press Pay.</div>
                </>
              )}
              {method==='cash'&&(
                <>
                  {payments?.cash?.note&&<div>📝 {payments.cash.note}</div>}
                  <div className="alt-note">Press Pay to notify organizer you’ll pay in cash.</div>
                </>
              )}
            </div>

            {(method==='zelle'||method==='pagoMovil')&&(
              <div className="receipt-upload">
                <label className="receipt-label">Upload Receipt (optional)</label>
                <input type="file" accept="image/*" onChange={e=>setReceiptFile(e.target.files?.[0]||null)}/>
                {receiptFile&&(
                  <div className="receipt-preview">
                    <img src={URL.createObjectURL(receiptFile)} alt="Receipt preview"/>
                    <button className="remove-receipt" onClick={()=>setReceiptFile(null)}>×</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <button className="buy-button" disabled={!canPay} onClick={handleCheckout}>
          {submitting?'Processing…':method==='card'?'Pay with card':`Pay (${method})`}
        </button>
        {method!=='card'&&<p className="pay-hint">Manual methods notify the organizer. You’ll get your ticket by email after confirmation.</p>}
      </div>
    </div>

    {toast && <div className="toast-bubble">{toast}</div>}
    </>
  )
}
