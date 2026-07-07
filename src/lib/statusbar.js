// statusbar.js — ネイティブのステータスバーを有効テーマに合わせて設定（web は no-op）。
// edge-to-edge（targetSdk 35）前提。アイコン色＝コントラスト、背景＝アプリ背景色。
import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'

const NATIVE = Capacitor.isNativePlatform()

// tokens.css / theme.js の --bg-app と同値に保つ。
const DARK_BG = '#07110F'
const LIGHT_BG = '#EEF3F2'

// eff: 'light' | 'dark'（resolveTheme の結果）。
// Style.Dark = 明るいアイコン（暗い背景向け）/ Style.Light = 暗いアイコン（明るい背景向け）。
export async function applyStatusBar(eff) {
  if (!NATIVE) return
  try {
    const light = eff === 'light'
    await StatusBar.setStyle({ style: light ? Style.Light : Style.Dark })
    // 旧 Android 向けベストエフォート（Android 15+ の edge-to-edge では背景はアプリ側が透過表示）。
    await StatusBar.setBackgroundColor({ color: light ? LIGHT_BG : DARK_BG })
  } catch {
    /* プラグイン未対応環境は無視 */
  }
}
