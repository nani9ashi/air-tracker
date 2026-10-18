// ============================================================
// billing.errors.dt.test.js — SDK のエラー → reason の分類（v2.5.0）。
// docs/test-design-istqb.md §6-1 のデシジョンテーブル22行をそのまま固定する。
// classifyPurchaseError は純関数（Capacitor/RevenueCat のモック不要）。
//
// 判定の優先順位: ① userCancelled フラグ → ② code → ③ code が無いときだけ文言。
// 🔒 code があるときは文言を見ない（DT-E16）。失敗をキャンセルと取り違えると
//   何も表示されず、利用者が状況を知れないため。
// ============================================================
import { describe, it, expect } from 'vitest'
import { classifyPurchaseError } from './billing.js'

// # | 入力 | 期待される reason
const TABLE = [
  ['DT-E01', { code: '1' }, 'cancelled'],
  ['DT-E02', { code: 1 }, 'cancelled'],
  ['DT-E03', { userCancelled: true }, 'cancelled'],
  ['DT-E04', { code: '2', userCancelled: true }, 'cancelled'],
  ['DT-E05', { data: { userCancelled: true } }, 'cancelled'],
  ['DT-E06', { code: '20' }, 'pending'],
  ['DT-E07', { code: '6' }, 'already-owned'],
  ['DT-E08', { code: '3' }, 'not-allowed'],
  ['DT-E09', { code: '10' }, 'network'],
  ['DT-E10', { code: '35' }, 'network'],
  ['DT-E11', { code: '15' }, 'in-progress'],
  ['DT-E12', { code: '5' }, 'unavailable'],
  ['DT-E13', { code: '0' }, 'failed'],
  ['DT-E14', { code: '2' }, 'failed'],
  ['DT-E15', { code: '23' }, 'failed'],
  ['DT-E16', { code: '2', message: 'The purchase was cancelled by the store' }, 'failed'],
  ['DT-E17', { message: 'Purchases must be configured before calling this function' }, 'not-ready'],
  ['DT-E18', { message: 'Purchase was cancelled by the user' }, 'cancelled'],
  ['DT-E19', new Error('network error'), 'failed'],
  ['DT-E20a', null, 'failed'],
  ['DT-E20b', undefined, 'failed'],
  ['DT-E21', 'boom', 'failed'],
  ['DT-E22', { code: '' }, 'failed'],
]

describe('classifyPurchaseError — デシジョンテーブル（§6-1）', () => {
  it.each(TABLE)('%s: %o → %s', (_id, input, expected) => {
    expect(classifyPurchaseError(input)).toBe(expected)
  })
})
