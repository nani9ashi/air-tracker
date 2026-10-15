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
import {
  levelForDay,
  buildColumns,
  monthLabelsFor,
  firstLabelMinColumns,
  MONTH_LABEL_MAX_W,
  MONTH_LABEL_MIN_GAP,
  COLUMN_PITCH,
} from './Heatmap.jsx'
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

// ============================================================
// 月ラベル（v2.4.5）— 左端のラベルが次の月のラベルと重ならないこと。
//
// 以前は「左端の列には無条件でラベルを付ける」ルールだったため、左端の週の
// 日曜日が月の最後の1週に入る日（全体の約23%）は、既定の文字サイズでも
// 「5月」「6月」のように隣り合うラベルが重なっていた。文字を大きくすると
// 2〜3列離れていても重なる。左端のラベルは、次のラベルまでに
// 「文字幅 × 倍率 ＋ すき間」が確保できるときだけ出す。
// ============================================================
describe('firstLabelMinColumns — 左端のラベルを出すのに必要な列数', () => {
  it.each([
    [0.85, 2],
    [1.0, 2],
    [1.15, 2],
    [1.3, 3],
    [1.5, 3],
    [1.8, 3],
    [2.0, 4],
  ])('DT: 倍率 %s → %s列', (zoom, cols) => {
    expect(firstLabelMinColumns(zoom)).toBe(cols)
  })
})

describe('monthLabelsFor — 左端のラベルの出す／出さない', () => {
  // 各列の日曜日の月（0始まり）だけを持つ最小の列。
  const cols = (...months) => months.map((m) => [{ month: m }])
  // 左端が5月、distance 列目から6月になる7列。
  const withDistance = (distance) => cols(...Array.from({ length: 7 }, (_, i) => (i < distance ? 4 : 5)))

  it.each([
    [1.0, 1, false],
    [1.0, 2, true],
    [1.0, 3, true],
    [1.0, 4, true],
    [1.3, 1, false],
    [1.3, 2, false],
    [1.3, 3, true],
    [1.3, 4, true],
    [2.0, 1, false],
    [2.0, 2, false],
    [2.0, 3, false],
    [2.0, 4, true],
  ])('DT: 倍率 %s・次のラベルまで %s列 → 左端に出す=%s', (zoom, distance, shown) => {
    const labels = monthLabelsFor(withDistance(distance), zoom)
    expect(labels[0]).toBe(shown ? '5月' : '')
    expect(labels[distance]).toBe('6月') // 次のラベル自体は常に出る
  })

  it('EP: 次のラベルが無い（期間がひと月に収まる）ときは左端に出す', () => {
    expect(monthLabelsFor(cols(9, 9, 9), 2.0)).toEqual(['10月', '', ''])
  })

  it('EP: 列が無ければ空', () => {
    expect(monthLabelsFor([], 1)).toEqual([])
  })

  it('ST: 年またぎ（12月→1月）', () => {
    expect(monthLabelsFor(cols(11, 0, 0, 0, 0), 1)).toEqual(['', '1月', '', '', ''])
    expect(monthLabelsFor(cols(11, 11, 0, 0, 0), 1)).toEqual(['12月', '', '1月', '', ''])
  })

  it('ST: 2列目以降は従来どおり（日曜日の月が前の列と変わった列に付く）', () => {
    expect(monthLabelsFor(cols(4, 4, 4, 4, 5, 5, 5, 5, 6), 1)).toEqual([
      '5月', '', '', '', '6月', '', '', '', '7月',
    ])
  })

  it('倍率を省略すると 1.0 として扱う', () => {
    expect(monthLabelsFor(withDistance(2))).toEqual(monthLabelsFor(withDistance(2), 1))
  })

  it('総当たり: 2026〜2027年の全日付 × 5/18/26/53週 × 倍率1.0/2.0 でラベル同士が重ならない', () => {
    const violations = []
    const seen = { hidden: 0, shownAt2: 0 }
    for (let d = new Date(2026, 0, 1); d <= new Date(2027, 11, 31); d.setDate(d.getDate() + 1)) {
      for (const weeks of [5, 18, 26, 53]) {
        const columns = buildColumns([], 14, weeks, new Date(d))
        for (const zoom of [1.0, 2.0]) {
          const at = monthLabelsFor(columns, zoom)
            .map((l, i) => (l ? i : -1))
            .filter((i) => i >= 0)
          for (let k = 1; k < at.length; k++) {
            const gap = (at[k] - at[k - 1]) * COLUMN_PITCH - MONTH_LABEL_MAX_W * zoom
            if (gap < MONTH_LABEL_MIN_GAP) violations.push(`${d.toDateString()} weeks=${weeks} zoom=${zoom} cols ${at[k - 1]}→${at[k]}`)
          }
          if (zoom === 1.0 && at[0] !== 0) seen.hidden++
          if (zoom === 1.0 && at[0] === 0 && at[1] === 2) seen.shownAt2++
        }
      }
    }
    expect(violations).toEqual([])
    // 検査が空振りしていないこと（左端を消す日も、2列差で出す日も実際にある）
    expect(seen.hidden).toBeGreaterThan(0)
    expect(seen.shownAt2).toBeGreaterThan(0)
  })
})
