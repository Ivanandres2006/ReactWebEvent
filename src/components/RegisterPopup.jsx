import React, { useMemo, useState, useEffect } from 'react'
import './RegisterPopup.css'
import { fetchWithAuth, getAccessToken } from '../lib/authClient'

const API = 'https://backendevent-etce.onrender.com'
const FALLBACK_VES_RATE = 179.43
const ENV_VES_RATE = Number(import.meta?.env?.VITE_VES_PER_USD || 0)
const LS_VES_RATE  = Number(localStorage.getItem('ves_rate') || 0)
const BCV_RATE_KEY = 'ves_rate_bcv'
const BCV_TS_KEY   = 'ves_rate_bcv_ts'
const BCV_TTL_MS   = 30 * 60 * 1000 // 30min

export default function RegisterPopup({
  eventId, tiers, loading=false, error=null,
  selectedTierId, quantity, submitting=false, payments=null,
  onClose, onSelectTier, onQuantityChange, onPay,
}) {
  const [method, setMethod] = useState('card')
  const [fee, setFee] = useState(null)
  const [feeLoading, setFeeLoading] = useState(false)
  const [bcvRate, setBcvRate] = useState(0)
  const [token, setToken] = useState(getAccessToken())
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [receiptUrl, setReceiptUrl] = useState(null)
  const [ticketId, setTicketId] = useState(null)

  useEffect(()=>{
    const onAuth=()=>setToken(getAccessToken())
    window.addEventListener('auth:login',onAuth)
    return()=>window.removeEventListener('auth:login',onAuth)
  },[])

  const isVenezuela=useMemo(()=>{
    const country=String(payments?.country||payments?.pagoMovil?.country||'').toLowerCase()
    const currency=String(payments?.currency||'').toUpperCase()
    const pmEnabled=!!payments?.pagoMovil?.enabled
    return country==='venezuela'||currency==='VES'||pmEnabled
  },[payments])

  const showZelle=!!payments?.zelle?.enabled
  const showPM=!!payments?.pagoMovil?.enabled
  const showCash=!!payments?.cash?.enabled
  const showCard=!isVenezuela

  // === BCV fetch ===
  useEffect(()=>{
    const readCache=()=>{
      const c=Number(localStorage.getItem(BCV_RATE_KEY)||0)
      const ts=Number(localStorage.getItem(BCV_TS_KEY)||0)
      const fresh=c>0&&Date.now()-ts<BCV_TTL_MS
      if(fresh){setBcvRate(c);return true}
      return false
    }
    const fetchLive=async()=>{
      try{
        const res=await fetch(`${API}/api/fx/ves-per-usd`)
        if(!res.ok)return
        const j=await res.json()
        const r=Number(j?.vesPerUsd||0)
        if(r>0){
          setBcvRate(r)
          localStorage.setItem(BCV_RATE_KEY,String(r))
          localStorage.setItem(BCV_TS_KEY,String(Date.now()))
        }
      }catch{}
    }
    readCache()||fetchLive()
  },[])

  // === Upload receipt ===
  async function uploadReceipt(file){
    if(!file||!ticketId)return
    if(file.size>25*1024*1024){alert('File too large (max 25 MB)');return}
    setUploading(true)
    setProgress(0)
    try{
      const f=new FormData();f.append('file',file)
      const xhr=new XMLHttpRequest()
      xhr.open('POST',`${API}/api/tickets/${ticketId}/proof`)
      if(token)xhr.setRequestHeader('Authorization',`Bearer ${token}`)
      xhr.upload.onprogress=e=>{
        if(e.lengthComputable)setProgress(Math.round((e.loaded/e.total)*100))
      }
      xhr.onload=()=>{
        setUploading(false)
        if(xhr.status===200){
          const data=JSON.parse(xhr.responseText)
          setReceiptUrl(data.proofUrl)
          alert('✅ Receipt uploaded successfully.')
        }else alert('Upload failed')
      }
      xhr.onerror=()=>{setUploading(false);alert('Upload error')}
      xhr.send(f)
    }catch{setUploading(false);alert('Network error')}
  }

  // === Fees ===
  const useVES=method==='pagoMovil'
  const vesRate=bcvRate||ENV_VES_RATE||LS_VES_RATE||FALLBACK_VES_RATE
  const fmtUSD=x=>`$${Number(x||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`
  const fmtVES=x=>`Bs. ${Number(x||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`
  const fmtCents=c=>{
    const usd=Number(c||0)/100
    return useVES?fmtVES(usd*vesRate):fmtUSD(usd)
  }

  useEffect(()=>{
    if(!eventId||!selectedTierId||quantity<1)return
    let cancel=false
    const load=async()=>{
      try{
        setFeeLoading(true)
        const q=new URLSearchParams({eventId,ticketTierId:selectedTierId,quantity,paymentMethod:method})
        const res=await fetchWithAuth(`${API}/api/tickets/quote?${q}`,{method:'GET'})
        const data=await res.json()
        if(!cancel)setFee(data)
      }catch{}finally{if(!cancel)setFeeLoading(false)}
    }
    load()
    return()=>{cancel=true}
  },[eventId,selectedTierId,quantity,method])

  const selectedTier=(tiers||[]).find(t=>t?.id===selectedTierId)
  const canPay=!!selectedTierId&&!submitting

  const feeRows=useMemo(()=>{
    if(!fee)return[]
    const rows=[]
    rows.push({label:`${selectedTier?.name||'Subtotal'} ×${quantity}`,value:fmtCents(fee.subtotalCents)})
    if(fee.serviceFeeCents>0)rows.push({label:'Service fee',value:fmtCents(fee.serviceFeeCents)})
    if(fee.stripeFeeCents>0&&method==='card')rows.push({label:'Stripe fee',value:fmtCents(fee.stripeFeeCents)})
    rows.push({label:'Total',value:fmtCents(fee.totalCents),strong:true})
    return rows
  },[fee,selectedTier,quantity,method,vesRate])

  // === Checkout ===
  const handleConfirm=async()=>{
    try{
      const res=await fetchWithAuth(`${API}/api/tickets/checkout`,{
        method:'POST',
        body:JSON.stringify({
          eventId,
          ticketTierId:selectedTierId,
          quantity,
          email:localStorage.getItem('user_email'),
          paymentMethod:method
        })
      })
      const data=await res.json()
      if(!res.ok)throw new Error(data?.error||'Checkout failed')
      if(data?.ticketId)setTicketId(data.ticketId)
      if(method==='card'){
        onPay?.('card',data)
      }else{
        alert('✅ Payment recorded. Upload your receipt below.')
      }
    }catch(e){alert(e.message||'Error during checkout')}
  }

  return(
    <div className="popup-overlay"onClick={onClose}>
      <div className="popup-modal"onClick={e=>e.stopPropagation()}>
        <h3>Select Your Ticket</h3>

        {tiers?.length ? (
          tiers.map(t=>{
            const selected=selectedTierId===t.id
            return(
              <div key={t.id}
                className={`ticket-tier rich ${selected?'selected':''}`}
                onClick={()=>onSelectTier(t.id)}>
                <div className="tier-row">
                  <div className="tier-name">{t.name}</div>
                  <div className="tier-price">{fmtUSD(t.price)}</div>
                </div>
                {t.description&&<div className="tier-desc">{t.description}</div>}
              </div>
            )
          })
        ):<div>No tiers</div>}

        <div className="ticket-quantity">
          <label>Quantity</label>
          <input type="number"min="1"max="10"value={quantity}
            onChange={e=>onQuantityChange(Math.max(1,Math.min(10,Number(e.target.value)||1)))}/>
        </div>

        {selectedTierId&&quantity>=1&&(
          <div className="fee-box">
            {feeLoading?<div className="fee-row muted">Calculating fees…</div>:
              feeRows.map((r,i)=>(
                <div key={i}className={`fee-row${r.strong?' total':''}`}>
                  <span>{r.label}</span><span>{r.value}</span>
                </div>
              ))}
          </div>
        )}

        <div className="method-tabs">
          {showCard&&<button className={`tab ${method==='card'?'active':''}`}onClick={()=>setMethod('card')}>Card</button>}
          {showPM&&<button className={`tab ${method==='pagoMovil'?'active':''}`}onClick={()=>setMethod('pagoMovil')}>Pago Móvil</button>}
          {showZelle&&<button className={`tab ${method==='zelle'?'active':''}`}onClick={()=>setMethod('zelle')}>Zelle</button>}
          {showCash&&<button className={`tab ${method==='cash'?'active':''}`}onClick={()=>setMethod('cash')}>Cash</button>}
        </div>

        {/* Alternate methods */}
        {method!=='card'&&(
          <div className="alt-details">
            {method==='pagoMovil'&&showPM&&(
              <div className="alt-box">
                <div>📱 {payments?.pagoMovil?.phone}</div>
                <div>🪪 CI: {payments?.pagoMovil?.ci}</div>
                <div>🏦 {payments?.pagoMovil?.bank}</div>
              </div>
            )}
            {method==='zelle'&&showZelle&&<div className="alt-box">📧 {payments?.zelle?.email}</div>}
            {method==='cash'&&showCash&&<div className="alt-box">📝 {payments?.cash?.note}</div>}

            {ticketId&&(
              <>
                <label className="receipt-label">Upload receipt (image)</label>
                <input type="file"accept="image/*"disabled={uploading}
                  onChange={e=>uploadReceipt(e.target.files?.[0])}/>
                {uploading&&<div className="fee-hint">Uploading… {progress}%</div>}
                {receiptUrl&&<img src={receiptUrl}alt="receipt"
                  style={{marginTop:'8px',maxWidth:'100%',borderRadius:'6px'}}/>}
              </>
            )}
          </div>
        )}

        <div className="pay-buttons">
          <button className="buy-button"disabled={!canPay}onClick={handleConfirm}>
            {submitting?'Processing…':`Pay (${method})`}
          </button>
          {method!=='card'&&<p className="pay-hint">Organizer will confirm your receipt to issue ticket.</p>}
        </div>
      </div>
    </div>
  )
}
