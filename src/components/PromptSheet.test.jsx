// ============================================================
// PromptSheet.test.jsx — window.prompt の置き換えが同じ受理条件で動くか。
//
// 旧実装との差は1点だけ意図的: 不正値のとき prompt は「閉じて黙って no-op」
// だったが、いまは決定ボタンが disabled で送信自体できない。
// ここではその差も含めて固定する。
// ============================================================
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PromptSheet, { PromptForm } from './PromptSheet.jsx'
import { parseCycle } from '../screens/HomeScreen.jsx'

const openSheet = (props = {}) => {
  const onConfirm = vi.fn()
  const onClose = vi.fn()
  render(
    <PromptSheet
      open
      onClose={onClose}
      title="自転車を追加"
      label="名前"
      confirmLabel="追加する"
      onConfirm={onConfirm}
      {...props}
    />,
  )
  return { onConfirm, onClose, user: userEvent.setup() }
}

describe('PromptSheet — 既定の受理条件（trim して空文字を弾く）', () => {
  it('入力にフォーカスが当たっている（タップ直後に IME が上がる）', () => {
    openSheet()
    expect(screen.getByLabelText('名前')).toHaveFocus()
  })

  it('空のあいだ決定ボタンは無効', () => {
    openSheet()
    expect(screen.getByRole('button', { name: '追加する' })).toBeDisabled()
  })

  it('空白のみも無効（trim 後が空）', async () => {
    const { user } = openSheet()
    await user.type(screen.getByLabelText('名前'), '   ')
    expect(screen.getByRole('button', { name: '追加する' })).toBeDisabled()
  })

  it('確定すると trim 済みの値で onConfirm', async () => {
    const { onConfirm, user } = openSheet()
    await user.type(screen.getByLabelText('名前'), '  通勤号  ')
    await user.click(screen.getByRole('button', { name: '追加する' }))
    expect(onConfirm).toHaveBeenCalledOnce()
    expect(onConfirm).toHaveBeenCalledWith('通勤号')
  })

  it('Enter でも送信できる（form の submit）', async () => {
    const { onConfirm, user } = openSheet()
    await user.type(screen.getByLabelText('名前'), '通勤号{Enter}')
    expect(onConfirm).toHaveBeenCalledWith('通勤号')
  })

  it('無効なあいだは Enter でも送信されない', async () => {
    const { onConfirm, user } = openSheet()
    await user.type(screen.getByLabelText('名前'), '{Enter}')
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('maxLength を超えて入力できない', async () => {
    const { user } = openSheet({ maxLength: 5 })
    await user.type(screen.getByLabelText('名前'), '123456789')
    expect(screen.getByLabelText('名前')).toHaveValue('12345')
  })

  it('キャンセル / Escape / 背景タップで閉じる', async () => {
    const { onClose, onConfirm, user } = openSheet()
    await user.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(onClose).toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()

    onClose.mockClear()
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('open=false なら描画されない', () => {
    render(<PromptSheet open={false} onClose={vi.fn()} title="自転車を追加" onConfirm={vi.fn()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('dialog として公開され、タイトルが名前になる', () => {
    openSheet()
    expect(screen.getByRole('dialog', { name: '自転車を追加' })).toHaveAttribute('aria-modal', 'true')
  })
})

describe('PromptForm — Sheet の中に直接置く形（入れ子回避）', () => {
  it('Sheet を生やさない（BikeSheet / HistoryScreen 用）', () => {
    render(<PromptForm label="名前" onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText('名前')).toBeInTheDocument()
  })

  it('onCancel が呼ばれる（閉じるのではなくモードを戻す用）', async () => {
    const onCancel = vi.fn()
    const user = userEvent.setup()
    render(<PromptForm label="名前" onConfirm={vi.fn()} onCancel={onCancel} />)
    await user.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(onCancel).toHaveBeenCalledOnce()
  })
})

describe('parseCycle — カスタム間隔の受理条件（window.prompt 時代と同一）', () => {
  it.each([
    ['1', 1],
    ['14', 14],
    ['1.5', 2], // Math.round
    ['1.4', 1],
    ['365', 365],
    [' 7 ', 7], // Number(' 7 ') === 7
  ])('%s を受理して %s になる', (raw, expected) => {
    expect(parseCycle(raw)).toBe(expected)
  })

  it.each(['0', '-1', '0.4', '', '   ', 'abc', 'NaN', 'Infinity', '-Infinity'])(
    '%s は拒否する（null）',
    (raw) => {
      expect(parseCycle(raw)).toBeNull()
    },
  )

  it('境界: 1 は受理、1未満は拒否', () => {
    expect(parseCycle('1')).toBe(1)
    expect(parseCycle('0.9')).toBeNull() // >= 1 の判定は round より前
  })

  it('不正値では決定ボタンが無効のままになる', async () => {
    const user = userEvent.setup()
    render(
      <PromptSheet
        open
        onClose={vi.fn()}
        title="カスタム間隔"
        label="日数"
        confirmLabel="この間隔にする"
        parse={parseCycle}
        onConfirm={vi.fn()}
      />,
    )
    const btn = screen.getByRole('button', { name: 'この間隔にする' })
    await user.type(screen.getByLabelText('日数'), '0')
    expect(btn).toBeDisabled()
    await user.clear(screen.getByLabelText('日数'))
    await user.type(screen.getByLabelText('日数'), '7')
    expect(btn).toBeEnabled()
  })
})
