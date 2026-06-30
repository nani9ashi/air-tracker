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

// 記録総数。
export function totalCount(history) {
  return Array.isArray(history) ? history.length : 0
}

// 平均間隔を設定サイクルと比較した「傾向」（ヒートマップと同じサイクル基準）。
// 記録2件未満は平均が出せないので '—'。
export function cycleTrend(history, intervalDays) {
  const avg = averageIntervalDays(history)
  const interval = Number(intervalDays) || 14
  if (avg == null) return { label: '—', tone: 'default' }
  const r = avg / interval
  if (r <= 1.0) return { label: '順調', tone: 'accent' }
  if (r <= 1.25) return { label: 'やや遅れ', tone: 'warning' }
  return { label: '遅れ', tone: 'energy' }
}
