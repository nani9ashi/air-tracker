// ============================================================
// reminder-sync.js — 予定日が変わったら通知を貼り直す薄い層。
//
// これが無かった頃は syncActiveReminder の呼び出しが App 起動時と
// HomeScreen の周期変更・リセットの4箇所だけで、履歴の編集/削除で予定日が
// 変わっても通知は古いままだった（App.jsx が「次のリセット/周期変更/再起動で
// 整合する（basic）」と限界を明記していた箇所）。
//
// ■ 置き場所の理由
// store の commit から通知を直接呼ぶと store.js → notifications.js の依存が
// 生まれ、notifications.js → store.js と循環する。そこで store.subscribe() を
// 購読する側にこの層を置く。依存は notifications.js → reminder-sync.js → store.js
// の一方向。**store.js から通知系を import してはいけない**（即座に循環する）。
//
// ■ 指紋をここに持つ理由
// notifications.js は Capacitor.isNativePlatform() が false だと全関数が即 return
// するため、jsdom では 1 行も実行されない＝CI で検証できない唯一の層。
// 「変わったときだけ呼ぶ」判定をあちらに置くと未検証コードが増えるので、
// 純粋なこちらに置く。この層は jsdom でそのままテストできる。
// ============================================================
import { subscribe, getState, getActiveBike, getActiveAirItem } from '../store/store.js'
import { syncActiveReminder } from './notifications.js'

// 通知の内容を決める値だけを取り出した指紋。
// これが変わらない限り再スケジュールしない（同じ予定日で cancel→schedule を
// 繰り返すと、その隙間に通知が消えるうえ何の得も無い）。
// 対象は notify-plan.js が本文と時刻を組み立てるのに使う4つ。
export function reminderKey(state = getState()) {
  const bike = getActiveBike(state)
  const item = getActiveAirItem(state)
  return JSON.stringify([bike.id, bike.name, item.lastReset, item.intervalDays])
}

// store の変更を購読し、指紋が変わったときだけ再同期する。
// 戻り値は購読解除関数（テストと、将来 StrictMode の二重実行に備えて）。
export function installReminderSync(sync = syncActiveReminder) {
  let lastKey = reminderKey()

  return subscribe(() => {
    const key = reminderKey()
    if (key === lastKey) return
    lastKey = key
    // 自動再同期は必ず userAction:false。
    // true にすると超過時に catchup 通知が出るが、その本文は
    // 「間隔の変更により、〜の予定日を過ぎています」で固定されており
    // （notify-plan.js）、履歴の削除で出すと事実と食い違う。
    // 「今すぐ知らせるべき意思表示」はリセットと周期変更だけ、という
    // 従来の意味論を保つ。
    sync({ userAction: false })
  })
}
