// ============================================================
// BottomNav.test.jsx — 下タブの a11y / 操作契約。
//
// ⚠ このテストはセーフエリアを観測できない。jsdom は env() もレイアウトも
//   計算しないため、「ラベルがシステムナビに被らない」ことはここでは証明
//   できない（規約は tokens.contract.test.js、実証は実機マトリクス）。
//   ここで固定するのは役割・名前・aria-current・onChange の配線だけ。
// ============================================================
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BottomNav from './BottomNav.jsx'

// App.jsx が渡している実際の構成。アイコンは表示のみなので素の span で足りる。
const ITEMS = [
  { key: 'home', label: 'ホーム', icon: <span /> },
  { key: 'history', label: '履歴', icon: <span /> },
  { key: 'stats', label: '統計', icon: <span /> },
  { key: 'settings', label: '設定', icon: <span /> },
]

const setup = (active = 'home', onChange = vi.fn()) => {
  render(<BottomNav items={ITEMS} active={active} onChange={onChange} />)
  return onChange
}

describe('BottomNav', () => {
  it('nav がアクセシブルな名前を持つ', () => {
    setup()
    expect(screen.getByRole('navigation', { name: 'メインナビゲーション' })).toBeInTheDocument()
  })

  it('4つのタブが label で引ける', () => {
    setup()
    for (const { label } of ITEMS) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
    expect(screen.getAllByRole('button')).toHaveLength(4)
  })

  it.each(ITEMS.map((i) => i.key))('active=%s のとき aria-current はちょうど1つ', (active) => {
    setup(active)
    const current = screen.getAllByRole('button').filter(
      (b) => b.getAttribute('aria-current') === 'page',
    )
    expect(current).toHaveLength(1)
    expect(current[0]).toHaveAccessibleName(ITEMS.find((i) => i.key === active).label)
  })

  it('非アクティブなタブを押すと key で onChange が呼ばれる', async () => {
    const user = userEvent.setup()
    const onChange = setup('home')
    await user.click(screen.getByRole('button', { name: '履歴' }))
    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledWith('history')
  })

  it('アクティブなタブを押しても onChange は呼ばれる（App 側で同値に落ち着く）', async () => {
    const user = userEvent.setup()
    const onChange = setup('home')
    await user.click(screen.getByRole('button', { name: 'ホーム' }))
    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledWith('home')
  })

  it('アイコンは装飾なので a11y ツリーから隠れている', () => {
    setup()
    // ラベルは読み上げに必要なので隠さない＝ボタンの名前はラベル由来のまま。
    const btn = screen.getByRole('button', { name: 'ホーム' })
    expect(btn.querySelector('.bottom-nav__icon')).toHaveAttribute('aria-hidden', 'true')
    expect(btn.querySelector('.bottom-nav__label')).not.toHaveAttribute('aria-hidden')
  })
})
