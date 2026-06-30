import './Chip.css'
import Icon from './Icon.jsx'

/**
 * 選択チップ（サイクル 7/14/21/28、カスタム等）。Cadence 準拠。
 * selected: グラデ塗り。locked: Premium ガード（鍵アイコン）。
 */
export default function Chip({
  children,
  selected = false,
  locked = false,
  iconLeft = null,
  className = '',
  ...rest
}) {
  const cls = ['chip', selected ? 'is-selected' : '', className].filter(Boolean).join(' ')
  return (
    <button type="button" className={cls} aria-pressed={selected} {...rest}>
      {locked ? <Icon name="lock" size={14} /> : iconLeft}
      <span className="chip__label">{children}</span>
    </button>
  )
}
