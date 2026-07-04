import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { initAnalytics, track, EV } from './lib/analytics.js'
// フォントは自己ホスト（@fontsource）。ネイティブ/オフラインでも確実に読み込む（CDN 依存を撤去）。
// 本文=Noto Sans JP / ワードマーク・ラベル=Saira / 数値=Saira Condensed
import '@fontsource/noto-sans-jp/400.css'
import '@fontsource/noto-sans-jp/500.css'
import '@fontsource/noto-sans-jp/700.css'
import '@fontsource/noto-sans-jp/900.css'
import '@fontsource/saira/600.css'
import '@fontsource/saira/700.css'
import '@fontsource/saira/800.css'
import '@fontsource/saira-condensed/600.css'
import '@fontsource/saira-condensed/700.css'
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
