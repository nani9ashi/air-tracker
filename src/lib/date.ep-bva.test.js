// ============================================================
// date.js — ISTQB 同値分割(EP) / 境界値分析(BVA)
// 設計書: docs/test-design-istqb.md §1
//
// 既存の date.test.js（代表値テスト）は変更せず、本ファイルで
// 「境界とその隣接値」「無効パーティション」を機械的に埋める。
// 日付は必ずローカル Date コンストラクタで構築し、TZ 非依存に保つ。
// ============================================================
import { describe, it, expect } from 'vitest'
import {
  startOfDayLocal,
  daysBetween,
  computeStatus,
  toDateInputValue,
  dateInputToISO,
  toStoredDateISO,
  formatDateJP,
  computeNextDueDate,
} from './date.js'

// ローカル日時ビルダ（月は1始まりで書けるようにする）
const at = (y, m, d, h = 12, mi = 0, s = 0, ms = 0) => new Date(y, m - 1, d, h, mi, s, ms)

// ------------------------------------------------------------
// §1-0 startOfDayLocal / daysBetween
// ------------------------------------------------------------
describe('startOfDayLocal', () => {
  it.each([
    ['0:00 ちょうど', at(2026, 6, 1, 0, 0, 0, 0)],
    ['正午', at(2026, 6, 1, 12, 0, 0, 0)],
    ['23:59:59.999', at(2026, 6, 1, 23, 59, 59, 999)],
  ])('EP: 同一日の任意時刻(%s)は同じ 0:00 に丸まる', (_label, input) => {
    const r = startOfDayLocal(input)
    expect(r.getFullYear()).toBe(2026)
    expect(r.getMonth()).toBe(5)
    expect(r.getDate()).toBe(1)
    expect([r.getHours(), r.getMinutes(), r.getSeconds(), r.getMilliseconds()]).toEqual([0, 0, 0, 0])
  })

  it('EP: 引数を破壊しない（元の Date は変わらない）', () => {
    const src = at(2026, 6, 1, 23, 30)
    startOfDayLocal(src)
    expect(src.getHours()).toBe(23)
  })

  it('EP: ISO文字列を渡しても Date として扱える', () => {
    const iso = at(2026, 6, 1, 15, 0).toISOString()
    expect(startOfDayLocal(iso).getDate()).toBe(1)
  })
})

describe('daysBetween', () => {
  it.each([
    ['同日（時刻は無視）', at(2026, 6, 1, 23, 0), at(2026, 6, 1, 0, 30), 0],
    ['翌日', at(2026, 6, 1), at(2026, 6, 2), 1],
    ['未来日 → 負', at(2026, 6, 2), at(2026, 6, 1), -1],
    ['月跨ぎ', at(2026, 5, 30), at(2026, 6, 2), 3],
    ['年跨ぎ', at(2025, 12, 31), at(2026, 1, 1), 1],
    ['うるう日跨ぎ 2/28→3/1', at(2028, 2, 28), at(2028, 3, 1), 2],
    ['非うるう年 2/28→3/1', at(2026, 2, 28), at(2026, 3, 1), 1],
  ])('BVA: %s は %#', (_label, from, to, expected) => {
    expect(daysBetween(from, to)).toBe(expected)
  })

  it('BVA: 1年（2026/6/1 → 2027/6/1）は 365 日', () => {
    expect(daysBetween(at(2026, 6, 1), at(2027, 6, 1))).toBe(365)
  })
})

// ------------------------------------------------------------
// §1-1 computeStatus 状態境界（最重要）
//   overdue: remaining <= 0
//   soon   : remaining/interval <= 0.25 || remaining <= 2
//   ok     : それ以外
// プリセット4サイクル全てで境界とその隣接値を検証する。
// ------------------------------------------------------------
describe('computeStatus — 状態境界 BVA', () => {
  const now = at(2026, 6, 20, 10, 0)
  const daysAgo = (n) => at(2026, 6, 20 - n, 10, 0)

  // [interval, elapsed, remaining, expectedState, 狙い]
  const BOUNDARIES = [
    // interval 7: 比率境界 remaining<=1.75、ただし remaining<=2 の方が先に効く
    [7, 3, 4, 'ok', 'ok側の外側'],
    [7, 4, 3, 'ok', 'ok/soon 境界の ok 側'],
    [7, 5, 2, 'soon', 'ok/soon 境界の soon 側（remaining<=2 が効く）'],
    [7, 6, 1, 'soon', 'soon/overdue 境界の soon 側'],
    [7, 7, 0, 'overdue', '★soon/overdue 境界（remaining=0 は overdue）'],
    [7, 8, -1, 'overdue', 'overdue 側の外側'],
    // interval 14: 比率境界 remaining<=3.5
    [14, 9, 5, 'ok', 'ok側の外側'],
    [14, 10, 4, 'ok', 'ok/soon 境界の ok 側'],
    [14, 11, 3, 'soon', 'ok/soon 境界の soon 側'],
    [14, 13, 1, 'soon', 'soon/overdue 境界の soon 側'],
    [14, 14, 0, 'overdue', '★soon/overdue 境界（既存テストは 15 のみ）'],
    [14, 15, -1, 'overdue', 'overdue 側の外側'],
    // interval 21: 比率境界 remaining<=5.25
    [21, 14, 7, 'ok', 'ok側の外側'],
    [21, 15, 6, 'ok', 'ok/soon 境界の ok 側'],
    [21, 16, 5, 'soon', 'ok/soon 境界の soon 側'],
    [21, 20, 1, 'soon', 'soon/overdue 境界の soon 側'],
    [21, 21, 0, 'overdue', '★soon/overdue 境界'],
    [21, 22, -1, 'overdue', 'overdue 側の外側'],
    // interval 28: 比率境界 remaining<=7（7/28 = 0.25 ちょうど）
    [28, 19, 9, 'ok', 'ok側の外側'],
    [28, 20, 8, 'ok', 'ok/soon 境界の ok 側'],
    [28, 21, 7, 'soon', '★比率がちょうど 0.25（<= と < の分かれ目）'],
    [28, 27, 1, 'soon', 'soon/overdue 境界の soon 側'],
    [28, 28, 0, 'overdue', '★soon/overdue 境界'],
    [28, 29, -1, 'overdue', 'overdue 側の外側'],
  ]

  it.each(BOUNDARIES)(
    'BVA: interval=%i / elapsed=%i (remaining=%i) は %s — %s',
    (interval, elapsed, remaining, expectedState) => {
      const s = computeStatus(daysAgo(elapsed), interval, now)
      expect(s.state).toBe(expectedState)
      expect(s.elapsed).toBe(elapsed)
      expect(s.remaining).toBe(remaining)
    },
  )

  it.each(BOUNDARIES)(
    'BVA: interval=%i / elapsed=%i の付随フィールドが state と整合する',
    (interval, elapsed, remaining, expectedState) => {
      const s = computeStatus(daysAgo(elapsed), interval, now)
      const expected = {
        ok: { tone: 'accent', icon: '✓', message: 'まだ大丈夫' },
        soon: { tone: 'warning', icon: '⏳', message: 'そろそろ' },
        overdue: { tone: 'energy', icon: '⚠', message: '空気入れどき！' },
      }[expectedState]
      expect({ tone: s.tone, icon: s.icon, message: s.message }).toEqual(expected)
      // overdue は progress=0 / fill=1 に固定、overdueBy は正の超過日数
      if (expectedState === 'overdue') {
        expect(s.progress).toBe(0)
        expect(s.fill).toBe(1)
        expect(s.overdueBy).toBe(Math.abs(remaining))
      } else {
        expect(s.overdueBy).toBe(0)
        expect(s.progress).toBeCloseTo(remaining / interval, 10)
        expect(s.fill).toBeCloseTo(elapsed / interval, 10)
      }
    },
  )

  it('BVA: 未記録直後（elapsed=0）は progress=1 / fill=0 の満タン', () => {
    const s = computeStatus(daysAgo(0), 14, now)
    expect(s.state).toBe('ok')
    expect(s.progress).toBe(1)
    expect(s.fill).toBe(0)
  })
})

// ------------------------------------------------------------
// §1-2 computeStatus パーティション
// ------------------------------------------------------------
describe('computeStatus — 入力パーティション', () => {
  const now = at(2026, 6, 20, 10, 0)

  it.each([['null', null], ['undefined', undefined], ['空文字', ''], ['0', 0]])(
    'EP: lastReset が無効(%s)なら unset',
    (_label, bad) => {
      const s = computeStatus(bad, 14, now)
      expect(s).toEqual({
        state: 'unset',
        elapsed: null,
        remaining: null,
        overdueBy: 0,
        progress: 1,
        fill: 0,
        tone: 'accent',
        message: 'まずは空気を入れて記録しよう',
        icon: '🚲',
      })
    },
  )

  it.each([
    ['Date オブジェクト', at(2026, 6, 15, 10)],
    ['ISO 文字列', at(2026, 6, 15, 10).toISOString()],
  ])('EP: lastReset が有効(%s)なら elapsed を算出', (_label, value) => {
    expect(computeStatus(value, 14, now).elapsed).toBe(5)
  })

  it.each([
    ['0', 0],
    ['NaN', NaN],
    ["'abc'", 'abc'],
    ['null', null],
    ['undefined', undefined],
    ['空文字', ''],
  ])('EP: intervalDays が無効(%s)なら既定 14 として扱う', (_label, bad) => {
    // elapsed=10 → interval=14 なら remaining=4 で ok
    const s = computeStatus(at(2026, 6, 10, 10), bad, now)
    expect(s.remaining).toBe(4)
    expect(s.state).toBe('ok')
  })

  it("EP: intervalDays が数値文字列 '21' なら 21 として扱う", () => {
    expect(computeStatus(at(2026, 6, 10, 10), '21', now).remaining).toBe(11)
  })

  it('EP: 未来日の lastReset は elapsed 負・progress/fill がクランプされる', () => {
    const s = computeStatus(at(2026, 6, 21, 10), 14, now)
    expect(s.elapsed).toBe(-1)
    expect(s.remaining).toBe(15)
    expect(s.state).toBe('ok')
    expect(s.progress).toBe(1) // 15/14 > 1 → 1 にクランプ
    expect(s.fill).toBe(0) // -1/14 < 0 → 0 にクランプ
  })

  // ※Findings #4: 負の intervalDays は弾かれず素通りする。
  //   setInterval は d<1 を拒否するが normalize は負数を残すため、
  //   importJSON 経由の外部データが負サイクルを持ち得る。現行挙動を固定する。
  it('EP: 負の intervalDays は素通りする（過去日なら overdue）（※Findings #4）', () => {
    const s = computeStatus(at(2026, 6, 17, 10), -5, now)
    expect(s.state).toBe('overdue')
    expect(s.remaining).toBe(-8) // -5 - 3
  })

  // 「負の intervalDays は常に overdue」は誤り。lastReset が未来なら soon になる。
  // このケース（負の intervalDays × 未来の lastReset）は fill のクランプ上限
  // （date.js:59 の clamp(..., 0, 1)）が実際に効く入力域であり、上限を書き換える改悪を検出する。
  it('EP: 負の intervalDays でも lastReset が未来なら soon（fill は上限1でクランプ）（※Findings #4）', () => {
    const s = computeStatus(at(2027, 6, 20, 10), -1, now)
    expect(s.state).toBe('soon')
    expect(s.elapsed).toBe(-365)
    expect(s.remaining).toBe(364)
    expect(s.fill).toBe(1) // clamp(-365 / -1, 0, 1) = 1。上限を 2 にすると 2 になる
  })
})

// ------------------------------------------------------------
// §1-3 computeNextDueDate — 数値 BVA + カレンダー境界
// ------------------------------------------------------------
describe('computeNextDueDate — 数値 BVA', () => {
  const base = at(2026, 6, 1, 13, 0) // 時刻は 0:00 に丸められる

  it.each([
    ['0（下限の外）', 0],
    ['0.9（下限直下）', 0.9],
    ['-1（負）', -1],
    ['NaN', NaN],
    ["'abc'", 'abc'],
    ['Infinity', Infinity],
    ['null', null],
    ['undefined', undefined],
  ])('BVA: intervalDays が %s なら null', (_label, bad) => {
    expect(computeNextDueDate(base, bad)).toBeNull()
  })

  it.each([
    ['1（下限ちょうど）', 1, 2],
    ['1.4（round で 1）', 1.4, 2],
    ['1.5（round で 2）', 1.5, 3],
    ['14（既定）', 14, 15],
    ["'14'（数値文字列）", '14', 15],
    ['28（最長プリセット）', 28, 29],
  ])('BVA: intervalDays が %s なら 6/%i', (_label, days, expectedDate) => {
    const due = computeNextDueDate(base, days)
    expect(due.getMonth()).toBe(5)
    expect(due.getDate()).toBe(expectedDate)
    expect(due.getHours()).toBe(0)
  })

  it.each([
    ['lastReset が null', null],
    ['lastReset が空文字', ''],
    ['lastReset が undefined', undefined],
  ])('EP: %s なら null', (_label, bad) => {
    expect(computeNextDueDate(bad, 14)).toBeNull()
  })
})

describe('computeNextDueDate — カレンダー境界', () => {
  it.each([
    ['月末 1/31 +1日 → 2/1', at(2026, 1, 31), 1, [2026, 1, 1]],
    ['非うるう年 2/28 +1日 → 3/1', at(2026, 2, 28), 1, [2026, 2, 1]],
    ['うるう年 2/28 +1日 → 2/29', at(2028, 2, 28), 1, [2028, 1, 29]],
    ['うるう日 2/29 +1日 → 3/1', at(2028, 2, 29), 1, [2028, 2, 1]],
    ['年末 12/31 +1日 → 翌年 1/1', at(2026, 12, 31), 1, [2027, 0, 1]],
    ['1/31 +28日 → 2/28', at(2026, 1, 31), 28, [2026, 1, 28]],
    ['30日月 4/30 +1日 → 5/1', at(2026, 4, 30), 1, [2026, 4, 1]],
  ])('BVA: %s', (_label, from, days, [y, monthIdx, d]) => {
    const due = computeNextDueDate(from, days)
    expect([due.getFullYear(), due.getMonth(), due.getDate()]).toEqual([y, monthIdx, d])
    expect(due.getHours()).toBe(0)
  })
})

// ------------------------------------------------------------
// §1-4 toDateInputValue / dateInputToISO / formatDateJP
// ------------------------------------------------------------
describe('toDateInputValue', () => {
  it.each([
    ['1桁の月日はゼロ埋め', at(2026, 1, 5, 9, 0), '2026-01-05'],
    ['2桁の月日', at(2026, 12, 31, 9, 0), '2026-12-31'],
    ['0:00 ちょうど', at(2026, 6, 20, 0, 0), '2026-06-20'],
    ['23:59:59.999 でも当日', at(2026, 6, 20, 23, 59, 59, 999), '2026-06-20'],
    ['うるう日', at(2028, 2, 29, 12), '2028-02-29'],
  ])('EP: %s', (_label, input, expected) => {
    expect(toDateInputValue(input)).toBe(expected)
  })

  it('EP: 引数省略でも YYYY-MM-DD 形式になる', () => {
    expect(toDateInputValue()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('dateInputToISO', () => {
  it.each([
    ['通常日', '2026-06-20'],
    ['1桁月日', '2026-01-05'],
    ['年末', '2026-12-31'],
    ['年始', '2026-01-01'],
    ['うるう日', '2028-02-29'],
    ['月末', '2026-01-31'],
  ])('BVA: %s は toDateInputValue と往復できる', (_label, value) => {
    expect(toDateInputValue(new Date(dateInputToISO(value)))).toBe(value)
  })

  it('EP: 保存時刻は正午（TZ 差で日付がずれないようにするため）', () => {
    expect(new Date(dateInputToISO('2026-06-20')).getHours()).toBe(12)
  })

  // v2.1.9 で Findings #2 を修正: 以前は Invalid Date に toISOString() を呼んで
  // RangeError を投げ、呼び出し側（PumpSheet.jsx / HistoryScreen.jsx）の `value &&`
  // ガード頼みだった。現在は例外ではなく null を返し、呼び出し側が truthy で弾く。
  it.each([
    ['空文字', ''],
    ['数値でない', 'abc'],
    ['日が欠けている', '2026-06'],
    ['末尾にゴミ', '2026-06-20x'],
    ['区切りが違う', '2026/06/20'],
    ['null', null],
    ['undefined', undefined],
    ['数値', 20260620],
  ])('EP: 不正な入力(%s)は null を返す（例外を投げない）', (_label, bad) => {
    expect(dateInputToISO(bad)).toBeNull()
  })
})

// ------------------------------------------------------------
// toStoredDateISO — 保存する日付文字列の検証・正規化（v2.1.9 で追加）
// recomputeLastReset / sortedHistory は「ISO は辞書順＝時系列順」を前提に
// .sort() するため、保存値は必ず ISO 表現に揃える必要がある。
// ------------------------------------------------------------
describe('toStoredDateISO', () => {
  it.each([
    ['ISO(UTC)', at(2026, 6, 1, 12).toISOString()],
    ['ミリ秒なし ISO', '2026-06-01T03:00:00Z'],
    ['日付のみ', '2026-06-01'],
  ])('EP: 有効な入力(%s)は ISO 文字列を返す', (_label, value) => {
    const r = toStoredDateISO(value)
    expect(r).toBe(new Date(value).toISOString())
    expect(r).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/)
  })

  it.each([
    ['スラッシュ区切り', '2026/06/01'],
    ['オフセット付き', '2026-06-01T12:00:00+09:00'],
    ['英語表記', 'June 1 2026'],
  ])('EP: 別表現(%s)も ISO 表現へ正規化される（辞書順ソートを守るため）', (_label, value) => {
    const r = toStoredDateISO(value)
    expect(r).toBe(new Date(value).toISOString())
    expect(r.includes('/')).toBe(false)
  })

  it.each([
    ['空文字', ''],
    ['ゴミ文字列', 'ゴミ文字列'],
    ['null', null],
    ['undefined', undefined],
    ['数値', 1750000000000],
    ['Date オブジェクト（文字列のみ受理）', new Date()],
    ['オブジェクト', {}],
    ['配列', []],
  ])('EP: 無効な入力(%s)は null', (_label, bad) => {
    expect(toStoredDateISO(bad)).toBeNull()
  })

  it('BVA: 正規化は冪等（一度通した値を再度通しても変わらない）', () => {
    const once = toStoredDateISO('2026/06/01')
    expect(toStoredDateISO(once)).toBe(once)
  })

  it('BVA: 正規化後は辞書順が時系列順と一致する', () => {
    const raw = ['2026-06-01T12:00:00.000Z', '2026/01/01', '2026-12-31T12:00:00.000Z']
    const normalized = raw.map(toStoredDateISO).sort()
    // 正規化前は '/'(0x2F) > '-'(0x2D) で '2026/01/01' が最後に並んでしまう
    expect([...raw].sort().at(-1)).toBe('2026/01/01')
    expect(normalized.at(-1)).toBe(new Date('2026-12-31T12:00:00.000Z').toISOString())
  })
})

describe('formatDateJP', () => {
  // 2026-06-01 は月曜。以降1日ずつで曜日7通りを網羅する。
  it.each([
    [at(2026, 6, 1), '6月1日(月)'],
    [at(2026, 6, 2), '6月2日(火)'],
    [at(2026, 6, 3), '6月3日(水)'],
    [at(2026, 6, 4), '6月4日(木)'],
    [at(2026, 6, 5), '6月5日(金)'],
    [at(2026, 6, 6), '6月6日(土)'],
    [at(2026, 6, 7), '6月7日(日)'],
  ])('EP: 曜日7通りを表示できる → %s', (input, expected) => {
    expect(formatDateJP(input)).toBe(expected)
  })

  it.each([
    ['月末', at(2026, 1, 31), '1月31日(土)'],
    ['年末', at(2026, 12, 31), '12月31日(木)'],
    ['うるう日', at(2028, 2, 29), '2月29日(火)'],
    ['ISO 文字列でも扱える', at(2026, 6, 1, 15).toISOString(), '6月1日(月)'],
  ])('BVA: %s', (_label, input, expected) => {
    expect(formatDateJP(input)).toBe(expected)
  })
})
