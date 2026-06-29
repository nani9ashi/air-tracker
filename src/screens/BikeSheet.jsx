import Sheet from '../components/Sheet.jsx'
import { useStore } from '../store/useStore.js'
import { setActiveBike, addBike } from '../store/store.js'
import './BikeSheet.css'

/**
 * 自転車の切替・追加シート（ホームヘッダから開く）。
 */
export default function BikeSheet({ open, onClose }) {
  const state = useStore()
  const bikes = state.bikes
  const activeId = state.settings.activeBikeId

  const pick = (id) => {
    setActiveBike(id)
    onClose()
  }

  const add = () => {
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

      <button type="button" className="bike-sheet__add" onClick={add}>
        ＋ 自転車を追加
      </button>
    </Sheet>
  )
}
