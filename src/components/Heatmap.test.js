// ============================================================
// Heatmap の色分けが computeStatus と一致することを固定する。
//
// 以前は Heatmap.jsx が独自に閾値（remaining<=0 / ratio<=0.25 / <=0.6）を持ち、
// computeStatus の「残り2日以下は soon」という規則が抜けていた。総当たりの結果、
// interval=7・残り2日の1点でホームは「そろそろ」なのにヒートマップは平常色になっていた。
//
// グリッドの構造（列数・7セル・日曜始まり）は本題ではないので入れていない。
// ここで守りたいのは「二重管理を復活させない」ことだけ。
// ============================================================
import { describe, it, expect } from 'vitest'
import { levelForDay, buildColumns } from './Heatmap.jsx'
import { computeStatus } from '../lib/date.js'

const MS = 86400000
const DAY = new Date(2026, 6, 22).getTime() // 判定する日（ローカル0:00基準）
const daysAgo = (n) => DAY - n * MS

describe('levelForDay — computeStatus との一致（二重管理の防止）', () => {
  // 状態系（over / soon）は computeStatus と 1:1。mid / fresh は ok の濃淡。
  const EXPECTED = { overdue: 'over', soon: 'soon' }

  it('DT: 4プリセット × 経過0日〜超過2日を総当たりして状態が一致する', () => {
    const mismatches = []
    for (const interval of [7, 14, 21, 28]) {
      for (let elapsed = 0; elapsed <= interval + 2; elapsed++) {
        const level = levelForDay(daysAgo(elapsed), DAY, interval)
        const { state } = computeStatus(new Date(daysAgo(elapsed)), interval, new Date(DAY))
        const expected = EXPECTED[state]
        const ok = expected ? level === expected : level === 'mid' || level === 'fresh'
        if (!ok) mismatches.push(`interval=${interval} elapsed=${elapsed}: ${state} vs ${level}`)
      }
    }
    expect(mismatches).toEqual([])
  })

  it('BVA: interval=7 / 残り2日 は soon（旧実装が mid にしていた唯一の乖離点）', () => {
    expect(levelForDay(daysAgo(5), DAY, 7)).toBe('soon')
    expect(computeStatus(new Date(daysAgo(5)), 7, new Date(DAY)).state).toBe('soon')
  })

  it.each([
    ['境界ちょうど（remaining=0）', 14, 14, 'over'],
    ['超過', 14, 15, 'over'],
    ['比率0.25ちょうど（interval=28 / 残り7）', 28, 21, 'soon'],
    ['残り2日（interval=14）', 14, 12, 'soon'],
    ['記録直後', 14, 0, 'fresh'],
  ])('BVA: %s → %s', (_label, interval, elapsed, expected) => {
    expect(levelForDay(daysAgo(elapsed), DAY, interval)).toBe(expected)
  })
})

describe('levelForDay — 濃淡（ok の内側）と無効入力', () => {
  it.each([
    ['比率0.6ちょうどは mid', 10, 4, 'mid'],
    ['比率0.6超は fresh', 10, 3, 'fresh'],
  ])('BVA: %s', (_label, interval, elapsed, expected) => {
    expect(levelForDay(daysAgo(elapsed), DAY, interval)).toBe(expected)
  })

  it('EP: 記録がまだ無い日は empty', () => {
    expect(levelForDay(null, DAY, 14)).toBe('empty')
  })

  it.each([
    ['0', 0],
    ['NaN', NaN],
    ["'abc'", 'abc'],
    ['undefined', undefined],
  ])('EP: intervalDays が無効(%s)でも既定14として computeStatus と一致する', (_label, bad) => {
    expect(levelForDay(daysAgo(14), DAY, bad)).toBe('over') // 14日経過＝remaining 0
    expect(levelForDay(daysAgo(11), DAY, bad)).toBe('soon') // 残り3日＝比率0.21
  })
})

describe('buildColumns — 記録日のセル', () => {
  const hist = (...dates) => dates.map((d, i) => ({ id: `h${i}`, date: d.toISOString() }))

  it('ST: 記録した日は pump になる', () => {
    const now = new Date(2026, 6, 22)
    const cols = buildColumns(hist(new Date(2026, 6, 20, 12)), 14, 4, now)
    const cells = cols.flat()
    expect(cells.filter((c) => c.level === 'pump')).toHaveLength(1)
  })

  it('ST: 同じ日に2回記録しても pump セルは1つ', () => {
    const now = new Date(2026, 6, 22)
    const cols = buildColumns(hist(new Date(2026, 6, 20, 9), new Date(2026, 6, 20, 21)), 14, 4, now)
    expect(cols.flat().filter((c) => c.level === 'pump')).toHaveLength(1)
  })

  it('ST: 記録より前の日は empty', () => {
    const now = new Date(2026, 6, 22)
    const cols = buildColumns(hist(new Date(2026, 6, 20, 12)), 14, 4, now)
    expect(cols.flat().some((c) => c.level === 'empty')).toBe(true)
  })

  it('ST: 履歴が空なら記録日以外すべて empty', () => {
    const now = new Date(2026, 6, 22)
    const cols = buildColumns([], 14, 4, now)
    const levels = new Set(cols.flat().map((c) => c.level))
    expect([...levels].every((l) => l === 'empty' || l === 'future')).toBe(true)
  })
})
