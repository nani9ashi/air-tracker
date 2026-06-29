import './IconButton.css'

/**
 * アイコン1つのタップターゲット（設定・閉じる等）。
 * 必ず aria-label を渡すこと（a11y / P5）。
 */
export default function IconButton({
  children,
  label,
  variant = 'glass',
  className = '',
  ...rest
}) {
  const cls = ['icon-btn', `icon-btn--${variant}`, className]
    .filter(Boolean)
    .join(' ')
  return (
    <button type="button" className={cls} aria-label={label} {...rest}>
      <span aria-hidden="true" className="icon-btn__glyph">
        {children}
      </span>
    </button>
  )
}
