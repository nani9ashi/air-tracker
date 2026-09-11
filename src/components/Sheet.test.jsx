// ============================================================
// Sheet.test.jsx — 背景タップ・Escape・ハンドルの下ドラッグで閉じることを固定する。
// Sheet.jsx 自体への直接のテストはこれまで無かった（PromptSheet.test.jsx
// 経由の間接カバレッジのみ）ので、既存2経路の回帰止めも兼ねる。
//
// 注意: このプロジェクトの jsdom（package.json "jsdom": "^25.0.1"）には
// window.PointerEvent が実装されていない。@testing-library/dom の
// fireEvent.pointerDown 等は window.PointerEvent を探しに行き、無ければ
// 素の Event にフォールバックするため、fireEvent.pointerDown(el, { clientY,
// pointerId }) と書いても clientY/pointerId は実際のイベントオブジェクトには
// 載らない（Event の init dict は bubbles/cancelable/composed しか認識しない
// ため、渡した余分なプロパティは黙って無視される）。
// そのため、ここでは Event を手動生成してから直接プロパティを上書きし、
// fireEvent(el, event) で発火させる。
// ============================================================
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Sheet, { DRAG_DISMISS_PX } from './Sheet.jsx'

const openSheet = (props = {}) => {
  const onClose = vi.fn()
  render(
    <Sheet open onClose={onClose} title="タイトル" {...props}>
      <p>本文</p>
    </Sheet>,
  )
  return { onClose, user: userEvent.setup() }
}

// jsdom に window.PointerEvent が無いため手動で作る（上部のコメント参照）。
function firePointer(type, el, { clientY = 0, pointerId = 1 } = {}) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.assign(event, { clientY, pointerId, button: 0 })
  fireEvent(el, event)
}

const getGrip = () => document.querySelector('.sheet__grip')

describe('Sheet — 既存の2経路（回帰止め）', () => {
  it('dialog として公開され、タイトルが表示される', () => {
    openSheet()
    expect(screen.getByRole('dialog', { name: 'タイトル' })).toHaveAttribute('aria-modal', 'true')
  })

  it('open=false なら描画されない', () => {
    render(<Sheet open={false} onClose={vi.fn()} title="タイトル" />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('背景タップで閉じる', () => {
    const { onClose } = openSheet()
    fireEvent.click(document.querySelector('.sheet__backdrop'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('パネル内のクリックは伝播せず閉じない', async () => {
    const { onClose, user } = openSheet()
    await user.click(screen.getByText('本文'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('Escape で閉じる', async () => {
    const { onClose, user } = openSheet()
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()
  })
})

describe('Sheet — ハンドルの下ドラッグで閉じる（新規）', () => {
  it('しきい値を超えて下にドラッグすると閉じる', () => {
    const { onClose } = openSheet()
    const grip = getGrip()
    firePointer('pointerdown', grip, { clientY: 0 })
    firePointer('pointermove', grip, { clientY: DRAG_DISMISS_PX + 30 })
    firePointer('pointerup', grip, { clientY: DRAG_DISMISS_PX + 30 })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('しきい値未満のドラッグでは閉じない', () => {
    const { onClose } = openSheet()
    const grip = getGrip()
    firePointer('pointerdown', grip, { clientY: 0 })
    firePointer('pointermove', grip, { clientY: DRAG_DISMISS_PX - 80 })
    firePointer('pointerup', grip, { clientY: DRAG_DISMISS_PX - 80 })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('上方向のドラッグは0にクランプされ、例外を投げず、閉じもしない', () => {
    const { onClose } = openSheet()
    const grip = getGrip()
    expect(() => {
      firePointer('pointerdown', grip, { clientY: 100 })
      firePointer('pointermove', grip, { clientY: 0 }) // dy = -100 → 0 にクランプ
      firePointer('pointerup', grip, { clientY: 0 })
    }).not.toThrow()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('pointercancel はしきい値を超えていても閉じない（中断はコミットしない）', () => {
    const { onClose } = openSheet()
    const grip = getGrip()
    firePointer('pointerdown', grip, { clientY: 0 })
    firePointer('pointermove', grip, { clientY: DRAG_DISMISS_PX + 30 })
    firePointer('pointercancel', grip, { clientY: DRAG_DISMISS_PX + 30 })
    expect(onClose).not.toHaveBeenCalled()
  })
})
