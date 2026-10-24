// ============================================================
// StatsScreen.tiles.test.jsx — 統計のタイル（v2.5.3）。
// docs/test-design-istqb.md §8 の ID をテスト名の先頭に付けている。
//
// 方針は plan-gates.test.jsx と同じ: useStore.js だけをモックしてフィクスチャの
// state を流し込む（store シングルトンには触らない）。画面は基準日を省略して
// 今日を使うため、記録は「今日から何日前」で作る。
// 範囲の境界そのもの（90日ちょうど・91日）は stats.ep-bva.test.js §3-4・§3-5 で固定済み。
// ============================================================
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const fx = vi.hoisted(() => ({ state: null }))
vi.mock('../store/useStore.js', () => ({
  useStore: (selector = (s) => s) => selector(fx.state),
}))
vi.mock('../lib/notifications.js', () => ({
  syncActiveReminder: vi.fn(),
  requestPermissionAfterReset: vi.fn().mockResolvedValue(undefined),
  isNotificationEnabled: vi.fn().mockResolvedValue(false),
}))
vi.mock('../components/PaywallSheet.jsx', () => ({ default: () => null }))

import { makeDefaultState } from '../store/store.js'
import StatsScreen from './StatsScreen.jsx'
import HistoryScreen from './HistoryScreen.jsx'

const DAY = 86400000
// 今日から n 日前の記録で、有料プランの state を作る。
function seedDaysAgo(...daysAgo) {
  const s = makeDefaultState()
  s.settings.plan = 'paid'
  const item = s.bikes[0].items[0]
  item.history = daysAgo.map((n, i) => ({ id: `h${i}`, date: new Date(Date.now() - n * DAY).toISOString() }))
  item.lastReset = item.history.length ? item.history[0].date : null
  return s
}

// タイルの名前から、そのタイルの値と単位を読む。
function tile(label) {
  const el = screen.getByText(label).closest('.stat-tile')
  return {
    value: el.querySelector('.stat-tile__value').textContent,
    unit: el.querySelector('.stat-tile__unit')?.textContent ?? '',
  }
}

// 99日前に終わった60日の遅れ（範囲外）＋ 直近は16日ごと（範囲内に6回）。
// 全期間の平均は (60 + 16×6) / 7 = 22.3日、直近90日の平均は 16日。
const LATE_THEN_RECENT = [3, 19, 35, 51, 67, 83, 99, 159]

beforeEach(() => {
  fx.state = null
})

describe('§8 統計のタイル', () => {
  it('UI-S01: 「直近平均」は直近90日の平均（16日。全期間の 22.3日ではない）、「直近傾向」は「遅め」', () => {
    fx.state = seedDaysAgo(...LATE_THEN_RECENT)
    render(<StatsScreen />)
    expect(tile('直近平均')).toEqual({ value: '16', unit: '日' })
    expect(tile('直近傾向').value).toBe('遅め')
    expect(screen.queryByText('平均間隔')).not.toBeInTheDocument()
  })

  it('UI-S02: 同じデータで、履歴画面の文は全期間の平均のまま（「平均22.3日間隔」）', () => {
    fx.state = seedDaysAgo(...LATE_THEN_RECENT)
    render(<HistoryScreen />)
    expect(screen.getByText('これまで8回記録。平均22.3日間隔です。')).toBeInTheDocument()
  })

  it('UI-S03: 記録1件 → 「直近平均」は「—」（単位なし）', () => {
    fx.state = seedDaysAgo(10)
    render(<StatsScreen />)
    expect(tile('直近平均')).toEqual({ value: '—', unit: '' })
  })
})
