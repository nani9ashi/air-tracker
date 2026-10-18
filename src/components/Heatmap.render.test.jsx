// ============================================================
// Heatmap.render.test.jsx — ヒートマップの描画（v2.5.1）。
// docs/test-design-istqb.md §7 の ID をテスト名の先頭に付けている。
// 色の判定ロジック（levelForDay / buildColumns / monthLabelsFor）は Heatmap.test.js。
// ============================================================
import { describe, it, expect } from 'vitest'
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
