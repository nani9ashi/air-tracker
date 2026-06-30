import './ListRow.css'

/**
 * リスト行（Cadence 準拠）：左にサムネ、中央にタイトル/サブ/メタ、右に trailing。
 * 履歴行などに使う。onClick/各種ハンドラは ...rest で渡す。
 */
export default function ListRow({
  thumb = null,
  title,
  subtitle = null,
  meta = null,
  trailing = null,
  divider = true,
  className = '',
  ...rest
}) {
  const cls = ['list-row', divider ? 'has-divider' : '', className]
    .filter(Boolean)
    .join(' ')
  return (
    <div className={cls} {...rest}>
      {thumb}
      <div className="list-row__body">
        <div className="list-row__title">{title}</div>
        {subtitle && <div className="list-row__sub">{subtitle}</div>}
        {meta && <div className="list-row__meta">{meta}</div>}
      </div>
      {trailing && <div className="list-row__trailing">{trailing}</div>}
    </div>
  )
}
