import { useEffect, useState } from 'react'
import PreviewScreen from './screens/PreviewScreen.jsx'

// P1: 開発時のみ #preview でコンポーネントカタログを表示。
// 本番ルート（HomeScreen）は P3 で実装する。
function useHash() {
  const [hash, setHash] = useState(window.location.hash)
  useEffect(() => {
    const onHash = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return hash
}

export default function App() {
  const hash = useHash()

  if (import.meta.env.DEV && hash === '#preview') {
    return <PreviewScreen />
  }

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--space-4)',
        padding: 'var(--gutter-screen)',
        textAlign: 'center',
      }}
    >
      <h1 className="cad-h1" style={{ color: 'var(--text-primary)' }}>
        Air Tracker
      </h1>
      <p className="cad-body" style={{ color: 'var(--text-secondary)' }}>
        コア画面は P3 で実装します。
      </p>
      {import.meta.env.DEV && (
        <a
          className="cad-label"
          style={{ color: 'var(--text-accent)' }}
          href="#preview"
        >
          → コンポーネントプレビュー (#preview)
        </a>
      )}
    </div>
  )
}
