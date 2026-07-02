// QUUKI ネイティブ用ソース画像生成（@capacitor/assets の入力）。
// 二重シェブロン(brand)を sharp でラスタライズし assets/ に出力する。
// 実行: node scripts/gen-native-assets.mjs → その後 `npx capacitor-assets generate --android`
import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets')

// 二重シェブロン（viewBox 0 0 64 64・translate(-2 0) で中央寄せ）。
const chevronPaths = '<path d="M16 16 L34 32 L16 48"/><path d="M34 16 L52 32 L34 48"/>'
function chevron(stroke, scale) {
  return (
    `<g transform="translate(32 32) scale(${scale}) translate(-32 -32)">` +
    `<g transform="translate(-2 0)" fill="none" stroke="${stroke}" stroke-width="8" ` +
    `stroke-linecap="round" stroke-linejoin="round">${chevronPaths}</g></g>`
  )
}
// gradient id は "g" 固定（各SVGは独立ファイルなので衝突しない）。
const gradBg = '<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1ED5D0"/><stop offset="1" stop-color="#0A8C8C"/></linearGradient>'
const gradMark = '<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#34E0D2"/><stop offset="1" stop-color="#0DA9A9"/></linearGradient>'

function svg({ size, defs = '', bg = '', chev = '' }) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">` +
      (defs ? `<defs>${defs}</defs>` : '') + bg + chev + '</svg>'
  )
}

const jobs = [
  // adaptive 前景: 透過・白シェブロン（セーフゾーン内 ~45%）
  { file: 'icon-foreground.png', buf: svg({ size: 1024, chev: chevron('#FFFFFF', 0.9) }) },
  // adaptive 背景: teal グラデ全面
  { file: 'icon-background.png', buf: svg({ size: 1024, defs: gradBg, bg: '<rect width="64" height="64" fill="url(#g)"/>' }) },
  // 汎用アイコン（round/legacy/iOS）: フルブリード teal グラデ＋白シェブロン
  { file: 'icon-only.png', buf: svg({ size: 1024, defs: gradBg, bg: '<rect width="64" height="64" fill="url(#g)"/>', chev: chevron('#FFFFFF', 1) }) },
  // スプラッシュ: #07110F 地＋teal グラデのシェブロン（マークのみ）
  { file: 'splash.png', buf: svg({ size: 2732, defs: gradMark, bg: '<rect width="64" height="64" fill="#07110F"/>', chev: chevron('url(#g)', 0.5) }) },
  { file: 'splash-dark.png', buf: svg({ size: 2732, defs: gradMark, bg: '<rect width="64" height="64" fill="#07110F"/>', chev: chevron('url(#g)', 0.5) }) },
]

await mkdir(outDir, { recursive: true })
for (const j of jobs) {
  await sharp(j.buf).png().toFile(join(outDir, j.file))
  console.log('generated assets/' + j.file)
}

// 通知スモールアイコン（白シェブロン・透過）を android res に直接生成。
// @capacitor/assets は通知アイコン非対応のため sharp で各密度を書き出す。
// Android は小アイコンをアルファ（シルエット）で描画する＝白＝正しく表示される。
const resDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'android', 'app', 'src', 'main', 'res')
const statDensities = { 'drawable-mdpi': 24, 'drawable-hdpi': 36, 'drawable-xhdpi': 48, 'drawable-xxhdpi': 72, 'drawable-xxxhdpi': 96 }
for (const [dir, px] of Object.entries(statDensities)) {
  const d = join(resDir, dir)
  await mkdir(d, { recursive: true })
  await sharp(svg({ size: px, chev: chevron('#FFFFFF', 1.25) })).png().toFile(join(d, 'ic_stat_quuki.png'))
  console.log('generated ' + dir + '/ic_stat_quuki.png')
}

console.log('done')
