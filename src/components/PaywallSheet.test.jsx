// ============================================================
// PaywallSheet.test.jsx — 課金導線の唯一の入口（自前実装）を検証する。
// notifications.test.js / plan-gates.test.jsx と同じ方針:
//   - billing.js を境界としてモック（RevenueCatの生の形はここに漏らさない）。
//   - analytics.js もモック（track の呼び出しだけを見る）。
//   - CAN_PURCHASE は billing.js ロード時に一度だけ確定する定数なので、
//     web/native を切り替えるテストは vi.resetModules() + 動的 import で
//     モジュールを作り直す（billing.test.js の loadBilling と同じ考え方）。
// ============================================================
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { canPurchase, getPriceLabel, purchaseMock, track } = vi.hoisted(() => ({
  canPurchase: { value: true },
  getPriceLabel: vi.fn(),
  purchaseMock: vi.fn(),
  track: vi.fn(),
}))

vi.mock('../lib/billing.js', () => ({
  // getter にする: プレーンな値だと最初の評価時点の値で固定されてしまい、
  // 後続テストで canPurchase.value を変えても反映されない
  // （vi.resetModules() をまたいでも、この factory 自体は使い回されるため）。
  get CAN_PURCHASE() {
    return canPurchase.value
  },
  getPriceLabel,
  purchase: purchaseMock,
}))
vi.mock('../lib/analytics.js', () => ({
  track,
  EV: { PAYWALL: 'paywall_view', PURCHASE: 'purchase' },
}))

async function loadPaywallSheet() {
  vi.resetModules()
  const mod = await import('./PaywallSheet.jsx')
  return mod.default
}

beforeEach(() => {
  vi.clearAllMocks()
  canPurchase.value = true
  getPriceLabel.mockResolvedValue('¥300')
  purchaseMock.mockResolvedValue({ ok: true })
})

describe('EV.PAYWALL — 開いた瞬間に source つきで1回だけ', () => {
  it('open時に発火する', async () => {
    const PaywallSheet = await loadPaywallSheet()
    render(<PaywallSheet open onClose={vi.fn()} source="custom_interval" />)
    await waitFor(() => expect(track).toHaveBeenCalledWith('paywall_view', { source: 'custom_interval' }))
  })

  it('open=false の間は発火しない（描画もされない）', async () => {
    const PaywallSheet = await loadPaywallSheet()
    render(<PaywallSheet open={false} onClose={vi.fn()} source="history" />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(track).not.toHaveBeenCalled()
  })
})

describe('価格表示 — getPriceLabel から取得（¥300をハードコードしない）', () => {
  it('取得できたらそのまま表示する', async () => {
    getPriceLabel.mockResolvedValue('¥123')
    const PaywallSheet = await loadPaywallSheet()
    render(<PaywallSheet open onClose={vi.fn()} source="x" />)
    expect(await screen.findByText('¥123')).toBeInTheDocument()
  })

  it('取得中は「価格を確認中…」、購入ボタンはブロックしない', async () => {
    let resolvePrice
    getPriceLabel.mockReturnValue(
      new Promise((r) => {
        resolvePrice = r
      }),
    )
    const PaywallSheet = await loadPaywallSheet()
    render(<PaywallSheet open onClose={vi.fn()} source="x" />)
    expect(screen.getByText('価格を確認中…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '購入する' })).toBeEnabled()
    resolvePrice(null)
    expect(await screen.findByText('価格を取得できませんでした')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '購入する' })).toBeEnabled()
  })
})

describe('購入フロー — native（DEVでも同じ経路。SDKの生の形はbilling.jsでモック済み）', () => {
  it('タップ中はボタンが無効化される（連打防止）', async () => {
    let resolvePurchase
    purchaseMock.mockReturnValue(
      new Promise((r) => {
        resolvePurchase = r
      }),
    )
    const PaywallSheet = await loadPaywallSheet()
    const user = userEvent.setup()
    render(<PaywallSheet open onClose={vi.fn()} source="x" />)
    user.click(screen.getByRole('button', { name: '購入する' }))
    expect(await screen.findByRole('button', { name: '購入処理中…' })).toBeDisabled()
    resolvePurchase({ ok: true })
  })

  it('成功: EV.PURCHASE started/success を発火し、確認表示のあと onClose する', async () => {
    const onClose = vi.fn()
    const PaywallSheet = await loadPaywallSheet()
    const user = userEvent.setup()
    render(<PaywallSheet open onClose={onClose} source="x" />)
    await user.click(screen.getByRole('button', { name: '購入する' }))
    expect(track).toHaveBeenCalledWith('purchase', { source: 'started' })
    expect(track).toHaveBeenCalledWith('purchase', { source: 'success' })
    expect(screen.getByText('購入が完了しました。ありがとうございます！')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled() // 即座には閉じない（結果を見せてから）
    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: 2000 })
  })

  it('キャンセル: エラー表示せず idle に戻る（backup.js の isCancellation と同じ原則）', async () => {
    purchaseMock.mockResolvedValue({ ok: false, reason: 'cancelled' })
    const PaywallSheet = await loadPaywallSheet()
    const user = userEvent.setup()
    render(<PaywallSheet open onClose={vi.fn()} source="x" />)
    await user.click(screen.getByRole('button', { name: '購入する' }))
    expect(track).toHaveBeenCalledWith('purchase', { source: 'cancelled' })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '購入する' })).toBeEnabled()
  })

  it('その他の失敗: エラー文言 + 再試行導線。EV.PURCHASE failed を発火', async () => {
    purchaseMock.mockResolvedValue({ ok: false, reason: 'failed' })
    const PaywallSheet = await loadPaywallSheet()
    const user = userEvent.setup()
    render(<PaywallSheet open onClose={vi.fn()} source="x" />)
    await user.click(screen.getByRole('button', { name: '購入する' }))
    expect(track).toHaveBeenCalledWith('purchase', { source: 'failed' })
    expect(screen.getByRole('alert')).toHaveTextContent('購入できませんでした')

    purchaseMock.mockResolvedValue({ ok: true })
    await user.click(screen.getByRole('button', { name: 'もう一度試す' }))
    expect(purchaseMock).toHaveBeenCalledTimes(2)
    expect(track).toHaveBeenCalledWith('purchase', { source: 'success' })
  })
})

describe('非native（公開PWA本番）— CAN_PURCHASE=false', () => {
  it('CTAの代わりに案内文を出し、purchase は一切呼ばない', async () => {
    canPurchase.value = false
    const PaywallSheet = await loadPaywallSheet()
    render(<PaywallSheet open onClose={vi.fn()} source="x" />)
    expect(await screen.findByText('有料版の購入はAndroidアプリからのみ行えます。')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '購入する' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '閉じる' })).toBeInTheDocument()
    expect(purchaseMock).not.toHaveBeenCalled()
  })

  it('「近日提供予定」は使わない（PWAには提供予定が無いため嘘になる——確定済みの文言regression防止）', async () => {
    canPurchase.value = false
    const PaywallSheet = await loadPaywallSheet()
    render(<PaywallSheet open onClose={vi.fn()} source="x" />)
    await screen.findByText('有料版の購入はAndroidアプリからのみ行えます。')
    expect(screen.queryByText(/近日/)).not.toBeInTheDocument()
  })
})

describe('dialog として公開される', () => {
  it('タイトルが「Proにアップグレード」になる', async () => {
    const PaywallSheet = await loadPaywallSheet()
    render(<PaywallSheet open onClose={vi.fn()} source="x" />)
    expect(await screen.findByRole('dialog', { name: 'Proにアップグレード' })).toBeInTheDocument()
  })
})
