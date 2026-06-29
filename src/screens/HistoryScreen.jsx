import { useMemo } from 'react'
import StatTile from '../components/StatTile.jsx'
import { useStore } from '../store/useStore.js'
import { getActiveAirItem } from '../store/store.js'
import {
  averageIntervalDays,
  currentStreak,
  totalCount,
  sortedHistory,
} from '../lib/stats.js'
import { formatDateJP, daysBetween } from '../lib/date.js'
import './HistoryScreen.css'

export default function HistoryScreen() {
  const state = useStore()
  const item = getActiveAirItem(state)

  const avg = averageIntervalDays(item.history)
  const streak = currentStreak(item.history, item.intervalDays)
  const total = totalCount(item.history)

  // 新しい順のリスト。各行に「前回からの間隔」を付与。
  const rows = useMemo(() => {
    const asc = sortedHistory(item.history)
    return asc
      .map((h, i) => ({
        id: h.id,
        date: h.date,
        gap: i === 0 ? null : daysBetween(asc[i - 1].date, new Date(h.date)),
      }))
      .reverse()
  }, [item.history])

  return (
    <div className="history">
      <header className="history__header">
        <h1 className="cad-h2">履歴</h1>
      </header>

      <main className="history__main">
        <div className="history__stats">
          <StatTile label="平均間隔" value={avg == null ? '—' : avg} unit={avg == null ? '' : '日'} />
          <StatTile label="連続達成" value={streak} unit="回" />
          <StatTile label="記録数" value={total} unit="回" />
        </div>

        {rows.length === 0 ? (
          <div className="history__empty">
            <span className="history__empty-icon" aria-hidden="true">🚲</span>
            <p className="cad-body">まだ記録がありません。</p>
            <p className="cad-label" style={{ color: 'var(--text-muted)' }}>
              ホームの「空気入れた！」で記録できます。
            </p>
          </div>
        ) : (
          <ul className="history__list">
            {rows.map((row) => (
              <li key={row.id} className="history__item">
                <span className="history__date">{formatDateJP(row.date)}</span>
                <span className="history__gap">
                  {row.gap == null ? '最初の記録' : `前回から ${row.gap}日`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
