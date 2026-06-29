import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { getActiveBike, setBikeName, setTheme } from '../store/store.js'
import './SettingsScreen.css'

const THEME_OPTIONS = [
  { key: 'auto', label: '自動', hint: '端末の設定に追従' },
  { key: 'dark', label: 'ダーク', hint: null },
  { key: 'light', label: 'ライト', hint: null },
]

export default function SettingsScreen() {
  const state = useStore()
  const bike = getActiveBike(state)
  const theme = state.settings.theme

  const [name, setName] = useState(bike.name)

  const commitName = () => {
    const trimmed = name.trim()
    if (trimmed && trimmed !== bike.name) setBikeName(trimmed)
    else setName(bike.name) // 空なら元に戻す
  }

  return (
    <div className="settings">
      <header className="settings__header">
        <h1 className="cad-h2">設定</h1>
      </header>

      <main className="settings__main">
        {/* 自転車名 */}
        <section className="settings__section">
          <label className="cad-eyebrow settings__label" htmlFor="bike-name">
            自転車の名前
          </label>
          <input
            id="bike-name"
            type="text"
            className="settings__input"
            value={name}
            maxLength={20}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                e.currentTarget.blur()
              }
            }}
          />
        </section>

        {/* テーマ */}
        <section className="settings__section">
          <span className="cad-eyebrow settings__label" id="theme-label">
            テーマ
          </span>
          <div
            className="settings__segmented"
            role="radiogroup"
            aria-labelledby="theme-label"
          >
            {THEME_OPTIONS.map((opt) => {
              const active = theme === opt.key
              return (
                <button
                  key={opt.key}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={[
                    'settings__seg',
                    active ? 'settings__seg--active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => setTheme(opt.key)}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
          <p className="settings__hint">
            既定はダーク。「自動」は端末の表示設定（ダーク/ライト）に追従します。
          </p>
        </section>

        <footer className="settings__footer">
          <p className="settings__version">Air Tracker v1</p>
        </footer>
      </main>
    </div>
  )
}
