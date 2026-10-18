// ============================================================
// Heatmap.render.test.jsx — ヒートマップの描画（v2.5.1）。
// docs/test-design-istqb.md §7 の ID をテスト名の先頭に付けている。
// 色の判定ロジック（levelForDay / buildColumns / monthLabelsFor）は Heatmap.test.js。
// ============================================================
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import Heatmap from './Heatmap.jsx'

// 凡例の中身を、文書の順に「ラベルの文字 / 色見本の種類 / 区切り」の列にする。
function legendSequence(container) {
  const legend = container.querySelector('.heatmap__legend')
  return [...legend.querySelectorAll('.heatmap__legend-label, .heatmap__cell, .heatmap__legend-sep')].map((el) => {
    if (el.classList.contains('heatmap__legend-label')) return el.textContent
    if (el.classList.contains('heatmap__legend-sep')) return 'sep'
    return [...el.classList].find((c) => c.startsWith('heatmap__cell--')).replace('heatmap__cell--', '')
  })
}

describe('§7 凡例の向き', () => {
  it('UI-H01: 目盛りごと反転（多・明→暗・少）。期限間近・超過はそのまま右側', () => {
    const { container } = render(<Heatmap history={[]} intervalDays={14} weeks={5} />)
    expect(legendSequence(container)).toEqual([
      '多', 'pump', 'fresh', 'mid', 'empty', '少',
      'sep',
      'soon', '期限間近',
      'over', '超過',
    ])
  })
})

// ============================================================
// §7 表示位置 — 最新の週（右端）を最初に表示する。
// jsdom はレイアウトを計算しないので、.heatmap__scroll の scrollWidth を
// 「列数 × 16px」として返し、scrollLeft への代入を記録する。
// ============================================================
describe('§7 表示位置', () => {
  let assigned
  beforeEach(() => {
    assigned = []
    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
      configurable: true,
      get() {
        return this.classList.contains('heatmap__scroll') ? this.querySelectorAll('.heatmap__col').length * 16 : 0
      },
    })
    Object.defineProperty(HTMLElement.prototype, 'scrollLeft', {
      configurable: true,
      get() {
        return 0
      },
      set(v) {
        if (this.classList.contains('heatmap__scroll')) assigned.push(v)
      },
    })
  })
  afterEach(() => {
    delete HTMLElement.prototype.scrollWidth
    delete HTMLElement.prototype.scrollLeft
  })

  const cols = (container) => container.querySelectorAll('.heatmap__col').length

  it('UI-H02: 描画の直後に右端（最新の週）までスクロールする', () => {
    const { container } = render(<Heatmap history={[]} intervalDays={14} weeks={53} />)
    expect(assigned.at(-1)).toBe(cols(container) * 16)
  })

  it('UI-H03: 列数が増えたとき（再描画）も右端までスクロールする', () => {
    const { container, rerender } = render(<Heatmap history={[]} intervalDays={14} weeks={18} />)
    const before = assigned.length
    rerender(<Heatmap history={[]} intervalDays={14} weeks={30} />)
    expect(assigned.length).toBeGreaterThan(before)
    expect(assigned.at(-1)).toBe(cols(container) * 16)
  })

  it('UI-H04: 列数が変わらない再描画（間隔の変更）ではスクロールしない', () => {
    const { rerender } = render(<Heatmap history={[]} intervalDays={14} weeks={18} />)
    const before = assigned.length
    rerender(<Heatmap history={[]} intervalDays={21} weeks={18} />)
    expect(assigned.length).toBe(before)
  })
})
