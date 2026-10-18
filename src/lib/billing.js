// ============================================================
// billing.js — RevenueCat 経由の課金（IAP: pro_upgrade, 買い切り1段）。
//
// native(Android) のみ動作。PWA/Web に Play Billing の等価物は存在しないため、
// notifications.js と同じく native/web の分岐は「web は成立しない」前提で
// 早期returnする。native/web の分岐自体は backup.js / notifications.js と
// 同じ house pattern（Capacitor.isNativePlatform() をロード時に定数化・
// 静的 import・{ok,reason} を返し例外を投げない）。
//
// 🔒 設計制約（README §8 / バックログ 1b-1・2026-08-20確定・最重要）:
// settings.plan を課金状態の source of truth にしない。RevenueCat の
// 購入状態を起点にし、localStorage（= settings.plan）は表示用キャッシュに
// 留める。起動時のリストア（restoreEntitlementOnStartup、v2.4.0 PR3）が
// 唯一の降格経路——「照会が unknown（オフライン等）のときは絶対に降格しない」
// が中心原則。決定表（8行）は billing.reconcile.dt.test.js に固定してある。
//
// ペイウォールUI（v2.4.0 PR4: PaywallSheet.jsx）は自前実装。
// RevenueCatUI.presentPaywall() は使わない——価格文言・エラー文言・非native
// 案内をこちら側で完全に制御するため。
// ============================================================
import { Capacitor } from '@capacitor/core'
import { Purchases } from '@revenuecat/purchases-capacitor'
import { setPlan, getState } from '../store/store.js'

const NATIVE = Capacitor.isNativePlatform()
const API_KEY = import.meta.env.VITE_REVENUECAT_API_KEY

// 🔒 事故防止ガード（2026-09-08・Step0完了時に確定）: 本番 native ビルドに
// RevenueCat の test_ キーが混入していたら起動時に落とす。
// test_ キーは本番では常にエンタイトルメント照会に失敗するため、実購入確認まで
// 気づけない「静かな失敗」になる——RevenueCatのオンボーディングが最初に
// test_ 始まりのキーを発行するため、本番用 goog_ キーへの差し替え漏れが
// 典型的な事故になる。DEV は意図的に test_ を使うことがあるため対象外。
// NATIVE に限定するのは、web(公開PWA) は Purchases を一切呼ばず無関係な
// ビルド設定ミスで公開中のPWAを道連れに落としたくないため（Capacitor.
// isNativePlatform() は実行時判定なので、この判定自体もPWA利用者には
// 常に false になり、このガードは native ビルド実行時にしか効かない）。
if (NATIVE && !import.meta.env.DEV && API_KEY?.startsWith('test_')) {
  throw new Error(
    '[billing] 本番ビルドに RevenueCat の test_ キーが設定されています。VITE_REVENUECAT_API_KEY を確認してください。',
  )
}

// RevenueCat 側の entitlement 識別子。store.js の 'paid' 値と1:1で対応させる
// （Step0セットアップ手順書で同じ文字列を使うよう指示済み）。
export const ENTITLEMENT_ID = 'paid'

// PaywallSheet が「本物の購入導線」を出してよいか。
// native は常に true（Step0未完了でも purchase() 内でエラーになるだけ）。
// web は DEV のみ true（devSimulatedPurchase で動作確認するため）。
// 本番web/PWA は false——呼び出し側（PaywallSheet）はこれを見て、CTAの代わりに
// 「Androidアプリからのみ」の案内文を出す。
export const CAN_PURCHASE = NATIVE || import.meta.env.DEV

// SDK の照会（価格・権利・復元）の上限（v2.5.0。docs/test-design-istqb.md §6-4）。
// 初期化（configure）待ちも含めた時間。購入そのもの（purchasePackage）は利用者が
// Google Play の画面を操作している間なので、上限を設けない。
export const PRICE_TIMEOUT_MS = 10000
export const QUERY_TIMEOUT_MS = 10000

const TIMEOUT = Symbol('timeout')
const UNAVAILABLE = Symbol('unavailable')

// p が ms 以内に確定しなければ TIMEOUT に解決する（p 自体は止められないので、
// 遅れて届いた結果は捨てる）。タイマーは必ず片付ける。
function withTimeout(p, ms) {
  let timer
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(TIMEOUT), ms)
  })
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer))
}

// ---- 初期化（v2.5.0。§6-3） ----
// configure は1回だけ行い、その結果（true=準備完了 / false=利用不可）を Promise で持つ。
// SDK を呼ぶ関数はすべてこれを待つ: configure の完了前に呼ぶと SDK が
// 「Purchases must be configured…」で拒否するため（起動直後にペイウォールを開くと
// 価格が取れないままになっていた）。
// 利用不可 = APIキー未設定（Step0未完了）または configure の失敗。
let ready = null

function ensureReady() {
  if (!ready) ready = configureOnce()
  return ready
}

async function configureOnce() {
  if (!API_KEY) return false
  try {
    await Purchases.configure({ apiKey: API_KEY })
  } catch (e) {
    console.warn('[billing] configure failed', e)
    return false
  }
  // SDK からの更新通知（§6-5 ST-L01〜L05）。保留中の支払いの完了や返金を、次の起動を
  // 待たずに反映する。登録に失敗しても課金そのものは使えるので、起動は止めない。
  try {
    await Purchases.addCustomerInfoUpdateListener(onCustomerInfoUpdated)
  } catch (e) {
    console.warn('[billing] addCustomerInfoUpdateListener failed', e)
  }
  return true
}

// アプリ起動時に一度呼ぶ。APIキー未設定（Step0未完了）や web では no-op。
// 2回以上呼んでも configure は1回だけ（冪等）。
export async function initBilling() {
  if (!NATIVE || !API_KEY) return
  await ensureReady()
}

// 初期化を待ってから call() を実行し、上限 ms で打ち切る。
// 戻り値は call() の結果、または UNAVAILABLE / TIMEOUT。例外はそのまま投げる。
function callSdk(call, ms) {
  return withTimeout(
    (async () => {
      if (!(await ensureReady())) return UNAVAILABLE
      return call()
    })(),
    ms,
  )
}

// 権利の照会（getCustomerInfo / restorePurchases）の共通部分。
// status: 'confirmed'（照会成功） | 'unknown'（オフライン・タイムアウト・利用不可で判定不能）。
async function queryEntitlement(call, label) {
  try {
    const r = await callSdk(call, QUERY_TIMEOUT_MS)
    if (r === UNAVAILABLE) return { ok: false, status: 'unknown', reason: 'unavailable' }
    if (r === TIMEOUT) {
      console.warn(`[billing] ${label} timed out`)
      return { ok: false, status: 'unknown', reason: 'timeout' }
    }
    // 応答の中身が不正なら「不明」（v2.5.1。§6-8）。確定として扱うと有料の利用者が降格し得る。
    const entitled = readEntitled(r?.customerInfo)
    if (entitled === null) {
      console.warn(`[billing] ${label} returned an invalid response`)
      return { ok: false, status: 'unknown', reason: 'invalid' }
    }
    return { ok: true, status: 'confirmed', entitled }
  } catch (e) {
    console.warn(`[billing] ${label} failed`, e)
    return { ok: false, status: 'unknown', reason: 'failed' }
  }
}

// 現在のエンタイトルメント状態を照会する（起動時リストアの基礎）。
// 'unknown' のとき呼び出し側は plan を変更してはいけない
// （オフラインで降格させない、が中心的な安全原則）。
export async function checkEntitlement() {
  if (!NATIVE) return { ok: true, status: 'unknown', reason: 'web-unsupported' }
  return queryEntitlement(() => Purchases.getCustomerInfo(), 'checkEntitlement')
}

// ユーザー起動の「購入を復元」ボタン用。checkEntitlement と違い、
// ストアへ明示的に再照会させる（restorePurchases）。
// 確定した結果は反映する（権利なしで確定したら free へ。§6-5 ST-S01〜S03）。
export async function restorePurchases() {
  if (!NATIVE) return { ok: true, status: 'unknown', reason: 'web-unsupported' }
  const result = await queryEntitlement(() => Purchases.restorePurchases(), 'restore')
  applyEntitlement(result)
  return result
}

// ペイウォールに表示する価格文字列。ハードコードしない（Play側の価格変更に追従）。
// null は「取得できなかった」（失敗・タイムアウト・利用不可）——呼び出し側は
// 「価格を取得できませんでした」と再読み込みの導線を出す。
export async function getPriceLabel() {
  if (!NATIVE) return import.meta.env.DEV ? '¥300（開発シミュレーション）' : null
  try {
    const r = await callSdk(async () => {
      const offerings = await Purchases.getOfferings()
      return offerings?.current?.availablePackages?.[0]?.product?.priceString ?? null
    }, PRICE_TIMEOUT_MS)
    if (r === UNAVAILABLE) return null
    if (r === TIMEOUT) {
      console.warn('[billing] getOfferings timed out')
      return null
    }
    return r
  } catch (e) {
    console.warn('[billing] getOfferings failed', e)
    return null
  }
}

// 購入を実行する。成功時は setPlan('paid') までこの関数の責務として行う
// （呼び出し側＝ペイウォールUIは結果の表示だけに専念できる）。
// 失敗は reason で区別する（docs/test-design-istqb.md §6-2）:
//   pending（支払い保留）/ already-owned（購入済みで復元もできない）/
//   not-entitled（支払い後も権利が付かない）/ in-progress（購入の途中）/
//   no-offering / それ以外は classifyPurchaseError の分類どおり。
let purchasing = false

export async function purchase() {
  if (!NATIVE) return import.meta.env.DEV ? devSimulatedPurchase() : { ok: false, reason: 'native-only' }
  // 二重購入ガード（DT-P08）。画面側でもボタンを無効化しているが、別の画面から
  // 同時に呼ばれても SDK に購入を重ねて投げない。
  if (purchasing) return { ok: false, reason: 'in-progress' }
  purchasing = true
  try {
    return await purchaseNative()
  } finally {
    purchasing = false
  }
}

async function purchaseNative() {
  let customerInfo
  try {
    // 初期化待ちと商品の取得は上限つき（BVA-T07）。購入そのものは上限なし（BVA-T08）。
    const pkg = await callSdk(async () => {
      const offerings = await Purchases.getOfferings()
      return offerings?.current?.availablePackages?.[0] ?? null
    }, PRICE_TIMEOUT_MS)
    if (pkg === UNAVAILABLE) return { ok: false, reason: 'unavailable' }
    if (pkg === TIMEOUT) return { ok: false, reason: 'timeout' }
    if (!pkg) return { ok: false, reason: 'no-offering' }
    ;({ customerInfo } = await Purchases.purchasePackage({ aPackage: pkg }))
  } catch (e) {
    const reason = classifyPurchaseError(e)
    // 購入済み（再インストール後にオフラインで起動した等）→ 復元して有効にする（DT-P02〜P04）。
    if (reason === 'already-owned') return recoverAlreadyOwned()
    // 自分でやめた操作と支払い保留は「失敗」ではないので warn しない。
    if (reason !== 'cancelled' && reason !== 'pending') console.warn('[billing] purchase failed', e)
    return { ok: false, reason }
  }
  if (readEntitled(customerInfo) === true) {
    applyEntitlement({ ok: true, status: 'confirmed', entitled: true })
    return { ok: true }
  }
  // 支払いは済んだのに権利が付いていない（反映の遅れ等）→ 1回だけ再照会する（DT-P05/P06）。
  const since = epoch
  const recheck = await checkEntitlement()
  if (recheck.status === 'confirmed' && recheck.entitled) {
    applyEntitlement(recheck, since)
    return { ok: true }
  }
  return { ok: false, reason: 'not-entitled' }
}

// 購入済み（code 6）→ 復元して有効にする。復元の結果は restorePurchases が反映する。
async function recoverAlreadyOwned() {
  const restored = await restorePurchases()
  if (restored.status === 'confirmed' && restored.entitled) return { ok: true, restored: true }
  return { ok: false, reason: 'already-owned' }
}

// ⚠ 開発限定: RevenueCat未設定（Step0未完了）でもペイウォールUIの購入フローを
// 一通り検証できるようにする（notifications.js の fireTestNotification と
// 同じ考え方）。native判定に頼るので追加のDEVガードは不要——`npm run dev` は
// ブラウザで動く限り常に !NATIVE。本番native buildでは NATIVE===true になり
// この関数へは絶対に到達しない（purchase() の分岐を参照）。
async function devSimulatedPurchase() {
  await new Promise((resolve) => setTimeout(resolve, 600)) // purchasing 状態を目視できる遅延
  setPlan('paid')
  return { ok: true, simulated: true }
}

// ============================================================
// 起動時のエンタイトルメント・リストア/整合（v2.4.0 PR3）。
// ============================================================

// キャッシュ済み plan と照会結果から、次に setPlan すべき値を決める純関数。
// 変更不要なら null（呼び出し側は setPlan を呼ばない＝無用な commit/persist を避ける）。
//
// 🔒 中心原則: status が 'confirmed' でない（＝オフライン等で unknown）ときは
// 絶対に降格しない。決定表8行は billing.reconcile.dt.test.js に固定。
export function reconcilePlan(cachedPlan, restoreResult) {
  if (restoreResult.status !== 'confirmed') return null // 不明のまま＝何もしない
  const next = restoreResult.entitled ? 'paid' : 'free'
  return next === cachedPlan ? null : next
}

// アプリ起動時に一度呼ぶ（initBilling の後）。実際のエンタイトルメントを照会し、
// 確定した差分だけ反映する。照会の途中で購入・復元・更新通知により権利が確定して
// いたら、この照会の結果は古いので捨てる（§6-5 ST-R01〜R04）。
export async function restoreEntitlementOnStartup() {
  const since = epoch
  const result = await checkEntitlement()
  applyEntitlement(result, since)
  return result
}

// ---- 権利の反映（v2.5.0。§6-5） ----
// 反映の経路は4つ（起動時の照会・購入・復元・SDK からの更新通知）で、すべてここを通す。
// 結果が届いた時点の plan と比べて、確定した差分だけ setPlan する。
// epoch は「確定した権利を反映した回数」。照会は開始時点の epoch（since）を持ち、
// そのあとに別の経路で反映されていたら古い結果として捨てる。
// （v2.4 は照会の開始時点の plan と比べていたため、1回の割り込みなら偶然安全だったが、
//   反映を一本化して届いた時点の plan と比べる以上、この番号が無いと降格が起きる。）
// 購入・復元・更新通知は、その時点で最新の結果なので since を付けない。
let epoch = 0

function applyEntitlement(result, since) {
  if (result?.status !== 'confirmed') return null // 不明のまま＝何もしない（降格しない）
  if (since !== undefined && since !== epoch) return null // 古い照会結果
  epoch += 1
  const next = reconcilePlan(getState().settings.plan, result)
  if (next) setPlan(next)
  return next
}

// SDK からの更新通知。中身が不正（entitlements.active が無い）なら何もしない（ST-L04）。
function onCustomerInfoUpdated(customerInfo) {
  const entitled = readEntitled(customerInfo)
  if (entitled === null) return
  applyEntitlement({ ok: true, status: 'confirmed', entitled })
}

// customerInfo から権利の有無を読む。true / false、形が不正（entitlements.active が
// 読めない）なら null（v2.5.1。§6-8）。更新通知・照会・復元・購入で共有し、扱いをそろえる。
function readEntitled(customerInfo) {
  const active = customerInfo?.entitlements?.active
  if (!active || typeof active !== 'object') return null
  return !!active[ENTITLEMENT_ID]
}

// ============================================================
// SDK のエラー → reason の分類（v2.5.0。docs/test-design-istqb.md §6-1）。
// ============================================================

// SDK のエラーコード（purchases-typescript-internal の PURCHASES_ERROR_CODE）→ reason。
// ここに無いコード（0 不明・2 ストアの問題・23 設定エラー等）は 'failed'。
const ERROR_REASONS = {
  1: 'cancelled', // PURCHASE_CANCELLED_ERROR
  3: 'not-allowed', // PURCHASE_NOT_ALLOWED_ERROR（課金できない端末・アカウント）
  5: 'unavailable', // PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR
  6: 'already-owned', // PRODUCT_ALREADY_PURCHASED_ERROR
  10: 'network', // NETWORK_ERROR
  15: 'in-progress', // OPERATION_ALREADY_IN_PROGRESS_ERROR
  20: 'pending', // PAYMENT_PENDING_ERROR（コンビニ払い等）
  35: 'network', // OFFLINE_CONNECTION_ERROR
}

// Capacitor 経由の SDK エラーは { code: '20', message, data } の形で届く。
// 優先順位: ① SDK の userCancelled フラグ → ② code → ③ code が無いときだけ文言。
// 🔒 code があるときは文言を見ない（DT-E16）。失敗をキャンセルと取り違えると
//   何も表示されず、利用者が状況を知れないため（逆の取り違えは文言が出るだけで済む）。
// configure 前の呼び出しは code なしの "Purchases must be configured…" で拒否される。
export function classifyPurchaseError(e) {
  if (e?.userCancelled === true || e?.data?.userCancelled === true) return 'cancelled'
  const code = e?.code
  if (code !== undefined && code !== null && String(code) !== '') {
    return ERROR_REASONS[String(code)] ?? 'failed'
  }
  const message = String(e?.message ?? e ?? '')
  if (/must be configured/i.test(message)) return 'not-ready'
  // v2.4 までの文言による判定（backup.js の isCancellation と同じ原則：閉じただけの操作に
  // エラー表示しない）。code の無いエラーに対してだけ使う。
  if (/cancel/i.test(message)) return 'cancelled'
  return 'failed'
}
