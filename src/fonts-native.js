// ネイティブ（Capacitor）ビルド専用のフォント同梱。
// ネイティブ WebView には Service Worker / CDN ランタイムキャッシュが無く、オフライン・初回起動時に
// Google Fonts を取得できないため、フォントをアプリ内に同梱する。
// ※ Web ビルドではこのモジュールを読み込まない（main.jsx でビルドモード分岐＝ツリーシェイク）。
// Web は index.html の Google Fonts CDN + SW runtimeCaching（vite.config.js）で解決する。
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
