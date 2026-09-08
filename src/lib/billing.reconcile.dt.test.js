// ============================================================
// billing.reconcile.dt.test.js — 起動時リストアの決定表（v2.4.0 PR3）。
// clever-juggling-pinwheel.md の8行をそのまま it.each で固定する。
// reconcilePlan は純関数（Capacitor/RevenueCatのモック不要）。
//
// 🔒 このテストが守っている中心原則: 照会が unknown（オフライン/エラー）の
// ときは絶対に降格しない。行6がそれ——マージ前のミューテーション確認で
// 「行6を反転させると実際に赤くなる」ことを確認済み。
// ============================================================
import { describe, it, expect } from 'vitest'
import { reconcilePlan } from './billing.js'

const confirmed = (entitled) => ({ ok: true, status: 'confirmed', entitled })
const unknown = () => ({ ok: false, status: 'unknown', reason: 'failed' })

// # | cached | 結果                        | 期待される setPlan 先（null=no-op）
const TABLE = [
  [1, 'free', confirmed(false), null], // 失うものがない
  [2, 'free', confirmed(true), 'paid'], // 別端末購入の発見・再インストール後の復元
  [3, 'free', unknown(), null], // 安全な既定値
  [4, 'paid', confirmed(true), null], // 再確認（冪等——値が変わらないので no-op）
  [5, 'paid', confirmed(false), 'free'], // 降格を許す唯一の経路——実際の照会で確認された返金/失効
  [6, 'paid', unknown(), null], // 🔒 このリリースの存在理由そのもの＝機内モード受け入れ基準
  [7, 'free', confirmed(true), 'paid'], // 改ざん是正済み/本当にfree、いずれも同じ結果
  [8, 'paid', confirmed(false), 'free'], // localStorage改ざんで見せかけの有料 → リストアが是正する
]

describe('reconcilePlan — 決定表8行', () => {
  it.each(TABLE)('行%i: cached=%s, %o → %s', (_n, cached, result, expected) => {
    expect(reconcilePlan(cached, result)).toBe(expected)
  })
})
