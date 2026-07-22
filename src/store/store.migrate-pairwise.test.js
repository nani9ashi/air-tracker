// ============================================================
// store.js（migrate / normalize / load / importJSON）
//   — ISTQB 同値分割(EP) + ペアワイズ(組合せ)テスト
// 設計書: docs/test-design-istqb.md §5
//
// 既存の store.test.js は代表的な移行パスを押さえている。本ファイルは
// (a) バージョン振り分けの全パーティション、(b) 欠損データ補完のペアワイズ、
// (c) 保存データ読み込み経路、(d) importJSON の無効入力を埋める。
// ============================================================
import { describe, it, expect, vi } from 'vitest'
import { migrate, normalize, makeDefaultState, PLANS } from './store.js'
import { freshStore, readPersisted, iso, STORAGE_KEY, LEGACY_KEY } from './__helpers__/freshStore.js'

const A = iso(2026, 6, 1)
const B = iso(2026, 6, 15)

const air = (s) => s.getActiveAirItem(s.getState())

const validBikes = () => [
  { id: 'bike-1', name: '通勤号', items: [{ type: 'air', lastReset: B, intervalDays: 21, history: [{ id: 'h1', date: A }] }] },
]

// ------------------------------------------------------------
// §5-1 バージョン振り分けの EP
// ------------------------------------------------------------
describe('migrate — バージョン振り分けの EP', () => {
  it('EP: version=3 + bikes配列 → normalize を通る（plan 維持）', () => {
    const r = migrate({ version: 3, bikes: validBikes(), settings: { plan: 'premium', activeBikeId: 'bike-1' } })
    expect(r.version).toBe(3)
    expect(r.settings.plan).toBe('premium')
    expect(r.bikes[0].items[0].intervalDays).toBe(21)
  })

  it('EP: version=2 + bikes配列 → v3 化（isPremium→plan）', () => {
    const r = migrate({ version: 2, bikes: validBikes(), settings: { isPremium: true } })
    expect(r.version).toBe(3)
    expect(r.settings.plan).toBe('pro')
    expect('isPremium' in r.settings).toBe(false)
  })

  it.each([
    ['lastPump のみ', { lastPump: B }],
    ['intervalDays のみ', { intervalDays: 28 }],
    ['history のみ', { history: [A] }],
    ['3点セット', { lastPump: B, intervalDays: 7, history: [A, B] }],
  ])('EP: v1 フラット形式(%s) → 移植される', (_label, raw) => {
    const r = migrate(raw)
    const item = r.bikes[0].items[0]
    expect(r.version).toBe(3)
    expect(r.settings.plan).toBe('free')
    if (raw.lastPump) expect(item.lastReset).toBe(raw.lastPump)
    if (raw.intervalDays) expect(item.intervalDays).toBe(raw.intervalDays)
    expect(item.history).toHaveLength(raw.history ? raw.history.length : 0)
    for (const h of item.history) expect(h.id).toBeTruthy()
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['数値', 42],
    ['文字列', 'x'],
    ['真偽値', true],
    ['空オブジェクト', {}],
    ['空配列', []],
    ['version=1 + bikes（v1フラットのキーが無い）', { version: 1, bikes: [{ id: 'b', items: [] }] }],
    ["version='3'（文字列＝厳密比較で不一致）", { version: '3', bikes: [{ id: 'b', items: [] }] }],
    ['version=3 だが bikes が非配列', { version: 3, bikes: 'nope', settings: { plan: 'pro' } }],
    ['version=3 だが bikes キー自体が無い', { version: 3, settings: { plan: 'pro' } }],
  ])('EP: 無効な入力(%s)は初期 state', (_label, bad) => {
    expect(migrate(bad)).toEqual(makeDefaultState())
  })

  // ※Findings #1（重大）: 未知の将来バージョンは v1 フラット判定にも該当せず初期 state に落ちる。
  //   ダウングレード時に全記録を失う。現行挙動を固定する。
  it.each([[4], [5], [99]])(
    'EP: 未知の将来バージョン(version=%i)のデータは破棄される（※Findings #1）',
    (version) => {
      const r = migrate({ version, bikes: validBikes(), settings: { plan: 'premium', activeBikeId: 'bike-1' } })
      expect(r).toEqual(makeDefaultState())
      expect(r.bikes[0].items[0].history).toEqual([]) // 履歴が消える
      expect(r.settings.plan).toBe('free') // プランも失われる
    },
  )
})

// ------------------------------------------------------------
// §5-2 normalize の欠損補完 — ペアワイズ
//
// 因子（4×3×3×4 = 144 通り / 全ペア 73）を貪欲IPO法で 17 行に圧縮した。
// 生成スクリプトは docs/test-design-istqb.md §5-2 に記載。
// ------------------------------------------------------------
const SETTINGS = {
  正常plan: () => ({ plan: 'pro', theme: 'dark', activeBikeId: 'bike-1' }),
  未知plan: () => ({ plan: 'gold', theme: 'light', activeBikeId: 'bike-1' }),
  'isPremium:true': () => ({ isPremium: true, theme: 'light', activeBikeId: 'bike-1' }),
  欠落: () => undefined,
}
const EXPECTED_PLAN = { 正常plan: 'pro', 未知plan: 'free', 'isPremium:true': 'pro', 欠落: 'free' }

const HISTORY = {
  オブジェクト配列: () => [{ id: 'h1', date: A }, { id: 'h2', date: B }],
  文字列配列: () => [A, B],
  id欠損: () => [{ date: A }, { date: B }],
  null: () => null,
}
const EXPECTED_HISTORY_LEN = { オブジェクト配列: 2, 文字列配列: 2, id欠損: 2, null: 0 }

const ITEMS = {
  正常: (history) => [{ type: 'air', lastReset: B, intervalDays: 21, history }],
  空配列: () => [],
  欠落: () => undefined,
}
const BIKES = {
  '1台正常': (items) => [{ id: 'bike-1', name: '通勤号', items }],
  '2台': (items) => [
    { id: 'bike-1', name: '通勤号', items },
    { id: 'bike-2', name: 'サブ', items },
  ],
  'id/name欠損': (items) => [{ items }],
}

// [行番号, settings, bikes, items, history]
const PAIRWISE = [
  [1, '正常plan', '1台正常', '正常', 'オブジェクト配列'],
  [2, '正常plan', '2台', '空配列', '文字列配列'],
  [3, '正常plan', 'id/name欠損', '欠落', 'id欠損'],
  [4, '未知plan', '1台正常', '空配列', 'id欠損'],
  [5, '未知plan', '2台', '正常', 'null'],
  [6, 'isPremium:true', '1台正常', '欠落', '文字列配列'],
  [7, 'isPremium:true', 'id/name欠損', '空配列', 'オブジェクト配列'],
  [8, '欠落', '2台', '欠落', 'オブジェクト配列'],
  [9, '欠落', 'id/name欠損', '正常', '文字列配列'],
  [10, 'isPremium:true', '2台', '正常', 'id欠損'],
  [11, '欠落', '1台正常', '空配列', 'null'],
  [12, '未知plan', 'id/name欠損', '欠落', 'null'],
  [13, '正常plan', '1台正常', '正常', 'null'],
  [14, '未知plan', '1台正常', '正常', 'オブジェクト配列'],
  [15, '未知plan', '1台正常', '正常', '文字列配列'],
  [16, 'isPremium:true', '1台正常', '正常', 'null'],
  [17, '欠落', '1台正常', '正常', 'id欠損'],
]

function build(settingsKey, bikesKey, itemsKey, historyKey) {
  const raw = { version: 3, bikes: BIKES[bikesKey](ITEMS[itemsKey](HISTORY[historyKey]())) }
  const settings = SETTINGS[settingsKey]()
  if (settings) raw.settings = settings
  return raw
}

describe('normalize — 欠損補完のペアワイズ', () => {
  it.each(PAIRWISE)(
    'PW-%i: settings=%s / bikes=%s / items=%s / history=%s → v3 の不変条件を満たす',
    (_n, settingsKey, bikesKey, itemsKey, historyKey) => {
      const out = normalize(build(settingsKey, bikesKey, itemsKey, historyKey))

      // (1) バージョンとプラン
      expect(out.version).toBe(3)
      expect(PLANS).toContain(out.settings.plan)
      expect(out.settings.plan).toBe(EXPECTED_PLAN[settingsKey])
      expect('isPremium' in out.settings).toBe(false)

      // (2) 自転車は必ず1台以上、id と name が埋まる
      expect(out.bikes.length).toBeGreaterThanOrEqual(1)
      for (const b of out.bikes) {
        expect(typeof b.id).toBe('string')
        expect(b.id).toBeTruthy()
        expect(typeof b.name).toBe('string')
        expect(b.name).toBeTruthy()

        // (3) item は必ず1つ以上、必須フィールドが埋まる
        expect(Array.isArray(b.items)).toBe(true)
        expect(b.items.length).toBeGreaterThanOrEqual(1)
        for (const it of b.items) {
          expect(typeof it.type).toBe('string')
          expect(typeof it.intervalDays).toBe('number')
          expect(it.intervalDays).toBeGreaterThanOrEqual(1)
          expect('lastReset' in it).toBe(true)

          // (4) history は必ず配列、全要素に id と date が入る
          expect(Array.isArray(it.history)).toBe(true)
          for (const h of it.history) {
            expect(h.id).toBeTruthy()
            expect(typeof h.date).toBe('string')
            expect(h.date).toBeTruthy()
          }
        }
      }

      // (5) activeBikeId は必ず実在の自転車を指す
      expect(out.bikes.some((b) => b.id === out.settings.activeBikeId)).toBe(true)
    },
  )

  it.each(PAIRWISE)(
    'PW-%i: 冪等 — normalize(normalize(x)) === normalize(x)',
    (_n, settingsKey, bikesKey, itemsKey, historyKey) => {
      const once = normalize(build(settingsKey, bikesKey, itemsKey, historyKey))
      expect(normalize(once)).toEqual(once)
    },
  )

  it.each(PAIRWISE)(
    'PW-%i: items が正常なら history 件数が保たれる',
    (_n, settingsKey, bikesKey, itemsKey, historyKey) => {
      const out = normalize(build(settingsKey, bikesKey, itemsKey, historyKey))
      const expected = itemsKey === '正常' ? EXPECTED_HISTORY_LEN[historyKey] : 0
      expect(out.bikes[0].items[0].history).toHaveLength(expected)
    },
  )

  it.each(PAIRWISE)(
    'PW-%i: migrate(version:3) は normalize と同じ結果になる',
    (_n, settingsKey, bikesKey, itemsKey, historyKey) => {
      const raw = build(settingsKey, bikesKey, itemsKey, historyKey)
      // history の id は自動採番されるため、構造の比較は id を除いて行う
      const strip = (s) => ({
        ...s,
        bikes: s.bikes.map((b) => ({
          ...b,
          items: b.items.map((it) => ({ ...it, history: it.history.map((h) => h.date) })),
        })),
      })
      expect(strip(migrate(raw))).toEqual(strip(normalize(raw)))
    },
  )
})

describe('normalize — bikes / items が空・欠落のときの回復', () => {
  it.each([
    ['bikes が空配列', { version: 3, bikes: [], settings: { plan: 'pro' } }],
    ['bikes が欠落', { version: 3, settings: { plan: 'pro' } }],
    ['bikes が null', { version: 3, bikes: null, settings: { plan: 'pro' } }],
  ])('EP: %s → 既定の1台に回復する', (_label, raw) => {
    const out = normalize(raw)
    expect(out.bikes).toHaveLength(1)
    expect(out.bikes[0].id).toBe('bike-1')
    expect(out.settings.activeBikeId).toBe('bike-1')
    expect(out.settings.plan).toBe('pro') // プランは保たれる
  })

  it('EP: activeBikeId が実在しなければ先頭の自転車へ寄せる', () => {
    const out = normalize({
      version: 3,
      bikes: [{ id: 'bike-x', name: 'X', items: [] }],
      settings: { plan: 'free', activeBikeId: 'ghost' },
    })
    expect(out.settings.activeBikeId).toBe('bike-x')
  })

  it('EP: theme など未知でない設定は保たれる', () => {
    const out = normalize({ version: 3, bikes: validBikes(), settings: { theme: 'light', plan: 'free', activeBikeId: 'bike-1' } })
    expect(out.settings.theme).toBe('light')
  })

  it.each([
    ['intervalDays が 0 → 既定 14', 0, 14],
    ['intervalDays が null → 既定 14', null, 14],
    ['intervalDays が欠落 → 既定 14', undefined, 14],
    ['intervalDays が 28 → そのまま', 28, 28],
  ])('EP: %s', (_label, input, expected) => {
    const out = normalize({
      version: 3,
      bikes: [{ id: 'bike-1', name: 'X', items: [{ type: 'air', lastReset: null, intervalDays: input, history: [] }] }],
      settings: { plan: 'free', activeBikeId: 'bike-1' },
    })
    expect(out.bikes[0].items[0].intervalDays).toBe(expected)
  })

  // ※Findings #4: normalize は負の intervalDays を弾かない（`|| 14` は負数を通す）。
  it('EP: 負の intervalDays はそのまま残る（※Findings #4）', () => {
    const out = normalize({
      version: 3,
      bikes: [{ id: 'bike-1', name: 'X', items: [{ type: 'air', lastReset: null, intervalDays: -5, history: [] }] }],
      settings: { plan: 'free', activeBikeId: 'bike-1' },
    })
    expect(out.bikes[0].items[0].intervalDays).toBe(-5)
  })

  it.each([
    ['null 要素', [null, { id: 'h1', date: A }]],
    ['date 欠損', [{ id: 'x' }, { id: 'h1', date: A }]],
    ['空文字の date', [{ id: 'x', date: '' }, { id: 'h1', date: A }]],
  ])('EP: history の不正要素(%s)は除去される', (_label, history) => {
    const out = normalize({
      version: 3,
      bikes: [{ id: 'bike-1', name: 'X', items: [{ type: 'air', lastReset: null, intervalDays: 14, history }] }],
      settings: { plan: 'free', activeBikeId: 'bike-1' },
    })
    expect(out.bikes[0].items[0].history).toEqual([{ id: 'h1', date: A }])
  })
})

// ------------------------------------------------------------
// §5-3 保存データの読み込み経路（load）
// ------------------------------------------------------------
describe('load — 保存データの読み込み', () => {
  it('EP: 保存が無ければ初期 state を作り、その場で書き出す', async () => {
    const s = await freshStore()
    expect(s.getState()).toEqual(makeDefaultState())
    expect(readPersisted()).toEqual(makeDefaultState())
  })

  it('EP: 旧バニラ版キー(airTracker)の v1 データを取り込み、新キーへ書き出す', async () => {
    const s = await freshStore({ lastPump: B, intervalDays: 7, history: [A, B] }, { key: LEGACY_KEY })
    expect(air(s).lastReset).toBe(B)
    expect(air(s).intervalDays).toBe(7)
    expect(air(s).history).toHaveLength(2)
    expect(readPersisted(STORAGE_KEY).bikes[0].items[0].history).toHaveLength(2)
  })

  it('EP: 新キーがあれば旧キーは無視される', async () => {
    localStorage.clear()
    localStorage.setItem(LEGACY_KEY, JSON.stringify({ lastPump: A, intervalDays: 7 }))
    const s = await freshStore({ version: 3, bikes: validBikes(), settings: { plan: 'pro', activeBikeId: 'bike-1' } })
    expect(air(s).intervalDays).toBe(21)
    expect(s.getState().settings.plan).toBe('pro')
  })

  it.each([
    ['壊れた JSON', '{{{ not json'],
    ['途中で切れた JSON', '{"version":3,"bikes":['],
    ['空文字列', ''],
  ])('EP: 保存データが %s なら初期 state へフォールバックする', async (_label, bad) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const s = await freshStore(bad)
    expect(s.getState()).toEqual(makeDefaultState())
    warn.mockRestore()
  })

  // ※Findings #1: 起動時 persist() が走るため、破棄された将来バージョンのデータは
  //   localStorage 上からも失われ、復元できない。
  it('EP: 未知の将来バージョンは読み込み時に破棄され、localStorage も上書きされる（※Findings #1）', async () => {
    const future = { version: 4, bikes: validBikes(), settings: { plan: 'premium', activeBikeId: 'bike-1' } }
    const s = await freshStore(future)
    expect(air(s).history).toEqual([])
    expect(s.getState().settings.plan).toBe('free')
    // 保存済みデータ自体が初期 state に置き換わっている＝旧データは復元不能
    expect(readPersisted()).toEqual(makeDefaultState())
  })
})

// ------------------------------------------------------------
// §5-4 importJSON / exportJSON の EP
// ------------------------------------------------------------
describe('importJSON — 有効パーティション', () => {
  it('EP: v3 のエクスポートを読み込める（複数台・履歴つき）', async () => {
    const s = await freshStore()
    s.setPlan('premium')
    s.addBike('サブ車')
    s.pump(iso(2026, 6, 1))
    s.setActiveBike('bike-1')
    s.pump(iso(2026, 6, 10))
    const snapshot = s.exportJSON()
    const before = s.getState()

    expect(s.importJSON(snapshot)).toEqual({ ok: true })
    expect(s.getState()).toEqual(before)
    expect(s.getState().bikes).toHaveLength(2)
  })

  it('EP: v2(isPremium:false) の import → plan free', async () => {
    const s = await freshStore()
    const r = s.importJSON(JSON.stringify({ version: 2, bikes: validBikes(), settings: { isPremium: false } }))
    expect(r).toEqual({ ok: true })
    expect(s.getState().settings.plan).toBe('free')
  })

  it('EP: v1 フラット形式も読み込める', async () => {
    const s = await freshStore()
    expect(s.importJSON(JSON.stringify({ lastPump: B, intervalDays: 7, history: [A, B] }))).toEqual({ ok: true })
    expect(air(s).intervalDays).toBe(7)
    expect(air(s).history).toHaveLength(2)
  })

  it('EP: 未知の plan を含む v3 は free に矯正して取り込む', async () => {
    const s = await freshStore()
    s.importJSON(JSON.stringify({ version: 3, bikes: validBikes(), settings: { plan: 'gold', activeBikeId: 'bike-1' } }))
    expect(s.getState().settings.plan).toBe('free')
  })

  it('EP: import 後の state は localStorage にも反映される', async () => {
    const s = await freshStore()
    s.importJSON(JSON.stringify({ version: 3, bikes: validBikes(), settings: { plan: 'pro', activeBikeId: 'bike-1' } }))
    expect(readPersisted().settings.plan).toBe('pro')
    expect(readPersisted().bikes[0].items[0].intervalDays).toBe(21)
  })
})

describe('importJSON — 無効パーティション', () => {
  it.each([
    ['JSON として壊れている', 'not json'],
    ['空文字列', ''],
    ['途中で切れている', '{"bikes":['],
    ['閉じ括弧が無い', '{'],
  ])('EP: %s → JSON 読み取りエラー', async (_label, bad) => {
    const s = await freshStore()
    expect(s.importJSON(bad)).toEqual({ ok: false, error: 'JSONを読み取れませんでした' })
  })

  it.each([
    ['関係のないオブジェクト', '{"foo":1}'],
    ['空オブジェクト', '{}'],
    ['null', 'null'],
    ['配列', '[]'],
    ['数値', '123'],
    ['文字列', '"hello"'],
    ['真偽値', 'true'],
  ])('EP: %s → 形式エラー', async (_label, bad) => {
    const s = await freshStore()
    expect(s.importJSON(bad)).toEqual({ ok: false, error: '対応していないデータ形式です' })
  })

  it('EP: import に失敗しても既存の state は変わらない', async () => {
    const s = await freshStore()
    s.pump(iso(2026, 6, 1))
    s.setPlan('pro')
    const before = JSON.stringify(s.getState())
    for (const bad of ['not json', '{"foo":1}', 'null', '[]', '']) s.importJSON(bad)
    expect(JSON.stringify(s.getState())).toBe(before)
  })

  // ※Findings #8: looksLikeData は bikes が配列でありさえすれば通すが、
  //   migrate は version 不一致で初期 state に落とす。エラーにならず既存データが消える。
  it.each([
    ['bikes が空配列 / version 無し', '{"bikes":[]}'],
    ['bikes はあるが version が未知', '{"version":9,"bikes":[{"id":"b","items":[]}]}'],
  ])('EP: %s → ok:true のまま初期 state にリセットされる（※Findings #8）', async (_label, input) => {
    const s = await freshStore()
    s.pump(iso(2026, 6, 1))
    s.setPlan('pro')
    expect(s.importJSON(input)).toEqual({ ok: true })
    expect(s.getState()).toEqual(makeDefaultState())
    expect(air(s).history).toEqual([]) // 直前の記録が消える
  })
})

describe('exportJSON', () => {
  it('EP: 現在の state をそのまま JSON 化する', async () => {
    const s = await freshStore()
    s.pump(iso(2026, 6, 1))
    expect(JSON.parse(s.exportJSON())).toEqual(s.getState())
  })

  it('EP: 人が読める整形（インデントつき）で出力する', async () => {
    const s = await freshStore()
    expect(s.exportJSON()).toContain('\n  "version": 3')
  })
})
