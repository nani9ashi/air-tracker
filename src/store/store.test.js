import { describe, it, expect, vi } from 'vitest'
import {
  migrate,
  normalize,
  makeDefaultState,
  getLimits,
  normalizePlan,
  PLAN_LIMITS,
} from './store.js'

// ---- フィクスチャ ----
const v2 = (settings) => ({
  version: 2,
  bikes: [
    { id: 'bike-1', name: 'X', items: [{ type: 'air', lastReset: null, intervalDays: 14, history: [] }] },
  ],
  settings: { theme: 'dark', activeBikeId: 'bike-1', ...settings },
})

// state を触るテストは毎回モジュールを作り直し localStorage を初期化して分離する。
async function freshStore(seed) {
  vi.resetModules()
  localStorage.clear()
  if (seed !== undefined) {
    localStorage.setItem('air-tracker:state', typeof seed === 'string' ? seed : JSON.stringify(seed))
  }
  return import('./store.js')
}

// ---- マイグレーション（0-3 の AC 本体） ----
describe('migrate', () => {
  it('不正入力は初期state（v3 / plan free）', () => {
    for (const bad of [null, undefined, 42, 'x']) {
      expect(migrate(bad)).toEqual(makeDefaultState())
    }
    expect(makeDefaultState().version).toBe(3)
    expect(makeDefaultState().settings.plan).toBe('free')
  })

  it('v1フラット → v3（intervalDays 移植・history 正規化・plan free）', () => {
    const r = migrate({
      lastPump: '2026-06-01T12:00:00.000Z',
      intervalDays: 21,
      history: ['2026-05-01T12:00:00.000Z'],
    })
    const item = r.bikes[0].items[0]
    expect(r.version).toBe(3)
    expect(item.intervalDays).toBe(21)
    expect(item.lastReset).toBe('2026-06-01T12:00:00.000Z')
    expect(item.history).toHaveLength(1)
    expect(item.history[0].date).toBe('2026-05-01T12:00:00.000Z')
    expect(item.history[0].id).toBeTruthy()
    expect(r.settings.plan).toBe('free')
    expect('isPremium' in r.settings).toBe(false)
  })

  it('v2 → v3: isPremium:true → plan pro（theme 保持・isPremium 除去）', () => {
    const r = migrate(v2({ isPremium: true }))
    expect(r.version).toBe(3)
    expect(r.settings.plan).toBe('pro')
    expect(r.settings.theme).toBe('dark')
    expect('isPremium' in r.settings).toBe(false)
  })

  it('v2 → v3: isPremium:false → plan free', () => {
    expect(migrate(v2({ isPremium: false })).settings.plan).toBe('free')
  })

  it('v2 で settings 欠落 → plan free ＋ 既定補完', () => {
    const r = migrate({
      version: 2,
      bikes: [{ id: 'bike-1', name: 'X', items: [{ type: 'air', lastReset: null, intervalDays: 14, history: [] }] }],
    })
    expect(r.settings.plan).toBe('free')
    expect(r.settings.activeBikeId).toBe('bike-1')
  })

  it('既存 v3 はパススルー（plan 維持）', () => {
    const r = migrate({
      version: 3,
      bikes: [{ id: 'bike-1', name: 'X', items: [{ type: 'air', lastReset: null, intervalDays: 14, history: [] }] }],
      settings: { theme: 'light', plan: 'pro', activeBikeId: 'bike-1' },
    })
    expect(r.version).toBe(3)
    expect(r.settings.plan).toBe('pro')
  })
})

describe('normalize', () => {
  it('冪等: normalize(normalize(x)) === normalize(x)', () => {
    const input = v2({ isPremium: true })
    input.bikes[0].items[0].history = [{ id: 'h1', date: '2026-06-01T12:00:00.000Z' }]
    const once = normalize(input)
    const twice = normalize(once)
    expect(twice).toEqual(once)
    expect('isPremium' in twice.settings).toBe(false)
  })

  it('未知 plan は free に矯正', () => {
    const r = normalize({
      version: 3,
      bikes: [{ id: 'bike-1', name: 'X', items: [{ type: 'air', lastReset: null, intervalDays: 14, history: [] }] }],
      settings: { plan: 'gold', activeBikeId: 'bike-1' },
    })
    expect(r.settings.plan).toBe('free')
  })
})

// ---- プランゲート判定 ----
describe('getLimits / normalizePlan', () => {
  it('free の上限', () => {
    expect(getLimits({ settings: { plan: 'free' } })).toEqual({
      bikes: 1, history: 3, heatmapWeeks: 5, customCycle: false, backup: false,
    })
  })
  it('pro の上限（履歴全件・全期間・カスタム/バックアップ可・台数は1）', () => {
    expect(getLimits({ settings: { plan: 'pro' } })).toEqual({
      bikes: 1, history: Infinity, heatmapWeeks: 'auto', customCycle: true, backup: true,
    })
  })
  it('premium は複数台可', () => {
    expect(getLimits({ settings: { plan: 'premium' } }).bikes).toBe(Infinity)
  })
  it('壊れた入力は free 上限', () => {
    expect(getLimits({})).toBe(PLAN_LIMITS.free)
    expect(getLimits({ settings: { plan: 'nope' } })).toBe(PLAN_LIMITS.free)
  })
  it('normalizePlan: 正常はそのまま / 異常は free', () => {
    expect(normalizePlan('pro')).toBe('pro')
    for (const bad of ['bogus', '', null, undefined]) expect(normalizePlan(bad)).toBe('free')
  })
})

// ---- pump は履歴を削除しない（0-2） ----
describe('pump', () => {
  it('無料でも5回で5件残る（truncate しない）', async () => {
    const s = await freshStore()
    for (let i = 0; i < 5; i++) s.pump(new Date(2026, 5, i + 1, 12).toISOString())
    expect(s.getActiveAirItem(s.getState()).history).toHaveLength(5)
  })
  it('lastReset は最新日', async () => {
    const s = await freshStore()
    s.pump('2026-06-01T12:00:00.000Z')
    s.pump('2026-06-10T12:00:00.000Z')
    s.pump('2026-06-05T12:00:00.000Z')
    expect(s.getActiveAirItem(s.getState()).lastReset).toBe('2026-06-10T12:00:00.000Z')
  })
})

// ---- setPlan ----
describe('setPlan', () => {
  it('正常値を設定 / 未知値は free に矯正', async () => {
    const s = await freshStore()
    s.setPlan('pro')
    expect(s.getState().settings.plan).toBe('pro')
    s.setPlan('bogus')
    expect(s.getState().settings.plan).toBe('free')
  })
  it('bikes/history は変更しない', async () => {
    const s = await freshStore()
    s.pump('2026-06-01T12:00:00.000Z')
    const len = s.getActiveAirItem(s.getState()).history.length
    s.setPlan('premium')
    expect(s.getActiveAirItem(s.getState()).history.length).toBe(len)
    expect(s.getState().bikes).toHaveLength(1)
  })
})

// ---- import / export ----
describe('importJSON / exportJSON', () => {
  it('往復で state が安定（v3）', async () => {
    const s = await freshStore()
    s.setPlan('pro')
    s.pump('2026-06-01T12:00:00.000Z')
    const snapshot = s.exportJSON()
    const before = s.getState()
    expect(s.importJSON(snapshot)).toEqual({ ok: true })
    expect(s.getState()).toEqual(before)
  })
  it('v2(isPremium:true) の import → plan pro ＋ isPremium 無し', async () => {
    const s = await freshStore()
    expect(s.importJSON(JSON.stringify(v2({ isPremium: true })))).toEqual({ ok: true })
    expect(s.getState().settings.plan).toBe('pro')
    expect('isPremium' in s.getState().settings).toBe(false)
  })
  it('不正 JSON / 非対応形式はエラー', async () => {
    const s = await freshStore()
    expect(s.importJSON('not json')).toEqual({ ok: false, error: 'JSONを読み取れませんでした' })
    expect(s.importJSON('{"foo":1}')).toEqual({ ok: false, error: '対応していないデータ形式です' })
  })
  it('export は plan を含み isPremium を含まない', async () => {
    const s = await freshStore(v2({ isPremium: true }))
    const json = s.exportJSON()
    expect(json).toContain('"plan"')
    expect(json).not.toContain('isPremium')
  })
})
