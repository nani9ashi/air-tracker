// ============================================================
// stats.js — 履歴から統計を計算する純粋関数。
// 履歴は [{ id, date(ISO) }]。日付はローカルカレンダー日で扱う。
// ============================================================

import { daysBetween } from './date.js'

// 日付昇順に正規化（元配列は破壊しない）。
export function sortedHistory(history) {
  if (!Array.isArray(history)) return []
  return [...history]
    .filter((h) => h && h.date)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

// 連続するpump間隔の平均（日）。記録2件未満は null。
export function averageIntervalDays(history) {
  const s = sortedHistory(history)
  if (s.length < 2) return null
  let total = 0
  for (let i = 1; i < s.length; i++) {
    total += daysBetween(s[i - 1].date, new Date(s[i].date))
  }
  return Math.round((total / (s.length - 1)) * 10) / 10
}

// 直近から連続して「間隔 ≤ intervalDays」で入れ続けた回数（pump件数）。
// 記録0件→0、1件→1。最新の間隔が超過していたら 1 にリセット。
export function currentStreak(history, intervalDays) {
  const s = sortedHistory(history)
  if (s.length === 0) return 0
  const limit = Number(intervalDays) || 14
  let streak = 1
  for (let i = s.length - 1; i >= 1; i--) {
    const gap = daysBetween(s[i - 1].date, new Date(s[i].date))
    if (gap <= limit) streak++
    else break
  }
  return streak
}

// 記録総数。sortedHistory と同じ母集団で数える（date 欠損の要素は含めない）。
export function totalCount(history) {
  return sortedHistory(history).length
}

// 「直近傾向」の判定に使う範囲（日）。v2.5.2。docs/test-design-istqb.md §3-4。
export const TREND_WINDOW_DAYS = 90

// 直近の間隔の平均を設定サイクルと比較した「傾向」（統計の「直近傾向」）。
// - 数えるのは、終わり（後の記録）が now から TREND_WINDOW_DAYS 日以内の間隔
//   （ちょうど90日前は含める。始まりが範囲より前でも1回分まるごと数える）。
// - 範囲に1つも無ければ最新の1回で判定する（記録が2件以上あれば必ず判定できる）。
// - 平均は丸めずに比べる（v2.5.1 までは小数第1位に丸めてから比べていた）。
//   比率 = 間隔の合計 ÷（間隔の数 × 設定の間隔）。
// 記録2件未満は間隔が無いので '—'。「平均間隔」の表示（averageIntervalDays）は全期間のまま。
export function cycleTrend(history, intervalDays, now = new Date()) {
  const s = sortedHistory(history)
  if (s.length < 2) return { label: '—', tone: 'default' }
  const interval = Number(intervalDays) || 14
  const gapAt = (i) => daysBetween(s[i - 1].date, new Date(s[i].date))
  const gaps = []
  for (let i = 1; i < s.length; i++) {
    if (daysBetween(s[i].date, now) <= TREND_WINDOW_DAYS) gaps.push(gapAt(i))
  }
  if (gaps.length === 0) gaps.push(gapAt(s.length - 1))
  const r = gaps.reduce((sum, g) => sum + g, 0) / (gaps.length * interval)
  if (r <= 1.0) return { label: '順調', tone: 'accent' }
  if (r <= 1.25) return { label: '遅め', tone: 'warning' }
  return { label: '遅延', tone: 'danger' }
}
