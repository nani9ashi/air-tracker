// ============================================================
// textZoom.js — 端末の「文字サイズ」設定による文字の倍率を実測し、
// <html> のインラインスタイルに --tz として書く（v2.4.5）。
//
// Android の WebView は端末の文字サイズ（Android 14 で最大 2.0倍）を
// textZoom として文字の大きさと行の高さにだけ掛ける。px の幅・高さ・余白・
// SVG の図形は大きくならない。CSS ではどの単位（px/rem/em/vw）で書いても
// 文字サイズに倍率が掛かってしまい、CSS 側から倍率を知る手段も無いため、
// 100px の見えない要素の計算後の font-size から逆算する。
//
// 使い道は2つだけ:
//   1. 巨大な数字の頭打ち（tokens.css の --tz-display / --tz-t）
//   2. ヒートマップの月ラベルの間引き（getTextZoom()）
// それ以外の崩れは倍率に依存しない流動的な CSS で吸収する方針。
//
// Android は文字サイズを変えるとアクティビティを作り直す（ページ再読み込み）ので
// 起動時の1回で足りるが、PWA（ブラウザ）は再読み込みなしで倍率が変わり得るため
// resize とタブ復帰でも測り直す。
// ============================================================

const PROBE_PX = 100
const MIN_ZOOM = 0.5
const MAX_ZOOM = 4

let current = 1

// 実測値を倍率として使える値にそろえる。測れなかった（NaN・0 以下）ときは 1、
// 範囲外は 0.5〜4 に丸める。浮動小数の誤差（1.1499…）は小数2桁にそろえる。
export function normalizeZoom(v) {
  if (!Number.isFinite(v) || v <= 0) return 1
  const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v))
  return Math.round(clamped * 100) / 100
}

// 文字の倍率を測る。測定用の要素は必ず片付ける。
export function measureTextZoom(doc = document) {
  const body = doc.body
  const view = doc.defaultView
  if (!body || !view) return 1
  const probe = doc.createElement('span')
  probe.setAttribute('aria-hidden', 'true')
  probe.style.cssText = `position:absolute;width:0;height:0;overflow:hidden;visibility:hidden;font-size:${PROBE_PX}px`
  body.appendChild(probe)
  try {
    return normalizeZoom(parseFloat(view.getComputedStyle(probe).fontSize) / PROBE_PX)
  } finally {
    probe.remove()
  }
}

// 測って <html> に --tz を書く。値が変わらなければ書かない（無駄なスタイル再計算を避ける）。
export function applyTextZoom(doc = document) {
  current = measureTextZoom(doc)
  const style = doc.documentElement.style
  const value = String(current)
  if (style.getPropertyValue('--tz') !== value) style.setProperty('--tz', value)
  return current
}

// 起動時に1回測り、resize／タブ復帰で測り直す。返り値で解除。
export function initTextZoom(win = window) {
  const doc = win.document
  applyTextZoom(doc)
  const onResize = () => applyTextZoom(doc)
  const onVisible = () => {
    if (doc.visibilityState === 'visible') applyTextZoom(doc)
  }
  win.addEventListener('resize', onResize)
  doc.addEventListener('visibilitychange', onVisible)
  return () => {
    win.removeEventListener('resize', onResize)
    doc.removeEventListener('visibilitychange', onVisible)
  }
}

// 最後に測った倍率（未測定なら 1）。
export const getTextZoom = () => current
