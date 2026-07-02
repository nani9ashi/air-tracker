import { describe, it, expect } from 'vitest'
import {
  sortedHistory,
  averageIntervalDays,
  currentStreak,
  totalCount,
  cycleTrend,
} from './stats.js'

// 履歴は [{ id, date(ISO) }]。日付は正午に固定して TZ 揺れを避ける。
const h = (id, y, m, d) => ({ id, date: new Date(y, m - 1, d, 12, 0, 0).toISOString() })

describe('sortedHistory', () => {
  it('昇順に並べ替え、元配列は破壊しない', () => {
    const src = [h('b', 2026, 6, 15), h('a', 2026, 6, 1), h('c', 2026, 6, 8)]
    const out = sortedHistory(src)
    expect(out.map((x) => x.id)).toEqual(['a', 'c', 'b'])
    expect(src.map((x) => x.id)).toEqual(['b', 'a', 'c']) // 非破壊
  })
  it('配列でなければ空配列', () => {
    expect(sortedHistory(null)).toEqual([])
  })
})

describe('averageIntervalDays', () => {
  it('2件未満は null', () => {
    expect(averageIntervalDays([])).toBeNull()
    expect(averageIntervalDays([h('a', 2026, 6, 1)])).toBeNull()
  })
  it('等間隔なら平均が出る', () => {
    const hist = [h('a', 2026, 6, 1), h('b', 2026, 6, 8), h('c', 2026, 6, 15)]
    expect(averageIntervalDays(hist)).toBe(7)
  })
})

describe('currentStreak', () => {
  it('0件は 0', () => {
    expect(currentStreak([], 14)).toBe(0)
  })
  it('間隔が全て上限以内なら件数分', () => {
    const hist = [h('a', 2026, 6, 1), h('b', 2026, 6, 8), h('c', 2026, 6, 15)]
    expect(currentStreak(hist, 14)).toBe(3)
  })
  it('直近の間隔が超過していたら打ち切り', () => {
    const hist = [h('a', 2026, 6, 1), h('b', 2026, 6, 8), h('c', 2026, 6, 28)]
    expect(currentStreak(hist, 14)).toBe(1)
  })
})

describe('totalCount', () => {
  it('件数を返す / 非配列は 0', () => {
    expect(totalCount([h('a', 2026, 6, 1)])).toBe(1)
    expect(totalCount(undefined)).toBe(0)
  })
})

describe('cycleTrend', () => {
  it('平均が出せなければ —', () => {
    expect(cycleTrend([], 14).label).toBe('—')
  })
  it('サイクル以内は順調', () => {
    const hist = [h('a', 2026, 6, 1), h('b', 2026, 6, 8)] // 平均7
    expect(cycleTrend(hist, 14).label).toBe('順調')
  })
  it('やや遅れ / 遅れ の境界', () => {
    const slight = [h('a', 2026, 6, 1), h('b', 2026, 6, 17)] // 平均16, 16/14≈1.14
    expect(cycleTrend(slight, 14).label).toBe('やや遅れ')
    const late = [h('a', 2026, 6, 1), h('b', 2026, 6, 21)] // 平均20, 20/14≈1.43
    expect(cycleTrend(late, 14).label).toBe('遅れ')
  })
})
