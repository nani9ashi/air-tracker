import { useState } from 'react'
import Button from '../components/Button.jsx'
import IconButton from '../components/IconButton.jsx'
import GlassCard from '../components/GlassCard.jsx'
import ProgressRing from '../components/ProgressRing.jsx'
import Chip from '../components/Chip.jsx'
import Switch from '../components/Switch.jsx'
import BottomNav from '../components/BottomNav.jsx'
import StatTile from '../components/StatTile.jsx'
import ListRow from '../components/ListRow.jsx'
import Icon from '../components/Icon.jsx'

const section = { display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginBottom: 'var(--space-8)' }

function Section({ title, children }) {
  return (
    <section style={section}>
      <h2 className="cad-eyebrow" style={{ color: 'var(--text-muted)' }}>{title}</h2>
      {children}
    </section>
  )
}

export default function PreviewScreen() {
  const [light, setLight] = useState(document.documentElement.getAttribute('data-theme') === 'light')
  const [cycle, setCycle] = useState(14)
  const [nav, setNav] = useState('home')

  const toggleTheme = (on) => {
    setLight(on)
    document.documentElement.setAttribute('data-theme', on ? 'light' : 'dark')
  }

  return (
    <div style={{ padding: 'var(--gutter-screen)', paddingBottom: 'calc(var(--bottom-nav-h) + var(--space-8))' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-6)' }}>
        <h1 className="cad-h2">Components</h1>
        <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span className="cad-label" style={{ color: 'var(--text-secondary)' }}>Light</span>
          <Switch checked={light} onChange={toggleTheme} label="ライトテーマ切替" />
        </label>
      </header>

      <Section title="Progress Ring (gradient)">
        <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          <ProgressRing progress={0.75} tone="accent" size={120} stroke={12}>
            <span className="cad-display" style={{ fontSize: 40 }}>9</span>
          </ProgressRing>
          <ProgressRing progress={0.2} tone="warning" size={120} stroke={12}>
            <span className="cad-display" style={{ fontSize: 40 }}>2</span>
          </ProgressRing>
          <ProgressRing progress={0.05} tone="energy" size={120} stroke={12}>
            <span className="cad-display" style={{ fontSize: 40 }}>0</span>
          </ProgressRing>
          <GlassCard variant="spotlight" radius="28px" style={{ padding: 16 }}>
            <ProgressRing progress={0.6} tone="contrast" size={120} stroke={12} gloss>
              <span className="cad-display" style={{ fontSize: 40, color: '#fff' }}>14</span>
            </ProgressRing>
          </GlassCard>
        </div>
      </Section>

      <Section title="Buttons">
        <Button variant="energy" size="lg" block iconLeft={<Icon name="plus-circle" />}>空気入れた！</Button>
        <Button variant="primary" block>保存</Button>
        <Button variant="secondary" block>セカンダリ</Button>
        <Button variant="ghost" block>キャンセル</Button>
        <Button variant="primary" block disabled>無効</Button>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <IconButton label="設定" variant="glass" size="sm"><Icon name="settings" size={18} /></IconButton>
          <IconButton label="テーマ" variant="glass" size="sm"><Icon name="moon" size={18} /></IconButton>
          <IconButton label="追加" variant="primary"><Icon name="plus-circle" /></IconButton>
          <IconButton label="閉じる" variant="ghost"><Icon name="x" /></IconButton>
        </div>
      </Section>

      <Section title="Glass Cards">
        <GlassCard variant="glass"><span className="cad-body">glass</span></GlassCard>
        <GlassCard variant="solid"><span className="cad-body">solid</span></GlassCard>
        <GlassCard variant="spotlight"><span className="cad-body" style={{ color: '#fff' }}>spotlight</span></GlassCard>
      </Section>

      <Section title="Chips">
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {[7, 14, 21, 28].map((d) => (
            <Chip key={d} selected={cycle === d} onClick={() => setCycle(d)}>{d}日</Chip>
          ))}
          <Chip locked onClick={() => {}}>カスタム</Chip>
        </div>
      </Section>

      <Section title="Stat Tiles (in card)">
        <GlassCard variant="glass">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <StatTile value={12} unit="日" label="平均間隔" tone="accent" />
            <StatTile value={3} unit="回" label="連続達成" />
            <StatTile value="安定" label="直近傾向" tone="accent" />
          </div>
        </GlassCard>
      </Section>

      <Section title="List Row">
        <GlassCard variant="glass">
          <ListRow
            thumb={<span style={{ width: 38, height: 38, borderRadius: 12, background: 'var(--accent-soft)', display: 'grid', placeItems: 'center' }}><Icon name="check" size={18} style={{ color: 'var(--text-accent)' }} /></span>}
            title="6月20日(土)"
            subtitle="9日前 ・ 前回から14日"
            trailing={<Icon name="more-vertical" size={18} style={{ color: 'var(--text-muted)' }} />}
          />
        </GlassCard>
      </Section>

      <BottomNav
        active={nav}
        onChange={setNav}
        items={[
          { key: 'home', label: 'ホーム', icon: <Icon name="gauge" size={22} /> },
          { key: 'history', label: '履歴', icon: <Icon name="history" size={22} /> },
          { key: 'stats', label: '統計', icon: <Icon name="bar-chart-3" size={22} /> },
          { key: 'settings', label: '設定', icon: <Icon name="settings" size={22} /> },
        ]}
      />
    </div>
  )
}
