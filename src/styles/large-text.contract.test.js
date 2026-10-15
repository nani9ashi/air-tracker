// ============================================================
// large-text.contract.test.js — Android の「文字サイズ」「表示サイズ」を最大に
// したときの表示崩れ対策（v2.4.5）の「規約」を固定する。
//
// ⚠ これは描画のテストではない。jsdom はレイアウトも文字の倍率（WebView の
//   textZoom）も計算しないので、崩れないことの実証はブラウザでの実測
//   （画面幅 412/360/320/290px × 文字の倍率 100〜200%、text-size-adjust で再現）
//   と実機で行う。ここで固定するのは「同じ壊れ方が戻ってこないこと」だけ:
//     1. 文字の入る箱は固定の height ではなく min-height（ボタン・チップ）
//     2. 重要な文言は1行固定・「…」省略にしない（トースト・履歴の日付）
//     3. ヒートマップの月ラベル行は固定の高さを持たない
//     4. 巨大な数字は var(--tz-display, 1) で頭打ち（fallback 必須）
//     5. リング数字の CSS の落とし穴（読み込み順で効かない宣言）を再発させない
//     6. 端末の文字サイズ設定を CSS で打ち消さない（text-size-adjust を書かない）
// ============================================================
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join, relative } from 'node:path'

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// コメントは規約の説明に「height」等の語を含むので取り除いてから検査する。
const read = (p) => readFileSync(resolve(SRC, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

// 行頭のセレクタがちょうど sel の規則の中身（複合セレクタの一部は拾わない）。
// 同じセレクタの規則が複数あれば（global.css の body など）すべてをつなげて返す。
const rule = (css, sel) => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const bodies = [...css.matchAll(new RegExp(`^${esc}\\s*\\{([^}]*)\\}`, 'gm'))].map((m) => m[1])
  expect(bodies.length, `${sel} の規則が見つからない`).toBeGreaterThan(0)
  return bodies.join('\n')
}
// min-height / line-height ではない、素の height 宣言。
const FIXED_HEIGHT = /(^|[;\s])height\s*:/

const cssFiles = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? cssFiles(p) : p.endsWith('.css') ? [p] : []
  })

describe('文字の入る箱は高さ可変', () => {
  it.each([
    ['.btn--sm', '--control-h-sm'],
    ['.btn--md', '--control-h-md'],
    ['.btn--lg', '--control-h-lg'],
  ])('Button.css %s は min-height（固定 height だと折り返したラベルがはみ出す）', (sel, token) => {
    const body = rule(read('components/Button.css'), sel)
    expect(body).toContain(`min-height: var(${token})`)
    expect(body).not.toMatch(FIXED_HEIGHT)
  })

  it('Button.css .btn の行の高さは 1 ではない（2行に折り返すと行どうしが重なる）', () => {
    expect(rule(read('components/Button.css'), '.btn')).not.toMatch(/line-height:\s*1\s*;/)
  })

  it('Chip.css .chip は min-height', () => {
    const body = rule(read('components/Chip.css'), '.chip')
    expect(body).toMatch(/min-height:/)
    expect(body).not.toMatch(FIXED_HEIGHT)
  })

  it('Heatmap.css 月ラベルの行は固定の高さを持たない（拡大した文字がマスの裏に隠れる）', () => {
    expect(rule(read('components/Heatmap.css'), '.heatmap__months')).not.toMatch(FIXED_HEIGHT)
  })
})

describe('タップ領域 44px（見えない当たり判定）', () => {
  it.each([
    ['components/Chip.css', '.chip::after'],
    ['components/IconButton.css', '.icon-btn--sm::after'],
  ])('%s に %s がある', (file, sel) => {
    const body = rule(read(file), sel)
    expect(body).toMatch(/position:\s*absolute/)
    expect(body).toMatch(/inset:\s*-/)
  })
})

describe('重要な文言は切らずに折り返す', () => {
  it('Toast.css は1行固定ではなく、左右を画面の余白で制限する', () => {
    const body = rule(read('components/Toast.css'), '.toast')
    expect(body).not.toMatch(/white-space:\s*nowrap/)
    expect(body).toContain('left: var(--gutter-screen)')
    expect(body).toContain('right: var(--gutter-screen)')
    expect(body).not.toMatch(/translateX\(-50%\)/)
  })

  it('ListRow.css 行タイトルを「…」で省略しない（日付が別の日付に読める）', () => {
    const body = rule(read('components/ListRow.css'), '.list-row__title')
    expect(body).not.toMatch(/text-overflow:\s*ellipsis/)
    expect(body).not.toMatch(/white-space:\s*nowrap/)
  })

  it('global.css body は break-word（anywhere は横並びのボタンを1文字ずつ改行させる）', () => {
    const body = rule(read('styles/global.css'), 'body')
    expect(body).toMatch(/overflow-wrap:\s*break-word/)
    expect(body).not.toMatch(/overflow-wrap:\s*anywhere/)
  })
})

describe('巨大な数字は文字の倍率を頭打ちにする', () => {
  it('tokens.css --tz-display / --tz-t は @supports の中でだけ定義する', () => {
    const css = read('styles/tokens.css')
    const at = css.indexOf('@supports (width: min(1px, 2px))')
    expect(at).toBeGreaterThan(-1)
    // :root の本体（@supports より前）では定義しない。古い WebView で無効値に
    // なると、使う側の宣言ごと unset になるため（fallback は未定義のときしか効かない）。
    expect(css.slice(0, at)).not.toMatch(/--tz-display\s*:|--tz-t\s*:/)
    expect(css.slice(at)).toMatch(/--tz-display\s*:/)
    expect(css.slice(at)).toMatch(/--tz-t\s*:/)
    expect(css).toMatch(/--tz:\s*1;/)
  })

  it.each([
    ['styles/tokens.css', '.cad-display'],
    ['components/StatTile.css', '.stat-tile__value'],
  ])('%s %s の文字サイズは var(--tz-display, 1) を掛ける', (file, sel) => {
    expect(rule(read(file), sel)).toMatch(/font-size:\s*calc\([^;]*var\(--tz-display, 1\)/)
  })

  it('src の CSS で --tz-display / --tz-t を fallback なしで参照していない', () => {
    for (const f of cssFiles(SRC)) {
      const css = read(relative(SRC, f))
      expect(css, `${relative(SRC, f)} に fallback なしの --tz-display`).not.toMatch(/var\(--tz-display\)/)
      expect(css, `${relative(SRC, f)} に fallback なしの --tz-t`).not.toMatch(/var\(--tz-t\)/)
    }
  })

  it('HomeScreen.css .home__ring-num 単独の規則に font-size / line-height を書かない', () => {
    // main.jsx は App（画面の CSS）を tokens.css より先に読み込むため、同じ詳細度の
    // .cad-display が後勝ちし、ここの宣言は効かない（v2.4.4 までの 66px は一度も
    // 効いていなかった）。変えるなら .home__ring-inset .home__ring-num のように詳細度を上げる。
    const body = rule(read('screens/HomeScreen.css'), '.home__ring-num')
    expect(body).not.toMatch(/font-size:|line-height:/)
    const main = readFileSync(resolve(SRC, 'main.jsx'), 'utf8')
    expect(main.indexOf("import App from './App.jsx'")).toBeLessThan(main.indexOf("import './styles/tokens.css'"))
  })
})

describe('端末の文字サイズ設定を打ち消さない', () => {
  it('src の CSS に text-size-adjust が無い（本番で倍率を固定・無効化しない）', () => {
    for (const f of cssFiles(SRC)) {
      expect(read(relative(SRC, f)), relative(SRC, f)).not.toMatch(/text-size-adjust/)
    }
  })

  it('main.jsx が描画前に initTextZoom() を呼ぶ', () => {
    const main = readFileSync(resolve(SRC, 'main.jsx'), 'utf8')
    const init = main.indexOf('initTextZoom()')
    expect(init).toBeGreaterThan(-1)
    expect(init).toBeLessThan(main.indexOf('createRoot('))
  })
})
