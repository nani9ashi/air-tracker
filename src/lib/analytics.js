// ============================================================
// analytics.js — 軽量・プライバシー配慮の計測（GoatCounter）。
// cookieless / PII なし。本番ビルド かつ VITE_GOATCOUNTER_CODE 設定時のみ送信。
// 未設定 or dev では送信せず、dev は console に出す（＝安全な no-op）。
// サイトコードは .env.local（gitignore 済み）で後差し込み。
// ============================================================

// 計測イベント名（タイプミス防止）。
export const EV = {
  RESET: 'reset', // 「空気入れた！」
  PAYWALL: 'paywall_view', // ロック機能に触れた（source 付き）
  PWA_INSTALL: 'pwa_install', // ホーム画面に追加された
  PWA_PROMPT: 'pwa_install_prompt', // インストール導線が提示された
  PURCHASE: 'purchase', // 1b で配線（名称のみ予約）
}

const CODE = import.meta.env.VITE_GOATCOUNTER_CODE
const ENABLED = import.meta.env.PROD && !!CODE

// count.js ロード前に発火したイベントを貯めて、ロード後に流す。
const queue = []
let injected = false

function flush() {
  if (!window.goatcounter || typeof window.goatcounter.count !== 'function') return
  while (queue.length) window.goatcounter.count(queue.shift())
}

function ensureScript() {
  if (injected || !ENABLED || typeof document === 'undefined') return
  injected = true
  const s = document.createElement('script')
  s.async = true
  s.dataset.goatcounter = `https://${CODE}.goatcounter.com/count`
  s.src = 'https://gc.zgo.at/count.js'
  s.addEventListener('load', flush)
  document.head.appendChild(s)
}

// 起動時に一度呼ぶ。スクリプト注入＝onload の自動カウントで pageview を計上。
export function initAnalytics() {
  if (import.meta.env.DEV) {
    console.debug('[analytics] init (pageview)')
    return
  }
  ensureScript()
}

// カスタムイベント送信。dev はログのみ、未設定/非prod は no-op（例外を出さない）。
export function track(event, meta) {
  if (import.meta.env.DEV) {
    console.debug('[analytics]', event, meta || '')
    return
  }
  if (!ENABLED) return
  const path = meta && meta.source ? `${event}:${meta.source}` : event
  queue.push({ path, title: event, event: true })
  if (window.goatcounter && typeof window.goatcounter.count === 'function') flush()
  else ensureScript()
}
