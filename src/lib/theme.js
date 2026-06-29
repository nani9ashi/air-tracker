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
  // 切替中はトランジションを止めてちらつき/中途半端な配色を防ぐ。
  root.setAttribute('data-theme-switching', '')
  if (eff === 'light') root.setAttribute('data-theme', 'light')
  else root.removeAttribute('data-theme') // dark = 既定
  // ステータスバー/ブラウザUIの色も合わせる
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', eff === 'light' ? LIGHT_BG : DARK_BG)
  // 2フレーム後に解除（適用が確定してから）。
  const release = () => root.removeAttribute('data-theme-switching')
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => window.requestAnimationFrame(release))
  }
  // バックグラウンドタブ等で rAF が抑制されても確実に解除する保険。
  window.setTimeout(release, 250)
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
