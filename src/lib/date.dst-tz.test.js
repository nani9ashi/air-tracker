// ============================================================
// date.js — DST（夏時間）のあるタイムゾーンでの日数計算
// 設計書: docs/test-design-istqb.md §1 / 経緯: docs/test-completion-report.md §5
//
// date.js:2-3 のコメントは「DST は丸めで吸収」と仕様を明示しているが、
// テストは Asia/Tokyo（DST なし）でしか走っていなかったため未検証だった。
// v2.1.8 のミューテーション調査で、daysBetween の Math.round を Math.floor に
// 変えても 556 件が全通過してしまう（M01 が生存する）ことが判明したため追加する。
//
// ■ TZ の固定方法（この位置とやり方に理由がある）
// このファイルの「モジュール先頭」で process.env.TZ を設定する。beforeAll では遅い
// （import 時に Date の内部 TZ が確定するため）。afterAll で復元する。
//   - vite.config.js の test.env で全体を固定する方法は採らない。
//     notify-plan.dt.test.js の Date 表現上限テスト（R6 の窓）が TZ 依存で、
//     America/New_York では窓が 1 日縮んで落ちるため。
//   - Vitest 2 の既定 pool='forks' でのみ有効。pool を 'threads' に変えると
//     process.env.TZ に値は入るが実タイムゾーンは変わらない（下の GUARD が検出する）。
// ============================================================
const ORIGINAL_TZ = process.env.TZ
process.env.TZ = 'America/New_York'

import { afterAll, describe, it, expect } from 'vitest'
import {
  daysBetween,
  startOfDayLocal,
  computeStatus,
  computeNextDueDate,
  toDateInputValue,
} from './date.js'

afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ
  else process.env.TZ = ORIGINAL_TZ
})

// 2026 年の米国 DST: 3/8(日) 2:00 開始（その日は 23 時間）/ 11/1(日) 2:00 終了（25 時間）。
const at = (y, m, d, h = 0) => new Date(y, m - 1, d, h)

// ------------------------------------------------------------
// GUARD — これは装飾ではなく必須。
// TZ 固定が効かなくなると、DST 依存のアサーションは JST では round == floor に
// なるため「静かに全部通ってしまい」、このファイルが無言の no-op に劣化する。
// ------------------------------------------------------------
describe('GUARD: タイムゾーンが実際に固定されているか', () => {
  it('GUARD: 夏は EDT(UTC-4) / 冬は EST(UTC-5) になっている', () => {
    expect(at(2026, 7, 1).getTimezoneOffset()).toBe(240) // 夏 = UTC-4
    expect(at(2026, 1, 1).getTimezoneOffset()).toBe(300) // 冬 = UTC-5
  })

  it('GUARD: DST 開始日は 23 時間、終了日は 25 時間である', () => {
    const MS_PER_HOUR = 3600000
    const springDay = (at(2026, 3, 9).getTime() - at(2026, 3, 8).getTime()) / MS_PER_HOUR
    const fallDay = (at(2026, 11, 2).getTime() - at(2026, 11, 1).getTime()) / MS_PER_HOUR
    expect(springDay).toBe(23)
    expect(fallDay).toBe(25)
  })
})

// ------------------------------------------------------------
// §1-0 daysBetween — DST を丸めで吸収する（date.js:20 の Math.round）
//
// 春の日は 23h なので生の差は N-0.042 日、秋の日は 25h なので N+0.042 日になる。
// round はどちらも N に戻すが、floor/trunc は春で、ceil は秋で 1 日ずれる。
// ------------------------------------------------------------
describe('daysBetween — DST 開始（23時間の日）を跨ぐ', () => {
  it.each([
    ['前日から翌日 3/7 → 3/9', at(2026, 3, 7), at(2026, 3, 9), 2],
    ['開始当日から翌日 3/8 → 3/9', at(2026, 3, 8), at(2026, 3, 9), 1],
    ['2週間 3/1 → 3/15', at(2026, 3, 1), at(2026, 3, 15), 14],
    ['1か月 2/20 → 3/20', at(2026, 2, 20), at(2026, 3, 20), 28],
  ])('BVA: %s は %i 日（floor だと 1 日足りなくなる）', (_label, from, to, expected) => {
    expect(daysBetween(from, to)).toBe(expected)
  })
})

describe('daysBetween — DST 終了（25時間の日）を跨ぐ', () => {
  it.each([
    ['前日から翌日 10/31 → 11/2', at(2026, 10, 31), at(2026, 11, 2), 2],
    ['終了当日から翌日 11/1 → 11/2', at(2026, 11, 1), at(2026, 11, 2), 1],
    ['2週間 10/25 → 11/8', at(2026, 10, 25), at(2026, 11, 8), 14],
    ['1か月 10/15 → 11/12', at(2026, 10, 15), at(2026, 11, 12), 28],
  ])('BVA: %s は %i 日（ceil だと 1 日多くなる）', (_label, from, to, expected) => {
    expect(daysBetween(from, to)).toBe(expected)
  })
})

describe('daysBetween — DST の両方を含む長期間', () => {
  it('BVA: 3/1 → 11/8（開始と終了の両方を跨ぐ）は 252 日', () => {
    // 23h と 25h が相殺するので、丸めなしでも整数になる区間。
    expect(daysBetween(at(2026, 3, 1), at(2026, 11, 8))).toBe(252)
  })

  it('BVA: 1年（2026/6/1 → 2027/6/1）は 365 日', () => {
    expect(daysBetween(at(2026, 6, 1), at(2027, 6, 1))).toBe(365)
  })
})

describe('daysBetween — DST 日の時刻に依存しない', () => {
  it.each([
    ['0:00 同士', 0, 0],
    ['正午 同士', 12, 12],
    ['23:00 → 1:00（時刻が逆転しても日付差で数える）', 23, 1],
    ['1:00 → 23:00', 1, 23],
  ])('EP: DST 開始日を跨ぐ 3/8 → 3/9（%s）は常に 1 日', (_label, fromHour, toHour) => {
    expect(daysBetween(at(2026, 3, 8, fromHour), at(2026, 3, 9, toHour))).toBe(1)
  })

  it('EP: DST 開始の瞬間（3/8 2:00 前後）を含んでも同一日は 0', () => {
    expect(daysBetween(at(2026, 3, 8, 1), at(2026, 3, 8, 5))).toBe(0)
  })
})

describe('startOfDayLocal — DST 日でもローカル 0:00 に丸まる', () => {
  it.each([
    ['DST 開始日 3/8', at(2026, 3, 8, 13)],
    ['DST 終了日 11/1', at(2026, 11, 1, 13)],
  ])('EP: %s の 13:00 は 0:00 になる', (_label, input) => {
    const r = startOfDayLocal(input)
    expect([r.getHours(), r.getMinutes(), r.getSeconds(), r.getMilliseconds()]).toEqual([0, 0, 0, 0])
  })

  it('EP: DST 終了日は 0:00 が 2 回あるが、早い方（EDT 側）を返す', () => {
    // 11/1 は 1:00 が 2 回来る日。setHours(0,0,0,0) は最初の 0:00 を指す。
    expect(startOfDayLocal(at(2026, 11, 1, 23)).getTimezoneOffset()).toBe(240) // EDT
  })
})

// ------------------------------------------------------------
// §1-1 computeStatus — DST を跨いでも状態境界が動かない
// ------------------------------------------------------------
describe('computeStatus — DST を跨いだ状態境界', () => {
  const now = at(2026, 3, 15, 10) // DST 開始（3/8）の 1 週間後
  const daysAgo = (n) => at(2026, 3, 15 - n, 10)

  it.each([
    ['ok の内側', 10, 'ok', 4],
    ['ok/soon 境界の soon 側', 11, 'soon', 3],
    ['soon/overdue 境界（remaining=0）', 14, 'overdue', 0],
    ['overdue の外側', 15, 'overdue', -1],
  ])('BVA: interval=14 / elapsed=%i(%s) — DST 跨ぎでも境界は同じ', (_label, elapsed, state, remaining) => {
    const s = computeStatus(daysAgo(elapsed), 14, now)
    expect(s.elapsed).toBe(elapsed)
    expect(s.state).toBe(state)
    expect(s.remaining).toBe(remaining)
  })

  it('BVA: DST 終了を跨いでも境界は同じ（11/8 時点で interval=14）', () => {
    const fallNow = at(2026, 11, 8, 10)
    expect(computeStatus(at(2026, 10, 25, 10), 14, fallNow).state).toBe('overdue') // elapsed=14
    expect(computeStatus(at(2026, 10, 28, 10), 14, fallNow).state).toBe('soon') // elapsed=11
  })
})

// ------------------------------------------------------------
// §1-3 computeNextDueDate — DST を跨いでもローカル 0:00
// ------------------------------------------------------------
describe('computeNextDueDate — DST を跨ぐ予定日', () => {
  it.each([
    ['DST 開始を跨ぐ 3/1 +14 日', at(2026, 3, 1, 12), 14, '2026-03-15'],
    ['DST 終了を跨ぐ 10/25 +14 日', at(2026, 10, 25, 12), 14, '2026-11-08'],
    ['DST 開始の直前 3/7 +2 日', at(2026, 3, 7, 12), 2, '2026-03-09'],
    ['DST 終了の直前 10/31 +2 日', at(2026, 10, 31, 12), 2, '2026-11-02'],
  ])('BVA: %s → %s（時刻は必ず 0:00）', (_label, base, days, expected) => {
    const due = computeNextDueDate(base, days)
    expect(toDateInputValue(due)).toBe(expected)
    expect(due.getHours()).toBe(0)
  })
})
