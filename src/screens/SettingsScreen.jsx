import { useEffect, useRef, useState } from 'react'
import GlassCard from '../components/GlassCard.jsx'
import Icon from '../components/Icon.jsx'
import QuukiMark from '../components/QuukiMark.jsx'
import Toast from '../components/Toast.jsx'
import PromptSheet from '../components/PromptSheet.jsx'
import ConfirmSheet from '../components/ConfirmSheet.jsx'
import { useStore } from '../store/useStore.js'
import {
  getActiveBike,
  getLimits,
  setBikeName,
  setTheme,
  exportJSON,
  importJSON,
  addBike,
  removeBike,
  setPlan,
  APP_VERSION,
} from '../store/store.js'
import { exportBackup } from '../lib/backup.js'
import { fireTestNotification } from '../lib/notifications.js'
import { track, EV } from '../lib/analytics.js'
import './SettingsScreen.css'

const THEMES = [
  { key: 'dark', label: 'ダーク', icon: 'moon' },
  { key: 'light', label: 'ライト', icon: 'sun' },
  { key: 'auto', label: '自動', icon: 'smartphone' },
]

export default function SettingsScreen() {
  const state = useStore()
  const bike = getActiveBike(state)
  const theme = state.settings.theme
  const canDelete = state.bikes.length > 1
  const limits = getLimits(state)
  const addLocked = state.bikes.length >= limits.bikes
  const backupLocked = !limits.backup

  const [name, setName] = useState(bike.name)
  const [addOpen, setAddOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [toast, setToast] = useState(null)
  const fileRef = useRef(null)
  const toastTimer = useRef(0)
  const planTaps = useRef(0)

  useEffect(() => {
    setName(bike.name)
  }, [bike.id, bike.name])

  const showToast = (message) => {
    setToast(message)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2200)
  }
  useEffect(() => () => window.clearTimeout(toastTimer.current), [])

  const commitName = () => {
    const t = name.trim()
    if (t && t !== bike.name) setBikeName(t)
    else setName(bike.name)
  }

  const handleAddBike = () => {
    if (addLocked) {
      track(EV.PAYWALL, { source: 'settings_add_bike' })
      showToast('複数の自転車はProで解放されます')
      return
    }
    setAddOpen(true)
  }
  const handleDeleteBike = () => {
    if (canDelete) setDeleteOpen(true)
  }

  const handleExport = async () => {
    if (backupLocked) {
      track(EV.PAYWALL, { source: 'backup_export' })
      showToast('バックアップはProで解放されます')
      return
    }
    const res = await exportBackup(exportJSON())
    if (res.ok) showToast('バックアップを書き出しました')
    else if (res.reason === 'cancelled') return // 自分でやめた操作にトーストは出さない
    else showToast('バックアップを書き出せませんでした')
  }
  // ⚠ 読み込み側は変更不要。<input type=file> は Capacitor の
  // BridgeWebChromeClient.onShowFileChooser が SAF ピッカーへ橋渡しするので
  // native でも動く（accept も EXTRA_MIME_TYPES として渡る）。
  // 書き出しと違って自前の経路は要らない。
  const handleImportFile = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const res = importJSON(String(reader.result))
      showToast(res.ok ? 'バックアップを復元しました' : res.error || '復元に失敗しました')
    }
    reader.onerror = () => showToast('ファイルを読み取れませんでした')
    reader.readAsText(file)
  }

  // 開発時のみ: 版フッターを5回タップで free→pro→premium を循環（本番ビルドでは無効）。
  const bumpPlan = () => {
    if (!import.meta.env.DEV) return
    planTaps.current += 1
    if (planTaps.current >= 5) {
      planTaps.current = 0
      const order = ['free', 'pro', 'premium']
      const next = order[(order.indexOf(state.settings.plan) + 1) % order.length]
      setPlan(next)
      showToast(`開発: プラン = ${next}`)
    }
  }

  // 開発時のみ: 通知の実機到達確認（1a-2残）。1分後に本番と同形の通知を発火する。
  // 推奨サイクルが7〜28日と長く、通常の操作フローでは何日も待たないと
  // 確認できないため、実機検証をこのボタンだけで完結させる。
  const [testNotifStatus, setTestNotifStatus] = useState('idle') // 'idle'|'sending'|'sent'|'error'
  const handleFireTestNotification = async () => {
    if (!import.meta.env.DEV) return
    setTestNotifStatus('sending')
    const res = await fireTestNotification()
    if (res.ok) {
      setTestNotifStatus('sent')
      showToast(`開発: テスト通知を ${res.at.toLocaleTimeString('ja-JP')} に予約`)
    } else {
      setTestNotifStatus('error')
      showToast(`開発: テスト通知を送れませんでした（${res.reason}）`)
    }
  }

  return (
    <div className="settings">
      <header className="settings__header">
        <h1 className="cad-h2">設定</h1>
      </header>

      <main className="settings__main">
        {/* 自転車 */}
        <section className="settings__section">
          <span className="settings__label">自転車</span>
          <GlassCard variant="glass">
            <label className="settings__sublabel" htmlFor="bike-name">名前</label>
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
            <div className="settings__row2">
              <button
                type="button"
                className="sheet-opt settings__btn"
                onClick={handleAddBike}
                aria-label={addLocked ? '自転車を追加（Proで解放）' : '自転車を追加'}
              >
                <span className="sheet-opt__icon">
                  <Icon name={addLocked ? 'lock' : 'plus-circle'} size={20} />
                </span>
                <span className="sheet-opt__label">自転車を追加</span>
              </button>
              <button
                type="button"
                className="sheet-opt settings__btn"
                onClick={handleDeleteBike}
                disabled={!canDelete}
                aria-disabled={!canDelete}
              >
                <span className="sheet-opt__icon"><Icon name="trash-2" size={20} /></span>
                <span className="sheet-opt__label">削除</span>
              </button>
            </div>
            {!canDelete && <p className="settings__hint">自転車は最低1台必要です。</p>}
          </GlassCard>
        </section>

        {/* テーマ */}
        <section className="settings__section">
          <span className="settings__label" id="theme-label">テーマ</span>
          <div className="settings__themes" role="radiogroup" aria-labelledby="theme-label">
            {THEMES.map((t) => {
              const active = theme === t.key
              return (
                <button
                  key={t.key}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={['settings__theme-btn', active ? 'is-active' : ''].filter(Boolean).join(' ')}
                  onClick={() => setTheme(t.key)}
                >
                  <Icon name={t.icon} size={18} />
                  {t.label}
                </button>
              )
            })}
          </div>
          <p className="settings__hint">「自動」は端末の表示設定（ダーク/ライト）に追従します。</p>
        </section>

        {/* バックアップ */}
        <section className="settings__section">
          <span className="settings__label">データのバックアップ</span>
          <div className="settings__row2">
            <button
              type="button"
              className="sheet-opt settings__btn settings__btn--center"
              onClick={handleExport}
              aria-label={backupLocked ? '書き出し（Proで解放）' : '書き出し'}
            >
              <Icon name={backupLocked ? 'lock' : 'download'} size={18} />
              書き出し
            </button>
            {backupLocked ? (
              <button
                type="button"
                className="sheet-opt settings__btn settings__btn--center"
                onClick={() => {
                  track(EV.PAYWALL, { source: 'backup_import' })
                  showToast('バックアップはProで解放されます')
                }}
                aria-label="読み込み（Proで解放）"
              >
                <Icon name="lock" size={18} />
                読み込み
              </button>
            ) : (
              <label className="sheet-opt settings__btn settings__btn--center">
                <Icon name="upload" size={18} />
                読み込み
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/json,.json"
                  onChange={handleImportFile}
                  style={{ display: 'none' }}
                  aria-label="バックアップファイルを選択"
                />
              </label>
            )}
          </div>
          <p className="settings__hint">
            {backupLocked
              ? 'バックアップ（書き出し/読み込み）はProで解放されます。'
              : 'インポートは現在のデータを置き換えます。'}
          </p>
        </section>

        {/* 開発ツール: 本番ビルドでは import.meta.env.DEV が false になり、
            この <section> ごと消える（v2.2.0 リスク#5 と同じ3層検証で無効化を
            確認する: ソース → web/nativeビルド → AAB展開後のJS）。 */}
        {import.meta.env.DEV && (
          <section className="settings__section">
            <span className="settings__label">開発ツール</span>
            <GlassCard variant="glass">
              <button
                type="button"
                className="sheet-opt settings__btn settings__btn--center"
                onClick={handleFireTestNotification}
                disabled={testNotifStatus === 'sending'}
              >
                <Icon name="alarm-clock" size={18} />
                通知を1分後にテスト発火
              </button>
              <p className="settings__hint">
                1a-2残の実機確認用。本番と同じ allowWhileIdle/smallIcon で送る。
              </p>
            </GlassCard>
          </section>
        )}

        <footer className="settings__footer">
          <div className="settings__brand" onClick={bumpPlan}>
            <QuukiMark size={20} />
            <span className="settings__wordmark">QUUKI</span>
            <span className="settings__version">v{APP_VERSION}</span>
          </div>
        </footer>
      </main>

      <PromptSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="自転車を追加"
        label="名前"
        maxLength={20}
        placeholder="例: 通勤号"
        confirmLabel="追加する"
        onConfirm={(n) => {
          addBike(n)
          setAddOpen(false)
          showToast('自転車を追加しました')
        }}
      />
      <ConfirmSheet
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="自転車を削除"
        message={`「${bike.name}」を削除しますか？記録もすべて消えます。`}
        onConfirm={() => {
          removeBike(bike.id)
          setDeleteOpen(false)
          showToast('自転車を削除しました')
        }}
      />

      <Toast show={!!toast} message={toast} />
    </div>
  )
}
