import { useEffect, useState } from 'react'
import HomeScreen from './screens/HomeScreen.jsx'
import SettingsScreen from './screens/SettingsScreen.jsx'
import BottomNav from './components/BottomNav.jsx'
import PreviewScreen from './screens/PreviewScreen.jsx'
import { useStore } from './store/useStore.js'
import { applyTheme, watchSystemTheme } from './lib/theme.js'

function useHash() {
  const [hash, setHash] = useState(window.location.hash)
  useEffect(() => {
    const onHash = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return hash
}

// settings.theme を <html data-theme> に反映。auto は OS 設定に追従。
function useApplyTheme() {
  const theme = useStore((s) => s.settings.theme)
  useEffect(() => {
    applyTheme(theme)
    return watchSystemTheme(theme, () => applyTheme(theme))
  }, [theme])
}

export default function App() {
  const hash = useHash()
  const [tab, setTab] = useState('home')
  useApplyTheme()

  // 開発時のみ #preview でコンポーネントカタログ。
  if (import.meta.env.DEV && hash === '#preview') {
    return <PreviewScreen />
  }

  return (
    <>
      {tab === 'home' ? <HomeScreen /> : <SettingsScreen />}

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
