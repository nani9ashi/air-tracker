import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { initAnalytics, track, EV } from './lib/analytics.js'
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
