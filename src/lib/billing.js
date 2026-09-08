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

// アプリ起動時に一度呼ぶ。APIキー未設定（Step0未完了）や web では no-op。
export async function initBilling() {
  if (!NATIVE || !API_KEY) return
  try {
    await Purchases.configure({ apiKey: API_KEY })
  } catch (e) {
    console.warn('[billing] configure failed', e)
  }
}

// 現在のエンタイトルメント状態を照会する（起動時リストアの基礎。PR3で使用）。
// status: 'confirmed'（照会成功） | 'unknown'（オフライン等で判定不能）。
// 'unknown' のとき呼び出し側は plan を変更してはいけない
// （オフラインで降格させない、が本リリースの中心的な安全原則）。
export async function checkEntitlement() {
  if (!NATIVE) return { ok: true, status: 'unknown', reason: 'web-unsupported' }
  try {
    const { customerInfo } = await Purchases.getCustomerInfo()
    return { ok: true, status: 'confirmed', entitled: !!customerInfo?.entitlements?.active?.[ENTITLEMENT_ID] }
  } catch (e) {
    console.warn('[billing] checkEntitlement failed', e)
    return { ok: false, status: 'unknown', reason: 'failed' }
  }
}

// ユーザー起動の「購入を復元」ボタン用。checkEntitlement と違い、
// ストアへ明示的に再照会させる（restorePurchases）。
export async function restorePurchases() {
  if (!NATIVE) return { ok: true, status: 'unknown', reason: 'web-unsupported' }
  try {
    const { customerInfo } = await Purchases.restorePurchases()
    return { ok: true, status: 'confirmed', entitled: !!customerInfo?.entitlements?.active?.[ENTITLEMENT_ID] }
  } catch (e) {
    console.warn('[billing] restore failed', e)
    return { ok: false, status: 'unknown', reason: 'failed' }
  }
}

// ペイウォールに表示する価格文字列。ハードコードしない（Play側の価格変更に追従）。
// null は「取得できなかった」——呼び出し側は「読み込み中」等で表示すること。
export async function getPriceLabel() {
  if (!NATIVE) return import.meta.env.DEV ? '¥300（開発シミュレーション）' : null
  try {
    const offerings = await Purchases.getOfferings()
    return offerings?.current?.availablePackages?.[0]?.product?.priceString ?? null
  } catch (e) {
    console.warn('[billing] getOfferings failed', e)
    return null
  }
}

// 購入を実行する。成功時は setPlan('paid') までこの関数の責務として行う
// （呼び出し側＝将来のペイウォールUIは結果の表示だけに専念できる）。
export async function purchase() {
  if (!NATIVE) return import.meta.env.DEV ? devSimulatedPurchase() : { ok: false, reason: 'native-only' }
  try {
    const offerings = await Purchases.getOfferings()
    const pkg = offerings?.current?.availablePackages?.[0]
    if (!pkg) return { ok: false, reason: 'no-offering' }
    const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg })
    const entitled = !!customerInfo?.entitlements?.active?.[ENTITLEMENT_ID]
    if (entitled) setPlan('paid')
    return entitled ? { ok: true } : { ok: false, reason: 'not-entitled' }
  } catch (e) {
    if (isUserCancellation(e)) return { ok: false, reason: 'cancelled' }
    console.warn('[billing] purchase failed', e)
    return { ok: false, reason: 'failed' }
  }
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

// アプリ起動時に一度呼ぶ（initBilling の後）。現在のキャッシュ値と実際の
// エンタイトルメントを照会し、確定した差分だけ setPlan で反映する。
export async function restoreEntitlementOnStartup() {
  const cached = getState().settings.plan
  const result = await checkEntitlement()
  const next = reconcilePlan(cached, result)
  if (next) setPlan(next)
  return result
}

// ユーザーが購入ダイアログを自分で閉じた/キャンセルしたことを、他の失敗と区別する
// （backup.js の isCancellation と同じ原則：閉じただけの操作にエラー表示しない）。
function isUserCancellation(e) {
  return /cancel/i.test(String(e?.message || e?.code || e))
}
