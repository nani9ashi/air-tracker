import { useState } from 'react'
import Sheet from '../components/Sheet.jsx'
import Icon from '../components/Icon.jsx'
import { useStore } from '../store/useStore.js'
import { setActiveBike, addBike, getLimits } from '../store/store.js'
import './BikeSheet.css'

/**
 * 自転車の切替・追加シート（ホームヘッダから開く）。
 * 複数自転車は Premium（free/pro は1台）。
 */
export default function BikeSheet({ open, onClose }) {
  const state = useStore()
  const bikes = state.bikes
  const activeId = state.settings.activeBikeId
  const addLocked = bikes.length >= getLimits(state).bikes
  const [showPremium, setShowPremium] = useState(false)

  const pick = (id) => {
    setActiveBike(id)
    onClose()
  }

  const add = () => {
    if (addLocked) {
      setShowPremium(true)
      return
    }
    const name = window.prompt('自転車の名前', '')
    if (name && name.trim()) {
      addBike(name.trim())
      onClose()
    }
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
        aria-label={addLocked ? '自転車を追加（Premiumで解放）' : '自転車を追加'}
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
          <Icon name="lock" size={14} /> 複数の自転車の管理はPremiumで解放されます
        </p>
      )}
    </Sheet>
  )
}
