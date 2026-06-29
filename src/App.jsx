// P0: 動く土台の確認用プレースホルダ。
// 受け入れ基準: ダーク背景(#07110F) + 日本語フォント + トークンが効いていること。
// 実体は P3 で HomeScreen に置き換える。
export default function App() {
  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--space-4)',
        padding: 'var(--gutter-screen)',
        textAlign: 'center',
      }}
    >
      <h1 className="cad-h1" style={{ color: 'var(--text-primary)' }}>
        Air Tracker
      </h1>
      <p className="cad-body" style={{ color: 'var(--text-secondary)' }}>
        空気入れトラッカー — 土台の起動確認 (P0)
      </p>
      <span
        className="cad-eyebrow"
        style={{ color: 'var(--text-accent)' }}
      >
        CADENCE · DARK THEME
      </span>
    </div>
  )
}
