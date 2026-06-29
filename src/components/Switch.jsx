import './Switch.css'

/**
 * オン/オフのトグルスイッチ（設定で使用）。
 * checked + onChange で制御。label は a11y 用（visually-hidden でも可）。
 */
export default function Switch({ checked = false, onChange, label, id, ...rest }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      id={id}
      className={['switch', checked ? 'switch--on' : ''].filter(Boolean).join(' ')}
      onClick={() => onChange && onChange(!checked)}
      {...rest}
    >
      <span className="switch__thumb" aria-hidden="true" />
    </button>
  )
}
