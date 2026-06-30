import { useEffect, useRef } from 'react'
import './Sheet.css'

/**
 * 下から出るボトムシート（プロト準拠）。背景タップ・Escape で閉じる。
 * title（左寄せ 900）/ subtitle を任意で。簡易フォーカストラップ付き。
 */
export default function Sheet({ open, onClose, title, subtitle, ariaLabel, children }) {
  const panelRef = useRef(null)
  const titleId = title ? 'sheet-title' : undefined

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const t = setTimeout(() => {
      const el = panelRef.current?.querySelector(
        'button, [href], input, select, [tabindex]:not([tabindex="-1"])',
      )
      el?.focus()
    }, 0)
    return () => {
      document.removeEventListener('keydown', onKey)
      clearTimeout(t)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="sheet" role="presentation" onClick={onClose}>
      <div className="sheet__backdrop" />
      <div
        className="sheet__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-label={titleId ? undefined : ariaLabel}
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet__handle" aria-hidden="true" />
        {title && (
          <h2 id={titleId} className="sheet__title">
            {title}
          </h2>
        )}
        {subtitle && <p className="sheet__subtitle">{subtitle}</p>}
        {children}
      </div>
    </div>
  )
}
