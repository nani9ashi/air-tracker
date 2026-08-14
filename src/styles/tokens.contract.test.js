// ============================================================
// tokens.contract.test.js — セーフエリアの「規約」を固定する。
//
// ⚠ これは描画のテストではない。jsdom は env() もレイアウトも計算しないので、
//   下タブがシステムナビに被らないことを単体テストで証明する手段は無い
//   （実証は実機マトリクス: 3ボタンナビ / ジェスチャーナビ / 古い WebView）。
//   ここで固定するのは「壊れ方が同じ形で戻ってこないこと」だけ:
//     1. 下端の余白は --bottom-nav-total を通す（--bottom-nav-h 直参照は禁止）
//     2. env() の fallback は無単位 0 ではなく 0px（calc() で宣言ごと落ちる）
//     3. Capacitor が注入する --safe-area-inset-* を読まない
// ============================================================
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(resolve(SRC, p), 'utf8')

// --bottom-nav-h を下余白の計算に使っている全ファイル（v2.2.0 で total へ移行済み）。
const CONSUMERS = [
  'components/Toast.css',
  'components/BottomNav.css',
  'screens/HomeScreen.css',
  'screens/HistoryScreen.css',
  'screens/StatsScreen.css',
  'screens/SettingsScreen.css',
  'screens/PreviewScreen.jsx',
]

describe('セーフエリアの規約', () => {
  it('tokens.css が --safe-top/--safe-bottom/--bottom-nav-total を定義している', () => {
    const css = read('styles/tokens.css')
    expect(css).toContain('--safe-top:')
    expect(css).toContain('--safe-bottom:')
    expect(css).toContain('--bottom-nav-total:')
  })

  it('env() の fallback が 0px（無単位 0 は calc() で宣言ごと無効になる）', () => {
    const css = read('styles/tokens.css')
    expect(css).toContain('env(safe-area-inset-top, 0px)')
    expect(css).toContain('env(safe-area-inset-bottom, 0px)')
    // src 全体で無単位 fallback が復活していないこと
    for (const f of ['styles/tokens.css', 'components/Sheet.css', ...CONSUMERS]) {
      expect(read(f), `${f} に無単位 0 の fallback`).not.toMatch(/env\(safe-area-inset-\w+,\s*0\)/)
    }
  })

  it.each(CONSUMERS)('%s は --bottom-nav-h を直接足していない', (file) => {
    // --bottom-nav-h) + ... は total を経由し損ねているサイン。
    expect(read(file)).not.toMatch(/--bottom-nav-h\)\s*\+/)
  })

  it('Capacitor 注入の --safe-area-inset-* を読んでいない（二重の下駄になる）', () => {
    for (const f of ['styles/tokens.css', 'components/Sheet.css', ...CONSUMERS]) {
      expect(read(f), `${f} が Capacitor 注入変数を参照`).not.toMatch(
        /var\(\s*--safe-area-inset-/,
      )
    }
  })
})
