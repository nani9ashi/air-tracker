import './StatTile.css'

/**
 * メトリクスタイル（Cadence 準拠：大きな Saira 数値＋単位＋JPラベル）。
 * 背景は持たない（GlassCard 内に並べる）。tone: 'default'|'accent'|'energy'。
 */
export default function StatTile({
  value,
  unit = null,
  label,
  icon = null,
  tone = 'default',
  align = 'left',
  className = '',
  ...rest
}) {
  const cls = [
    'stat-tile',
    `stat-tile--${tone}`,
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
