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
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { canPurchase, getPriceLabel, purchaseMock, restoreMock, track } = vi.hoisted(() => ({
  canPurchase: { value: true },
  getPriceLabel: vi.fn(),
  purchaseMock: vi.fn(),
  restoreMock: vi.fn(),
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
  restorePurchases: restoreMock,
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
  // v2.5.0: 開いている間の plan の変化（ST-U12）を見るため store は本物を使う。
  // 前のテストで保存された plan が次のテストに残らないよう、毎回消す。
  localStorage.clear()
  canPurchase.value = true
  getPriceLabel.mockResolvedValue('¥300')
  purchaseMock.mockResolvedValue({ ok: true })
  restoreMock.mockResolvedValue({ ok: true, status: 'confirmed', entitled: true })
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

// ============================================================
// v2.5.0 §6-6 購入画面の状態遷移（docs/test-design-istqb.md）。
// ============================================================
const deferred = () => {
  let resolve
  const promise = new Promise((r) => (resolve = r))
  return { promise, resolve }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function openSheet(props = {}) {
  const PaywallSheet = await loadPaywallSheet()
  const onClose = props.onClose ?? vi.fn()
  const user = userEvent.setup()
  const view = render(<PaywallSheet open onClose={onClose} source="x" {...props} />)
  await screen.findByText('¥300')
  return { PaywallSheet, onClose, user, view }
}

describe('§6-6 購入の結果ごとの表示', () => {
  it('ST-U01: 支払い保留 → 手続き中の案内（エラーではない）。購入ボタンは出さない。EV.PURCHASE pending', async () => {
    purchaseMock.mockResolvedValue({ ok: false, reason: 'pending' })
    const { user } = await openSheet()
    await user.click(screen.getByRole('button', { name: '購入する' }))
    expect(await screen.findByRole('status')).toHaveTextContent('お支払いの手続き中です')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /購入する|もう一度試す/ })).not.toBeInTheDocument()
    expect(track).toHaveBeenCalledWith('purchase', { source: 'pending' })
  })

  it.each([
    ['network', '通信できませんでした。通信環境を確認して、もう一度お試しください。'],
    ['timeout', '通信できませんでした。通信環境を確認して、もう一度お試しください。'],
    ['not-allowed', 'この端末またはアカウントでは購入できません。Google Play の設定をご確認ください。'],
    ['unavailable', '現在購入できません。時間をおいてお試しください。'],
    ['no-offering', '現在購入できません。時間をおいてお試しください。'],
    ['not-ready', '現在購入できません。時間をおいてお試しください。'],
    ['in-progress', '購入処理中です。しばらくお待ちください。'],
    ['not-entitled', '購入は完了しましたが、まだ反映されていません。少し待ってから「購入を復元」をお試しください。'],
    ['already-owned', '購入済みの記録を確認できませんでした。「購入を復元」をお試しください。'],
    ['failed', '購入できませんでした。時間をおいてお試しください。'],
    ['something-new', '購入できませんでした。時間をおいてお試しください。'],
  ])('DT-U02: reason=%s → 「%s」。EV.PURCHASE failed', async (reason, message) => {
    purchaseMock.mockResolvedValue({ ok: false, reason })
    const { user } = await openSheet()
    await user.click(screen.getByRole('button', { name: '購入する' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(track).toHaveBeenCalledWith('purchase', { source: 'failed' })
  })

  it('ST-U03: 購入済みを復元して有効化（ok/restored）→ その旨を表示し、EV.PURCHASE restored', async () => {
    purchaseMock.mockResolvedValue({ ok: true, restored: true })
    const { user, onClose } = await openSheet()
    await user.click(screen.getByRole('button', { name: '購入する' }))
    expect(await screen.findByText('購入済みの記録を確認し、Proを有効にしました。')).toBeInTheDocument()
    expect(track).toHaveBeenCalledWith('purchase', { source: 'restored' })
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1), { timeout: 2000 })
  })
})

describe('§6-6 購入を復元', () => {
  it('ST-U04: 権利あり → 「購入を復元しました」→ 自動で閉じる。EV.PURCHASE restored', async () => {
    const { user, onClose } = await openSheet()
    await user.click(screen.getByRole('button', { name: '購入を復元' }))
    expect(restoreMock).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('購入を復元しました。')).toBeInTheDocument()
    expect(track).toHaveBeenCalledWith('purchase', { source: 'restored' })
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1), { timeout: 2000 })
  })

  it('ST-U05: 権利なし → 購入履歴が見つからない旨（同じアカウントで試す案内）', async () => {
    restoreMock.mockResolvedValue({ ok: true, status: 'confirmed', entitled: false })
    const { user, onClose } = await openSheet()
    await user.click(screen.getByRole('button', { name: '購入を復元' }))
    expect(await screen.findByRole('status')).toHaveTextContent('購入履歴が見つかりませんでした')
    expect(screen.getByRole('button', { name: '購入する' })).toBeEnabled()
    await sleep(1300)
    expect(onClose).not.toHaveBeenCalled()
  })

  it.each([
    ['failed', { ok: false, status: 'unknown', reason: 'failed' }],
    ['timeout', { ok: false, status: 'unknown', reason: 'timeout' }],
    ['unavailable', { ok: false, status: 'unknown', reason: 'unavailable' }],
    ['web-unsupported', { ok: true, status: 'unknown', reason: 'web-unsupported' }],
  ])('ST-U06: 確認できない（%s）→ 「確認できませんでした」', async (_label, result) => {
    restoreMock.mockResolvedValue(result)
    const { user } = await openSheet()
    await user.click(screen.getByRole('button', { name: '購入を復元' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('確認できませんでした。通信環境を確認して、もう一度お試しください。')
  })

  it('ST-U07: 復元中は購入ボタンと復元ボタンを無効化', async () => {
    const d = deferred()
    restoreMock.mockReturnValue(d.promise)
    const { user } = await openSheet()
    user.click(screen.getByRole('button', { name: '購入を復元' }))
    expect(await screen.findByRole('button', { name: '確認中…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '購入する' })).toBeDisabled()
    d.resolve({ ok: true, status: 'confirmed', entitled: false })
    expect(await screen.findByRole('button', { name: '購入を復元' })).toBeEnabled()
  })

  it('ST-U08: 購入中は復元ボタンを無効化', async () => {
    const d = deferred()
    purchaseMock.mockReturnValue(d.promise)
    const { user } = await openSheet()
    user.click(screen.getByRole('button', { name: '購入する' }))
    await screen.findByRole('button', { name: '購入処理中…' })
    expect(screen.getByRole('button', { name: '購入を復元' })).toBeDisabled()
    d.resolve({ ok: false, reason: 'cancelled' })
    await waitFor(() => expect(screen.getByRole('button', { name: '購入を復元' })).toBeEnabled())
  })

  it('ST-U13: 非native（PWA本番）では復元ボタンも出さない', async () => {
    canPurchase.value = false
    const PaywallSheet = await loadPaywallSheet()
    render(<PaywallSheet open onClose={vi.fn()} source="x" />)
    await screen.findByText('有料版の購入はAndroidアプリからのみ行えます。')
    expect(screen.queryByRole('button', { name: '購入を復元' })).not.toBeInTheDocument()
  })
})

describe('§6-6 価格の再読み込み', () => {
  it('ST-U09: 価格が取れない → 「再読み込み」で取り直して表示する', async () => {
    getPriceLabel.mockResolvedValueOnce(null).mockResolvedValueOnce('¥300')
    const PaywallSheet = await loadPaywallSheet()
    const user = userEvent.setup()
    render(<PaywallSheet open onClose={vi.fn()} source="x" />)
    expect(await screen.findByText('価格を取得できませんでした')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '再読み込み' }))
    expect(await screen.findByText('¥300')).toBeInTheDocument()
    expect(getPriceLabel).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('button', { name: '再読み込み' })).not.toBeInTheDocument()
  })
})

describe('§6-6 閉じる・開き直すときの無効な遷移', () => {
  it('ST-invalid-U10: 購入中に閉じて開き直す → 古い購入の成功が届いても新しい画面は成功にならず、onClose も呼ばれない', async () => {
    const d = deferred()
    purchaseMock.mockReturnValueOnce(d.promise)
    const { PaywallSheet, onClose, user, view } = await openSheet()
    user.click(screen.getByRole('button', { name: '購入する' }))
    await screen.findByRole('button', { name: '購入処理中…' })
    view.rerender(<PaywallSheet open={false} onClose={onClose} source="x" />)
    view.rerender(<PaywallSheet open onClose={onClose} source="x" />)
    await screen.findByText('¥300')
    await act(async () => d.resolve({ ok: true }))
    expect(screen.queryByText('購入が完了しました。ありがとうございます！')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '購入する' })).toBeEnabled()
    await sleep(1300)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('ST-invalid-U11: 成功のあと自動で閉じる前に自分で閉じる → onClose は1回だけ', async () => {
    const { PaywallSheet, onClose, user, view } = await openSheet()
    await user.click(screen.getByRole('button', { name: '購入する' }))
    await screen.findByText('購入が完了しました。ありがとうございます！')
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
    view.rerender(<PaywallSheet open={false} onClose={onClose} source="x" />)
    await sleep(1300)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('ST-U12: 開いている間に plan が paid になる（更新通知）→ 「Proが有効になりました」→ 自動で閉じる', async () => {
    const { onClose } = await openSheet()
    const store = await import('../store/store.js')
    act(() => store.setPlan('paid'))
    expect(await screen.findByText('Proが有効になりました。')).toBeInTheDocument()
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1), { timeout: 2000 })
  })
})

describe('§6-6 購入・復元の最中の plan の変化（C4b）', () => {
  // 実際のアプリでは、billing が purchase() / restorePurchases() の完了前に setPlan('paid') する。
  // その変化を「更新通知による有効化」と取り違えず、購入・復元の結果の表示に任せる。
  it('ST-U14: 購入中に plan が paid → 途中で「Proが有効になりました」を出さず、「購入が完了しました」。onClose は1回', async () => {
    const d = deferred()
    purchaseMock.mockReturnValue(d.promise)
    const { user, onClose } = await openSheet()
    const store = await import('../store/store.js')
    user.click(screen.getByRole('button', { name: '購入する' }))
    await screen.findByRole('button', { name: '購入処理中…' })
    act(() => store.setPlan('paid'))
    expect(screen.queryByText('Proが有効になりました。')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '購入処理中…' })).toBeDisabled()
    await act(async () => d.resolve({ ok: true }))
    expect(await screen.findByText('購入が完了しました。ありがとうございます！')).toBeInTheDocument()
    await sleep(1300)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('ST-U15: 復元中に plan が paid → 途中で「Proが有効になりました」を出さず、「購入を復元しました」', async () => {
    const d = deferred()
    restoreMock.mockReturnValue(d.promise)
    const { user } = await openSheet()
    const store = await import('../store/store.js')
    user.click(screen.getByRole('button', { name: '購入を復元' }))
    await screen.findByRole('button', { name: '確認中…' })
    act(() => store.setPlan('paid'))
    expect(screen.queryByText('Proが有効になりました。')).not.toBeInTheDocument()
    await act(async () => d.resolve({ ok: true, status: 'confirmed', entitled: true }))
    expect(await screen.findByText('購入を復元しました。')).toBeInTheDocument()
  })
})
