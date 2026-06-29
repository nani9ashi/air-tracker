// ============================================================
// theme.js — settings.theme（auto/dark/light）を <html data-theme> に反映。
// 既定はダーク。auto は prefers-color-scheme に追従。
// ダークは :root（tokens.css）の既定なので data-theme を外すだけでよい。
// ============================================================

const LIGHT_BG = '#EEF3F2'
const DARK_BG = '#07110F'

const mql = () =>
  window.matchMedia && window.matchMedia('(prefers-color-scheme: light)')

// mode から実効テーマ（'light' | 'dark'）を解決。
export function resolveTheme(mode) {
  if (mode === 'light') return 'light'
  if (mode === 'dark') return 'dark'
  // auto
  return mql() && mql().matches ? 'light' : 'dark'
}

export function applyTheme(mode) {
  const eff = resolveTheme(mode)
  const root = document.documentElement
  if (eff === 'light') root.setAttribute('data-theme', 'light')
  else root.removeAttribute('data-theme') // dark = 既定
  // ステータスバー/ブラウザUIの色も合わせる
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', eff === 'light' ? LIGHT_BG : DARK_BG)
}

// auto のときだけ OS のテーマ変更に追従するリスナを張る。返り値で解除。
export function watchSystemTheme(mode, onResolvedChange) {
  if (mode !== 'auto') return () => {}
  const m = mql()
  if (!m) return () => {}
  const handler = () => onResolvedChange()
  m.addEventListener('change', handler)
  return () => m.removeEventListener('change', handler)
}
