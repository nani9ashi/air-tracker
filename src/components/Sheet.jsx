import { useEffect, useRef } from 'react'
import './Sheet.css'

/**
 * 下から出るボトムシート（モーダル）。
 * open / onClose 制御。背景タップ・Escape で閉じる。簡易フォーカストラップ付き。
 */
export default function Sheet({ open, onClose, title, children }) {
  const panelRef = useRef(null)
  const titleId = 'sheet-title'

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    // 開いたら最初のフォーカス可能要素へ
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
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet__handle" aria-hidden="true" />
        {title && (
          <h2 id={titleId} className="cad-h3 sheet__title">
            {title}
          </h2>
        )}
        {children}
      </div>
    </div>
  )
}
