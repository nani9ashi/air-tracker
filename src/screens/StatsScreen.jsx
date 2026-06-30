import GlassCard from '../components/GlassCard.jsx'
import StatTile from '../components/StatTile.jsx'
import Heatmap from '../components/Heatmap.jsx'
import Icon from '../components/Icon.jsx'
import { useStore } from '../store/useStore.js'
import { getActiveAirItem } from '../store/store.js'
import { averageIntervalDays, currentStreak, totalCount, cycleTrend } from '../lib/stats.js'
import './StatsScreen.css'

export default function StatsScreen() {
  const state = useStore()
  const item = getActiveAirItem(state)
  const avg = averageIntervalDays(item.history)
  const streak = currentStreak(item.history, item.intervalDays)
  const total = totalCount(item.history)
  const trend = cycleTrend(item.history, item.intervalDays)

  return (
    <div className="stats">
      <header className="stats__header">
        <h1 className="cad-h2">統計</h1>
      </header>

      <main className="stats__main">
        <GlassCard variant="glass">
          <div className="stats__tiles">
            <StatTile value={avg == null ? '—' : avg} unit={avg == null ? '' : '日'} label="平均間隔" tone="accent" />
            <StatTile value={streak} unit="回" label="連続達成" />
            <StatTile value={trend.label} label="直近傾向" tone={trend.tone} />
          </div>
        </GlassCard>

        <GlassCard variant="glass">
          <div className="stats__card-head">
            <span className="stats__card-title">記録ヒートマップ</span>
            <span className="stats__card-sub">記録{total}件 · 直近4ヶ月</span>
          </div>
          {total === 0 ? (
            <div className="stats__empty">
              <Icon name="bike" size={40} style={{ color: 'var(--text-muted)', opacity: 0.6 }} />
              <p className="cad-body" style={{ color: 'var(--text-secondary)' }}>まだ記録がありません。</p>
            </div>
          ) : (
            <Heatmap history={item.history} intervalDays={item.intervalDays} />
          )}
        </GlassCard>
      </main>
    </div>
  )
}
