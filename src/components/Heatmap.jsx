import { useMemo } from 'react'
import { sortedHistory } from '../lib/stats.js'
import { toDateInputValue, startOfDayLocal } from '../lib/date.js'
import './Heatmap.css'

const MS = 86400000

// 各日のタイヤ状態で色分け（プロト準拠の段階強度＋期限間近/超過）。
function buildColumns(history, intervalDays, weeks) {
  const pumpKeys = new Set()
  const pumpStarts = []
  for (const h of sortedHistory(history)) {
    const key = toDateInputValue(new Date(h.date))
    if (!pumpKeys.has(key)) {
      pumpKeys.add(key)
      pumpStarts.push(startOfDayLocal(new Date(h.date)).getTime())
    }
  }
  const interval = Number(intervalDays) || 14
  const today = startOfDayLocal(new Date())
  const start = new Date(today)
  start.setDate(start.getDate() - (weeks * 7 - 1))
  start.setDate(start.getDate() - start.getDay())

  const levelFor = (dayDate, key) => {
    if (pumpKeys.has(key)) return 'pump'
    const dayMs = startOfDayLocal(dayDate).getTime()
    let latest = null
    for (const ms of pumpStarts) {
      if (ms <= dayMs) latest = ms
      else break
    }
    if (latest == null) return 'empty'
    const remaining = interval - Math.round((dayMs - latest) / MS)
    const ratio = remaining / interval
    if (remaining <= 0) return 'over'
    if (ratio <= 0.25) return 'soon'
    if (ratio <= 0.6) return 'mid'
    return 'fresh'
  }

  const columns = []
  const cur = new Date(start)
  while (cur <= today) {
    const col = []
    for (let d = 0; d < 7; d++) {
      const key = toDateInputValue(cur)
      const future = cur > today
      col.push({ key, month: cur.getMonth(), level: future ? 'future' : levelFor(cur, key) })
      cur.setDate(cur.getDate() + 1)
    }
    columns.push(col)
  }
  return columns
}

export default function Heatmap({ history, intervalDays = 14, weeks = 18 }) {
  const columns = useMemo(
    () => buildColumns(history, intervalDays, weeks),
    [history, intervalDays, weeks],
  )
  const monthLabels = columns.map((col, i) =>
    i === 0 || col[0].month !== columns[i - 1][0].month ? `${col[0].month + 1}月` : '',
  )
  const pumpCount = columns.flat().filter((c) => c.level === 'pump').length

  return (
    <div
      className="heatmap"
      role="img"
      aria-label={`直近${weeks}週間の空気入れ記録ヒートマップ。記録${pumpCount}件。`}
    >
      <div className="heatmap__scroll">
        <div className="heatmap__body">
          <div className="heatmap__months" aria-hidden="true">
            {monthLabels.map((l, i) => (
              <span key={i} className="heatmap__month">{l}</span>
            ))}
          </div>
          <div className="heatmap__grid">
            {columns.map((col, ci) => (
              <div key={ci} className="heatmap__col">
                {col.map((cell) => (
                  <span
                    key={cell.key}
                    className={`heatmap__cell heatmap__cell--${cell.level}`}
                    title={cell.level === 'future' ? '' : cell.key}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="heatmap__legend" aria-hidden="true">
        <span className="heatmap__legend-label">少</span>
        <span className="heatmap__cell heatmap__cell--empty" />
        <span className="heatmap__cell heatmap__cell--mid" />
        <span className="heatmap__cell heatmap__cell--fresh" />
        <span className="heatmap__cell heatmap__cell--pump" />
        <span className="heatmap__legend-label">多</span>
        <span className="heatmap__legend-sep" />
        <span className="heatmap__cell heatmap__cell--soon" />
        <span className="heatmap__legend-label">期限間近</span>
        <span className="heatmap__cell heatmap__cell--over" />
        <span className="heatmap__legend-label">超過</span>
      </div>
    </div>
  )
}
