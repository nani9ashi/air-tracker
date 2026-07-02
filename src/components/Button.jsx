import './Button.css'

/**
 * Cadence アクションボタン。
 * variant: 'primary'(teal grad) | 'energy'(ember grad) | 'warning'(amber grad) | 'secondary' | 'ghost'
 * size: 'sm' | 'md' | 'lg'。block で全幅。iconLeft/iconRight に Lucide ノード。
 */
export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  block = false,
  fullWidth = false,
  disabled = false,
  iconLeft = null,
  iconRight = null,
  type = 'button',
  className = '',
  ...rest
}) {
  const cls = [
    'btn',
    `btn--${variant}`,
    `btn--${size}`,
    block || fullWidth ? 'btn--block' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button type={type} className={cls} disabled={disabled} {...rest}>
      {iconLeft}
      {children != null && <span className="btn__label">{children}</span>}
      {iconRight}
    </button>
  )
}
