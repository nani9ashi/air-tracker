import './BottomNav.css'

/**
 * 下タブナビ（ホーム・設定の2タブ）。
 * items: [{ key, label, icon }], active: 現在キー, onChange(key)。
 */
export default function BottomNav({ items, active, onChange }) {
  return (
    <nav className="bottom-nav" aria-label="メインナビゲーション">
      <ul className="bottom-nav__list">
        {items.map((item) => {
          const isActive = item.key === active
          return (
            <li key={item.key} className="bottom-nav__item">
              <button
                type="button"
                className={[
                  'bottom-nav__btn',
                  isActive ? 'bottom-nav__btn--active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => onChange(item.key)}
              >
                <span className="bottom-nav__icon" aria-hidden="true">
                  {item.icon}
                </span>
                <span className="bottom-nav__label">{item.label}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
