import './StatTile.css'

/**
 * 補助メトリクス表示（任意）。例: サイクル日数・経過日数。
 * label（小さい見出し）+ value（数字, Saira）+ unit。
 */
export default function StatTile({ label, value, unit, className = '' }) {
  return (
    <div className={['stat-tile', className].filter(Boolean).join(' ')}>
      <span className="stat-tile__label">{label}</span>
      <span className="stat-tile__value">
        {value}
        {unit && <span className="stat-tile__unit">{unit}</span>}
      </span>
    </div>
  )
}
