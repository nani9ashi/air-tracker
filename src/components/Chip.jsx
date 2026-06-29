import './Chip.css'

/**
 * 選択チップ（サイクル 7/14/21/28、カスタム等）。
 * selected: 選択状態。locked: Premiumガード（鍵表示・操作可だが上位で誘導）。
 */
export default function Chip({
  children,
  selected = false,
  locked = false,
  className = '',
  ...rest
}) {
  const cls = [
    'chip',
    selected ? 'chip--selected' : '',
    locked ? 'chip--locked' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <button
      type="button"
      className={cls}
      aria-pressed={selected}
      {...rest}
    >
      {locked && (
        <span className="chip__lock" aria-hidden="true">
          🔒
        </span>
      )}
      <span className="chip__label">{children}</span>
    </button>
  )
}
