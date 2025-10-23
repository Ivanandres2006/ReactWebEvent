import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import './SafeModal.css'

/**
 * SafeModal: a universally safe overlay for iOS Safari.
 * - Isolates its own paint/stacking context
 * - Fixed, non-scrolling backdrop
 * - Only modal content scrolls
 * - Disables backdrop-filter on iOS Safari via global class
 */
export default function SafeModal({ isOpen, onClose, children, size = 'normal', ariaLabel = 'Dialog' }) {
  useEffect(() => {
    if (!isOpen) return
    document.body.classList.add('body-no-scroll')
    return () => document.body.classList.remove('body-no-scroll')
  }, [isOpen])

  if (!isOpen) return null

  const content =
    <div className="safe-overlay" onClick={onClose} role="presentation">
      <div
        className={`safe-modal ${size === 'small' ? 'safe-modal--sm' : ''}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
      >
        {children}
      </div>
    </div>

  return createPortal(content, document.body)
}
