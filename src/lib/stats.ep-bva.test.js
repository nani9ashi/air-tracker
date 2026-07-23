// ============================================================
// stats.js — ISTQB 同値分割(EP) / 境界値分析(BVA)
// 設計書: docs/test-design-istqb.md §3
//
// 既存の stats.test.js（代表値テスト）は変更せず、本ファイルで
// 件数境界・間隔境界・比率境界・丸め・無効パーティションを埋める。
// ============================================================
import { describe, it, expect } from 'vitest'
import {
  sortedHistory,
  averageIntervalDays,
  currentStreak,
  totalCount,
  cycleTrend,
} from './stats.js'

const h = (id, y, m, d) => ({ id, date: new Date(y, m - 1, d, 12).toISOString() })

// 間隔(日)の配列から履歴を組み立てる。gaps=[7,8] なら 3件・間隔 7日と8日。
function seq(gaps) {
  const d = new Date(2026, 0, 1, 12)
  const out = [{ id: 'h0', date: d.toISOString() }]
  gaps.forEach((g, i) => {
    d.setDate(d.getDate() + g)
    out.push({ id: `h${i + 1}`, date: d.toISOString() })
  })
  return out
}

const NON_ARRAYS = [
  ['null', null],
  ['undefined', undefined],
  ['オブジェクト', {}],
  ['文字列', 'x'],
  ['数値', 42],
]

// ------------------------------------------------------------
// §3-3 sortedHistory — 無効パーティション
// ------------------------------------------------------------
describe('sortedHistory', () => {
  it.each(NON_ARRAYS)('EP: 非配列(%s)は空配列', (_label, bad) => {
    expect(sortedHistory(bad)).toEqual([])
  })

  it('EP: 空配列は空配列', () => {
    expect(sortedHistory([])).toEqual([])
  })

  it.each([
    ['null 要素', [null, h('a', 2026, 6, 1)]],
    ['undefined 要素', [undefined, h('a', 2026, 6, 1)]],
    ['date 欠損', [{ id: 'x' }, h('a', 2026, 6, 1)]],
    ['date が空文字', [{ id: 'x', date: '' }, h('a', 2026, 6, 1)]],
    ['文字列要素（旧形式の生データ）', ['2026-06-01', h('a', 2026, 6, 1)]],
  ])('EP: 不正な要素(%s)は除外される', (_label, input) => {
    const out = sortedHistory(input)
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('a')
  })

  it('EP: 昇順に並べ替え、元配列は破壊しない（月・年跨ぎ）', () => {
    const src = [h('c', 2027, 1, 5), h('a', 2026, 6, 30), h('b', 2026, 12, 31)]
    expect(sortedHistory(src).map((x) => x.id)).toEqual(['a', 'b', 'c'])
    expect(src.map((x) => x.id)).toEqual(['c', 'a', 'b'])
  })

  it('BVA: 同一日時の2件は両方残る', () => {
    expect(sortedHistory([h('a', 2026, 6, 1), h('b', 2026, 6, 1)])).toHaveLength(2)
  })

  it('BVA: 1件だけならそのまま', () => {
    expect(sortedHistory([h('a', 2026, 6, 1)]).map((x) => x.id)).toEqual(['a'])
  })
})

// ------------------------------------------------------------
// §3-3 averageIntervalDays — 件数境界 + 丸め
// ------------------------------------------------------------
describe('averageIntervalDays — 件数境界', () => {
  it.each(NON_ARRAYS)('EP: 非配列(%s)は null', (_label, bad) => {
    expect(averageIntervalDays(bad)).toBeNull()
  })

  it.each([
    ['0件（下限の外）', [], null],
    ['1件（下限直下）', [h('a', 2026, 6, 1)], null],
  ])('BVA: %s は null', (_label, input, expected) => {
    expect(averageIntervalDays(input)).toBe(expected)
  })

  it('BVA: 2件（算出可能な最小件数）で平均が出る', () => {
    expect(averageIntervalDays(seq([7]))).toBe(7)
  })

  it('BVA: 有効要素が1件になる入力（date 欠損を除外後）は null', () => {
    expect(averageIntervalDays([h('a', 2026, 6, 1), { id: 'x' }, null])).toBeNull()
  })

  it('BVA: 同日2件は平均 0', () => {
    expect(averageIntervalDays(seq([0]))).toBe(0)
  })

  it('EP: 未ソート入力でも正しい平均（内部でソートされる）', () => {
    const sorted = seq([7, 7])
    const shuffled = [sorted[2], sorted[0], sorted[1]]
    expect(averageIntervalDays(shuffled)).toBe(7)
  })
})

describe('averageIntervalDays — 小数第1位への丸め', () => {
  it.each([
    ['7,8 → 7.5（ちょうど半分）', [7, 8], 7.5],
    ['7,7,8 → 7.3（22/3=7.333 切り捨て側）', [7, 7, 8], 7.3],
    ['7,8,8 → 7.7（23/3=7.667 切り上げ側）', [7, 8, 8], 7.7],
    ['14 → 14（整数はそのまま）', [14], 14],
    ['1,2 → 1.5', [1, 2], 1.5],
    ['30,31 → 30.5（長期間隔）', [30, 31], 30.5],
  ])('BVA: %s', (_label, gaps, expected) => {
    expect(averageIntervalDays(seq(gaps))).toBe(expected)
  })
})

// ------------------------------------------------------------
// §3-1 currentStreak — 間隔境界 gap <= intervalDays
// ------------------------------------------------------------
describe('currentStreak — 間隔境界 BVA', () => {
  it.each([
    ['gap=13（境界の内側）', [13], 14, 2],
    ['★gap=14（境界ちょうど＝継続する）', [14], 14, 2],
    ['★gap=15（境界の外側＝打ち切り）', [15], 14, 1],
    ['gap=0（同日）', [0], 14, 2],
    ['gap=6/7（interval=7 の境界）', [6], 7, 2],
    ['gap=7（interval=7 の境界ちょうど）', [7], 7, 2],
    ['gap=8（interval=7 の外側）', [8], 7, 1],
    ['gap=28（interval=28 の境界ちょうど）', [28], 28, 2],
    ['gap=29（interval=28 の外側）', [29], 28, 1],
  ])('BVA: %s → streak %i', (_label, gaps, interval, expected) => {
    expect(currentStreak(seq(gaps), interval)).toBe(expected)
  })

  it.each([
    ['0件（下限）', [], 0],
    ['1件', [h('a', 2026, 6, 1)], 1],
  ])('BVA: %s → %i', (_label, input, expected) => {
    expect(currentStreak(input, 14)).toBe(expected)
  })

  it.each(NON_ARRAYS)('EP: 非配列(%s)は 0', (_label, bad) => {
    expect(currentStreak(bad, 14)).toBe(0)
  })

  it('BVA: 途中で超過したら直近側だけ数える（古い側は切り捨て）', () => {
    // 新しい順に gap 7, 7, 15(超過), 7 → 直近2つの gap が有効なので streak=3
    expect(currentStreak(seq([7, 15, 7, 7]), 14)).toBe(3)
  })

  it('BVA: 最新の間隔が超過していたら 1 にリセット', () => {
    expect(currentStreak(seq([7, 7, 7, 15]), 14)).toBe(1)
  })

  it('BVA: 全間隔が境界ちょうどなら全件が streak', () => {
    expect(currentStreak(seq([14, 14, 14]), 14)).toBe(4)
  })

  it.each([
    ['0', 0],
    ['NaN', NaN],
    ["'abc'", 'abc'],
    ['null', null],
    ['undefined', undefined],
  ])('EP: intervalDays が無効(%s)なら既定 14 を使う', (_label, bad) => {
    expect(currentStreak(seq([14]), bad)).toBe(2)
    expect(currentStreak(seq([15]), bad)).toBe(1)
  })

  it("EP: intervalDays が数値文字列 '7' なら 7 として扱う", () => {
    expect(currentStreak(seq([7]), '7')).toBe(2)
    expect(currentStreak(seq([8]), '7')).toBe(1)
  })

  it('EP: 未ソート入力でも直近から数える', () => {
    const sorted = seq([7, 15])
    const shuffled = [sorted[2], sorted[0], sorted[1]]
    expect(currentStreak(shuffled, 14)).toBe(1)
  })
})

// ------------------------------------------------------------
// §3-3 totalCount
// ------------------------------------------------------------
describe('totalCount', () => {
  it.each(NON_ARRAYS)('EP: 非配列(%s)は 0', (_label, bad) => {
    expect(totalCount(bad)).toBe(0)
  })

  it.each([
    ['0件', [], 0],
    ['1件', [h('a', 2026, 6, 1)], 1],
    ['3件', seq([7, 7]), 3],
  ])('EP: %s', (_label, input, expected) => {
    expect(totalCount(input)).toBe(expected)
  })

  // v2.1.9 で Findings #7 を修正: 以前は sortedHistory と母集団が食い違い、
  // 履歴画面の「これまで N 回記録」とリストの行数がずれ得た。
  it('EP: date 欠損要素は数えない（sortedHistory と同じ母集団）', () => {
    const input = [h('a', 2026, 6, 1), { id: 'x' }, null]
    expect(totalCount(input)).toBe(1)
    expect(totalCount(input)).toBe(sortedHistory(input).length)
  })
})

// ------------------------------------------------------------
// §3-2 cycleTrend — 比率境界（<= 1.0 / <= 1.25）
// averageIntervalDays が小数第1位に丸めてから比較される点に注意。
// ------------------------------------------------------------
describe('cycleTrend — 比率境界 BVA', () => {
  it.each([
    ['0件', []],
    ['1件', [h('a', 2026, 6, 1)]],
    ['非配列', null],
  ])('EP: 平均が出せない(%s)は —', (_label, input) => {
    expect(cycleTrend(input, 14)).toEqual({ label: '—', tone: 'default' })
  })

  it.each([
    ['avg=7 / interval=14 → 比率 0.5', [7], 14, '順調', 'accent'],
    ['★avg=14 / interval=14 → 比率 1.00 ちょうど', [14], 14, '順調', 'accent'],
    ['★avg=14.1 / interval=14 → 比率 1.007（1目盛り上）', [14, 14, 14, 14, 14, 15, 14, 14, 14, 14], 14, 'やや遅れ', 'warning'],
    ['avg=12 / interval=10 → 比率 1.2', [12], 10, 'やや遅れ', 'warning'],
    ['★avg=12.5 / interval=10 → 比率 1.25 ちょうど', [12, 13], 10, 'やや遅れ', 'warning'],
    ['★avg=12.6 / interval=10 → 比率 1.26（1目盛り上）', [12, 13, 13, 13, 12], 10, '遅れ', 'danger'],
    ['avg=28 / interval=14 → 比率 2.0', [28], 14, '遅れ', 'danger'],
    ['avg=0 / 同日2件 → 比率 0', [0], 14, '順調', 'accent'],
  ])('BVA: %s → %s', (_label, gaps, interval, expectedLabel, expectedTone) => {
    expect(cycleTrend(seq(gaps), interval)).toEqual({ label: expectedLabel, tone: expectedTone })
  })

  it.each([
    ['0', 0],
    ['NaN', NaN],
    ["'abc'", 'abc'],
    ['null', null],
    ['undefined', undefined],
  ])('EP: intervalDays が無効(%s)なら既定 14 で判定', (_label, bad) => {
    expect(cycleTrend(seq([14]), bad).label).toBe('順調')
    expect(cycleTrend(seq([28]), bad).label).toBe('遅れ')
  })

  it('EP: 平均は丸めてから比較される（14.04 は 14.0 として順調）', () => {
    // gap 14 が 24本 + 15 が 1本 → 351/25 = 14.04 → 丸めて 14.0 → 比率 1.0 → 順調
    const gaps = [...Array(24).fill(14), 15]
    expect(averageIntervalDays(seq(gaps))).toBe(14)
    expect(cycleTrend(seq(gaps), 14).label).toBe('順調')
  })
})
