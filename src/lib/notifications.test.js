// ============================================================
// notifications.test.js — native ラッパの配線を vi.mock で固定する。
// docs/test-completion-report.md §10 項目8「cancel→schedule の順序と引数を固定」。
//
// 方針:
//   - @capacitor/* と store.js はモック（native の存在と state を差し替える）
//   - notify-plan.js は**実物**のまま。ここを差し替えると「どの通知が出るか」の
//     結び付きが切れ、ラッパだけが正しいという無意味なテストになる
//   - NATIVE は notifications.js のロード時に確定するので、vi.mock の巻き上げ
//     （静的 import より前に評価される）に頼れば静的 import で足りる
// ============================================================
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ⚠ vi.mock はファイル先頭へ巻き上げられるので、ファクトリが参照するものは
//   すべて vi.hoisted で作る。素の const にすると TDZ で
//   「Cannot access 'cancel' before initialization」になる。
const { cancel, schedule, checkPermissions, requestPermissions, fx } = vi.hoisted(() => ({
  cancel: vi.fn(),
  schedule: vi.fn(),
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  fx: { bike: null, item: null },
}))

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }))
vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: { cancel, schedule, checkPermissions, requestPermissions },
}))
vi.mock('../store/store.js', () => ({
  getState: () => ({}),
  getActiveBike: () => fx.bike,
  getActiveAirItem: () => fx.item,
}))

import { syncActiveReminder, requestPermissionAfterReset, isNotificationEnabled } from './notifications.js'

// 2026-06-01 に空気入れ、14日間隔 → 予定日 6/15、前夜通知 6/14 20:00、念押し 6/17 20:00。
const RESET = new Date(2026, 5, 1, 12).toISOString()
const granted = () => checkPermissions.mockResolvedValue({ display: 'granted' })

beforeEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
  cancel.mockResolvedValue(undefined)
  schedule.mockResolvedValue(undefined)
  requestPermissions.mockResolvedValue({ display: 'denied' })
  fx.bike = { id: 'bike-1', name: '通勤号' }
  fx.item = { lastReset: RESET, intervalDays: 14 }
  granted()
})

// 予定日より十分前の「現在」に固定する（primary/renudge の両方が未来）。
const atSafeNow = () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 5, 2, 9))
}

describe('syncActiveReminder — cancel / schedule の配線', () => {
  it('cancel は schedule より先に呼ばれる（多重・古い予約を残さない）', async () => {
    atSafeNow()
    await syncActiveReminder()
    expect(cancel).toHaveBeenCalledOnce()
    expect(schedule).toHaveBeenCalledOnce()
    expect(cancel.mock.invocationCallOrder[0]).toBeLessThan(schedule.mock.invocationCallOrder[0])
  })

  it('cancel は primary / renudge の両スロットを消す', async () => {
    atSafeNow()
    await syncActiveReminder()
    const ids = cancel.mock.calls[0][0].notifications.map((n) => n.id)
    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2) // スロットが衝突していない
    for (const id of ids) {
      expect(Number.isInteger(id)).toBe(true)
      expect(id).toBeGreaterThan(0)
      expect(id).toBeLessThan(2 ** 31) // 32bit 正整数
    }
  })

  it('ID は自転車ごとに安定かつ異なる', async () => {
    atSafeNow()
    await syncActiveReminder()
    const first = cancel.mock.calls[0][0].notifications.map((n) => n.id)

    cancel.mockClear()
    await syncActiveReminder()
    expect(cancel.mock.calls[0][0].notifications.map((n) => n.id)).toEqual(first) // 安定

    cancel.mockClear()
    fx.bike = { id: 'bike-2', name: '週末号' }
    await syncActiveReminder()
    const second = cancel.mock.calls[0][0].notifications.map((n) => n.id)
    expect(second).not.toEqual(first) // 自転車をまたいで衝突しない
  })

  it('schedule のペイロードに allowWhileIdle と smallIcon が乗る', async () => {
    atSafeNow()
    await syncActiveReminder()
    const notifs = schedule.mock.calls[0][0].notifications
    expect(notifs).toHaveLength(2) // primary + renudge
    for (const n of notifs) {
      // allowWhileIdle → プラグインが setAndAllowWhileIdle を使う。Doze 中でも届く。
      // これが落ちると v2.1.3 の修正が無言で失われる。
      expect(n.schedule).toMatchObject({ allowWhileIdle: true })
      expect(n.schedule.at).toBeInstanceOf(Date)
      expect(n.smallIcon).toBe('ic_stat_quuki')
      expect(n.title).toBeTruthy()
      expect(n.body).toContain('通勤号')
    }
  })

  it('schedule の id は cancel した ID の部分集合（消してから同じ枠に貼る）', async () => {
    atSafeNow()
    await syncActiveReminder()
    const cancelled = cancel.mock.calls[0][0].notifications.map((n) => n.id)
    for (const n of schedule.mock.calls[0][0].notifications) {
      expect(cancelled).toContain(n.id)
    }
  })

  it('catchup は primary と同じスロット（置換であって追加ではない）', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 5, 20, 9)) // 予定日 6/15 も念押し 6/17 も過ぎた
    await syncActiveReminder({ userAction: true })

    const notifs = schedule.mock.calls[0][0].notifications
    expect(notifs).toHaveLength(1)
    const cancelled = cancel.mock.calls[0][0].notifications.map((n) => n.id)
    expect(notifs[0].id).toBe(cancelled[0]) // primary スロット
  })
})

describe('syncActiveReminder — 出さない経路', () => {
  it('未記録（plan が空）なら cancel はするが schedule はしない', async () => {
    // ⚠ ここが「リマインダーが無言で止まる」経路（docs §5 M16）。
    fx.item = { lastReset: null, intervalDays: 14 }
    await syncActiveReminder()
    expect(cancel).toHaveBeenCalledOnce()
    expect(schedule).not.toHaveBeenCalled()
  })

  it('超過かつ userAction=false なら再登録しない（起動時に過去分を張らない）', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 5, 20, 9))
    await syncActiveReminder({ userAction: false })
    expect(cancel).toHaveBeenCalledOnce()
    expect(schedule).not.toHaveBeenCalled()
  })

  it.each(['denied', 'prompt', 'prompt-with-rationale'])(
    '権限が %s なら cancel も schedule もしない（プロンプトも出さない）',
    async (display) => {
      checkPermissions.mockResolvedValue({ display })
      await syncActiveReminder()
      expect(cancel).not.toHaveBeenCalled()
      expect(schedule).not.toHaveBeenCalled()
      expect(requestPermissions).not.toHaveBeenCalled()
    },
  )
})

describe('syncActiveReminder — 失敗してもアプリを壊さない', () => {
  it('schedule が reject しても解決し、warn するだけ', async () => {
    atSafeNow()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    schedule.mockRejectedValueOnce(new Error('boom'))
    await expect(syncActiveReminder()).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('checkPermissions が reject しても解決する', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    checkPermissions.mockRejectedValueOnce(new Error('boom'))
    await expect(syncActiveReminder()).resolves.toBeUndefined()
    expect(schedule).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('requestPermissionAfterReset', () => {
  it('許可済みなら userAction=true で再スケジュール（超過ならキャッチアップ）', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 5, 20, 9)) // 超過中
    await requestPermissionAfterReset()
    // userAction=true が渡っていなければ schedule は呼ばれない（上の「出さない経路」参照）
    expect(schedule).toHaveBeenCalledOnce()
    expect(schedule.mock.calls[0][0].notifications[0].title).toBe('空気入れの時期になりました')
  })

  it('未確定なら要求し、拒否されたらスケジュールしない', async () => {
    checkPermissions.mockResolvedValue({ display: 'prompt' })
    requestPermissions.mockResolvedValue({ display: 'denied' })
    await requestPermissionAfterReset()
    expect(requestPermissions).toHaveBeenCalledOnce()
    expect(schedule).not.toHaveBeenCalled()
  })

  it('許可済みなら要求を重ねて出さない', async () => {
    atSafeNow()
    await requestPermissionAfterReset()
    expect(requestPermissions).not.toHaveBeenCalled()
    expect(schedule).toHaveBeenCalledOnce()
  })
})

describe('isNotificationEnabled', () => {
  it('granted で true / それ以外と例外で false', async () => {
    await expect(isNotificationEnabled()).resolves.toBe(true)
    checkPermissions.mockResolvedValue({ display: 'denied' })
    await expect(isNotificationEnabled()).resolves.toBe(false)
    checkPermissions.mockRejectedValueOnce(new Error('boom'))
    await expect(isNotificationEnabled()).resolves.toBe(false)
  })
})
