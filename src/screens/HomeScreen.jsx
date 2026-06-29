import { useEffect, useMemo, useState } from 'react'
import ProgressRing from '../components/ProgressRing.jsx'
import Button from '../components/Button.jsx'
import Chip from '../components/Chip.jsx'
import StatTile from '../components/StatTile.jsx'
import PumpSheet from './PumpSheet.jsx'
import { useStore } from '../store/useStore.js'
import { getActiveBike, getActiveAirItem, pump, setInterval as setCycle, PRESET_INTERVALS } from '../store/store.js'
import { computeStatus, formatDateJP } from '../lib/date.js'
import './HomeScreen.css'

export default function HomeScreen() {
  const state = useStore()
  const bike = getActiveBike(state)
  const item = getActiveAirItem(state)
  const isPremium = state.settings.isPremium

  const [sheetOpen, setSheetOpen] = useState(false)
  const [showPremium, setShowPremium] = useState(false)

  // 開いたまま日付が変わってもカウントダウンを更新するため定期的に再評価。
  const [, tick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 60000)
    return () => window.clearInterval(id)
  }, [])

  const status = useMemo(
    () => computeStatus(item.lastReset, item.intervalDays, new Date()),
    [item.lastReset, item.intervalDays],
  )

  const isCustom = !PRESET_INTERVALS.includes(item.intervalDays)

  const onConfirmPump = (iso) => {
    pump(iso)
    setSheetOpen(false)
  }

  const onSelectPreset = (d) => {
    setShowPremium(false)
    setCycle(d)
  }

  const onCustomClick = () => {
    if (!isPremium) {
      setShowPremium((v) => !v)
      return
    }
    const input = window.prompt('カスタムサイクル（日数）', String(item.intervalDays))
    const v = Number(input)
    if (Number.isFinite(v) && v >= 1) setCycle(Math.round(v))
  }

  // リング中央の表示（色だけに頼らず数字＋ラベルで状態を示す）。
  const center = (() => {
    if (status.state === 'unset') {
      return (
        <>
          <span className="home__ring-eyebrow">未記録</span>
          <span className="cad-display home__ring-num">—</span>
        </>
      )
    }
    if (status.state === 'overdue') {
      return (
        <>
          <span className="home__ring-eyebrow">超過</span>
          <span className="cad-display home__ring-num">{status.overdueBy}</span>
          <span className="home__ring-unit">日</span>
        </>
      )
    }
    return (
      <>
        <span className="home__ring-eyebrow">あと</span>
        <span className="cad-display home__ring-num">{status.remaining}</span>
        <span className="home__ring-unit">日</span>
      </>
    )
  })()

  return (
    <div className="home">
      <header className="home__header">
        <h1 className="cad-h2 home__bike">
          <span aria-hidden="true">🚲</span> {bike.name}
        </h1>
      </header>

      <main className="home__main">
        <ProgressRing
          progress={status.progress}
          tone={status.tone}
          size={260}
          stroke={18}
        >
          {center}
        </ProgressRing>

        {/* 状態メッセージ: 色＋アイコン＋テキストで判別可能に */}
        <p
          className={`home__status home__status--${status.tone}`}
          role="status"
          aria-live="polite"
        >
          <span aria-hidden="true" className="home__status-icon">
            {status.icon}
          </span>
          {status.message}
        </p>

        <div className="home__stats">
          <StatTile label="サイクル" value={item.intervalDays} unit="日" />
          <StatTile
            label="経過"
            value={status.elapsed == null ? '—' : status.elapsed}
            unit={status.elapsed == null ? '' : '日'}
          />
        </div>

        {item.lastReset && (
          <p className="home__last">
            前回: {formatDateJP(item.lastReset)}
          </p>
        )}

        <Button variant="primary" size="lg" fullWidth onClick={() => setSheetOpen(true)}>
          空気入れた！
        </Button>

        <section className="home__cycles" aria-labelledby="cycle-heading">
          <h2 id="cycle-heading" className="cad-eyebrow home__cycles-title">
            推奨サイクル
          </h2>
          <div className="home__chips">
            {PRESET_INTERVALS.map((d) => (
              <Chip
                key={d}
                selected={!isCustom && item.intervalDays === d}
                onClick={() => onSelectPreset(d)}
              >
                {d}日
              </Chip>
            ))}
            <Chip
              selected={isCustom}
              locked={!isPremium}
              onClick={onCustomClick}
              aria-label={
                isPremium
                  ? 'カスタムサイクル'
                  : 'カスタムサイクル（プレミアムで解放）'
              }
            >
              {isCustom ? `${item.intervalDays}日` : 'カスタム'}
            </Chip>
          </div>
          {showPremium && (
            <p className="home__premium" role="status">
              🔒 カスタムサイクルはプレミアムで解放されます
            </p>
          )}
        </section>
      </main>

      <PumpSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onConfirm={onConfirmPump}
      />
    </div>
  )
}
