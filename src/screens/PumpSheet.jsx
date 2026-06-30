import { useEffect, useState } from 'react'
import Sheet from '../components/Sheet.jsx'
import Button from '../components/Button.jsx'
import Icon from '../components/Icon.jsx'
import { toDateInputValue, dateInputToISO } from '../lib/date.js'

function labelOf(offset) {
  const d = new Date()
  d.setDate(d.getDate() - offset)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

/**
 * 「空気入れた！」の日付選択シート（プロト準拠の選択肢行）。
 * 今日 / 昨日 は即確定、カレンダーは日付入力を展開。
 */
export default function PumpSheet({ open, onClose, onConfirm }) {
  const [calOpen, setCalOpen] = useState(false)
  const [dateValue, setDateValue] = useState(toDateInputValue())

  useEffect(() => {
    if (!open) setCalOpen(false)
  }, [open])

  const confirmDay = (offset) => {
    const d = new Date()
    d.setDate(d.getDate() - offset)
    onConfirm(dateInputToISO(toDateInputValue(d)))
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="空気を入れた日は？"
      subtitle="記録すると経過日数がリセットされます。"
    >
      <div className="sheet-list">
        <button type="button" className="sheet-opt sheet-opt--accent" onClick={() => confirmDay(0)}>
          <span className="sheet-opt__icon"><Icon name="calendar-check" size={22} /></span>
          <span className="sheet-opt__label">今日</span>
          <span className="sheet-opt__meta">{labelOf(0)}</span>
        </button>
        <button type="button" className="sheet-opt" onClick={() => confirmDay(1)}>
          <span className="sheet-opt__icon"><Icon name="calendar-minus" size={22} /></span>
          <span className="sheet-opt__label">昨日</span>
          <span className="sheet-opt__meta">{labelOf(1)}</span>
        </button>
        <button
          type="button"
          className="sheet-opt"
          aria-expanded={calOpen}
          onClick={() => setCalOpen((v) => !v)}
        >
          <span className="sheet-opt__icon"><Icon name="calendar-days" size={22} /></span>
          <span className="sheet-opt__label">カレンダーで選ぶ</span>
          <Icon name="chevron-right" size={18} style={{ color: 'var(--text-muted)' }} />
        </button>

        {calOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <input
              type="date"
              className="date-input"
              value={dateValue}
              max={toDateInputValue()}
              onChange={(e) => setDateValue(e.target.value)}
            />
            <Button
              variant="primary"
              size="md"
              block
              onClick={() => dateValue && onConfirm(dateInputToISO(dateValue))}
            >
              この日で記録する
            </Button>
          </div>
        )}
      </div>

      <button type="button" className="sheet-cancel" onClick={onClose}>
        キャンセル
      </button>
    </Sheet>
  )
}
