import './IconButton.css'

/**
 * 角丸スクエアのアイコンボタン（Cadence chrome コントロール）。
 * variant: 'primary' | 'glass' | 'ghost'。size: 'sm'(36) | 'md'(44) | 'lg'(52)。
 * 必ず label（aria-label）を渡す。children に <Icon name/>。
 */
export default function IconButton({
  children,
  label,
  variant = 'glass',
  size = 'md',
  active = false,
  disabled = false,
  className = '',
  ...rest
}) {
  const cls = [
    'icon-btn',
    `icon-btn--${variant}`,
    `icon-btn--${size}`,
    active ? 'is-active' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <button
      type="button"
      className={cls}
      aria-label={label}
      aria-pressed={active || undefined}
      disabled={disabled}
      {...rest}
    >
      {children}
    </button>
  )
}
