import { useEffect, useState } from 'react'
import HomeScreen from './screens/HomeScreen.jsx'
import BottomNav from './components/BottomNav.jsx'
import PreviewScreen from './screens/PreviewScreen.jsx'

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
  const [tab, setTab] = useState('home')

  // 開発時のみ #preview でコンポーネントカタログ。
  if (import.meta.env.DEV && hash === '#preview') {
    return <PreviewScreen />
  }

  return (
    <>
      {tab === 'home' ? (
        <HomeScreen />
      ) : (
        <div
          style={{
            minHeight: '100dvh',
            display: 'grid',
            placeItems: 'center',
            padding: 'var(--gutter-screen)',
          }}
        >
          <p className="cad-body" style={{ color: 'var(--text-secondary)' }}>
            設定は P5 で実装します。
          </p>
        </div>
      )}

      <BottomNav
        active={tab}
        onChange={setTab}
        items={[
          { key: 'home', label: 'ホーム', icon: '◎' },
          { key: 'settings', label: '設定', icon: '⚙' },
        ]}
      />
    </>
  )
}
