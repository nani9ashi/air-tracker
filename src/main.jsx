import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { initAnalytics, track, EV } from './lib/analytics.js'
// フォント読込はビルドモードで分岐する:
//  - ネイティブ（capacitor）: SW/CDN が無いためフォントを同梱（fonts-native.js）。
//  - Web: index.html の Google Fonts CDN + SW runtimeCaching（vite.config.js）で解決。
// import.meta.env.MODE はビルド時に静的置換されるため、Web ビルドでは下記 import は
// ツリーシェイクされ、フォント資産は dist に出力されない（デプロイ肥大・PWA プリキャッシュ肥大を回避）。
if (import.meta.env.MODE === 'capacitor') import('./fonts-native.js')
import './styles/tokens.css'
import './styles/global.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// 計測（訪問＝pageview／PWAインストール）。プライバシー配慮・本番のみ送信。
initAnalytics()
window.addEventListener('appinstalled', () => track(EV.PWA_INSTALL))
window.addEventListener('beforeinstallprompt', () => track(EV.PWA_PROMPT))
