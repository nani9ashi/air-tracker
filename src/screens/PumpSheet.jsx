import { useState } from 'react'
import Sheet from '../components/Sheet.jsx'
import Button from '../components/Button.jsx'
import { toDateInputValue, dateInputToISO } from '../lib/date.js'

/**
 * 「空気入れた！」の日付選択シート。今日 / 昨日 / カレンダー選択 → onConfirm(ISO)。
 */
export default function PumpSheet({ open, onClose, onConfirm }) {
  const [dateValue, setDateValue] = useState(toDateInputValue())

  const confirmDay = (offsetDays) => {
    const d = new Date()
    d.setDate(d.getDate() - offsetDays)
    onConfirm(dateInputToISO(toDateInputValue(d)))
  }

  const confirmPicked = () => {
    if (!dateValue) return
    onConfirm(dateInputToISO(dateValue))
  }

  return (
    <Sheet open={open} onClose={onClose} title="いつ空気を入れた？">
      <div
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
      >
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <Button variant="primary" size="md" fullWidth onClick={() => confirmDay(0)}>
            今日
          </Button>
          <Button variant="ghost" size="md" fullWidth onClick={() => confirmDay(1)}>
            昨日
          </Button>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-2)',
          }}
        >
          <label
            className="cad-label"
            htmlFor="pump-date"
            style={{ color: 'var(--text-secondary)' }}
          >
            カレンダーで選ぶ
          </label>
          <input
            id="pump-date"
            type="date"
            className="date-input"
            value={dateValue}
            max={toDateInputValue()}
            onChange={(e) => setDateValue(e.target.value)}
          />
        </div>

        <Button variant="ghost" size="md" fullWidth onClick={confirmPicked}>
          この日で記録する
        </Button>
      </div>
    </Sheet>
  )
}
