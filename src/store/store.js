// ============================================================
// store.js — 状態 + localStorage + マイグレーション（プレーンJS）
// データは「複数自転車 × 複数項目」前提（README §5）。v1のUIは air 1項目のみ表示。
// React へは useSyncExternalStore（src/store/useStore.js）で配る。
// ============================================================

const STORAGE_KEY = 'air-tracker:state'
const LEGACY_KEY = 'airTracker' // 旧バニラ版のキー（あれば取り込む）
const VERSION = 2
const DEFAULT_BIKE_NAME = 'マイバイク'
const PRESET_INTERVALS = [7, 14, 21, 28]

function makeDefaultState() {
  return {
    version: VERSION,
    bikes: [
      {
        id: 'bike-1',
        name: DEFAULT_BIKE_NAME,
        items: [
          {
            type: 'air',
            lastReset: null, // 未記録。初回 pump で設定。
            intervalDays: 14,
            history: [], // v1では追記のみ・UI非表示
          },
        ],
      },
    ],
    settings: {
      theme: 'auto', // 'auto' | 'dark' | 'light'
      isPremium: false,
      activeBikeId: 'bike-1',
    },
  }
}

// 旧データ → v2 へ正規化。
// - 既に version:2 + bikes 配列なら（足りないフィールドだけ補って）そのまま。
// - 旧フラット shape { lastPump, intervalDays, history } を検出したら移植。
// - それ以外は初期state。
function migrate(raw) {
  if (!raw || typeof raw !== 'object') return makeDefaultState()

  if (raw.version === VERSION && Array.isArray(raw.bikes)) {
    return normalize(raw)
  }

  // v1 フラット shape
  if ('lastPump' in raw || 'intervalDays' in raw || 'history' in raw) {
    const def = makeDefaultState()
    const item = def.bikes[0].items[0]
    if (raw.lastPump) item.lastReset = raw.lastPump
    if (raw.intervalDays) item.intervalDays = raw.intervalDays
    if (Array.isArray(raw.history)) {
      item.history = raw.history
        .map((d) => ({ date: typeof d === 'string' ? d : d?.date || null }))
        .filter((h) => h.date)
    }
    return def
  }

  return makeDefaultState()
}

// 既存 v2 データに欠損フィールドがあっても壊れないよう補完。
function normalize(state) {
  const def = makeDefaultState()
  const settings = { ...def.settings, ...(state.settings || {}) }
  const bikes =
    Array.isArray(state.bikes) && state.bikes.length
      ? state.bikes.map((b) => ({
          id: b.id || 'bike-1',
          name: b.name || DEFAULT_BIKE_NAME,
          items:
            Array.isArray(b.items) && b.items.length
              ? b.items.map((it) => ({
                  type: it.type || 'air',
                  lastReset: it.lastReset ?? null,
                  intervalDays: it.intervalDays || 14,
                  history: Array.isArray(it.history) ? it.history : [],
                }))
              : def.bikes[0].items,
        }))
      : def.bikes
  // activeBikeId が存在しなければ先頭に寄せる
  if (!bikes.some((b) => b.id === settings.activeBikeId)) {
    settings.activeBikeId = bikes[0].id
  }
  return { version: VERSION, bikes, settings }
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return migrate(JSON.parse(raw))
    // 新キーが無ければ旧バニラ版キーを取り込む
    const legacy = localStorage.getItem(LEGACY_KEY)
    if (legacy) return migrate(JSON.parse(legacy))
  } catch (e) {
    console.warn('[store] load failed, using defaults', e)
  }
  return makeDefaultState()
}

// ---- ストア本体（購読可能） ----
let state = load()
const listeners = new Set()

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (e) {
    console.warn('[store] persist failed', e)
  }
}

// 初回起動時、新キーへ確実に書き出す（旧キー取り込み or 初期生成の確定）。
persist()

function emit() {
  for (const l of listeners) l()
}

// state を差し替えて永続化＆通知。引数は新しい state オブジェクト。
function commit(next) {
  state = next
  persist()
  emit()
}

// ---- セレクタ（純粋） ----
export function getActiveBike(s = state) {
  return s.bikes.find((b) => b.id === s.settings.activeBikeId) || s.bikes[0]
}

export function getActiveAirItem(s = state) {
  const bike = getActiveBike(s)
  return bike.items.find((it) => it.type === 'air') || bike.items[0]
}

// ---- 公開 API ----
export function getState() {
  return state
}

export function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// active な air の lastReset を更新し history に追記。
export function pump(dateISO = new Date().toISOString()) {
  const next = structuredCloneState(state)
  const item = getActiveAirItem(next)
  item.lastReset = dateISO
  item.history.push({ date: dateISO })
  commit(next)
}

export function setInterval(days) {
  const d = Number(days)
  if (!Number.isFinite(d) || d < 1) return
  const next = structuredCloneState(state)
  getActiveAirItem(next).intervalDays = Math.round(d)
  commit(next)
}

export function setBikeName(name) {
  const next = structuredCloneState(state)
  getActiveBike(next).name = String(name || '').trim() || DEFAULT_BIKE_NAME
  commit(next)
}

export function setTheme(mode) {
  if (!['auto', 'dark', 'light'].includes(mode)) return
  const next = structuredCloneState(state)
  next.settings.theme = mode
  commit(next)
}

export function setPremium(isPremium) {
  const next = structuredCloneState(state)
  next.settings.isPremium = !!isPremium
  commit(next)
}

// 構造体の安全な複製（古い環境向けに structuredClone が無ければ JSON フォールバック）。
function structuredCloneState(s) {
  if (typeof structuredClone === 'function') return structuredClone(s)
  return JSON.parse(JSON.stringify(s))
}

export { PRESET_INTERVALS, STORAGE_KEY }
