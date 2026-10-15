import { useMemo } from 'react'
import { sortedHistory } from '../lib/stats.js'
import { toDateInputValue, startOfDayLocal, computeStatus } from '../lib/date.js'
import { getTextZoom } from '../lib/textZoom.js'
import './Heatmap.css'

// セルの濃淡。'over' / 'soon' はホーム画面の状態（computeStatus）と 1:1 で対応させる。
// 'mid' / 'fresh' は状態ではなく **ok の中の濃淡**で、ヒートマップ固有の見せ方。
// 閾値をここに書くと computeStatus と二重管理になり、片方だけ直すと
// 「ホームはそろそろなのにヒートマップは平常色」という食い違いが起きる。
const MID_RATIO = 0.6

// ある日のセルの濃淡を返す。latest はその日以前で最も新しい記録（ローカル0:00のms）。
// export しているのはテストのため（状態判定が computeStatus と一致することを固定する）。
export function levelForDay(latest, dayMs, intervalDays) {
  if (latest == null) return 'empty'
  // computeStatus に「その日時点で」判定させる。経過日数の計算・intervalDays の
  // 既定値・状態の閾値がすべて date.js 側に一本化される。
  const { state, remaining } = computeStatus(new Date(latest), intervalDays, new Date(dayMs))
  if (state === 'overdue') return 'over'
  if (state === 'soon') return 'soon'
  const interval = Number(intervalDays) || 14
  return remaining / interval <= MID_RATIO ? 'mid' : 'fresh'
}

// 各日のタイヤ状態で色分け（プロト準拠の段階強度＋期限間近/超過）。
export function buildColumns(history, intervalDays, weeks, now = new Date()) {
  const pumpKeys = new Set()
  const pumpStarts = []
  for (const h of sortedHistory(history)) {
    const key = toDateInputValue(new Date(h.date))
    if (!pumpKeys.has(key)) {
      pumpKeys.add(key)
      pumpStarts.push(startOfDayLocal(new Date(h.date)).getTime())
    }
  }
  const today = startOfDayLocal(now)
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
    return levelForDay(latest, dayMs, intervalDays)
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

// ---- 月ラベル（v2.4.5） ----
// ラベルの枠は1マス分（13px）で、文字は右へはみ出して描かれる。通常のラベルは
// 「その週の日曜日の月が前の列と変わった列」に付くので、月が28日以上ある以上
// 必ず4列（64px）以上離れ、文字サイズ最大（2.0倍）でも重ならない。
// 重なり得るのは左端の列のラベルだけ（その週の日曜日が月の最後の1週に入ると、
// 次の月のラベルが1〜3列先に来る）。そこで左端のラベルは、次のラベルまでに
// 「文字幅 × 文字の倍率 ＋ すき間」が確保できるときだけ出す。
// 消えても1〜3列先に次の月のラベルがあるので、左端の週の月は読み取れる。
export const MONTH_LABEL_MAX_W = 24 // px。最も広い「10月」の実測 23.6px（既定の文字サイズ）
export const MONTH_LABEL_MIN_GAP = 4 // px。ラベルどうしの最小のすき間
// px。列の間隔 ＝ Heatmap.css の --cell（13px）＋ --cell-gap（3px）。
// ⚠ どちらかを変えたらここも直すこと。
export const COLUMN_PITCH = 16

// 左端のラベルを出すのに必要な「次のラベルまでの列数」。
// 倍率 0.85〜1.15 → 2列、1.3〜1.8 → 3列、2.0 → 4列。
export function firstLabelMinColumns(zoom) {
  return Math.ceil((MONTH_LABEL_MAX_W * zoom + MONTH_LABEL_MIN_GAP) / COLUMN_PITCH)
}

// 各列のラベル（無ければ ''）。zoom は端末の文字サイズ設定の倍率。
export function monthLabelsFor(columns, zoom = 1) {
  const labels = columns.map((col, i) =>
    i > 0 && col[0].month !== columns[i - 1][0].month ? `${col[0].month + 1}月` : '',
  )
  if (columns.length > 0) {
    const next = labels.findIndex((l, i) => i > 0 && l !== '')
    if (next === -1 || next >= firstLabelMinColumns(zoom)) {
      labels[0] = `${columns[0][0].month + 1}月`
    }
  }
  return labels
}

export default function Heatmap({ history, intervalDays = 14, weeks = 18 }) {
  const columns = useMemo(
    () => buildColumns(history, intervalDays, weeks),
    [history, intervalDays, weeks],
  )
  // 倍率は表示時の値でよい（Android は文字サイズを変えるとアプリが再起動する）。
  const monthLabels = monthLabelsFor(columns, getTextZoom())
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

      {/* 色見本と説明は1つのまとまり（折り返しても別の行に分かれない） */}
      <div className="heatmap__legend" aria-hidden="true">
        <span className="heatmap__legend-group">
          <span className="heatmap__legend-label">少</span>
          <span className="heatmap__cell heatmap__cell--empty" />
          <span className="heatmap__cell heatmap__cell--mid" />
          <span className="heatmap__cell heatmap__cell--fresh" />
          <span className="heatmap__cell heatmap__cell--pump" />
          <span className="heatmap__legend-label">多</span>
        </span>
        <span className="heatmap__legend-sep" />
        <span className="heatmap__legend-group">
          <span className="heatmap__cell heatmap__cell--soon" />
          <span className="heatmap__legend-label">期限間近</span>
        </span>
        <span className="heatmap__legend-group">
          <span className="heatmap__cell heatmap__cell--over" />
          <span className="heatmap__legend-label">超過</span>
        </span>
      </div>
    </div>
  )
}
