// ============================================================
// store.js（ミューテータ）— ISTQB 状態遷移テスト + 無効遷移マトリクス + 入力 BVA
// 設計書: docs/test-design-istqb.md §4
//
// 既存の store.test.js は migrate/plan/import を扱う。本ファイルは
// 「状態を変えるAPI」に絞り、有効遷移(0-switch)と無効遷移の全セルを埋める。
// setInterval / setBikeName / setTheme / addBike / removeBike / setActiveBike は
// これまでテストが1件も無かった。
// ============================================================
import { describe, it, expect, vi } from 'vitest'
import { getActiveBike, getActiveAirItem } from './store.js'
import { freshStore, readPersisted, iso } from './__helpers__/freshStore.js'

// 現在のアクティブ air item / bike を都度引くための小道具
const air = (s) => s.getActiveAirItem(s.getState())
const bike = (s) => s.getActiveBike(s.getState())

// ------------------------------------------------------------
// §4-1 記録状態のライフサイクル
//   未記録(lastReset=null) --pump--> 記録あり --removeHistory(最後の1件)--> 未記録
// ------------------------------------------------------------
describe('ST: 記録状態のライフサイクル（0-switch）', () => {
  it('ST: 初期状態は「未記録」', async () => {
    const s = await freshStore()
    expect(air(s).lastReset).toBeNull()
    expect(air(s).history).toEqual([])
    expect(air(s).intervalDays).toBe(14)
  })

  it('ST: 未記録 --pump--> 記録あり', async () => {
    const s = await freshStore()
    s.pump(iso(2026, 6, 1))
    expect(air(s).lastReset).toBe(iso(2026, 6, 1))
    expect(air(s).history).toHaveLength(1)
  })

  it('ST: 記録あり --pump--> 記録あり（lastReset は最新日を採用）', async () => {
    const s = await freshStore()
    s.pump(iso(2026, 6, 1))
    s.pump(iso(2026, 6, 10))
    s.pump(iso(2026, 6, 5)) // 過去日を後から追加しても最新は 6/10
    expect(air(s).lastReset).toBe(iso(2026, 6, 10))
    expect(air(s).history).toHaveLength(3)
  })

  it('ST: 記録あり --removeHistory(最後の1件)--> 未記録（往復遷移）', async () => {
    const s = await freshStore()
    s.pump(iso(2026, 6, 1))
    s.removeHistory(air(s).history[0].id)
    expect(air(s).lastReset).toBeNull()
    expect(air(s).history).toEqual([])
  })

  it('ST: 未記録 --pump--> 記録あり --全削除--> 未記録 --pump--> 記録あり（1-switch）', async () => {
    const s = await freshStore()
    s.pump(iso(2026, 6, 1))
    s.pump(iso(2026, 6, 8))
    for (const h of [...air(s).history]) s.removeHistory(h.id)
    expect(air(s).lastReset).toBeNull()
    s.pump(iso(2026, 7, 1))
    expect(air(s).lastReset).toBe(iso(2026, 7, 1))
    expect(air(s).history).toHaveLength(1)
  })

  it('ST: 記録あり --removeHistory(複数のうち1件)--> 記録あり（lastReset 再計算）', async () => {
    const s = await freshStore()
    s.pump(iso(2026, 6, 1))
    s.pump(iso(2026, 6, 10))
    const newest = air(s).history.find((x) => x.date === iso(2026, 6, 10))
    s.removeHistory(newest.id)
    expect(air(s).lastReset).toBe(iso(2026, 6, 1))
    expect(air(s).history).toHaveLength(1)
  })

  it('ST: 記録あり --editHistory--> 記録あり（最新を過去へずらすと lastReset が別レコードへ移る）', async () => {
    const s = await freshStore()
    s.pump(iso(2026, 6, 1))
    s.pump(iso(2026, 6, 10))
    const newest = air(s).history.find((x) => x.date === iso(2026, 6, 10))
    s.editHistory(newest.id, iso(2026, 5, 20))
    expect(air(s).lastReset).toBe(iso(2026, 6, 1))
    expect(air(s).history).toHaveLength(2)
  })

  it('ST: editHistory で最古を未来へずらすと lastReset がそれに移る', async () => {
    const s = await freshStore()
    s.pump(iso(2026, 6, 1))
    s.pump(iso(2026, 6, 10))
    const oldest = air(s).history.find((x) => x.date === iso(2026, 6, 1))
    s.editHistory(oldest.id, iso(2026, 7, 1))
    expect(air(s).lastReset).toBe(iso(2026, 7, 1))
  })

  it('ST: pump は引数省略で「今日」を記録する', async () => {
    const s = await freshStore()
    const before = Date.now()
    s.pump()
    const t = new Date(air(s).lastReset).getTime()
    expect(t).toBeGreaterThanOrEqual(before)
    expect(t).toBeLessThanOrEqual(Date.now())
  })

  it('ST: 履歴の id は一意（同じ日付を連続 pump しても衝突しない）', async () => {
    const s = await freshStore()
    for (let i = 0; i < 20; i++) s.pump(iso(2026, 6, 1))
    const ids = air(s).history.map((h) => h.id)
    expect(new Set(ids).size).toBe(20)
  })
})

// ------------------------------------------------------------
// §4-1 無効遷移マトリクス（拒否されること）
// ------------------------------------------------------------
describe('ST-invalid: 記録操作の無効遷移', () => {
  it.each([
    ['未記録の状態で removeHistory', async (s) => s.removeHistory('h-nope')],
    ['未記録の状態で editHistory', async (s) => s.editHistory('h-nope', iso(2026, 6, 1))],
  ])('ST-invalid: %s → no-op（未記録のまま）', async (_label, act) => {
    const s = await freshStore()
    await act(s)
    expect(air(s).lastReset).toBeNull()
    expect(air(s).history).toEqual([])
  })

  it.each([
    ['存在しない id で removeHistory', (s) => s.removeHistory('h-nope')],
    ['存在しない id で editHistory', (s) => s.editHistory('h-nope', iso(2026, 7, 1))],
    ['id が空文字の editHistory', (s) => s.editHistory('', iso(2026, 7, 1))],
    ['id が null の editHistory', (s) => s.editHistory(null, iso(2026, 7, 1))],
    ['id が undefined の removeHistory', (s) => s.removeHistory(undefined)],
  ])('ST-invalid: 記録ありの状態で %s → 状態が変わらない', async (_label, act) => {
    const s = await freshStore()
    s.pump(iso(2026, 6, 1))
    const before = JSON.stringify(s.getState())
    act(s)
    expect(JSON.stringify(s.getState())).toBe(before)
  })

  it.each([
    ['dateISO が空文字', ''],
    ['dateISO が null', null],
    ['dateISO が undefined', undefined],
  ])('ST-invalid: editHistory の %s は拒否される', async (_label, bad) => {
    const s = await freshStore()
    s.pump(iso(2026, 6, 1))
    const id = air(s).history[0].id
    s.editHistory(id, bad)
    expect(air(s).history[0].date).toBe(iso(2026, 6, 1))
    expect(air(s).lastReset).toBe(iso(2026, 6, 1))
  })

  // ※Findings #3: editHistory は日付形式を検証しないため、不正文字列がそのまま保存され、
  //   recomputeLastReset の文字列ソートを通じて lastReset まで壊れる。現行挙動を固定する。
  it('ST-invalid: editHistory は不正な日付文字列を検証せず素通しする（※Findings #3）', async () => {
    const s = await freshStore()
    s.pump(iso(2026, 6, 1))
    const id = air(s).history[0].id
    s.editHistory(id, 'ゴミ文字列')
    expect(air(s).history[0].date).toBe('ゴミ文字列')
    expect(air(s).lastReset).toBe('ゴミ文字列') // 文字列ソートの結果そのまま lastReset に載る
  })

  it('ST-invalid: 無効な操作では購読者に通知されない', async () => {
    const s = await freshStore()
    s.pump(iso(2026, 6, 1))
    const listener = vi.fn()
    const unsubscribe = s.subscribe(listener)
    s.removeHistory('h-nope')
    s.editHistory('h-nope', iso(2026, 7, 1))
    s.editHistory('', iso(2026, 7, 1))
    expect(listener).not.toHaveBeenCalled()
    s.pump(iso(2026, 6, 2)) // 有効な操作では通知される
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
    s.pump(iso(2026, 6, 3))
    expect(listener).toHaveBeenCalledTimes(1) // 解除後は届かない
  })
})

// ------------------------------------------------------------
// §4-2 自転車のライフサイクル + 無効遷移マトリクス
// ------------------------------------------------------------
describe('ST: 自転車のライフサイクル', () => {
  it('ST: 1台 --addBike--> 複数台（新規がアクティブになる）', async () => {
    const s = await freshStore()
    const id = s.addBike('サブ車')
    expect(s.getState().bikes).toHaveLength(2)
    expect(s.getState().settings.activeBikeId).toBe(id)
    expect(bike(s).name).toBe('サブ車')
  })

  it('ST: 追加した自転車は未記録・14日・履歴空で始まる', async () => {
    const s = await freshStore()
    s.pump(iso(2026, 6, 1))
    s.addBike('サブ車')
    expect(air(s)).toMatchObject({ type: 'air', lastReset: null, intervalDays: 14, history: [] })
  })

  it('ST: 複数台 --removeBike(アクティブ)--> 先頭がアクティブになる', async () => {
    const s = await freshStore()
    const id = s.addBike('サブ車')
    s.removeBike(id)
    expect(s.getState().bikes).toHaveLength(1)
    expect(s.getState().settings.activeBikeId).toBe('bike-1')
  })

  it('ST: 複数台 --removeBike(非アクティブ)--> アクティブは維持される', async () => {
    const s = await freshStore()
    const id = s.addBike('サブ車') // これがアクティブ
    s.removeBike('bike-1')
    expect(s.getState().bikes).toHaveLength(1)
    expect(s.getState().settings.activeBikeId).toBe(id)
  })

  it('ST: 複数台 --setActiveBike--> 切り替わり、記録は自転車ごとに独立', async () => {
    const s = await freshStore()
    s.pump(iso(2026, 6, 1)) // bike-1 に記録
    const id = s.addBike('サブ車')
    expect(air(s).lastReset).toBeNull() // サブ車は未記録
    s.pump(iso(2026, 6, 20)) // サブ車に記録
    s.setActiveBike('bike-1')
    expect(air(s).lastReset).toBe(iso(2026, 6, 1)) // bike-1 の記録は無傷
    s.setActiveBike(id)
    expect(air(s).lastReset).toBe(iso(2026, 6, 20))
  })

  it('ST: 3台に増やして真ん中を消しても他は無傷', async () => {
    const s = await freshStore()
    const b2 = s.addBike('2号')
    const b3 = s.addBike('3号')
    s.removeBike(b2)
    expect(s.getState().bikes.map((b) => b.id)).toEqual(['bike-1', b3])
    expect(s.getState().settings.activeBikeId).toBe(b3)
  })

  it.each([
    ['空文字', '', 'マイバイク'],
    ['空白のみ', '   ', 'マイバイク'],
    ['null', null, 'マイバイク'],
    ['undefined', undefined, 'マイバイク'],
    ['前後空白は trim', '  サブ車  ', 'サブ車'],
    ['通常名', 'サブ車', 'サブ車'],
  ])('EP: addBike の名前 %s → %s', async (_label, input, expected) => {
    const s = await freshStore()
    s.addBike(input)
    expect(bike(s).name).toBe(expected)
  })

  it('EP: addBike は毎回異なる id を返す', async () => {
    const s = await freshStore()
    const ids = [s.addBike('a'), s.addBike('b'), s.addBike('c')]
    expect(new Set(ids).size).toBe(3)
  })
})

describe('ST-invalid: 自転車操作の無効遷移', () => {
  it('ST-invalid: 1台 --removeBike--> no-op（最後の1台は消せない）', async () => {
    const s = await freshStore()
    s.removeBike('bike-1')
    expect(s.getState().bikes).toHaveLength(1)
    expect(s.getState().settings.activeBikeId).toBe('bike-1')
  })

  it.each([
    ['1台のとき', 0],
    ['複数台のとき', 1],
  ])('ST-invalid: %s に存在しない id で removeBike → no-op', async (_label, extra) => {
    const s = await freshStore()
    for (let i = 0; i < extra; i++) s.addBike(`追加${i}`)
    const before = JSON.stringify(s.getState())
    s.removeBike('bike-nope')
    expect(JSON.stringify(s.getState())).toBe(before)
  })

  it.each([
    ['存在しない id', 'bike-nope'],
    ['空文字', ''],
    ['null', null],
    ['undefined', undefined],
  ])('ST-invalid: setActiveBike に %s → no-op', async (_label, bad) => {
    const s = await freshStore()
    s.addBike('サブ車')
    const before = s.getState().settings.activeBikeId
    s.setActiveBike(bad)
    expect(s.getState().settings.activeBikeId).toBe(before)
  })

  it('ST-invalid: 1台のときに自分自身へ setActiveBike しても壊れない', async () => {
    const s = await freshStore()
    s.setActiveBike('bike-1')
    expect(s.getState().settings.activeBikeId).toBe('bike-1')
    expect(s.getState().bikes).toHaveLength(1)
  })

  // store 層はプラン上限を強制しない。ゲートは UI 層のみ
  // （BikeSheet.jsx:19 / SettingsScreen.jsx:35）。この設計を明示的に固定する。
  it.each([['free'], ['pro'], ['premium']])(
    'ST: store は plan=%s でも addBike を拒否しない（上限は UI 層のゲート）',
    async (plan) => {
      const s = await freshStore()
      s.setPlan(plan)
      s.addBike('2台目')
      expect(s.getState().bikes).toHaveLength(2)
      expect(s.getLimits(s.getState()).bikes).toBe(plan === 'premium' ? Infinity : 1)
    },
  )
})

// ------------------------------------------------------------
// §4-3 セッター入力の EP / BVA
// ------------------------------------------------------------
describe('setInterval — BVA', () => {
  it.each([
    ['1（下限ちょうど）', 1, 1],
    ['1.4 → round で 1', 1.4, 1],
    ['1.5 → round で 2', 1.5, 2],
    ['2.5 → round で 3', 2.5, 3],
    ['7（最短プリセット）', 7, 7],
    ['14（既定）', 14, 14],
    ['21', 21, 21],
    ['28（最長プリセット）', 28, 28],
    ["'21'（数値文字列）", '21', 21],
    ['365（長期でも通る）', 365, 365],
    ['true → Number(true)=1', true, 1],
  ])('BVA: setInterval(%s) は %i を採用', async (_label, input, expected) => {
    const s = await freshStore()
    s.setInterval(input)
    expect(air(s).intervalDays).toBe(expected)
  })

  it.each([
    ['0（下限の外）', 0],
    ['0.9（下限直下）', 0.9],
    ['0.4（round しても 0）', 0.4],
    ['-1（負）', -1],
    ['-14', -14],
    ['NaN', NaN],
    ["'abc'", 'abc'],
    ['空文字', ''],
    ['null', null],
    ['undefined', undefined],
    ['Infinity', Infinity],
    ['-Infinity', -Infinity],
    ['配列', []],
    ['オブジェクト', {}],
  ])('BVA: setInterval(%s) は拒否され 14 のまま', async (_label, bad) => {
    const s = await freshStore()
    s.setInterval(bad)
    expect(air(s).intervalDays).toBe(14)
  })

  it('BVA: 拒否された setInterval では購読者に通知されず localStorage も変わらない', async () => {
    const s = await freshStore()
    const listener = vi.fn()
    s.subscribe(listener)
    const before = JSON.stringify(readPersisted())
    s.setInterval(0)
    expect(listener).not.toHaveBeenCalled()
    expect(JSON.stringify(readPersisted())).toBe(before)
  })

  it('BVA: setInterval は履歴と lastReset を変えない', async () => {
    const s = await freshStore()
    s.pump(iso(2026, 6, 1))
    s.setInterval(28)
    expect(air(s).lastReset).toBe(iso(2026, 6, 1))
    expect(air(s).history).toHaveLength(1)
  })
})

describe('setBikeName — EP', () => {
  it.each([
    ['通常名', 'ロードバイク', 'ロードバイク'],
    ['前後空白は trim', '  ロードバイク  ', 'ロードバイク'],
    ['空文字 → 既定名', '', 'マイバイク'],
    ['空白のみ → 既定名', '   ', 'マイバイク'],
    ['タブ・改行のみ → 既定名', '\t\n ', 'マイバイク'],
    ['null → 既定名', null, 'マイバイク'],
    ['undefined → 既定名', undefined, 'マイバイク'],
    ['0（falsy）→ 既定名', 0, 'マイバイク'],
    ['数値は文字列化', 123, '123'],
    ['1文字', 'A', 'A'],
    ['絵文字を含む', '🚲 通勤号', '🚲 通勤号'],
  ])('EP: setBikeName(%s) → %s', async (_label, input, expected) => {
    const s = await freshStore()
    s.setBikeName(input)
    expect(bike(s).name).toBe(expected)
  })

  it('EP: 長い名前も切り詰められない（上限は未定義）', async () => {
    const s = await freshStore()
    const long = 'あ'.repeat(200)
    s.setBikeName(long)
    expect(bike(s).name).toBe(long)
  })

  it('EP: 改名してもアクティブな自転車だけが変わる', async () => {
    const s = await freshStore()
    s.addBike('サブ車')
    s.setBikeName('改名後')
    expect(s.getState().bikes.map((b) => b.name)).toEqual(['マイバイク', '改名後'])
  })
})

describe('setTheme — EP', () => {
  it.each([['auto'], ['dark'], ['light']])('EP: setTheme(%s) は採用される', async (mode) => {
    const s = await freshStore()
    s.setTheme(mode)
    expect(s.getState().settings.theme).toBe(mode)
  })

  it.each([
    ["'blue'（未知の値）", 'blue'],
    ["'DARK'（大文字＝別値）", 'DARK'],
    ['空文字', ''],
    ['null', null],
    ['undefined', undefined],
    ['数値', 0],
    ['配列', []],
  ])('EP: setTheme(%s) は拒否され auto のまま', async (_label, bad) => {
    const s = await freshStore()
    s.setTheme(bad)
    expect(s.getState().settings.theme).toBe('auto')
  })

  it('EP: 拒否された setTheme では購読者に通知されない', async () => {
    const s = await freshStore()
    const listener = vi.fn()
    s.subscribe(listener)
    s.setTheme('blue')
    expect(listener).not.toHaveBeenCalled()
  })
})

// ------------------------------------------------------------
// §4-4 永続化とセレクタ
// ------------------------------------------------------------
describe('永続化', () => {
  it('ST: 主要な4操作（pump / setInterval / setBikeName / setTheme）が localStorage に反映される', async () => {
    const s = await freshStore()
    s.pump(iso(2026, 6, 1))
    s.setInterval(21)
    s.setBikeName('通勤号')
    s.setTheme('dark')
    const saved = readPersisted()
    expect(saved.version).toBe(3)
    expect(saved.bikes[0].name).toBe('通勤号')
    expect(saved.bikes[0].items[0].intervalDays).toBe(21)
    expect(saved.bikes[0].items[0].lastReset).toBe(iso(2026, 6, 1))
    expect(saved.settings.theme).toBe('dark')
  })

  it('ST: 保存内容は再読み込み後も復元される', async () => {
    const first = await freshStore()
    first.pump(iso(2026, 6, 1))
    first.setInterval(28)
    const saved = readPersisted()

    const second = await freshStore(saved)
    expect(air(second).lastReset).toBe(iso(2026, 6, 1))
    expect(air(second).intervalDays).toBe(28)
  })
})

describe('セレクタのフォールバック — EP', () => {
  it('EP: activeBikeId が実在しない state でも先頭の自転車を返す', () => {
    const s = {
      bikes: [{ id: 'a', name: 'A', items: [{ type: 'air' }] }],
      settings: { activeBikeId: 'ghost' },
    }
    expect(getActiveBike(s).id).toBe('a')
  })

  it("EP: type:'air' の item が無ければ先頭の item を返す", () => {
    const s = {
      bikes: [{ id: 'a', name: 'A', items: [{ type: 'chain', intervalDays: 30 }] }],
      settings: { activeBikeId: 'a' },
    }
    expect(getActiveAirItem(s).type).toBe('chain')
  })

  it("EP: 複数 item があれば type:'air' を選ぶ", () => {
    const s = {
      bikes: [
        { id: 'a', name: 'A', items: [{ type: 'chain' }, { type: 'air', intervalDays: 14 }] },
      ],
      settings: { activeBikeId: 'a' },
    }
    expect(getActiveAirItem(s).type).toBe('air')
  })
})
