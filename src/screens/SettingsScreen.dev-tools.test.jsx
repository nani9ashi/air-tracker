// ============================================================
// SettingsScreen.dev-tools.test.jsx — 開発ツールセクション（1a-2残の実機検証UI）。
//
// 検証したいのは2点:
//   1. DEV ビルドでは「開発ツール」セクションとテスト通知ボタンが出る
//   2. ボタンを押すと fireTestNotification が呼ばれ、結果に応じてトーストが出る
// 本番から消えることは vitest では確認できない（import.meta.env.DEV は
// vitest では常に true）ので、ripgrep によるバンドル検査で別途確認する。
//
// 方針は plan-gates.test.jsx と同じ: useStore.js のみモックし、
// store シングルトンには触らない。
// ============================================================
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const fx = vi.hoisted(() => ({ state: null }))
vi.mock('../store/useStore.js', () => ({
  useStore: (selector = (s) => s) => selector(fx.state),
}))

const { fireTestNotification } = vi.hoisted(() => ({ fireTestNotification: vi.fn() }))
vi.mock('../lib/notifications.js', () => ({ fireTestNotification }))

import { makeDefaultState } from '../store/store.js'
import SettingsScreen from './SettingsScreen.jsx'

beforeEach(() => {
  vi.clearAllMocks()
  fx.state = makeDefaultState()
})

describe('SettingsScreen — 開発ツール（1a-2残）', () => {
  it('「開発ツール」セクションとテスト通知ボタンが表示される', () => {
    render(<SettingsScreen />)
    expect(screen.getByText('開発ツール')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '通知を1分後にテスト発火' })).toBeInTheDocument()
  })

  it('成功したら fireTestNotification を呼び、予約時刻をトーストで示す', async () => {
    const at = new Date(2026, 5, 2, 9, 1, 0)
    fireTestNotification.mockResolvedValue({ ok: true, at })
    const user = userEvent.setup()
    render(<SettingsScreen />)
    await user.click(screen.getByRole('button', { name: '通知を1分後にテスト発火' }))
    expect(fireTestNotification).toHaveBeenCalledOnce()
    expect(screen.getByText(new RegExp(`開発: テスト通知を.*に予約`))).toBeInTheDocument()
  })

  it('失敗したら理由つきでトーストを出す（成功扱いにしない）', async () => {
    fireTestNotification.mockResolvedValue({ ok: false, reason: 'permission-denied' })
    const user = userEvent.setup()
    render(<SettingsScreen />)
    await user.click(screen.getByRole('button', { name: '通知を1分後にテスト発火' }))
    expect(screen.getByText('開発: テスト通知を送れませんでした（permission-denied）')).toBeInTheDocument()
  })
})
