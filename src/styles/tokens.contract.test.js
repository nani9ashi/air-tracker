// ============================================================
// tokens.contract.test.js — セーフエリア(top/bottom共通)の「規約」を固定する。
//
// ⚠ これは描画のテストではない。jsdom は env() もレイアウトも計算しないので、
//   下タブ/ステータスバーフェードが実機で正しく効くことを単体テストで証明する
//   手段は無い
//   （実証は実機マトリクス: 3ボタンナビ / ジェスチャーナビ / 古い WebView）。
//   ここで固定するのは「壊れ方が同じ形で戻ってこないこと」だけ:
//     1. 下端の余白は --bottom-nav-total を通す（--bottom-nav-h 直参照は禁止）
//     2. 上端のフェードは --status-fade-total を通す（--status-fade-h 直参照は禁止）。
//        各画面のヘッダーもフェードの終端（--status-fade-total）から始める
//     3. env() の fallback は無単位 0 ではなく 0px（calc() で宣言ごと落ちる）
//     4. Capacitor が注入する --safe-area-inset-* を読まない
// ============================================================
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(resolve(SRC, p), 'utf8')

// セーフエリア（上端 --safe-top / 下端 --safe-bottom）を消費する全ファイル。
// 元は「--bottom-nav-h を下余白の計算に使っている全ファイル」(v2.2.0)の
// 意味だったが、下の2チェック（fallback 0px / Capacitor注入変数不参照）は
// top/bottom を問わず全セーフエリア消費者に一般化できるため、v2.4.3で
// StatusBarFade.css（上端専用）もここに合流させた。
const CONSUMERS = [
  'components/Toast.css',
  'components/BottomNav.css',
  'components/StatusBarFade.css',
  'screens/HomeScreen.css',
  'screens/HistoryScreen.css',
  'screens/StatsScreen.css',
  'screens/SettingsScreen.css',
  'screens/PreviewScreen.jsx',
]

describe('セーフエリアの規約', () => {
  it('tokens.css が --safe-top/--safe-bottom/--bottom-nav-total/--status-fade-total を定義している', () => {
    const css = read('styles/tokens.css')
    expect(css).toContain('--safe-top:')
    expect(css).toContain('--safe-bottom:')
    expect(css).toContain('--bottom-nav-total:')
    expect(css).toContain('--status-fade-h:')
    expect(css).toContain('--status-fade-total:')
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

  it.each(CONSUMERS)('%s は --status-fade-h を直接足していない', (file) => {
    // --status-fade-h) + ... は total を経由し損ねているサイン（--bottom-nav-h と同じ理由）。
    expect(read(file)).not.toMatch(/--status-fade-h\)\s*\+/)
  })

  // v2.4.4: ヘッダーの上余白がフェード帯より短いと、スクロールしていなくても
  // タイトル・ロゴの上部がフェードでかすむ（v2.4.3 では safe-top+12px から
  // 始まるヘッダーに safe-top+32px までのフェードが被り、20px かすんでいた）。
  // ヘッダーの中身はフェードの終端（--status-fade-total）から始める。
  it.each([
    ['screens/HomeScreen.css', 'home__header'],
    ['screens/HistoryScreen.css', 'history__header'],
    ['screens/StatsScreen.css', 'stats__header'],
    ['screens/SettingsScreen.css', 'settings__header'],
  ])('%s のヘッダーはフェードの終端から始まる', (file, cls) => {
    const rule = read(file).match(new RegExp(`\\.${cls}\\s*\\{([^}]*)\\}`))
    expect(rule, `.${cls} の規則が見つからない`).not.toBeNull()
    // 規則の中で最後に効く padding-top を見る（前にある padding 一括指定を上書きする側）。
    const tops = [...rule[1].matchAll(/padding-top:\s*([^;]+);/g)].map((m) => m[1].trim())
    expect(tops.at(-1)).toBe('var(--status-fade-total)')
  })

  it('--status-fade-h は画面幅に追従する（clamp）', () => {
    // 表示サイズ設定で CSS 上の画面幅が変わっても、余白の比率をほぼ一定に保つ。
    expect(read('styles/tokens.css')).toMatch(/--status-fade-h:\s*clamp\(/)
  })

  it('Capacitor 注入の --safe-area-inset-* を読んでいない（二重の下駄になる）', () => {
    for (const f of ['styles/tokens.css', 'components/Sheet.css', ...CONSUMERS]) {
      expect(read(f), `${f} が Capacitor 注入変数を参照`).not.toMatch(
        /var\(\s*--safe-area-inset-/,
      )
    }
  })
})
