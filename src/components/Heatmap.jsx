import { useMemo } from 'react'
import { sortedHistory } from '../lib/stats.js'
import { toDateInputValue, startOfDayLocal } from '../lib/date.js'
import './Heatmap.css'

const WD = ['日', '月', '火', '水', '木', '金', '土']

// 直近 weeks 週間の週カラム配列を作る。各セル: {key,date,day,month,pumped,future}
function buildColumns(history, weeks) {
  const counts = new Map()
  for (const h of sortedHistory(history)) {
    const key = toDateInputValue(new Date(h.date))
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  const today = startOfDayLocal(new Date())
  const start = new Date(today)
  start.setDate(start.getDate() - (weeks * 7 - 1))
  start.setDate(start.getDate() - start.getDay()) // 週初（日曜）に揃える

  const columns = []
  const cur = new Date(start)
  while (cur <= today) {
    const col = []
    for (let d = 0; d < 7; d++) {
      const key = toDateInputValue(cur)
      col.push({
        key,
        date: new Date(cur),
        day: cur.getDay(),
        month: cur.getMonth(),
        count: counts.get(key) || 0,
        pumped: counts.has(key),
        future: cur > today,
      })
      cur.setDate(cur.getDate() + 1)
    }
    columns.push(col)
  }
  return columns
}

export default function Heatmap({ history, weeks = 26 }) {
  const columns = useMemo(() => buildColumns(history, weeks), [history, weeks])

  // 各カラムの月ラベル（前カラムから月が変わったら表示）。
  const monthLabels = columns.map((col, i) => {
    const m = col[0].month
    const prev = i > 0 ? columns[i - 1][0].month : null
    return i === 0 || m !== prev ? `${m + 1}月` : ''
  })

  const totalPumped = columns.flat().filter((c) => c.pumped).length

  return (
    <div
      className="heatmap"
      role="img"
      aria-label={`直近${weeks}週間の記録ヒートマップ。記録${totalPumped}件。`}
    >
      <div className="heatmap__scroll">
        <div className="heatmap__inner">
          {/* 曜日ラベル列（月・水・金のみ） */}
          <div className="heatmap__weekdays" aria-hidden="true">
            {WD.map((w, i) => (
              <span key={i} className="heatmap__wd">
                {i === 1 || i === 3 || i === 5 ? w : ''}
              </span>
            ))}
          </div>

          <div className="heatmap__body">
            <div className="heatmap__months" aria-hidden="true">
              {monthLabels.map((label, i) => (
                <span key={i} className="heatmap__month">
                  {label}
                </span>
              ))}
            </div>
            <div className="heatmap__grid">
              {columns.map((col, ci) => (
                <div key={ci} className="heatmap__col">
                  {col.map((cell) => (
                    <span
                      key={cell.key}
                      className={[
                        'heatmap__cell',
                        cell.pumped ? 'heatmap__cell--on' : '',
                        cell.future ? 'heatmap__cell--future' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      title={
                        cell.future
                          ? ''
                          : `${cell.key}${cell.pumped ? '：記録あり' : '：記録なし'}`
                      }
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="heatmap__legend" aria-hidden="true">
        <span className="heatmap__legend-label">なし</span>
        <span className="heatmap__cell" />
        <span className="heatmap__cell heatmap__cell--on" />
        <span className="heatmap__legend-label">記録あり</span>
      </div>
    </div>
  )
}
