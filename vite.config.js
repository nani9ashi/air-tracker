import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// モバイル前提・相対パス配信（任意のホスティングに置けるよう base: './'）。
export default defineConfig({
  base: './',
  // Vitest 設定（純粋ロジックのユニットテスト）。store.js が localStorage を触るため jsdom。
  test: {
    environment: 'jsdom',
    globals: true,
  },
  plugins: [
    react(),
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
        name: 'Air Tracker — 空気入れトラッカー',
        short_name: 'Air Tracker',
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
  ],
})
