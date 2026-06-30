import './BottomNav.css'

/**
 * 下タブナビ（Cadence 準拠：浮遊ガラスドック）。
 * アクティブタブはアイコンに角丸グラデスクエア＋グローのハイライト。
 * items: [{ key, label, icon }]（icon は React ノード＝<Icon name/>）。
 */
export default function BottomNav({ items, active, onChange }) {
  return (
    <nav className="bottom-nav" aria-label="メインナビゲーション">
      {items.map((item) => {
        const on = item.key === active
        return (
          <button
            key={item.key}
            type="button"
            className={['bottom-nav__btn', on ? 'is-active' : ''].filter(Boolean).join(' ')}
            aria-label={item.label}
            aria-current={on ? 'page' : undefined}
            onClick={() => onChange(item.key)}
          >
            <span className="bottom-nav__icon" aria-hidden="true">
              {item.icon}
            </span>
            <span className="bottom-nav__label">{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
