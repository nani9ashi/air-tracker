// ============================================================
// date.js — 経過日数・残日数・状態判定の純粋関数。
// すべて「ローカルカレンダー日」で算出（タイムゾーン/日付境界の取り違え防止）。
// ============================================================

const MS_PER_DAY = 86400000

// ローカルの 0:00 に丸めた Date を返す。
export function startOfDayLocal(d) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

// from から to までの「日数」差（ローカルカレンダー日）。to 既定は今日。
// 例: 昨日入れたなら 1。DST は丸めで吸収。
export function daysBetween(fromISO, to = new Date()) {
  const from = startOfDayLocal(fromISO).getTime()
  const toMs = startOfDayLocal(to).getTime()
  return Math.round((toMs - from) / MS_PER_DAY)
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n))
}

/**
 * 状態を算出する。色だけに依存せず state/message/icon でも判別できるようにする。
 * 返り値:
 *  - state: 'unset' | 'ok' | 'soon' | 'overdue'
 *  - elapsed: 経過日数（unset は null）
 *  - remaining: 残日数（intervalDays - elapsed。負＝超過）
 *  - overdueBy: 超過日数（overdue のとき正、それ以外 0）
 *  - progress: リング充填率 0..1（残り割合）
 *  - tone: ProgressRing/配色用 'accent' | 'warning' | 'energy'
 *  - message / icon: 表示用
 */
export function computeStatus(lastReset, intervalDays, now = new Date()) {
  const interval = Number(intervalDays) || 14

  if (!lastReset) {
    return {
      state: 'unset',
      elapsed: null,
      remaining: null,
      overdueBy: 0,
      progress: 1,
      fill: 0,
      tone: 'accent',
      message: 'まずは空気を入れて記録しよう',
      icon: '🚲',
    }
  }

  const elapsed = daysBetween(lastReset, now)
  const remaining = interval - elapsed
  const progress = clamp(remaining / interval, 0, 1)
  // fill: 経過の進捗（リングは経過で伸びる）。新しいほど小さく、期限/超過で満。
  const fill = clamp(elapsed / interval, 0, 1)

  if (remaining <= 0) {
    return {
      state: 'overdue',
      elapsed,
      remaining,
      overdueBy: Math.abs(remaining),
      progress: 0,
      fill: 1,
      tone: 'energy',
      message: '空気入れどき！',
      icon: '⚠',
    }
  }

  // 残り割合が 25% 以下、または残り2日以下なら「そろそろ」。
  if (remaining / interval <= 0.25 || remaining <= 2) {
    return {
      state: 'soon',
      elapsed,
      remaining,
      overdueBy: 0,
      progress,
      fill,
      tone: 'warning',
      message: 'そろそろ',
      icon: '⏳',
    }
  }

  return {
    state: 'ok',
    elapsed,
    remaining,
    overdueBy: 0,
    progress,
    fill,
    tone: 'accent',
    message: 'まだ大丈夫',
    icon: '✓',
  }
}

// ローカル日付を input[type=date] 用 'YYYY-MM-DD' に変換。
export function toDateInputValue(d = new Date()) {
  const x = startOfDayLocal(d)
  const y = x.getFullYear()
  const m = String(x.getMonth() + 1).padStart(2, '0')
  const day = String(x.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// 保存済みの日付文字列を検証・正規化して ISO(UTC) 文字列にする。解釈できなければ null。
// 保存値は必ず ISO 表現に揃える: recomputeLastReset（store.js）と sortedHistory（stats.js）は
// 「ISO 文字列は辞書順＝時系列順」という前提で .sort() しているため、'2026/06/01' のような
// 別表現が混ざると '/'(0x2F) > '-'(0x2D) で全 ISO 値より後ろに並び、最新判定が壊れる。
// 外部データ（importJSON・旧キー・手編集した localStorage）の入口で必ず通すこと。
export function toStoredDateISO(value) {
  if (typeof value !== 'string') return null
  const t = new Date(value)
  return Number.isNaN(t.getTime()) ? null : t.toISOString()
}

// 'YYYY-MM-DD'（ローカル日付）→ その日の正午のローカル時刻の ISO 文字列。
// 正午にするのは、保存後に別TZで解釈されても日付がずれにくくするため。
// 解釈できない入力は例外ではなく null を返す（呼び出し側は truthy で弾く）。
export function dateInputToISO(value) {
  const [y, m, d] = String(value ?? '').split('-').map(Number)
  const noon = new Date(y, m - 1, d, 12, 0, 0, 0)
  return Number.isNaN(noon.getTime()) ? null : noon.toISOString()
}

// 日付の和文表示（例: 6月20日(金)）。
const WD = ['日', '月', '火', '水', '木', '金', '土']
export function formatDateJP(d) {
  const x = new Date(d)
  return `${x.getMonth() + 1}月${x.getDate()}日(${WD[x.getDay()]})`
}

// 次回予定日（lastReset + intervalDays）のローカル 0:00 を返す。
// lastReset 未設定/不正 intervalDays は null。通知スケジュール用（純関数）。
export function computeNextDueDate(lastReset, intervalDays) {
  const n = Number(intervalDays)
  if (!lastReset || !Number.isFinite(n) || n < 1) return null
  const d = startOfDayLocal(lastReset)
  d.setDate(d.getDate() + Math.round(n))
  return d
}
