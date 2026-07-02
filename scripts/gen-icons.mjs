// QUUKI アプリアイコン生成。
// ロゴガイド§3 の squircle（teal グラデ背景＋白の二重シェブロン）を sharp でラスタライズし、
// PWA / iOS 用 PNG を public/ に出力する。実行: node scripts/gen-icons.mjs
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

const BG0 = '#1ED5D0'
const BG1 = '#0A8C8C'

// フルブリード（角丸なし＝マスカブルでも背景が欠けない）。
// chevronScale<1 でマークを中央基準に縮小し、マスカブルのセーフゾーンに収める。
function iconSVG(size, chevronScale = 1) {
  const c = 32 // viewBox 中心
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${BG0}"/>
      <stop offset="1" stop-color="${BG1}"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" fill="url(#bg)"/>
  <g transform="translate(${c} ${c}) scale(${chevronScale}) translate(${-c} ${-c})">
    <g transform="translate(-2 0)" fill="none" stroke="#FFFFFF" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M16 16 L34 32 L16 48"/>
      <path d="M34 16 L52 32 L34 48"/>
    </g>
  </g>
</svg>`
}

const targets = [
  { file: 'icon-192.png', size: 192, scale: 1 },
  { file: 'icon-512.png', size: 512, scale: 1 },
  { file: 'apple-touch-icon-180.png', size: 180, scale: 1 },
  { file: 'icon-maskable-512.png', size: 512, scale: 0.8 },
]

for (const t of targets) {
  await sharp(Buffer.from(iconSVG(t.size, t.scale)))
    .png()
    .toFile(join(outDir, t.file))
  console.log('generated', t.file)
}
console.log('done')
