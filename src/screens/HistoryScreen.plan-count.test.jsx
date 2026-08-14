// ============================================================
// HistoryScreen.plan-count.test.jsx
// docs/test-completion-report.md §10 項目7 の優先ターゲット:
//   「最初の1本は HistoryScreen のプラン×件数分割」
//
// 固定するのは3つ:
//   1. 無料は直近 limits.history 件だけ通常表示（削除はしない）
//   2. 超過ぶんはロック行として残るが、ぼかしティザーは TEASER=2 件まで
//   3. 有料は全件を通常表示し、ロック行が出ない
// ============================================================
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const fx = vi.hoisted(() => ({ state: null }))
vi.mock('../store/useStore.js', () => ({
  useStore: (selector = (s) => s) => selector(fx.state),
}))

import { makeDefaultState, PLAN_LIMITS } from '../store/store.js'
import HistoryScreen from './HistoryScreen.jsx'

const FREE_LIMIT = PLAN_LIMITS.free.history // 3
const TEASER = 2 // HistoryScreen.jsx の定数と対応

function seed(plan, historyCount) {
  const s = makeDefaultState()
  s.settings.plan = plan
  const item = s.bikes[0].items[0]
  for (let i = 0; i < historyCount; i++) {
    item.history.push({ id: `h-${i}`, date: new Date(2026, 0, 1 + i * 14).toISOString() })
  }
  if (item.history.length) item.lastReset = item.history.at(-1).date
  return s
}

// 通常表示の行（操作できる）／ロック行（aria-hidden・非操作）
const normalRows = (c) => c.querySelectorAll('.history__row:not(.history__row--locked)')
const lockedRows = (c) => c.querySelectorAll('.history__row--locked')

beforeEach(() => {
  fx.state = seed('free', 0)
})

describe('無料プラン — 件数による分割', () => {
  it.each([
    // [記録件数, 通常表示, ぼかしティザー, ロック行に出る残り件数]
    [0, 0, 0, null],
    [1, 1, 0, null],
    [2, 2, 0, null],
    [3, 3, 0, null], // 境界: 上限ちょうど＝まだロックされない
    [4, 3, 1, 1], // 境界: 上限+1 で初めてロックが出る
    [5, 3, 2, 2],
    [6, 3, 2, 3], // ティザーは2件で頭打ち。ロック件数は増え続ける
    [10, 3, 2, 7],
  ])('記録%s件 → 通常%s件 / ティザー%s件 / 残り%s件', (count, shown, teaser, remaining) => {
    fx.state = seed('free', count)
    const { container } = render(<HistoryScreen />)

    expect(normalRows(container)).toHaveLength(shown)
    expect(lockedRows(container)).toHaveLength(teaser)

    if (remaining === null) {
      expect(screen.queryByText(/はProで全件表示できます/)).not.toBeInTheDocument()
    } else {
      expect(
        screen.getByRole('button', { name: `残り${remaining}件はProで全件表示` }),
      ).toBeInTheDocument()
    }
  })

  it('通常表示は最新順（先頭が最新）', () => {
    fx.state = seed('free', 5)
    const { container } = render(<HistoryScreen />)
    const labels = [...normalRows(container)].map((r) => r.getAttribute('aria-label'))
    // seed は 1/1 から 14 日おき＝最後が最新。最新3件が降順で並ぶ。
    expect(labels[0]).toMatch(/2月26日/)
    expect(labels).toHaveLength(FREE_LIMIT)
  })

  it('ロック行は記録を削除していない（見せ方の問題であってデータは残る）', () => {
    fx.state = seed('free', 6)
    render(<HistoryScreen />)
    // 統計バナーは全件（6件）を数えている
    expect(screen.getByText(/これまで6回記録/)).toBeInTheDocument()
  })

  it('ロック行は a11y ツリーから隠れていて操作もできない', () => {
    fx.state = seed('free', 5)
    const { container } = render(<HistoryScreen />)
    for (const row of lockedRows(container)) {
      expect(row).toHaveAttribute('aria-hidden', 'true')
      expect(row).toHaveAttribute('tabindex', '-1')
    }
    // 編集で開けるのは通常表示の3件だけ
    expect(screen.getAllByRole('button', { name: /の記録を編集$/ })).toHaveLength(FREE_LIMIT)
  })
})

describe.each(['pro', 'premium'])('%s プラン — 全件表示', (plan) => {
  it.each([1, 3, 4, 5, 10])('記録%s件をすべて通常表示し、ロック行を出さない', (count) => {
    fx.state = seed(plan, count)
    const { container } = render(<HistoryScreen />)
    expect(normalRows(container)).toHaveLength(count)
    expect(lockedRows(container)).toHaveLength(0)
    expect(screen.queryByText(/はProで全件表示できます/)).not.toBeInTheDocument()
  })
})

describe('空状態', () => {
  it.each(['free', 'pro', 'premium'])('%s: 0件なら空メッセージ、ロック行なし', (plan) => {
    fx.state = seed(plan, 0)
    const { container } = render(<HistoryScreen />)
    expect(screen.getByText('まだ記録がありません。')).toBeInTheDocument()
    expect(normalRows(container)).toHaveLength(0)
    expect(screen.queryByText(/はProで全件表示できます/)).not.toBeInTheDocument()
  })
})
