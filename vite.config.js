import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// @fontsource は各 @font-face の src に woff2 と woff を並べて出す
// （例: src: url(...woff2) format('woff2'), url(...woff) format('woff')）。
// minSdkVersion 24（android/variables.gradle）= WebView Chromium 51+ であり、
// woff2 は Chrome 36（2014）から対応済みのため、native ビルドでは woff の
// フォールバックが**全端末で一度も読まれない**死荷重になる
// （v2.2.0/versionCode13 の AAB 実測: フォントが圧縮後 25.09MB=全体の86%、
// うち woff だけで 14.19MB）。CSS の url() 参照を落として出力ごと止める。
// ⚠ web ビルドはそもそも main.jsx の import.meta.env.MODE 分岐で
// fonts-native.js 自体が tree-shake され、woff/woff2 とも 0 件で出力されない
// （実測確認済み）。このプラグインは native ビルドにのみ意味を持つ。
function dropLegacyWoff() {
  return {
    name: 'quuki-drop-legacy-woff',
    enforce: 'pre', // vite:css の url() 解決より前に文字列レベルで削る
    transform(code, id) {
      if (!id.includes('@fontsource') || !/\.css(\?|$)/.test(id)) return null
      const out = code.replace(/,\s*url\([^)]+\.woff\)\s*format\(['"]woff['"]\)/g, '')
      return out === code ? null : { code: out, map: null }
    },
    // ⚠ 静かに効かなくなるのを防ぐ番人。@fontsource の CSS 書式が変わって
    //    上の正規表現が外れても、ビルドは通ってサイズだけ元に戻る、という
    //    事故を起こさない（native ビルドでのみ検査。web は元から 0 件）。
    generateBundle(_opts, bundle) {
      if (process.env.__QUUKI_BUILD_TARGET__ !== 'capacitor') return
      const leaked = Object.keys(bundle).filter((f) => f.endsWith('.woff'))
      if (leaked.length) {
        this.error(
          `.woff が ${leaked.length} 件 native ビルドに混入した（死荷重）。dropLegacyWoff の正規表現が @fontsource の CSS 書式変更で外れていないか確認すること: ${leaked.slice(0, 3).join(', ')}`,
        )
      }
    },
  }
}

// モバイル前提・相対パス配信（任意のホスティングに置けるよう base: './'）。
// `--mode capacitor`（build:native）では Service Worker/PWA を外す。
// ネイティブ(WebView)はアプリshellを端末内から配信するため SW は不要で、
// 更新/stale/白画面の衝突要因になるため載せない。
export default defineConfig(({ mode }) => {
  const native = mode === 'capacitor'
  process.env.__QUUKI_BUILD_TARGET__ = mode
  return {
    base: './',
    // Vitest 設定。store.js が localStorage を触るため jsdom。
    // globals:true は RTL の自動 cleanup（afterEach）にも効いている。
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.js'],
      coverage: {
        provider: 'v8',
        // thresholds は置かない。狙いは「未到達分岐を説明できること」
        // （docs/test-completion-report.md 完了基準 #6）であって率の達成ではない。
        // 数値ゲートにすると、説明の代わりに帳尻合わせのテストが増える。
        reporter: ['text-summary', 'html'],
        reportsDirectory: './coverage',
        include: ['src/**/*.{js,jsx}'],
        exclude: [
          'src/**/*.test.{js,jsx}',
          'src/test/**',
          'src/main.jsx',
          'src/fonts-native.js',
          'src/screens/PreviewScreen.jsx', // dev 専用のコンポーネントカタログ
        ],
      },
    },
    plugins: [
      dropLegacyWoff(),
      react(),
      ...(native
        ? []
        : [
            VitePWA({
              registerType: 'autoUpdate',
              includeAssets: [
                'icon.svg',
                'icon-192.png',
                'icon-512.png',
                'icon-maskable-512.png',
                'apple-touch-icon-180.png',
              ],
              manifest: {
                name: 'QUUKI — 自転車 空気入れリマインダー',
                short_name: 'QUUKI',
                description:
                  '自転車のタイヤに空気を入れてからの経過日数を記録するアプリ',
                lang: 'ja',
                display: 'standalone',
                orientation: 'portrait',
                theme_color: '#07110F',
                background_color: '#07110F',
                start_url: '.',
                scope: '.',
                icons: [
                  { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
                  { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
                  {
                    src: 'icon-maskable-512.png',
                    sizes: '512x512',
                    type: 'image/png',
                    purpose: 'maskable',
                  },
                ],
              },
              workbox: {
                // app shell プリキャッシュ
                globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
                // オフライン fallback（SPA: どのルートも index.html へ）
                navigateFallback: 'index.html',
                cleanupOutdatedCaches: true,
                runtimeCaching: [
                  {
                    urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
                    handler: 'StaleWhileRevalidate',
                    options: { cacheName: 'google-fonts-stylesheets' },
                  },
                  {
                    urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
                    handler: 'CacheFirst',
                    options: {
                      cacheName: 'google-fonts-webfonts',
                      expiration: {
                        maxEntries: 30,
                        maxAgeSeconds: 60 * 60 * 24 * 365,
                      },
                      cacheableResponse: { statuses: [0, 200] },
                    },
                  },
                ],
              },
              devOptions: {
                enabled: false, // 開発時は SW を無効（混乱防止）。本番ビルドで有効。
              },
            }),
          ]),
    ],
  }
})
