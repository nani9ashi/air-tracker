// ============================================================
// billing.test.js — RevenueCat 境界の配線を vi.mock で固定する。
// notifications.test.js / backup.test.js と同じ方針:
//   - @capacitor/core と @revenuecat/purchases-capacitor は SDK 境界としてモック
//   - store.js もモック（setPlan の呼び出しだけを見る。store 本体には触れない）
//   - NATIVE と API_KEY は billing.js のロード時に一度だけ確定するため、
//     native/webを切り替えるテストは vi.resetModules() + 動的 import で
//     モジュールを作り直す（store.test.js の freshStore と同じ考え方）。
// ============================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ⚠ vi.mock はファイル先頭へ巻き上げられる。ミュータブルな値は vi.hoisted で作り、
// モックのファクトリからはそれを参照する関数を返す（NATIVE の値を
// vi.resetModules() をまたいで切り替えるため）。
const {
  nativeFlag,
  configure,
  getCustomerInfo,
  restorePurchasesMock,
  getOfferings,
  purchasePackage,
  setPlan,
  getState,
} = vi.hoisted(() => ({
  nativeFlag: { value: true },
  configure: vi.fn(),
  getCustomerInfo: vi.fn(),
  restorePurchasesMock: vi.fn(),
  getOfferings: vi.fn(),
  purchasePackage: vi.fn(),
  setPlan: vi.fn(),
  getState: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => nativeFlag.value } }))
vi.mock('@revenuecat/purchases-capacitor', () => ({
  Purchases: {
    configure,
    getCustomerInfo,
    restorePurchases: restorePurchasesMock,
    getOfferings,
    purchasePackage,
  },
}))
vi.mock('../store/store.js', () => ({ setPlan, getState }))

// billing.js を作り直して読み込む。NATIVE/API_KEY はロード時に一度だけ確定するため、
// これらを変えるテストは必ずこのヘルパーで読み直す。
async function loadBilling() {
  vi.resetModules()
  return import('./billing.js')
}

const entitled = (id = 'paid') => ({ customerInfo: { entitlements: { active: { [id]: {} } } } })
const notEntitled = () => ({ customerInfo: { entitlements: { active: {} } } })
const withOffering = () => ({
  current: { availablePackages: [{ product: { priceString: '¥300' } }] },
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  vi.useRealTimers()
  nativeFlag.value = true
  configure.mockResolvedValue(undefined)
  getCustomerInfo.mockResolvedValue(entitled())
  restorePurchasesMock.mockResolvedValue(entitled())
  getOfferings.mockResolvedValue(withOffering())
  purchasePackage.mockResolvedValue(entitled())
  getState.mockReturnValue({ settings: { plan: 'free' } })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('ENTITLEMENT_ID', () => {
  it('paid（store.js の正規プラン値・Step0手順書と一致させる）', async () => {
    const { ENTITLEMENT_ID } = await loadBilling()
    expect(ENTITLEMENT_ID).toBe('paid')
  })
})

describe('initBilling', () => {
  it('native かつ APIキー設定済みなら configure を呼ぶ', async () => {
    vi.stubEnv('VITE_REVENUECAT_API_KEY', 'test-key')
    const { initBilling } = await loadBilling()
    await initBilling()
    expect(configure).toHaveBeenCalledWith({ apiKey: 'test-key' })
  })

  it('APIキー未設定なら configure を呼ばない', async () => {
    // Step0完了後は .env.local に実キーが入っているため、周囲の環境に頼らず
    // 明示的に空へスタブする（Step0前は「今の実環境と同じ」で暗黙に緑だったが、
    // 2026-09-08 に本番キー設定が完了して初めてこの依存が壊れているのを検出した）。
    vi.stubEnv('VITE_REVENUECAT_API_KEY', '')
    const { initBilling } = await loadBilling()
    await initBilling()
    expect(configure).not.toHaveBeenCalled()
  })

  it('web では APIキーがあっても configure を呼ばない', async () => {
    nativeFlag.value = false
    vi.stubEnv('VITE_REVENUECAT_API_KEY', 'test-key')
    const { initBilling } = await loadBilling()
    await initBilling()
    expect(configure).not.toHaveBeenCalled()
  })

  it('configure が失敗しても throw しない', async () => {
    vi.stubEnv('VITE_REVENUECAT_API_KEY', 'test-key')
    configure.mockRejectedValueOnce(new Error('boom'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { initBilling } = await loadBilling()
    await expect(initBilling()).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('checkEntitlement', () => {
  it('native + entitled → confirmed/true', async () => {
    const { checkEntitlement } = await loadBilling()
    await expect(checkEntitlement()).resolves.toEqual({ ok: true, status: 'confirmed', entitled: true })
  })

  it('native + 未購入 → confirmed/false', async () => {
    getCustomerInfo.mockResolvedValue(notEntitled())
    const { checkEntitlement } = await loadBilling()
    await expect(checkEntitlement()).resolves.toEqual({ ok: true, status: 'confirmed', entitled: false })
  })

  it('照会失敗（オフライン等）→ ok:false/unknown（降格させない側の既定値）', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    getCustomerInfo.mockRejectedValueOnce(new Error('network'))
    const { checkEntitlement } = await loadBilling()
    await expect(checkEntitlement()).resolves.toEqual({ ok: false, status: 'unknown', reason: 'failed' })
    warn.mockRestore()
  })

  it('web では SDK を呼ばず web-unsupported を返す', async () => {
    nativeFlag.value = false
    const { checkEntitlement } = await loadBilling()
    await expect(checkEntitlement()).resolves.toEqual({ ok: true, status: 'unknown', reason: 'web-unsupported' })
    expect(getCustomerInfo).not.toHaveBeenCalled()
  })
})

describe('restorePurchases', () => {
  it('native + entitled → confirmed/true（明示的な再照会）', async () => {
    const { restorePurchases } = await loadBilling()
    await expect(restorePurchases()).resolves.toEqual({ ok: true, status: 'confirmed', entitled: true })
    expect(restorePurchasesMock).toHaveBeenCalledOnce()
  })

  it('失敗しても throw しない', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    restorePurchasesMock.mockRejectedValueOnce(new Error('boom'))
    const { restorePurchases } = await loadBilling()
    await expect(restorePurchases()).resolves.toEqual({ ok: false, status: 'unknown', reason: 'failed' })
    warn.mockRestore()
  })

  it('web では web-unsupported', async () => {
    nativeFlag.value = false
    const { restorePurchases } = await loadBilling()
    await expect(restorePurchases()).resolves.toEqual({ ok: true, status: 'unknown', reason: 'web-unsupported' })
  })
})

describe('getPriceLabel', () => {
  it('native: offerings から priceString を返す（ハードコードしない）', async () => {
    const { getPriceLabel } = await loadBilling()
    await expect(getPriceLabel()).resolves.toBe('¥300')
  })

  it('native: パッケージが無ければ null', async () => {
    getOfferings.mockResolvedValue({ current: { availablePackages: [] } })
    const { getPriceLabel } = await loadBilling()
    await expect(getPriceLabel()).resolves.toBeNull()
  })

  it('native: 取得失敗なら null（呼び出し側が読み込み中扱いにする）', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    getOfferings.mockRejectedValueOnce(new Error('boom'))
    const { getPriceLabel } = await loadBilling()
    await expect(getPriceLabel()).resolves.toBeNull()
    warn.mockRestore()
  })

  it('web + DEV: シミュレーション文言を返す（vitest では DEV は常に true）', async () => {
    nativeFlag.value = false
    const { getPriceLabel } = await loadBilling()
    await expect(getPriceLabel()).resolves.toBe('¥300（開発シミュレーション）')
    expect(getOfferings).not.toHaveBeenCalled()
  })
})

describe('purchase — native', () => {
  it('成功: entitled になったら setPlan(\'paid\') を呼び ok:true', async () => {
    const { purchase } = await loadBilling()
    await expect(purchase()).resolves.toEqual({ ok: true })
    expect(setPlan).toHaveBeenCalledWith('paid')
  })

  it('purchasePackage は成功したが entitled にならない → not-entitled、setPlanは呼ばない', async () => {
    purchasePackage.mockResolvedValue(notEntitled())
    const { purchase } = await loadBilling()
    await expect(purchase()).resolves.toEqual({ ok: false, reason: 'not-entitled' })
    expect(setPlan).not.toHaveBeenCalled()
  })

  it('オファリングが無い → no-offering', async () => {
    getOfferings.mockResolvedValue({ current: null })
    const { purchase } = await loadBilling()
    await expect(purchase()).resolves.toEqual({ ok: false, reason: 'no-offering' })
    expect(purchasePackage).not.toHaveBeenCalled()
  })

  it('ユーザーがキャンセル → cancelled（エラー扱いにしない）', async () => {
    purchasePackage.mockRejectedValueOnce(new Error('Purchase was cancelled by the user'))
    const { purchase } = await loadBilling()
    await expect(purchase()).resolves.toEqual({ ok: false, reason: 'cancelled' })
    expect(setPlan).not.toHaveBeenCalled()
  })

  it('その他の失敗 → failed（warn するが throw しない）', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    purchasePackage.mockRejectedValueOnce(new Error('network error'))
    const { purchase } = await loadBilling()
    await expect(purchase()).resolves.toEqual({ ok: false, reason: 'failed' })
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('purchase — web（DEV限定シミュレーション）', () => {
  it('!NATIVE かつ DEV: 実SDKを一切呼ばず setPlan(\'paid\') で解放する', async () => {
    nativeFlag.value = false
    vi.useFakeTimers()
    const { purchase } = await loadBilling()
    const p = purchase()
    await vi.advanceTimersByTimeAsync(600)
    await expect(p).resolves.toEqual({ ok: true, simulated: true })
    expect(setPlan).toHaveBeenCalledWith('paid')
    expect(getOfferings).not.toHaveBeenCalled()
    expect(purchasePackage).not.toHaveBeenCalled()
  })
})

describe('CAN_PURCHASE（PaywallSheetが実CTAを出してよいか）', () => {
  it('native: 常に true', async () => {
    const { CAN_PURCHASE } = await loadBilling()
    expect(CAN_PURCHASE).toBe(true)
  })

  it('web + DEV（vitestでは常にDEV=true）: true', async () => {
    nativeFlag.value = false
    const { CAN_PURCHASE } = await loadBilling()
    expect(CAN_PURCHASE).toBe(true)
  })
})

describe('restoreEntitlementOnStartup（起動時リストア。決定表は billing.reconcile.dt.test.js）', () => {
  it('checkEntitlement を呼び、reconcilePlan が変更ありと判断したときだけ setPlan する', async () => {
    getState.mockReturnValue({ settings: { plan: 'free' } })
    getCustomerInfo.mockResolvedValue(entitled()) // confirmed/entitled → 'free'→'paid'
    const { restoreEntitlementOnStartup } = await loadBilling()
    const result = await restoreEntitlementOnStartup()
    expect(result).toEqual({ ok: true, status: 'confirmed', entitled: true })
    expect(setPlan).toHaveBeenCalledWith('paid')
  })

  it('照会が unknown（オフライン等）なら setPlan を一切呼ばない（降格しない）', async () => {
    getState.mockReturnValue({ settings: { plan: 'paid' } })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    getCustomerInfo.mockRejectedValueOnce(new Error('network'))
    const { restoreEntitlementOnStartup } = await loadBilling()
    await restoreEntitlementOnStartup()
    expect(setPlan).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('キャッシュと結果が一致（冪等）なら setPlan を呼ばない', async () => {
    getState.mockReturnValue({ settings: { plan: 'paid' } })
    getCustomerInfo.mockResolvedValue(entitled())
    const { restoreEntitlementOnStartup } = await loadBilling()
    await restoreEntitlementOnStartup()
    expect(setPlan).not.toHaveBeenCalled()
  })
})
