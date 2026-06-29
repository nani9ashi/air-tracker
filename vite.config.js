import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// PWA設定は P4 で vite-plugin-pwa を追加する。
// v1 はモバイル前提・相対パス配信（任意のホスティングに置けるよう base: './'）。
export default defineConfig({
  base: './',
  plugins: [react()],
})
