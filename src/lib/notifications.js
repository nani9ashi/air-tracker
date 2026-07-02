// ============================================================
// notifications.js — 基本リマインダー通知（@capacitor/local-notifications）。
// native(Android) のみ動作。web/PWA は完全 no-op（analytics.js と同じ安全ガード）。
// 出し分けロジックは純関数 notify-plan.js（テスト対象）に委譲。ここは native ラッパ。
// SCHEDULE_EXACT_ALARM は使わない（マニフェストで除去・プラグインは inexact フォールバック）。
// ============================================================
import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { getState, getActiveBike, getActiveAirItem } from '../store/store.js'
import { planNotifications } from './notify-plan.js'

const NATIVE = Capacitor.isNativePlatform()

// 文字列から安定した正の 32bit 整数（通知ID）。
function hashId(key) {
  const s = String(key)
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (Math.abs(h) % 2000000000) || 1
}
// 自転車×スロットで衝突しないID。catchup は primary と同スロット（置換）。
function idForKind(bikeId, kind) {
  const slot = kind === 'renudge' ? 'renudge' : 'primary'
  return hashId(String(bikeId || 'bike') + ':' + slot)
}

// 通知権限を確認し、未確定なら要求。granted 真偽を返す。非native/例外は false。
export async function ensureNotificationPermission() {
  if (!NATIVE) return false
  try {
    let p = await LocalNotifications.checkPermissions()
    if (p.display === 'prompt' || p.display === 'prompt-with-rationale') {
      p = await LocalNotifications.requestPermissions()
    }
    return p.display === 'granted'
  } catch {
    return false
  }
}

// 通知が有効か（native かつ許可済み）。インライン表示の可否に使う。
export async function isNotificationEnabled() {
  if (!NATIVE) return false
  try {
    const p = await LocalNotifications.checkPermissions()
    return p.display === 'granted'
  } catch {
    return false
  }
}

// アクティブ自転車のリマインダーを(再)スケジュール。プロンプトはしない（許可済みのみ動作）。
// userAction=true（リセット/周期変更）は超過時に直近20時へキャッチアップ。false（起動時）は過去分を張らない。
export async function syncActiveReminder({ userAction = false } = {}) {
  if (!NATIVE) return
  try {
    const perm = await LocalNotifications.checkPermissions()
    if (perm.display !== 'granted') return
    const s = getState()
    const bike = getActiveBike(s)
    const item = getActiveAirItem(s)
    // primary/renudge の両スロットを消してから貼り直す（多重・古い予約を残さない）。
    const ids = [idForKind(bike.id, 'primary'), idForKind(bike.id, 'renudge')]
    await LocalNotifications.cancel({ notifications: ids.map((id) => ({ id })) })
    const plan = planNotifications(bike.name, item.lastReset, item.intervalDays, {
      userAction,
      now: Date.now(),
    })
    if (!plan.length) return
    await LocalNotifications.schedule({
      notifications: plan.map((n) => ({
        id: idForKind(bike.id, n.kind),
        title: n.title,
        body: n.body,
        schedule: { at: n.at }, // allowWhileIdle 指定なし＝exact に依存しない
        smallIcon: 'ic_stat_quuki',
      })),
    })
  } catch (e) {
    // 通知の失敗でアプリを壊さない。
    console.warn('[notifications] sync failed', e)
  }
}

// リセット直後に呼ぶ：初回だけ権限要求→許可なら(再)スケジュール。
export async function requestPermissionAfterReset() {
  if (!NATIVE) return
  const granted = await ensureNotificationPermission()
  if (granted) await syncActiveReminder({ userAction: true })
}
