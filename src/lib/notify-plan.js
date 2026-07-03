// ============================================================
// notify-plan.js — 「どの通知をいつ出すか」を決める純関数（native非依存＝テスト対象）。
// 改善メモ準拠: 無料は 20:00 固定・予定日と予定日+2日の最大2本・
// ユーザーが間隔を短縮して超過に落ちたら直近20:00にキャッチアップ。
// ============================================================
import { computeNextDueDate } from './date.js'

export const REMINDER_HOUR = 20 // 20時に通知
export const LEAD_DAYS = 1 // 予定日の1日前＝前夜に予告（どの間隔でも共通）
export const RENUDGE_DAYS = 2 // 放置時の念押し（最大1回）

// その日の h:00(ローカル) を返す（元は破壊しない）。
function atHour(date, h) {
  const d = new Date(date)
  d.setHours(h, 0, 0, 0)
  return d
}
function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}
// now 以降で最も近い h:00（本日 h:00 が未来なら本日、過ぎていれば翌日）。
function nextHour(now, h) {
  const today = atHour(now, h)
  return today.getTime() > now.getTime() ? today : addDays(today, 1)
}

// インライン表示用。「次に実際に出る通知」の状態を返す（前夜→念押し→超過）。
export function reminderStatus(lastReset, intervalDays, now = new Date()) {
  const due = computeNextDueDate(lastReset, intervalDays)
  if (!due) return { at: null, state: 'none' }
  const t = now.getTime()
  const primaryAt = atHour(addDays(due, -LEAD_DAYS), REMINDER_HOUR)
  if (primaryAt.getTime() > t) return { at: primaryAt, state: 'scheduled' } // 前夜リマインダー
  const renudgeAt = atHour(addDays(due, RENUDGE_DAYS), REMINDER_HOUR)
  if (renudgeAt.getTime() > t) return { at: renudgeAt, state: 'scheduled' } // primary後は念押しが次
  return { at: null, state: 'overdue' } // 予定日+2も過ぎたら超過
}

// スケジュールすべき通知の記述子配列を返す（kind/at/title/body）。
// kind: 'primary' | 'renudge' | 'catchup'（catchup は primary と同スロット）。
export function planNotifications(bikeName, lastReset, intervalDays, { userAction = false, now = Date.now() } = {}) {
  const due = computeNextDueDate(lastReset, intervalDays)
  if (!due) return []
  const name = bikeName || 'マイバイク'
  const days = Math.round(Number(intervalDays)) || intervalDays
  const primaryAt = atHour(addDays(due, -LEAD_DAYS), REMINDER_HOUR) // 予定日の前日20時
  const renudgeAt = atHour(addDays(due, RENUDGE_DAYS), REMINDER_HOUR)
  const out = []

  if (primaryAt.getTime() > now) {
    out.push({
      kind: 'primary',
      at: primaryAt,
      title: 'そろそろ空気入れの時期です',
      body: `「${name}」のタイヤに空気を入れましょう（${days}日サイクル）`,
    })
    if (renudgeAt.getTime() > now) {
      out.push({
        kind: 'renudge',
        at: renudgeAt,
        title: `「${name}」の空気入れがまだのようです`,
        body: `予定日から${RENUDGE_DAYS}日。数分で済みます。`,
      })
    }
  } else if (userAction) {
    // 間隔を短縮して超過に落ちた等、ユーザーの意思表示。直近20:00に1発。
    out.push({
      kind: 'catchup',
      at: nextHour(new Date(now), REMINDER_HOUR),
      title: 'そろそろ空気入れの時期です',
      body: `「${name}」— 予定日を過ぎています。数分で済みます。`,
    })
  } else if (renudgeAt.getTime() > now) {
    // 起動時の再同期: 予定日は過ぎているが念押し(予定日+2)がまだ未来なら再登録。
    out.push({
      kind: 'renudge',
      at: renudgeAt,
      title: `「${name}」の空気入れがまだのようです`,
      body: `予定日から${RENUDGE_DAYS}日。数分で済みます。`,
    })
  }
  return out
}
