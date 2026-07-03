import { describe, it, expect } from 'vitest'
import { planNotifications, reminderStatus, REMINDER_HOUR } from './notify-plan.js'

// lastReset=2026-06-01(正午) / interval=14 → 予定日=6/15 0:00 → primary=6/15 20:00 / renudge=6/17 20:00
const lastReset = new Date(2026, 5, 1, 12).toISOString()
const at = (y, m, d, h) => new Date(y, m - 1, d, h).getTime()

describe('planNotifications', () => {
  it('予定日前: primary(前夜=予定日-1)＋renudge の2本（20時）', () => {
    const out = planNotifications('テスト車', lastReset, 14, { userAction: false, now: at(2026, 6, 10, 10) })
    expect(out.map((n) => n.kind)).toEqual(['primary', 'renudge'])
    expect(out[0].at.getDate()).toBe(14) // 予定日6/15の前日
    expect(out[0].at.getHours()).toBe(REMINDER_HOUR)
    expect(out[0].body).toContain('テスト車')
    expect(out[0].body).toContain('14日間隔')
    expect(out[1].at.getDate()).toBe(17) // 予定日+2
  })

  it('超過＋ユーザー操作: catchup 1本（直近20時）', () => {
    const out = planNotifications('車', lastReset, 14, { userAction: true, now: at(2026, 6, 16, 10) })
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('catchup')
    expect(out[0].at.getDate()).toBe(16) // 当日20時がまだ未来
    expect(out[0].at.getHours()).toBe(20)
  })

  it('超過＋ユーザー操作（20時以降）: 翌日20時にcatchup', () => {
    const out = planNotifications('車', lastReset, 14, { userAction: true, now: at(2026, 6, 16, 22) })
    expect(out[0].at.getDate()).toBe(17)
  })

  it('超過＋起動時: renudgeが未来なら1本', () => {
    const out = planNotifications('車', lastReset, 14, { userAction: false, now: at(2026, 6, 16, 10) })
    expect(out.map((n) => n.kind)).toEqual(['renudge'])
  })

  it('超過＋起動時: renudgeも過ぎていれば空（無音・スパム回避）', () => {
    const out = planNotifications('車', lastReset, 14, { userAction: false, now: at(2026, 6, 20, 10) })
    expect(out).toEqual([])
  })

  it('未記録は空', () => {
    expect(planNotifications('車', null, 14, { now: at(2026, 6, 10, 10) })).toEqual([])
  })
})

describe('reminderStatus', () => {
  it('前夜リマインダー前は scheduled（予定日-1の20時）', () => {
    const r = reminderStatus(lastReset, 14, new Date(2026, 5, 10, 10))
    expect(r.state).toBe('scheduled')
    expect(r.at.getDate()).toBe(14) // 予定日6/15の前日
    expect(r.at.getHours()).toBe(20)
  })
  it('前夜を過ぎたら次回=念押し(予定日+2)を返す', () => {
    const r = reminderStatus(lastReset, 14, new Date(2026, 5, 16, 10))
    expect(r.state).toBe('scheduled')
    expect(r.at.getDate()).toBe(17)
  })
  it('念押し(予定日+2)も過ぎたら overdue', () => {
    expect(reminderStatus(lastReset, 14, new Date(2026, 5, 20, 10)).state).toBe('overdue')
  })
  it('未記録は none', () => {
    expect(reminderStatus(null, 14, new Date(2026, 5, 10, 10)).state).toBe('none')
  })
})
