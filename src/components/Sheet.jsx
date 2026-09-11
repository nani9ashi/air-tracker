import { useEffect, useRef } from 'react'
import './Sheet.css'

// ハンドルを下にドラッグして閉じるしきい値(px)。
// getBoundingClientRect() は jsdom ではレイアウトを持たず常に0を返す
// （Sheet.test.jsx の実行環境）ため、パネル高さに対する割合ではなく
// 固定 px にしている。120px は一般的なモバイルの「下スワイプで閉じる」の
// 自然な移動量として妥当で、かつパーセンテージ方式よりテストしやすい。
export const DRAG_DISMISS_PX = 120

/**
 * 下から出るボトムシート（プロト準拠）。背景タップ・Escape・ハンドルの
 * 下ドラッグの3通りで閉じる（いずれも内側の状態——BikeSheet の mode や
 * HistoryScreen の confirmDelete 等——は経由せず、常に onClose を直接
 * 呼ぶ。既存2経路と同じ規約）。
 * title（左寄せ 900）/ subtitle を任意で。簡易フォーカストラップ付き。
 */
export default function Sheet({ open, onClose, title, subtitle, ariaLabel, children }) {
  const panelRef = useRef(null)
  const dragStartY = useRef(0)
  const dragging = useRef(false)
  const dragCleanup = useRef(null)
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

  // ドラッグ中に window へ張った pointermove/up/cancel リスナーの保険。
  // 通常は pointerup/cancel 側で自分から外すが、ドラッグの最中に
  // （親側の都合で）Sheet 自体がアンマウントされた場合のリスナー漏れを防ぐ。
  useEffect(() => {
    return () => dragCleanup.current?.()
  }, [])

  if (!open) return null

  const handleGripPointerDown = (event) => {
    // 左ボタン以外（右クリック等）・多重ドラッグは無視。
    if (event.button !== 0 || dragging.current) return
    event.preventDefault() // デスクトップでのテキスト選択の巻き込みを防ぐ

    const grip = event.currentTarget
    if (typeof grip.setPointerCapture === 'function') {
      try {
        grip.setPointerCapture(event.pointerId)
      } catch {
        // Pointer Capture 未実装の環境（jsdom / 一部 WebView）。
        // 追跡は下の window リスナーで行うので握れなくても機能に支障はない。
      }
    }

    dragging.current = true
    dragStartY.current = event.clientY
    if (panelRef.current) panelRef.current.style.transition = 'none'

    // Pointer Capture が効かない環境でも、指がハンドルの外に出たら
    // 追跡が切れないよう、move/up/cancel は window で拾う
    // （capture が効く環境では二重に効くだけで実害はない）。
    const onMove = (e) => {
      if (!dragging.current) return
      const dy = Math.max(0, e.clientY - dragStartY.current)
      if (panelRef.current) panelRef.current.style.transform = `translateY(${dy}px)`
    }

    const finishDrag = (e, { commit }) => {
      if (!dragging.current) return
      dragging.current = false
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      dragCleanup.current = null

      const dy = Math.max(0, e.clientY - dragStartY.current)
      if (commit && dy > DRAG_DISMISS_PX) {
        onClose()
        return
      }
      if (panelRef.current) {
        panelRef.current.style.transition = 'transform var(--dur-base) var(--ease-out)'
        panelRef.current.style.transform = ''
      }
    }

    const onUp = (e) => finishDrag(e, { commit: true })
    // pointercancel はブラウザ側の都合で中断された合図（スクロールの引き継ぎ等）で
    // あって、ユーザーの意思確認ではないため、しきい値を超えていても閉じない。
    const onCancel = (e) => finishDrag(e, { commit: false })

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    dragCleanup.current = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }
  }

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
        <div className="sheet__grip" aria-hidden="true" onPointerDown={handleGripPointerDown}>
          <div className="sheet__handle" />
        </div>
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
