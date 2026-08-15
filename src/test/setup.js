// Vitest のグローバルセットアップ（vite.config.js の test.setupFiles）。
// toBeInTheDocument / toBeDisabled などのマッチャを追加する。
// RTL の自動 cleanup は globals:true（afterEach が生える）で有効なので明示不要。
import '@testing-library/jest-dom/vitest'
