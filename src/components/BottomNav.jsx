import './BottomNav.css'

/**
 * 下タブナビ（Cadence 準拠：浮遊ガラスドック）。
 * アクティブタブはアイコンに角丸グラデスクエア＋グローのハイライト。
 * items: [{ key, label, icon }]（icon は React ノード＝<Icon name/>）。
 *
 * v2.3: 背景・境界線はビューポート全幅（.bottom-nav）、操作領域だけ
 * アプリ列 420px に中央寄せ（.bottom-nav__inner）。420px を超える画面
 * （タブレット/デスクトップPWA/大きめのDisplay size設定端末）で左右に
 * 地の色が覗き「浮いた長方形」に見えていたのを解消する。
 */
export default function BottomNav({ items, active, onChange }) {
  return (
    <nav className="bottom-nav" aria-label="メインナビゲーション">
      <div className="bottom-nav__inner">
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
      </div>
    </nav>
  )
}
