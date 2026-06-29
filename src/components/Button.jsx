import './Button.css'

/**
 * 主アクション用ボタン。
 * variant: 'primary'（teal グラデ＋グロー） | 'energy'（ember） | 'ghost'（ガラス縁）
 * size: 'md'（既定 48px） | 'lg'（56px）
 */
export default function Button({
  children,
  variant = 'primary',
  size = 'lg',
  fullWidth = false,
  type = 'button',
  className = '',
  ...rest
}) {
  const cls = [
    'btn',
    `btn--${variant}`,
    `btn--${size}`,
    fullWidth ? 'btn--full' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button type={type} className={cls} {...rest}>
      <span className="btn__label">{children}</span>
    </button>
  )
}
