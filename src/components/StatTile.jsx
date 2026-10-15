import './StatTile.css'

/**
 * メトリクスタイル（Cadence 準拠：大きな Saira 数値＋単位＋JPラベル）。
 * 背景は持たない（GlassCard 内に並べる）。tone: 'default'|'accent'|'energy'。
 * text: 値が数値ではなく語（「順調」など）のとき true。本文用の書体で1語として描く。
 */
export default function StatTile({
  value,
  unit = null,
  label,
  icon = null,
  tone = 'default',
  align = 'left',
  text = false,
  className = '',
  ...rest
}) {
  const cls = [
    'stat-tile',
    `stat-tile--${tone}`,
    text ? 'stat-tile--text' : '',
    align === 'center' ? 'is-center' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <div className={cls} {...rest}>
      {(icon || label) && (
        <div className="stat-tile__head">
          {icon}
          {label && <span className="stat-tile__label">{label}</span>}
        </div>
      )}
      <div className="stat-tile__val">
        <span className="stat-tile__value">{value}</span>
        {unit && <span className="stat-tile__unit">{unit}</span>}
      </div>
    </div>
  )
}
