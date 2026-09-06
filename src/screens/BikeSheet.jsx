import { useEffect, useState } from 'react'
import Sheet from '../components/Sheet.jsx'
import Icon from '../components/Icon.jsx'
import { PromptForm } from '../components/PromptSheet.jsx'
import { useStore } from '../store/useStore.js'
import { setActiveBike, addBike, getLimits } from '../store/store.js'
import { track, EV } from '../lib/analytics.js'
import './BikeSheet.css'

/**
 * 自転車の切替・追加シート（ホームヘッダから開く）。
 * 複数台は有料版で解放（PLAN_LIMITS）。無料は1台。
 */
export default function BikeSheet({ open, onClose }) {
  const state = useStore()
  const bikes = state.bikes
  const activeId = state.settings.activeBikeId
  const addLocked = bikes.length >= getLimits(state).bikes
  const [showPremium, setShowPremium] = useState(false)
  // このシート自身が Sheet なので、追加の入力は入れ子の Sheet ではなく
  // 本体の差し替えで出す（入れ子にすると背景タップ・Escape が二重に効く）。
  const [mode, setMode] = useState('list')

  useEffect(() => {
    if (!open) setMode('list')
  }, [open])

  const pick = (id) => {
    setActiveBike(id)
    onClose()
  }

  const add = () => {
    if (addLocked) {
      track(EV.PAYWALL, { source: 'add_bike' })
      setShowPremium(true)
      return
    }
    setMode('add')
  }

  if (mode === 'add') {
    return (
      <Sheet open={open} onClose={onClose} title="自転車を追加">
        <PromptForm
          label="名前"
          maxLength={20}
          placeholder="例: 通勤号"
          confirmLabel="追加する"
          onConfirm={(name) => {
            addBike(name)
            onClose()
          }}
          onCancel={() => setMode('list')}
        />
      </Sheet>
    )
  }

  return (
    <Sheet open={open} onClose={onClose} title="自転車を選ぶ">
      <ul className="bike-sheet__list" role="radiogroup" aria-label="自転車">
        {bikes.map((b) => {
          const active = b.id === activeId
          return (
            <li key={b.id}>
              <button
                type="button"
                role="radio"
                aria-checked={active}
                className={['bike-sheet__item', active ? 'bike-sheet__item--active' : '']
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => pick(b.id)}
              >
                <span aria-hidden="true" className="bike-sheet__icon">🚲</span>
                <span className="bike-sheet__name">{b.name}</span>
                {active && (
                  <span className="bike-sheet__check" aria-hidden="true">✓</span>
                )}
              </button>
            </li>
          )
        })}
      </ul>

      <button
        type="button"
        className="bike-sheet__add"
        onClick={add}
        aria-label={addLocked ? '自転車を追加（Proで解放）' : '自転車を追加'}
      >
        {addLocked ? (
          <>
            <Icon name="lock" size={16} /> 自転車を追加
          </>
        ) : (
          '＋ 自転車を追加'
        )}
      </button>

      {showPremium && (
        <p className="bike-sheet__premium" role="status">
          <Icon name="lock" size={14} /> 複数の自転車の管理はProで解放されます
        </p>
      )}
    </Sheet>
  )
}
