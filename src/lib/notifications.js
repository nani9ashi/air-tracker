// ============================================================
// notifications.js — 基本リマインダー通知（@capacitor/local-notifications）。
// native(Android) のみ動作。web/PWA は完全 no-op（analytics.js と同じ安全ガード）。
// リセット時に「次回予定日（lastReset+intervalDays）」の朝9時に inexact でスケジュール。
// SCHEDULE_EXACT_ALARM は使わない（マニフェストで除去・プラグインは inexact フォールバック）。
// ============================================================
import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { getState, getActiveBike, getActiveAirItem } from '../store/store.js'
import { computeNextDueDate } from './date.js'

const NATIVE = Capacitor.isNativePlatform()
const REMINDER_HOUR = 9 // 予定日の朝9時（±数時間ずれてよい）

// bikeId から安定した正の 32bit 整数（複数台でも通知IDが衝突しない）。
function notifId(bikeId) {
  const s = String(bikeId || 'bike')
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (Math.abs(h) % 2000000000) || 1
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

// アクティブ自転車の次回予定日にリマインダーを(再)スケジュール。
// プロンプトはしない（権限済みのときのみ動作）。過去予定は張らない。
export async function syncActiveReminder() {
  if (!NATIVE) return
  try {
    const perm = await LocalNotifications.checkPermissions()
    if (perm.display !== 'granted') return
    const s = getState()
    const bike = getActiveBike(s)
    const item = getActiveAirItem(s)
    const id = notifId(bike.id)
    // 前回分を消してから貼り直す（周期変更・再リセットで最新の予定日に）。
    await LocalNotifications.cancel({ notifications: [{ id }] })
    const due = computeNextDueDate(item.lastReset, item.intervalDays)
    if (!due) return
    const at = new Date(due)
    at.setHours(REMINDER_HOUR, 0, 0, 0)
    if (at.getTime() <= Date.now()) return // 既に超過なら張らない（起動毎スパム回避）
    await LocalNotifications.schedule({
      notifications: [
        {
          id,
          title: 'そろそろ空気入れの時期です',
          body: `「${bike.name}」のタイヤに空気を入れましょう（${item.intervalDays}日サイクル）`,
          schedule: { at }, // allowWhileIdle 指定なし＝exact に依存しない
          smallIcon: 'ic_stat_quuki',
        },
      ],
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
  if (granted) await syncActiveReminder()
}
