import './Toast.css'

/**
 * 軽量トースト（保存/復元などの通知）。show=true で表示。
 */
export default function Toast({ show, message }) {
  if (!show) return null
  return (
    <div className="toast" role="status" aria-live="polite">
      {message}
    </div>
  )
}
