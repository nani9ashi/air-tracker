import { useMemo, useState } from 'react'
import StatTile from '../components/StatTile.jsx'
import Heatmap from '../components/Heatmap.jsx'
import Sheet from '../components/Sheet.jsx'
import Button from '../components/Button.jsx'
import { useStore } from '../store/useStore.js'
import { getActiveAirItem, editHistory, removeHistory } from '../store/store.js'
import {
  averageIntervalDays,
  currentStreak,
  totalCount,
  sortedHistory,
} from '../lib/stats.js'
import {
  formatDateJP,
  daysBetween,
  toDateInputValue,
  dateInputToISO,
} from '../lib/date.js'
import './HistoryScreen.css'

export default function HistoryScreen() {
  const state = useStore()
  const item = getActiveAirItem(state)

  const avg = averageIntervalDays(item.history)
  const streak = currentStreak(item.history, item.intervalDays)
  const total = totalCount(item.history)

  // 編集対象の履歴エントリと、編集中の日付値。
  const [editing, setEditing] = useState(null)
  const [editValue, setEditValue] = useState('')

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

  const openEdit = (row) => {
    setEditing(row)
    setEditValue(toDateInputValue(new Date(row.date)))
  }
  const closeEdit = () => setEditing(null)

  const saveEdit = () => {
    if (editing && editValue) editHistory(editing.id, dateInputToISO(editValue))
    closeEdit()
  }

  const deleteEntry = () => {
    if (!editing) return
    if (window.confirm('この記録を削除しますか？')) {
      removeHistory(editing.id)
      closeEdit()
    }
  }

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

        <section aria-label="記録ヒートマップ">
          <Heatmap history={item.history} />
        </section>

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
              <li key={row.id}>
                <button
                  type="button"
                  className="history__item"
                  onClick={() => openEdit(row)}
                  aria-label={`${formatDateJP(row.date)} の記録を編集`}
                >
                  <span className="history__date">{formatDateJP(row.date)}</span>
                  <span className="history__gap">
                    {row.gap == null ? '最初の記録' : `前回から ${row.gap}日`}
                  </span>
                  <span className="history__chevron" aria-hidden="true">›</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>

      <Sheet open={!!editing} onClose={closeEdit} title="記録を編集">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <label className="cad-label" htmlFor="edit-date" style={{ color: 'var(--text-secondary)' }}>
              日付
            </label>
            <input
              id="edit-date"
              type="date"
              className="date-input"
              value={editValue}
              max={toDateInputValue()}
              onChange={(e) => setEditValue(e.target.value)}
            />
          </div>
          <Button variant="primary" size="md" fullWidth onClick={saveEdit}>
            保存
          </Button>
          <Button variant="ghost" size="md" fullWidth onClick={deleteEntry}>
            🗑 削除
          </Button>
        </div>
      </Sheet>
    </div>
  )
}
