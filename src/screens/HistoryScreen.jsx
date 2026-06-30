import { useMemo, useState } from 'react'
import GlassCard from '../components/GlassCard.jsx'
import ListRow from '../components/ListRow.jsx'
import Sheet from '../components/Sheet.jsx'
import Button from '../components/Button.jsx'
import Icon from '../components/Icon.jsx'
import { useStore } from '../store/useStore.js'
import { getActiveAirItem, editHistory, removeHistory } from '../store/store.js'
import { averageIntervalDays, totalCount, sortedHistory } from '../lib/stats.js'
import { formatDateJP, daysBetween, toDateInputValue, dateInputToISO } from '../lib/date.js'
import './HistoryScreen.css'

const WD = ['日', '月', '火', '水', '木', '金', '土']

export default function HistoryScreen() {
  const state = useStore()
  const item = getActiveAirItem(state)
  const total = totalCount(item.history)
  const avg = averageIntervalDays(item.history)

  const [editing, setEditing] = useState(null)
  const [editValue, setEditValue] = useState('')

  const rows = useMemo(() => {
    const asc = sortedHistory(item.history)
    const now = new Date()
    return asc
      .map((h, i) => {
        const d = new Date(h.date)
        const ago = daysBetween(h.date, now)
        return {
          id: h.id,
          date: h.date,
          dateLabel: `${d.getMonth() + 1}月${d.getDate()}日`,
          weekday: `(${WD[d.getDay()]})`,
          rel: ago === 0 ? '今日' : `${ago}日前`,
          interval: i === 0 ? '最初の記録' : `前回から${daysBetween(asc[i - 1].date, d)}日`,
        }
      })
      .reverse()
  }, [item.history])

  const histMsg =
    total >= 2
      ? `これまで${total}回記録。平均${avg}日間隔です。`
      : total === 1
        ? '最初の記録があります。次の空気入れもお忘れなく。'
        : ''

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
    if (editing && window.confirm('この記録を削除しますか？')) {
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
        <GlassCard variant="glass">
          <div className="history__card-head">
            <span className="history__card-title">記録</span>
            <span className="history__card-hint">タップ／右クリックで編集</span>
          </div>

          {histMsg && <p className="history__banner">{histMsg}</p>}

          {rows.length === 0 ? (
            <div className="history__empty">
              <Icon name="bike" size={40} style={{ color: 'var(--text-muted)', opacity: 0.6 }} />
              <p className="cad-body" style={{ color: 'var(--text-secondary)' }}>まだ記録がありません。</p>
              <p className="cad-label" style={{ color: 'var(--text-muted)' }}>
                ホームの「空気入れた！」で記録できます。
              </p>
            </div>
          ) : (
            <div className="history__list">
              {rows.map((row) => (
                <ListRow
                  key={row.id}
                  role="button"
                  tabIndex={0}
                  className="history__row"
                  onClick={() => openEdit(row)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    openEdit(row)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      openEdit(row)
                    }
                  }}
                  aria-label={`${row.dateLabel}${row.weekday} の記録を編集`}
                  thumb={
                    <span className="history__thumb" aria-hidden="true">
                      <Icon name="check" size={18} style={{ color: 'var(--text-accent)' }} />
                    </span>
                  }
                  title={
                    <>
                      {row.dateLabel}{' '}
                      <span className="history__wd">{row.weekday}</span>
                    </>
                  }
                  subtitle={`${row.rel} ・ ${row.interval}`}
                  trailing={<Icon name="more-vertical" size={18} style={{ color: 'var(--text-muted)' }} />}
                />
              ))}
            </div>
          )}
        </GlassCard>
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
          <Button variant="primary" size="md" block iconLeft={<Icon name="check" size={18} />} onClick={saveEdit}>
            保存
          </Button>
          <Button variant="ghost" size="md" block iconLeft={<Icon name="trash-2" size={18} />} onClick={deleteEntry}>
            削除
          </Button>
        </div>
      </Sheet>
    </div>
  )
}
