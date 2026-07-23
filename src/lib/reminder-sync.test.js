// ============================================================
// reminder-sync.js — 予定日が変わったときだけ通知を貼り直す層
//
// notifications.js（native ラッパ）は jsdom では全関数が即 return するため
// 検証できない。「いつ貼り直すか」の判断をこちら側に置いてあるので、
// ここは素の jsdom でテストできる。
// ============================================================
import { describe, it, expect, vi } from 'vitest'
import { freshStore, iso } from '../store/__helpers__/freshStore.js'

// store をモジュール単位で作り直すため、reminder-sync も毎回読み直す。
async function freshSync(seed) {
  const store = await freshStore(seed)
  const { installReminderSync, reminderKey } = await import('./reminder-sync.js')
  const sync = vi.fn()
  const stop = installReminderSync(sync)
  return { store, sync, stop, reminderKey }
}

describe('ST: 予定日が変わる操作で再同期される', () => {
  it.each([
    ['pump（記録）', (s) => s.pump(iso(2026, 6, 1))],
    ['setInterval（周期変更）', (s) => s.setInterval(28)],
    ['setBikeName（改名＝通知本文が変わる）', (s) => s.setBikeName('通勤号')],
    ['addBike（新しい自転車がアクティブになる）', (s) => s.addBike('サブ車')],
  ])('ST: %s の後に再同期が呼ばれる', async (_label, act) => {
    const { store, sync } = await freshSync()
    act(store)
    expect(sync).toHaveBeenCalledTimes(1)
  })

  it('ST: editHistory で予定日が変わったら再同期される', async () => {
    const { store, sync } = await freshSync()
    store.pump(iso(2026, 6, 1))
    sync.mockClear()
    const id = store.getActiveAirItem(store.getState()).history[0].id
    store.editHistory(id, iso(2026, 6, 10))
    expect(sync).toHaveBeenCalledTimes(1)
  })

  it('ST: removeHistory で予定日が変わったら再同期される', async () => {
    const { store, sync } = await freshSync()
    store.pump(iso(2026, 6, 1))
    store.pump(iso(2026, 6, 10))
    sync.mockClear()
    const newest = store
      .getActiveAirItem(store.getState())
      .history.find((h) => h.date === iso(2026, 6, 10))
    store.removeHistory(newest.id)
    expect(sync).toHaveBeenCalledTimes(1)
  })

  it('ST: 自転車を切り替えたら再同期される（対象の予定日が変わる）', async () => {
    const { store, sync } = await freshSync()
    store.pump(iso(2026, 6, 1))
    const id = store.addBike('サブ車')
    sync.mockClear()
    store.setActiveBike('bike-1')
    expect(sync).toHaveBeenCalledTimes(1)
    sync.mockClear()
    store.setActiveBike(id)
    expect(sync).toHaveBeenCalledTimes(1)
  })

  it('ST: 再同期は必ず userAction:false（catchup の本文が事実と食い違わないように）', async () => {
    const { store, sync } = await freshSync()
    store.pump(iso(2026, 6, 1))
    expect(sync).toHaveBeenCalledWith({ userAction: false })
  })
})

describe('ST-invalid: 予定日が変わらない操作では再同期しない', () => {
  it.each([
    ['setTheme（見た目だけ）', (s) => s.setTheme('dark')],
    ['setPlan（上限だけ）', (s) => s.setPlan('pro')],
  ])('ST-invalid: %s では呼ばれない', async (_label, act) => {
    const { store, sync } = await freshSync()
    act(store)
    expect(sync).not.toHaveBeenCalled()
  })

  it('ST-invalid: 同じ間隔を選び直しても呼ばれない（無駄な貼り直しを避ける）', async () => {
    const { store, sync } = await freshSync()
    store.setInterval(14) // 既定と同じ
    expect(sync).not.toHaveBeenCalled()
  })

  it('ST-invalid: 同じ名前に改名しても呼ばれない', async () => {
    const { store, sync } = await freshSync()
    store.setBikeName('マイバイク') // 既定と同じ
    expect(sync).not.toHaveBeenCalled()
  })

  it('ST-invalid: 拒否された操作（no-op）では呼ばれない', async () => {
    const { store, sync } = await freshSync()
    store.setInterval(0) // 拒否される
    store.editHistory('h-nope', iso(2026, 6, 1)) // 存在しない id
    store.setTheme('blue') // 未知のテーマ
    expect(sync).not.toHaveBeenCalled()
  })

  it('ST-invalid: 購読解除後は呼ばれない', async () => {
    const { store, sync, stop } = await freshSync()
    stop()
    store.pump(iso(2026, 6, 1))
    expect(sync).not.toHaveBeenCalled()
  })
})

describe('reminderKey — 指紋に含める値', () => {
  it('EP: 通知の内容を決める4つ（自転車id・名前・lastReset・間隔）で構成される', async () => {
    const { store, reminderKey } = await freshSync()
    const before = reminderKey()
    store.pump(iso(2026, 6, 1))
    expect(reminderKey()).not.toBe(before)
  })

  it.each([
    ['テーマ', (s) => s.setTheme('light')],
    ['プラン', (s) => s.setPlan('premium')],
  ])('EP: 通知に関係しない %s の変更では指紋が変わらない', async (_label, act) => {
    const { store, reminderKey } = await freshSync()
    const before = reminderKey()
    act(store)
    expect(reminderKey()).toBe(before)
  })

  it('EP: 履歴を足しても最新日が変わらなければ指紋は変わらない', async () => {
    const { store, reminderKey } = await freshSync()
    store.pump(iso(2026, 6, 10))
    const before = reminderKey()
    store.pump(iso(2026, 6, 1)) // 過去日を追加＝lastReset は 6/10 のまま
    expect(reminderKey()).toBe(before)
  })
})
