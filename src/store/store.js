// ============================================================
// store.js — 状態 + localStorage + マイグレーション（プレーンJS）
// データは「複数自転車 × 複数項目」前提（README §5）。v1のUIは air 1項目のみ表示。
// React へは useSyncExternalStore（src/store/useStore.js）で配る。
// ============================================================

const STORAGE_KEY = 'air-tracker:state'
const LEGACY_KEY = 'airTracker' // 旧バニラ版のキー（あれば取り込む）
const VERSION = 3
const DEFAULT_BIKE_NAME = 'マイバイク'
const PRESET_INTERVALS = [7, 14, 21, 28]

// プラン別の上限/解放。README §8 準拠。
// history: 無料で通常表示する直近件数（超過分は削除せずロック/ぼかし表示）。Infinity=全件。
// heatmapWeeks: 数値=固定週数 / 'auto'=最古の記録〜現在。bikes: 追加可能な最大台数。
// 注: Infinity はコード上のみ。localStorage には settings.plan（文字列）だけが載る。
export const PLAN_LIMITS = {
  free: { bikes: 1, history: 3, heatmapWeeks: 5, customCycle: false, backup: false },
  pro: { bikes: 1, history: Infinity, heatmapWeeks: 'auto', customCycle: true, backup: true },
  premium: { bikes: Infinity, history: Infinity, heatmapWeeks: 'auto', customCycle: true, backup: true },
}
export const PLANS = ['free', 'pro', 'premium']

// プランを検証・正規化。未知値は 'free'。
export function normalizePlan(plan) {
  return PLANS.includes(plan) ? plan : 'free'
}

// state から現在プランの上限を引く。selector 省略でグローバル state。
export function getLimits(s = state) {
  return PLAN_LIMITS[normalizePlan(s?.settings?.plan)]
}

// アプリ表示バージョン（設定フッター等で使用）。
export const APP_VERSION = '2.1.1'

// 履歴エントリ用の安定 ID。
let __idSeq = 0
function makeId() {
  __idSeq += 1
  const rand = Math.random().toString(36).slice(2, 8)
  return `h-${Date.now().toString(36)}-${__idSeq}-${rand}`
}

// 履歴配列を { id, date } へ正規化（旧形式の文字列/ id 欠損を補完）。
function normalizeHistory(arr) {
  if (!Array.isArray(arr)) return []
  return arr
    .map((h) => {
      if (!h) return null
      const date = typeof h === 'string' ? h : h.date
      if (!date) return null
      return { id: h.id || makeId(), date }
    })
    .filter(Boolean)
}

// 履歴から lastReset（最新の日付）を再計算。空なら null。
// ISO(UTC) 文字列は辞書順 = 時系列順。
function recomputeLastReset(item) {
  if (!item.history.length) {
    item.lastReset = null
    return
  }
  item.lastReset = item.history.map((h) => h.date).sort().at(-1)
}

export function makeDefaultState() {
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
      plan: 'free', // 'free' | 'pro' | 'premium'（README §8）
      activeBikeId: 'bike-1',
    },
  }
}

// 旧データ → v3 へ正規化。
// - 既に v3（または v2）+ bikes 配列なら normalize に通す（欠損補完＋isPremium→plan）。
// - 旧フラット shape { lastPump, intervalDays, history } を検出したら移植（plan は free）。
// - それ以外は初期state。
export function migrate(raw) {
  if (!raw || typeof raw !== 'object') return makeDefaultState()

  if ((raw.version === VERSION || raw.version === 2) && Array.isArray(raw.bikes)) {
    return normalize(raw)
  }

  // v1 フラット shape（プレミアム概念なし → plan は free のまま）
  if ('lastPump' in raw || 'intervalDays' in raw || 'history' in raw) {
    const def = makeDefaultState()
    const item = def.bikes[0].items[0]
    if (raw.lastPump) item.lastReset = raw.lastPump
    if (raw.intervalDays) item.intervalDays = raw.intervalDays
    item.history = normalizeHistory(raw.history)
    return def
  }

  return makeDefaultState()
}

// 既存 v2/v3 データに欠損フィールドがあっても壊れないよう補完し、v3 へ揃える。
// isPremium(旧v2)→plan 変換もここで行い、import と再正規化で共有（冪等）。
export function normalize(state) {
  const def = makeDefaultState()
  const src = state.settings || {}
  // 旧 isPremium -> plan。このアプリの有料段は Pro（true='pro' / false='free'）。
  // plan があればそれを優先し検証。実ユーザー0のため退行リスクは無い。
  const plan = 'plan' in src ? normalizePlan(src.plan) : src.isPremium ? 'pro' : 'free'
  const settings = { ...def.settings, ...src, plan }
  delete settings.isPremium
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
                  history: normalizeHistory(it.history),
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

// 開発時のみ: コンソールからプランを切り替え/確認できるように公開（本番ビルドでは消える）。
if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.setPlan = setPlan
  window.getPlan = () => getState().settings.plan
}

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
  item.history.push({ id: makeId(), date: dateISO })
  // v1.5: 全プランで履歴は削除しない（無料は 4件目以降をロック/ぼかし表示）。
  recomputeLastReset(item)
  commit(next)
}

// 履歴1件の日付を編集。lastReset を再計算。
export function editHistory(id, dateISO) {
  if (!id || !dateISO) return
  const next = structuredCloneState(state)
  const item = getActiveAirItem(next)
  const h = item.history.find((x) => x.id === id)
  if (!h) return
  h.date = dateISO
  recomputeLastReset(item)
  commit(next)
}

// 履歴1件を削除。lastReset を再計算（全削除で未記録に戻る）。
export function removeHistory(id) {
  const next = structuredCloneState(state)
  const item = getActiveAirItem(next)
  const i = item.history.findIndex((x) => x.id === id)
  if (i === -1) return
  item.history.splice(i, 1)
  recomputeLastReset(item)
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

// 新しい自転車を追加し、それをアクティブにする。新IDを返す。
export function addBike(name) {
  const next = structuredCloneState(state)
  const id = `bike-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  next.bikes.push({
    id,
    name: String(name || '').trim() || DEFAULT_BIKE_NAME,
    items: [{ type: 'air', lastReset: null, intervalDays: 14, history: [] }],
  })
  next.settings.activeBikeId = id
  commit(next)
  return id
}

// 自転車を削除。最後の1台は削除しない。アクティブを消したら先頭へ。
export function removeBike(id) {
  if (state.bikes.length <= 1) return
  const next = structuredCloneState(state)
  const idx = next.bikes.findIndex((b) => b.id === id)
  if (idx === -1) return
  next.bikes.splice(idx, 1)
  if (next.settings.activeBikeId === id) {
    next.settings.activeBikeId = next.bikes[0].id
  }
  commit(next)
}

export function setActiveBike(id) {
  if (!state.bikes.some((b) => b.id === id)) return
  const next = structuredCloneState(state)
  next.settings.activeBikeId = id
  commit(next)
}

export function setTheme(mode) {
  if (!['auto', 'dark', 'light'].includes(mode)) return
  const next = structuredCloneState(state)
  next.settings.theme = mode
  commit(next)
}

// プランを設定。README の3値のみ（未知値は 'free' に coerce）。
export function setPlan(plan) {
  const next = structuredCloneState(state)
  next.settings.plan = normalizePlan(plan)
  commit(next)
}

// ---- バックアップ（エクスポート / インポート） ----
export function exportJSON() {
  return JSON.stringify(state, null, 2)
}

function looksLikeData(raw) {
  if (!raw || typeof raw !== 'object') return false
  if (Array.isArray(raw.bikes)) return true
  if ('lastPump' in raw || 'intervalDays' in raw || 'history' in raw) return true
  return false
}

// JSON文字列を検証→マイグレーション→置換。{ ok, error } を返す。
export function importJSON(text) {
  let raw
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'JSONを読み取れませんでした' }
  }
  if (!looksLikeData(raw)) {
    return { ok: false, error: '対応していないデータ形式です' }
  }
  commit(migrate(raw))
  return { ok: true }
}

// 構造体の安全な複製（古い環境向けに structuredClone が無ければ JSON フォールバック）。
function structuredCloneState(s) {
  if (typeof structuredClone === 'function') return structuredClone(s)
  return JSON.parse(JSON.stringify(s))
}

export { PRESET_INTERVALS, STORAGE_KEY }
