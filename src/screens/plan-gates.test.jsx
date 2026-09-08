// ============================================================
// plan-gates.test.jsx — プラン × ロック文言の対応表を固定する。
// docs/test-completion-report.md §10 項目6:
//   「Pro で複数台が解放されないのに『Proで解放』と案内している。
//     課金導線の実装前に対応表をテストで固定する」
// v2.2.0 で pro.bikes を Infinity にして解消したので、その解消が
// 戻らないことをここで守る。
//
// v2.4.0 PR5: 各ロック導線が実ペイウォール（PaywallSheet）に繋がった。
// PaywallSheet 自体の網羅的な検証（購入フロー・価格表示・非native案内等）は
// PaywallSheet.test.jsx に一本化したので、ここでは「各ロック導線が正しい
// source でペイウォールを開くこと」だけを軽量スタブで確認する。
//
// 方針: useStore.js だけをモックしてフィクスチャ state を流し込む。
// getLimits / PLAN_LIMITS は**実物**を走らせるので、上限表を書き換えれば
// このテストが落ちる。store シングルトンには触らない（vi.resetModules() と
// RTL を混ぜると、コンポーネントが旧インスタンスを掴んで無言で食い違う）。
// ============================================================
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const fx = vi.hoisted(() => ({ state: null }))
vi.mock('../store/useStore.js', () => ({
  useStore: (selector = (s) => s) => selector(fx.state),
}))
vi.mock('../lib/notifications.js', () => ({
  syncActiveReminder: vi.fn(),
  requestPermissionAfterReset: vi.fn().mockResolvedValue(undefined),
  isNotificationEnabled: vi.fn().mockResolvedValue(false),
}))
// PaywallSheet 自体は PaywallSheet.test.jsx で網羅的に検証済み。ここでは
// 「open のとき source を伴って描画される」ことだけ分かればよい軽量スタブにする。
vi.mock('../components/PaywallSheet.jsx', () => ({
  default: ({ open, source }) => (open ? <div data-testid="paywall" data-source={source} /> : null),
}))

import { makeDefaultState, PLAN_LIMITS } from '../store/store.js'
import HomeScreen from './HomeScreen.jsx'
import HistoryScreen from './HistoryScreen.jsx'
import StatsScreen from './StatsScreen.jsx'
import SettingsScreen from './SettingsScreen.jsx'
import BikeSheet from './BikeSheet.jsx'

const PLANS = ['free', 'pro', 'premium']
const PAID = ['pro', 'premium']

// plan と履歴件数を指定した state を作る。
function seed(plan, { historyCount = 0, bikeCount = 1 } = {}) {
  const s = makeDefaultState()
  s.settings.plan = plan
  const item = s.bikes[0].items[0]
  for (let i = 0; i < historyCount; i++) {
    const d = new Date(2026, 0, 1 + i * 14)
    item.history.push({ id: `h-${i}`, date: d.toISOString() })
  }
  if (item.history.length) item.lastReset = item.history.at(-1).date
  for (let i = 1; i < bikeCount; i++) {
    s.bikes.push({
      id: `bike-${i + 1}`,
      name: `${i + 1}台目`,
      items: [{ type: 'air', lastReset: null, intervalDays: 14, history: [] }],
    })
  }
  return s
}

beforeEach(() => {
  fx.state = seed('free')
})

// ------------------------------------------------------------
// 上限表そのもの
// ------------------------------------------------------------
describe('PLAN_LIMITS — v2.4.0 の対応表（free/paid の2値）', () => {
  it('複数台は有料版で解放（UI 文言「Proで解放」と一致する）', () => {
    expect(PLAN_LIMITS.free.bikes).toBe(1)
    expect(PLAN_LIMITS.paid.bikes).toBe(Infinity)
  })

  it.each(['customCycle', 'backup'])('%s は有料版のみ', (key) => {
    expect(PLAN_LIMITS.free[key]).toBe(false)
    expect(PLAN_LIMITS.paid[key]).toBe(true)
  })
})

// ------------------------------------------------------------
// カスタム間隔（HomeScreen）
// ------------------------------------------------------------
describe('カスタム間隔チップ', () => {
  it('free ではロック表示', () => {
    fx.state = seed('free')
    render(<HomeScreen />)
    expect(screen.getByRole('button', { name: 'カスタム間隔（Proで解放）' })).toBeInTheDocument()
  })

  it.each(PAID)('%s では非ロック', (plan) => {
    fx.state = seed(plan)
    render(<HomeScreen />)
    expect(screen.getByRole('button', { name: 'カスタム間隔' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'カスタム間隔（Proで解放）' })).not.toBeInTheDocument()
  })

  it('free で押すと PaywallSheet(source=custom_interval) が開き、入力シートは開かない', async () => {
    fx.state = seed('free')
    const user = userEvent.setup()
    render(<HomeScreen />)
    await user.click(screen.getByRole('button', { name: 'カスタム間隔（Proで解放）' }))
    expect(screen.getByTestId('paywall')).toHaveAttribute('data-source', 'custom_interval')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it.each(PAID)('%s で押すと入力シートが開く', async (plan) => {
    fx.state = seed(plan)
    const user = userEvent.setup()
    render(<HomeScreen />)
    await user.click(screen.getByRole('button', { name: 'カスタム間隔' }))
    expect(screen.getByRole('dialog', { name: 'カスタム間隔' })).toBeInTheDocument()
  })
})

// ------------------------------------------------------------
// 履歴のロック行（HistoryScreen）
// ------------------------------------------------------------
describe('履歴のロック行', () => {
  it('free は上限超過ぶんがロック行になる', () => {
    fx.state = seed('free', { historyCount: 5 })
    render(<HistoryScreen />)
    expect(screen.getByRole('button', { name: '残り2件はProで全件表示' })).toBeInTheDocument()
  })

  it.each(PAID)('%s はロック行が出ない', (plan) => {
    fx.state = seed(plan, { historyCount: 5 })
    render(<HistoryScreen />)
    expect(screen.queryByText(/はProで全件表示できます/)).not.toBeInTheDocument()
  })

  it('タップすると PaywallSheet(source=history) が開く', async () => {
    fx.state = seed('free', { historyCount: 5 })
    const user = userEvent.setup()
    render(<HistoryScreen />)
    await user.click(screen.getByRole('button', { name: '残り2件はProで全件表示' }))
    expect(screen.getByTestId('paywall')).toHaveAttribute('data-source', 'history')
  })
})

// ------------------------------------------------------------
// ヒートマップのロック導線（StatsScreen）
// 画面を開いただけの EV.PAYWALL 計測（タップ非依存）はここでは検証しない
// （analytics.js はモックしていないため、DEV では console.debug の no-op）。
// ------------------------------------------------------------
describe('ヒートマップのロック導線', () => {
  it('free はロック案内がボタンになっている', () => {
    fx.state = seed('free', { historyCount: 1 })
    render(<StatsScreen />)
    expect(screen.getByRole('button', { name: /無料版は直近1ヶ月/ })).toBeInTheDocument()
  })

  it('タップすると PaywallSheet(source=heatmap) が開く', async () => {
    fx.state = seed('free', { historyCount: 1 })
    const user = userEvent.setup()
    render(<StatsScreen />)
    await user.click(screen.getByRole('button', { name: /無料版は直近1ヶ月/ }))
    expect(screen.getByTestId('paywall')).toHaveAttribute('data-source', 'heatmap')
  })

  it.each(PAID)('%s はロック案内が出ない', (plan) => {
    fx.state = seed(plan, { historyCount: 1 })
    render(<StatsScreen />)
    expect(screen.queryByText(/無料版は直近1ヶ月/)).not.toBeInTheDocument()
  })
})

// ------------------------------------------------------------
// バックアップ（SettingsScreen）
// ------------------------------------------------------------
describe('バックアップ', () => {
  it('free は書き出し/読み込みともロック文言', () => {
    fx.state = seed('free')
    render(<SettingsScreen />)
    expect(screen.getByRole('button', { name: '書き出し（Proで解放）' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '読み込み（Proで解放）' })).toBeInTheDocument()
    expect(screen.getByText('バックアップ（書き出し/読み込み）はProで解放されます。')).toBeInTheDocument()
  })

  it.each(PAID)('%s は非ロック（読み込みはファイル選択になる）', (plan) => {
    fx.state = seed(plan)
    render(<SettingsScreen />)
    expect(screen.getByRole('button', { name: '書き出し' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '読み込み（Proで解放）' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('バックアップファイルを選択')).toBeInTheDocument()
    expect(screen.getByText('インポートは現在のデータを置き換えます。')).toBeInTheDocument()
  })

  it('free: 書き出しタップで PaywallSheet(source=backup_export) が開く', async () => {
    fx.state = seed('free')
    const user = userEvent.setup()
    render(<SettingsScreen />)
    await user.click(screen.getByRole('button', { name: '書き出し（Proで解放）' }))
    expect(screen.getByTestId('paywall')).toHaveAttribute('data-source', 'backup_export')
  })

  it('free: 読み込みタップで PaywallSheet(source=backup_import) が開く', async () => {
    fx.state = seed('free')
    const user = userEvent.setup()
    render(<SettingsScreen />)
    await user.click(screen.getByRole('button', { name: '読み込み（Proで解放）' }))
    expect(screen.getByTestId('paywall')).toHaveAttribute('data-source', 'backup_import')
  })
})

// ------------------------------------------------------------
// アップグレードセクション（SettingsScreen・v2.4.0 PR5で新設）
// ------------------------------------------------------------
describe('アップグレードセクション', () => {
  it('free: CTAが出て、押すと PaywallSheet(source=settings_upgrade) が開く', async () => {
    fx.state = seed('free')
    const user = userEvent.setup()
    render(<SettingsScreen />)
    expect(screen.getByRole('button', { name: 'Proにアップグレード' })).toBeInTheDocument()
    expect(screen.queryByText('Pro（購入済み）')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Proにアップグレード' }))
    expect(screen.getByTestId('paywall')).toHaveAttribute('data-source', 'settings_upgrade')
  })

  it.each(PAID)('%s: 購入済みバッジのみでCTAは出ない', (plan) => {
    fx.state = seed(plan)
    render(<SettingsScreen />)
    expect(screen.getByText('Pro（購入済み）')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Proにアップグレード' })).not.toBeInTheDocument()
  })
})

// ------------------------------------------------------------
// 自転車を追加 — v2.2.0 で変わったところ
// ------------------------------------------------------------
describe('自転車を追加', () => {
  it('free（1台）はロック文言', () => {
    fx.state = seed('free')
    render(<SettingsScreen />)
    expect(screen.getByRole('button', { name: '自転車を追加（Proで解放）' })).toBeInTheDocument()
  })

  it.each(PAID)('%s は非ロック（v2.2.0 で変更）', (plan) => {
    fx.state = seed(plan)
    render(<SettingsScreen />)
    expect(screen.getByRole('button', { name: '自転車を追加' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '自転車を追加（Proで解放）' })).not.toBeInTheDocument()
  })

  it('free で押すと PaywallSheet(source=settings_add_bike) が開く（文言と実装が一致）', async () => {
    fx.state = seed('free')
    const user = userEvent.setup()
    render(<SettingsScreen />)
    await user.click(screen.getByRole('button', { name: '自転車を追加（Proで解放）' }))
    expect(screen.getByTestId('paywall')).toHaveAttribute('data-source', 'settings_add_bike')
  })

  it.each(PAID)('%s では「Proで解放」の案内が一切出ない（回帰テスト）', async (plan) => {
    // これが docs §12 の指摘そのもの: pro を買っても複数台が解放されないのに
    // 「Proで解放されます」と案内していた。プランを持っている人にロック文言を
    // 見せた時点で不整合なので、否定形で固定する。
    fx.state = seed(plan)
    const user = userEvent.setup()
    render(<SettingsScreen />)
    await user.click(screen.getByRole('button', { name: '自転車を追加' }))
    expect(screen.queryByText(/複数の自転車.*Pro/)).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: '自転車を追加' })).toBeInTheDocument()
  })

  it('BikeSheet: free（1台）はロック、押すと onLocked が呼ばれる（親がPaywallSheetを開く）', async () => {
    fx.state = seed('free')
    const user = userEvent.setup()
    const onLocked = vi.fn()
    render(<BikeSheet open onClose={vi.fn()} onLocked={onLocked} />)
    await user.click(screen.getByRole('button', { name: '自転車を追加（Proで解放）' }))
    expect(onLocked).toHaveBeenCalledOnce()
  })

  it.each(PAID)('BikeSheet: %s は追加フォームに進む（onLockedは呼ばれない）', async (plan) => {
    fx.state = seed(plan)
    const user = userEvent.setup()
    const onLocked = vi.fn()
    render(<BikeSheet open onClose={vi.fn()} onLocked={onLocked} />)
    await user.click(screen.getByRole('button', { name: '自転車を追加' }))
    expect(onLocked).not.toHaveBeenCalled()
    expect(screen.getByLabelText('名前')).toBeInTheDocument()
    // 入れ子の Sheet になっていないこと
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
  })

  it.each(PLANS)('%s: 2台以上あっても free だけがロックされる', (plan) => {
    fx.state = seed(plan, { bikeCount: 2 })
    render(<SettingsScreen />)
    const locked = plan === 'free'
    const name = locked ? '自転車を追加（Proで解放）' : '自転車を追加'
    expect(screen.getByRole('button', { name })).toBeInTheDocument()
  })
})
