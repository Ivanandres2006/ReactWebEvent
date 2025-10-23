import { useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'

export default function ModalPortal({ children }) {
  const host = useMemo(() => {
    const el = document.createElement('div')
    el.setAttribute('data-modal-root', 'true')
    return el
  }, [])

  useEffect(() => {
    document.body.appendChild(host)
    return () => {
      try { document.body.removeChild(host) } catch {}
    }
  }, [host])

  return createPortal(children, host)
}
