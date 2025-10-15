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
  const [method,setMethod] = useState('card')
  const [fee,setFee] = useState(null)
  const [feeLoading,setFeeLoading] = useState(false)
  const [feeHadError,setFeeHadError] = useState(false)
  const [bcvRate,setBcvRate] = useState(0)
  const [bcvSource,setBcvSource] = useState('')
  const [token,setToken] = useState(getAccessToken())
  const [uploading,setUploading] = useState(false)
  const [receiptUrl,setReceiptUrl] = useState(localStorage.getItem('pendingReceiptUrl')||null)

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

  // === Live BCV ===
  useEffect(()=>{
    let cancel=false
    const readCacheFresh=()=>{
      const c=Number(localStorage.getItem(BCV_RATE_KEY)||0)
      const ts=Number(localStorage.getItem(BCV_TS_KEY)||0)
      const fresh=c>0&&Date.now()-ts<BCV_TTL_MS
      if(fresh){setBcvRate(c);setBcvSource('cache')}
      return fresh
    }
    const fetchLive=async()=>{
      try{
        const res=await fetch(`${API}/api/fx/ves-per-usd`)
        if(!res.ok)return
        const j=await res.json()
        const r=Number(j?.vesPerUsd||0)
        if(!cancel&&r>0){
          setBcvRate(r)
          setBcvSource(j?.overrideActive?'override':(j?.source||'bcv'))
          localStorage.setItem(BCV_RATE_KEY,String(r))
          localStorage.setItem(BCV_TS_KEY,String(Date.now()))
          localStorage.setItem('ves_rate',String(r))
        }
      }catch{}
    }
    readCacheFresh();fetchLive()
    const id=setInterval(fetchLive,BCV_TTL_MS)
    return()=>{cancel=true;clearInterval(id)}
  },[])

  // === Upload receipt ===
  async function uploadReceipt(file){
    if(!file)return
    if(file.size>25*1024*1024){alert('File too large (max 25 MB)');return}
    try{
      setUploading(true)
      const f=new FormData();f.append('file',file)
      const res=await fetch(`${API}/api/tickets/upload-proof`,{
        method:'POST',
        headers:token?{Authorization:`Bearer ${token}`}:{},
        body:f,
      })
      const data=await res.json()
      if(res.ok&&data?.url){
        setReceiptUrl(data.url)
        localStorage.setItem('pendingReceiptUrl',data.url)
        alert('✅ Receipt uploaded successfully.')
      }else alert(data?.error||'Upload failed.')
    }catch(e){console.error(e);alert('Network error')}
    finally{setUploading(false)}
  }

  // === Rates and formatting
  const useVES=method==='pagoMovil'
  const vesRate=bcvRate||ENV_VES_RATE||LS_VES_RATE||FALLBACK_VES_RATE
  const fmtUSD=x=>`$${Number(x||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`
  const fmtVES=x=>`Bs. ${Number(x||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`
  const fmtCents=c=>{
    const usd=Number(c||0)/100
    return useVES?fmtVES(usd*vesRate):fmtUSD(usd)
  }

  // === Fee quote
  useEffect(()=>{
    if(!eventId||!selectedTierId||quantity<1)return
    let cancel=false
    const load=async()=>{
      try{
        setFeeLoading(true)
        const q=new URLSearchParams({eventId,ticketTierId:selectedTierId,quantity,paymentMethod:method})
        const url=`${API}/api/tickets/quote?${q}`
        const res=await fetchWithAuth(url,{method:'GET'})
        if(!res.ok)throw new Error()
        const data=await res.json()
        if(!cancel)setFee(data)
      }catch{if(!cancel)setFeeHadError(true)}
      finally{if(!cancel)setFeeLoading(false)}
    }
    load()
    return()=>{cancel=true}
  },[eventId,selectedTierId,quantity,method])

  const selectedTier=(tiers||[]).find(t=>t?.id===selectedTierId)
  const canPay=!!selectedTierId&&!submitting

  const feeRows=useMemo(()=>{
    const rows=[]
    if(fee&&typeof fee.totalCents==='number'){
      rows.push({label:`${selectedTier?.name||'Subtotal'} ×${quantity}`,value:fmtCents(fee.subtotalCents)})
      if(fee.serviceFeeCents>0)rows.push({label:'Service fee',value:fmtCents(fee.serviceFeeCents)})
      if(fee.stripeFeeCents>0&&method==='card')rows.push({label:'Stripe fee',value:fmtCents(fee.stripeFeeCents)})
      rows.push({label:'Total',value:fmtCents(fee.totalCents),strong:true})
    }
    return rows
  },[fee,selectedTier,quantity,method,vesRate])

  const handleConfirm=()=>{
    if(method!=='card'&&!receiptUrl&&!window.confirm('No receipt uploaded. Continue?'))return
    onPay?.(method)
  }

  return(
    <div className="popup-overlay"onClick={onClose}>
      <div className="popup-modal"onClick={e=>e.stopPropagation()}>
        <h3>Select Your Ticket</h3>

        {/* Fee */}
        {feeLoading?<div className="fee-row muted">Calculating fees…</div>:
          feeRows.length>0&&(
            <div className="fee-box">
              {feeRows.map((r,i)=>
                <div key={i}className={`fee-row${r.strong?' total':''}`}>
                  <span className="fee-label">{r.label}</span>
                  <span className="fee-value">{r.value}</span>
                </div>
              )}
              {feeHadError&&<div className="fee-hint">Estimate only – final fees at checkout.</div>}
            </div>
          )
        }

        {/* Method Tabs */}
        <div className="method-tabs">
          {showCard&&<button className={`tab ${method==='card'?'active':''}`}onClick={()=>setMethod('card')}>Card</button>}
          {showPM&&<button className={`tab ${method==='pagoMovil'?'active':''}`}onClick={()=>setMethod('pagoMovil')}>Pago Móvil</button>}
          {showZelle&&<button className={`tab ${method==='zelle'?'active':''}`}onClick={()=>setMethod('zelle')}>Zelle</button>}
          {showCash&&<button className={`tab ${method==='cash'?'active':''}`}onClick={()=>setMethod('cash')}>Cash</button>}
        </div>

        {/* Manual methods with receipt */}
        {method!=='card'&&(
          <div className="alt-details">
            {method==='pagoMovil'&&showPM&&(
              <div className="alt-box">
                {payments?.pagoMovil?.phone&&<div>📱 {payments.pagoMovil.phone}</div>}
                {payments?.pagoMovil?.ci&&<div>🪪 CI: {payments.pagoMovil.ci}</div>}
                {payments?.pagoMovil?.bank&&<div>🏦 {payments.pagoMovil.bank}</div>}
                <div className="alt-note">Upload receipt after Pago Móvil payment:</div>
                <div className="receipt-upload">
                  <label className="receipt-label">Upload receipt (image)</label>
                  <input type="file"accept="image/*"disabled={uploading}
                    onChange={e=>uploadReceipt(e.target.files?.[0])}/>
                  {uploading&&<div className="fee-hint">Uploading…</div>}
                  {receiptUrl&&<div className="receipt-preview"><img src={receiptUrl}alt="receipt"/></div>}
                </div>
              </div>
            )}

            {method==='zelle'&&showZelle&&(
              <div className="alt-box">
                {payments?.zelle?.email&&<div>📧 {payments.zelle.email}</div>}
                <div className="alt-note">Upload your Zelle receipt:</div>
                <div className="receipt-upload">
                  <label className="receipt-label">Upload receipt (image)</label>
                  <input type="file"accept="image/*"disabled={uploading}
                    onChange={e=>uploadReceipt(e.target.files?.[0])}/>
                  {uploading&&<div className="fee-hint">Uploading…</div>}
                  {receiptUrl&&<div className="receipt-preview"><img src={receiptUrl}alt="receipt"/></div>}
                </div>
              </div>
            )}

            {method==='cash'&&showCash&&(
              <div className="alt-box">
                {payments?.cash?.note&&<div>📝 {payments.cash.note}</div>}
                <div className="alt-note">Optional: upload cash payment proof.</div>
                <div className="receipt-upload">
                  <label className="receipt-label">Upload receipt (optional)</label>
                  <input type="file"accept="image/*"disabled={uploading}
                    onChange={e=>uploadReceipt(e.target.files?.[0])}/>
                  {uploading&&<div className="fee-hint">Uploading…</div>}
                  {receiptUrl&&<div className="receipt-preview"><img src={receiptUrl}alt="receipt"/></div>}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Confirm */}
        <div className="pay-buttons">
          <button className="buy-button"disabled={!canPay}onClick={handleConfirm}>
            {submitting?(method==='card'?'Processing…':'Sending…')
              :(method==='card'?'Pay with card':`Pay (${method})`)}
          </button>
          {method!=='card'&&<p className="pay-hint">Manual methods notify organizer; you’ll receive your ticket once approved.</p>}
        </div>
      </div>
    </div>
  )
}
