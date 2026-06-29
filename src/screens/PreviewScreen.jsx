import { useState } from 'react'
import Button from '../components/Button.jsx'
import IconButton from '../components/IconButton.jsx'
import GlassCard from '../components/GlassCard.jsx'
import ProgressRing from '../components/ProgressRing.jsx'
import Chip from '../components/Chip.jsx'
import Switch from '../components/Switch.jsx'
import BottomNav from '../components/BottomNav.jsx'
import StatTile from '../components/StatTile.jsx'

/**
 * 開発時のみのコンポーネントカタログ（本番ルートには出さない）。
 * App から import.meta.env.DEV かつ #preview のときだけ描画。
 */
const sectionStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
  marginBottom: 'var(--space-8)',
}

function Section({ title, children }) {
  return (
    <section style={sectionStyle}>
      <h2 className="cad-eyebrow" style={{ color: 'var(--text-muted)' }}>
        {title}
      </h2>
      {children}
    </section>
  )
}

export default function PreviewScreen() {
  const [light, setLight] = useState(
    document.documentElement.getAttribute('data-theme') === 'light',
  )
  const [cycle, setCycle] = useState(14)
  const [nav, setNav] = useState('home')
  const [sw, setSw] = useState(true)

  const toggleTheme = (on) => {
    setLight(on)
    document.documentElement.setAttribute('data-theme', on ? 'light' : 'dark')
  }

  return (
    <div
      style={{
        padding: 'var(--gutter-screen)',
        paddingBottom: 'calc(var(--bottom-nav-h) + var(--space-8))',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 'var(--space-6)',
        }}
      >
        <h1 className="cad-h2">Components</h1>
        <label
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
        >
          <span className="cad-label" style={{ color: 'var(--text-secondary)' }}>
            Light
          </span>
          <Switch checked={light} onChange={toggleTheme} label="ライトテーマ切替" />
        </label>
      </header>

      <Section title="Progress Ring">
        <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          <ProgressRing progress={0.75} tone="accent" size={140} stroke={12}>
            <span className="cad-display" style={{ fontSize: 40 }}>
              9
            </span>
            <span className="cad-label" style={{ color: 'var(--text-muted)' }}>
              あと日
            </span>
          </ProgressRing>
          <ProgressRing progress={0.2} tone="warning" size={140} stroke={12}>
            <span className="cad-display" style={{ fontSize: 40 }}>
              2
            </span>
          </ProgressRing>
          <ProgressRing progress={0.05} tone="danger" size={140} stroke={12}>
            <span className="cad-display" style={{ fontSize: 40 }}>
              0
            </span>
          </ProgressRing>
        </div>
      </Section>

      <Section title="Buttons">
        <Button variant="primary" fullWidth>
          空気入れた！
        </Button>
        <Button variant="energy" fullWidth>
          超過：今すぐ
        </Button>
        <Button variant="ghost" fullWidth>
          キャンセル
        </Button>
        <Button variant="primary" disabled fullWidth>
          無効状態
        </Button>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <IconButton label="設定">⚙</IconButton>
          <IconButton label="閉じる" variant="bare">
            ✕
          </IconButton>
        </div>
      </Section>

      <Section title="Glass Card">
        <GlassCard>
          <h3 className="cad-h3" style={{ marginBottom: 'var(--space-2)' }}>
            マイバイク
          </h3>
          <p className="cad-body" style={{ color: 'var(--text-secondary)' }}>
            すりガラス調パネル。情報表示に使用。
          </p>
        </GlassCard>
      </Section>

      <Section title="Chips (cycle)">
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {[7, 14, 21, 28].map((d) => (
            <Chip
              key={d}
              selected={cycle === d}
              onClick={() => setCycle(d)}
            >
              {d}日
            </Chip>
          ))}
          <Chip locked onClick={() => {}}>
            カスタム
          </Chip>
        </div>
      </Section>

      <Section title="Stat Tiles">
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <StatTile label="サイクル" value={cycle} unit="日" />
          <StatTile label="経過" value={5} unit="日" />
        </div>
      </Section>

      <Section title="Switch">
        <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'center' }}>
          <Switch checked={sw} onChange={setSw} label="サンプルスイッチ" />
          <span className="cad-body" style={{ color: 'var(--text-secondary)' }}>
            {sw ? 'ON' : 'OFF'}
          </span>
        </div>
      </Section>

      <BottomNav
        active={nav}
        onChange={setNav}
        items={[
          { key: 'home', label: 'ホーム', icon: '◎' },
          { key: 'settings', label: '設定', icon: '⚙' },
        ]}
      />
    </div>
  )
}
