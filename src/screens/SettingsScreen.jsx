import { useEffect, useRef, useState } from 'react'
import Button from '../components/Button.jsx'
import { useStore } from '../store/useStore.js'
import {
  getActiveBike,
  setBikeName,
  setTheme,
  exportJSON,
  importJSON,
  addBike,
  removeBike,
} from '../store/store.js'
import { toDateInputValue } from '../lib/date.js'
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
  const canDelete = state.bikes.length > 1

  const handleAddBike = () => {
    const n = window.prompt('追加する自転車の名前', '')
    if (n && n.trim()) addBike(n.trim())
  }

  const handleDeleteBike = () => {
    if (!canDelete) return
    if (window.confirm(`「${bike.name}」を削除しますか？記録もすべて消えます。`)) {
      removeBike(bike.id)
    }
  }

  const [name, setName] = useState(bike.name)
  const [backupMsg, setBackupMsg] = useState(null) // { ok, text }
  const fileRef = useRef(null)

  // 外部要因（インポート・自転車切替）で名前が変わったら入力欄を同期。
  useEffect(() => {
    setName(bike.name)
  }, [bike.id, bike.name])

  const commitName = () => {
    const trimmed = name.trim()
    if (trimmed && trimmed !== bike.name) setBikeName(trimmed)
    else setName(bike.name) // 空なら元に戻す
  }

  const handleExport = () => {
    const blob = new Blob([exportJSON()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `air-tracker-backup-${toDateInputValue()}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    setBackupMsg({ ok: true, text: 'バックアップを書き出しました' })
  }

  const handleImportFile = (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // 同じファイルを再選択できるようリセット
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const res = importJSON(String(reader.result))
      setBackupMsg(
        res.ok
          ? { ok: true, text: 'バックアップを復元しました' }
          : { ok: false, text: res.error || '復元に失敗しました' },
      )
    }
    reader.onerror = () =>
      setBackupMsg({ ok: false, text: 'ファイルを読み取れませんでした' })
    reader.readAsText(file)
  }

  return (
    <div className="settings">
      <header className="settings__header">
        <h1 className="cad-h2">設定</h1>
      </header>

      <main className="settings__main">
        {/* 自転車 */}
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
          <div className="settings__backup">
            <Button variant="ghost" size="md" fullWidth onClick={handleAddBike}>
              ＋ 自転車を追加
            </Button>
            <Button
              variant="ghost"
              size="md"
              fullWidth
              onClick={handleDeleteBike}
              disabled={!canDelete}
            >
              🗑 この自転車を削除
            </Button>
          </div>
          {!canDelete && (
            <p className="settings__hint">自転車は最低1台必要です。</p>
          )}
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

        {/* バックアップ */}
        <section className="settings__section">
          <span className="cad-eyebrow settings__label">バックアップ</span>
          <div className="settings__backup">
            <Button variant="ghost" size="md" fullWidth onClick={handleExport}>
              ⬇ エクスポート
            </Button>
            <Button
              variant="ghost"
              size="md"
              fullWidth
              onClick={() => fileRef.current?.click()}
            >
              ⬆ インポート
            </Button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            onChange={handleImportFile}
            style={{ display: 'none' }}
            aria-hidden="true"
          />
          {backupMsg && (
            <p
              className={`settings__backup-msg settings__backup-msg--${
                backupMsg.ok ? 'ok' : 'err'
              }`}
              role="status"
            >
              {backupMsg.text}
            </p>
          )}
          <p className="settings__hint">
            データをJSONファイルで保存・復元できます。インポートは現在のデータを置き換えます。
          </p>
        </section>

        <footer className="settings__footer">
          <p className="settings__version">Air Tracker v1.1</p>
        </footer>
      </main>
    </div>
  )
}
