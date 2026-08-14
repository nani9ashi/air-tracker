import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// モバイル前提・相対パス配信（任意のホスティングに置けるよう base: './'）。
// `--mode capacitor`（build:native）では Service Worker/PWA を外す。
// ネイティブ(WebView)はアプリshellを端末内から配信するため SW は不要で、
// 更新/stale/白画面の衝突要因になるため載せない。
export default defineConfig(({ mode }) => {
  const native = mode === 'capacitor'
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
