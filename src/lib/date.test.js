import { describe, it, expect } from 'vitest'
import {
  daysBetween,
  computeStatus,
  toDateInputValue,
  dateInputToISO,
  computeNextDueDate,
} from './date.js'

// すべてローカルカレンダー日で扱う純粋関数。TZ 揺れを避けるためローカル Date で構築。
describe('daysBetween', () => {
  it('同じ日は 0', () => {
    expect(daysBetween(new Date(2026, 5, 1, 23, 0), new Date(2026, 5, 1, 1, 0))).toBe(0)
  })
  it('前日は 1', () => {
    expect(daysBetween(new Date(2026, 5, 1), new Date(2026, 5, 2))).toBe(1)
  })
  it('月をまたいでも日数で数える', () => {
    expect(daysBetween(new Date(2026, 4, 30), new Date(2026, 5, 2))).toBe(3)
  })
})

describe('computeStatus', () => {
  const now = new Date(2026, 5, 20, 10, 0, 0)
  const daysAgo = (n) => new Date(2026, 5, 20 - n, 10, 0, 0)

  it('未記録は unset（fill 0 / remaining null）', () => {
    const s = computeStatus(null, 14, now)
    expect(s.state).toBe('unset')
    expect(s.remaining).toBeNull()
    expect(s.fill).toBe(0)
  })
  it('十分残っていれば ok', () => {
    const s = computeStatus(daysAgo(5), 14, now)
    expect(s.state).toBe('ok')
    expect(s.remaining).toBe(9)
  })
  it('残り2日以下は soon', () => {
    expect(computeStatus(daysAgo(12), 14, now).state).toBe('soon')
  })
  it('残り割合25%以下は soon', () => {
    expect(computeStatus(daysAgo(11), 14, now).state).toBe('soon')
  })
  it('超過は overdue（overdueBy 正）', () => {
    const s = computeStatus(daysAgo(15), 14, now)
    expect(s.state).toBe('overdue')
    expect(s.overdueBy).toBe(1)
    expect(s.fill).toBe(1)
  })
})

describe('toDateInputValue / dateInputToISO', () => {
  it('YYYY-MM-DD を往復できる', () => {
    const iso = dateInputToISO('2026-06-20')
    expect(toDateInputValue(new Date(iso))).toBe('2026-06-20')
  })
})

describe('computeNextDueDate', () => {
  it('lastReset + intervalDays のローカル0:00を返す', () => {
    const due = computeNextDueDate(new Date(2026, 5, 1, 13, 0).toISOString(), 14)
    expect(due.getFullYear()).toBe(2026)
    expect(due.getMonth()).toBe(5) // 6月
    expect(due.getDate()).toBe(15) // 1 + 14
    expect(due.getHours()).toBe(0)
  })
  it('未設定/不正入力は null', () => {
    expect(computeNextDueDate(null, 14)).toBeNull()
    expect(computeNextDueDate('2026-06-01T00:00:00Z', 0)).toBeNull()
    expect(computeNextDueDate('2026-06-01T00:00:00Z', undefined)).toBeNull()
  })
})
