// ============================================================
// billing.race.test.js — 課金の「時間と順序」に関わる異常系（v2.5.0）。
//   §6-3 初期化の状態遷移（configure の完了前の呼び出し・利用不可）
//   §6-4 タイムアウトの境界値（偽のタイマー）
//   §6-5 権利の反映と競合・SDK からの更新通知
// docs/test-design-istqb.md §6 の ID をテスト名の先頭に付けている。
//
// モックの方針は billing.test.js と同じ（SDK と store を境界としてモックし、
// NATIVE/API_KEY を切り替えるテストは vi.resetModules() + 動的 import で読み直す）。
// ============================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const {
  nativeFlag,
  configure,
  addCustomerInfoUpdateListener,
  getCustomerInfo,
  restorePurchasesMock,
  getOfferings,
  purchasePackage,
  setPlan,
  getState,
} = vi.hoisted(() => ({
  nativeFlag: { value: true },
  configure: vi.fn(),
  addCustomerInfoUpdateListener: vi.fn(),
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
    addCustomerInfoUpdateListener,
    getCustomerInfo,
    restorePurchases: restorePurchasesMock,
    getOfferings,
    purchasePackage,
  },
}))
vi.mock('../store/store.js', () => ({ setPlan, getState }))

async function loadBilling() {
  vi.resetModules()
  return import('./billing.js')
}

const entitled = () => ({ customerInfo: { entitlements: { active: { paid: {} } } } })
const notEntitled = () => ({ customerInfo: { entitlements: { active: {} } } })
const withOffering = () => ({ current: { availablePackages: [{ product: { priceString: '¥300' } }] } })
const never = () => new Promise(() => {})
const deferred = () => {
  let resolve
  const promise = new Promise((r) => (resolve = r))
  return { promise, resolve }
}
// 実タイマーで、保留中の Promise の連鎖を一巡させる。
const flush = () => new Promise((r) => setTimeout(r, 0))
// p が確定したかどうかを、確定を待たずに観察する。
const track = (p) => {
  const t = { settled: false, value: undefined }
  p.then((v) => {
    t.settled = true
    t.value = v
  })
  return t
}

// store のモックを「本物らしく」する: setPlan で plan が変わり、getState がそれを返す。
// 競合のテスト（§6-5）で、購入による setPlan('paid') のあとの照会結果を正しく評価するため。
let plan
beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  vi.useRealTimers()
  // 周囲の .env.local に頼らず、APIキーを明示する（未設定のテストは個別に '' を入れる）。
  vi.stubEnv('VITE_REVENUECAT_API_KEY', 'goog_unit')
  nativeFlag.value = true
  plan = 'free'
  setPlan.mockImplementation((p) => {
    plan = p
  })
  getState.mockImplementation(() => ({ settings: { plan } }))
  configure.mockResolvedValue(undefined)
  addCustomerInfoUpdateListener.mockResolvedValue('listener-1')
  getCustomerInfo.mockResolvedValue(entitled())
  restorePurchasesMock.mockResolvedValue(entitled())
  getOfferings.mockResolvedValue(withOffering())
  purchasePackage.mockResolvedValue(entitled())
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

// ============================================================
// §6-3 初期化の状態遷移
// ============================================================
describe('§6-3 初期化の状態遷移', () => {
  it('ST-I01: initBilling() を2回呼んでも configure は1回だけ（冪等）', async () => {
    const b = await loadBilling()
    await Promise.all([b.initBilling(), b.initBilling()])
    await b.initBilling()
    expect(configure).toHaveBeenCalledTimes(1)
  })

  it('ST-I02: 初期化中に getPriceLabel() → configure の完了を待ってから getOfferings を呼ぶ', async () => {
    const cfg = deferred()
    configure.mockReturnValueOnce(cfg.promise)
    const b = await loadBilling()
    b.initBilling()
    const price = b.getPriceLabel()
    await flush()
    expect(getOfferings).not.toHaveBeenCalled()
    cfg.resolve()
    await expect(price).resolves.toBe('¥300')
    expect(configure).toHaveBeenCalledTimes(1)
  })

  it('ST-I03: 初期化中に purchase() → configure の完了を待ってから購入する', async () => {
    const cfg = deferred()
    configure.mockReturnValueOnce(cfg.promise)
    const b = await loadBilling()
    b.initBilling()
    const result = b.purchase()
    await flush()
    expect(getOfferings).not.toHaveBeenCalled()
    expect(purchasePackage).not.toHaveBeenCalled()
    cfg.resolve()
    await expect(result).resolves.toEqual({ ok: true })
  })

  it('ST-I04: 未初期化のまま checkEntitlement() → 自動で初期化してから照会する', async () => {
    const b = await loadBilling()
    await expect(b.checkEntitlement()).resolves.toEqual({ ok: true, status: 'confirmed', entitled: true })
    expect(configure).toHaveBeenCalledTimes(1)
    expect(configure.mock.invocationCallOrder[0]).toBeLessThan(getCustomerInfo.mock.invocationCallOrder[0])
  })

  describe('利用不可（configure 失敗）', () => {
    beforeEach(() => {
      configure.mockRejectedValue(new Error('configure failed'))
      vi.spyOn(console, 'warn').mockImplementation(() => {})
    })
    afterEach(() => vi.restoreAllMocks())

    it('ST-I05: getPriceLabel() → SDK を呼ばず null', async () => {
      const b = await loadBilling()
      await expect(b.getPriceLabel()).resolves.toBeNull()
      expect(getOfferings).not.toHaveBeenCalled()
    })

    it('ST-I06: purchase() → SDK を呼ばず unavailable', async () => {
      const b = await loadBilling()
      await expect(b.purchase()).resolves.toEqual({ ok: false, reason: 'unavailable' })
      expect(getOfferings).not.toHaveBeenCalled()
      expect(purchasePackage).not.toHaveBeenCalled()
    })

    it('ST-I07: checkEntitlement() → unknown/unavailable（降格しない側）', async () => {
      const b = await loadBilling()
      await expect(b.checkEntitlement()).resolves.toEqual({ ok: false, status: 'unknown', reason: 'unavailable' })
      expect(getCustomerInfo).not.toHaveBeenCalled()
    })

    it('ST-I07b: restorePurchases() → unknown/unavailable、setPlan は呼ばない', async () => {
      const b = await loadBilling()
      await expect(b.restorePurchases()).resolves.toEqual({ ok: false, status: 'unknown', reason: 'unavailable' })
      expect(restorePurchasesMock).not.toHaveBeenCalled()
      expect(setPlan).not.toHaveBeenCalled()
    })
  })

  it('ST-I08: APIキーなし（native）→ configure を呼ばず、利用不可と同じ扱い', async () => {
    vi.stubEnv('VITE_REVENUECAT_API_KEY', '')
    const b = await loadBilling()
    await expect(b.getPriceLabel()).resolves.toBeNull()
    await expect(b.purchase()).resolves.toEqual({ ok: false, reason: 'unavailable' })
    await expect(b.checkEntitlement()).resolves.toEqual({ ok: false, status: 'unknown', reason: 'unavailable' })
    expect(configure).not.toHaveBeenCalled()
    expect(getOfferings).not.toHaveBeenCalled()
    expect(getCustomerInfo).not.toHaveBeenCalled()
  })

  it('ST-I09: web → 初期化を待たず既存どおり（configure は一切呼ばない）', async () => {
    nativeFlag.value = false
    const b = await loadBilling()
    await expect(b.checkEntitlement()).resolves.toEqual({ ok: true, status: 'unknown', reason: 'web-unsupported' })
    await expect(b.getPriceLabel()).resolves.toBe('¥300（開発シミュレーション）')
    expect(configure).not.toHaveBeenCalled()
  })
})

// ============================================================
// §6-4 タイムアウトの境界値
// ============================================================
describe('§6-4 タイムアウトの境界値', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  it('EP: 上限は価格・照会とも 10,000ms', async () => {
    const b = await loadBilling()
    expect(b.PRICE_TIMEOUT_MS).toBe(10000)
    expect(b.QUERY_TIMEOUT_MS).toBe(10000)
  })

  it('BVA-T01/T02: 価格 — getOfferings が戻らない → 9,999ms ではまだ未確定、10,000ms で null', async () => {
    getOfferings.mockReturnValue(never())
    const b = await loadBilling()
    const t = track(b.getPriceLabel())
    await vi.advanceTimersByTimeAsync(9999)
    expect(t.settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(t.settled).toBe(true)
    expect(t.value).toBeNull()
  })

  it('BVA-T03: 価格 — getOfferings が 9,999ms で解決 → 価格を返す', async () => {
    getOfferings.mockReturnValue(new Promise((r) => setTimeout(() => r(withOffering()), 9999)))
    const b = await loadBilling()
    const t = track(b.getPriceLabel())
    await vi.advanceTimersByTimeAsync(9999)
    expect(t.value).toBe('¥300')
    await vi.advanceTimersByTimeAsync(1)
    expect(t.value).toBe('¥300')
  })

  it('BVA-T04: 照会 — getCustomerInfo が戻らない → 10,000ms で unknown/timeout', async () => {
    getCustomerInfo.mockReturnValue(never())
    const b = await loadBilling()
    const t = track(b.checkEntitlement())
    await vi.advanceTimersByTimeAsync(9999)
    expect(t.settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(t.value).toEqual({ ok: false, status: 'unknown', reason: 'timeout' })
  })

  it('BVA-T05: 起動時リストア — 照会がタイムアウト（cached paid）→ setPlan を呼ばない（降格しない）', async () => {
    plan = 'paid'
    getCustomerInfo.mockReturnValue(never())
    const b = await loadBilling()
    const t = track(b.restoreEntitlementOnStartup())
    await vi.advanceTimersByTimeAsync(10000)
    expect(t.value).toEqual({ ok: false, status: 'unknown', reason: 'timeout' })
    expect(setPlan).not.toHaveBeenCalled()
  })

  it('BVA-T06: 復元 — restorePurchases が戻らない → 10,000ms で unknown/timeout、setPlan なし', async () => {
    restorePurchasesMock.mockReturnValue(never())
    const b = await loadBilling()
    const t = track(b.restorePurchases())
    await vi.advanceTimersByTimeAsync(9999)
    expect(t.settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(t.value).toEqual({ ok: false, status: 'unknown', reason: 'timeout' })
    expect(setPlan).not.toHaveBeenCalled()
  })

  it('BVA-T07: 購入 — getOfferings が戻らない → 10,000ms で timeout、purchasePackage は呼ばない', async () => {
    getOfferings.mockReturnValue(never())
    const b = await loadBilling()
    const t = track(b.purchase())
    await vi.advanceTimersByTimeAsync(9999)
    expect(t.settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(t.value).toEqual({ ok: false, reason: 'timeout' })
    expect(purchasePackage).not.toHaveBeenCalled()
  })

  it('BVA-T08: 購入 — purchasePackage が 60,000ms 後に成功 → 成功（購入そのものはタイムアウトしない）', async () => {
    purchasePackage.mockReturnValue(new Promise((r) => setTimeout(() => r(entitled()), 60000)))
    const b = await loadBilling()
    const t = track(b.purchase())
    await vi.advanceTimersByTimeAsync(59999)
    expect(t.settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(t.value).toEqual({ ok: true })
    expect(setPlan).toHaveBeenCalledWith('paid')
  })

  it('BVA-T09: 価格 — configure が戻らない → 10,000ms で null（初期化待ちも上限に含める）', async () => {
    configure.mockReturnValue(never())
    const b = await loadBilling()
    const t = track(b.getPriceLabel())
    await vi.advanceTimersByTimeAsync(9999)
    expect(t.settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(t.value).toBeNull()
    expect(getOfferings).not.toHaveBeenCalled()
  })
})
