import { useEffect } from 'react'
import GlassCard from '../components/GlassCard.jsx'
import StatTile from '../components/StatTile.jsx'
import Heatmap from '../components/Heatmap.jsx'
import Icon from '../components/Icon.jsx'
import { useStore } from '../store/useStore.js'
import { getActiveAirItem, getLimits } from '../store/store.js'
import { averageIntervalDays, currentStreak, totalCount, cycleTrend, sortedHistory } from '../lib/stats.js'
import { daysBetween } from '../lib/date.js'
import { track, EV } from '../lib/analytics.js'
import './StatsScreen.css'

export default function StatsScreen() {
  const state = useStore()
  const item = getActiveAirItem(state)
  const avg = averageIntervalDays(item.history)
  const streak = currentStreak(item.history, item.intervalDays)
  const total = totalCount(item.history)
  const trend = cycleTrend(item.history, item.intervalDays)
  const limits = getLimits(state)

  // 無料は直近1ヶ月（約5週）。Pro/Premium は最古の記録〜現在をカバー（18〜53週）。
  const heatmapWeeks = (() => {
    if (limits.heatmapWeeks !== 'auto') return limits.heatmapWeeks
    const s = sortedHistory(item.history)
    if (!s.length) return 18
    const days = daysBetween(s[0].date, new Date())
    return Math.max(18, Math.min(53, Math.ceil(days / 7) + 1))
  })()

  // 全期間ヒートがロックされている無料ユーザーが統計を開いた＝ペイウォール到達（画面表示ごと1回）。
  const heatmapLocked = limits.heatmapWeeks !== 'auto' && total > 0
  useEffect(() => {
    if (heatmapLocked) track(EV.PAYWALL, { source: 'heatmap' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
            <span className="stats__card-sub">
              記録{total}件 · {limits.heatmapWeeks === 'auto' ? '全期間' : '直近1ヶ月'}
            </span>
          </div>
          {total === 0 ? (
            <div className="stats__empty">
              <Icon name="bike" size={40} style={{ color: 'var(--text-muted)', opacity: 0.6 }} />
              <p className="cad-body" style={{ color: 'var(--text-secondary)' }}>まだ記録がありません。</p>
            </div>
          ) : (
            <>
              <Heatmap history={item.history} intervalDays={item.intervalDays} weeks={heatmapWeeks} />
              {limits.heatmapWeeks !== 'auto' && (
                <p className="stats__premium" role="status">
                  <Icon name="lock" size={14} /> 無料版は直近1ヶ月（Proで全期間）
                </p>
              )}
            </>
          )}
        </GlassCard>
      </main>
    </div>
  )
}
