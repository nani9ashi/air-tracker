import Sheet from './Sheet.jsx'
import Icon from './Icon.jsx'

/**
 * 破壊的操作の確認シート（window.confirm の置き換え）。
 * 既存の .sheet-opt--danger / .sheet-cancel をそのまま使うので専用 CSS は無い。
 * 「実行」は危険色の行、キャンセルは地味なテキストボタン＝押し間違いにくい並び。
 */
export default function ConfirmSheet({
  open,
  onClose,
  title,
  message,
  confirmLabel = '削除する',
  cancelLabel = 'キャンセル',
  icon = 'trash-2',
  onConfirm,
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title} subtitle={message}>
      <div className="sheet-list">
        <button type="button" className="sheet-opt sheet-opt--danger" onClick={onConfirm}>
          <span className="sheet-opt__icon">
            <Icon name={icon} size={22} />
          </span>
          <span className="sheet-opt__label">{confirmLabel}</span>
        </button>
      </div>
      <button type="button" className="sheet-cancel" onClick={onClose}>
        {cancelLabel}
      </button>
    </Sheet>
  )
}
