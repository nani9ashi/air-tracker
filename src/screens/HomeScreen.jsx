import { useEffect, useMemo, useState } from 'react'
import ProgressRing from '../components/ProgressRing.jsx'
import Button from '../components/Button.jsx'
import Chip from '../components/Chip.jsx'
import GlassCard from '../components/GlassCard.jsx'
import IconButton from '../components/IconButton.jsx'
import Icon from '../components/Icon.jsx'
import QuukiMark from '../components/QuukiMark.jsx'
import { track, EV } from '../lib/analytics.js'
import { requestPermissionAfterReset, syncActiveReminder } from '../lib/notifications.js'
import PumpSheet from './PumpSheet.jsx'
import BikeSheet from './BikeSheet.jsx'
import { useStore } from '../store/useStore.js'
import {
  getActiveBike,
  getActiveAirItem,
  getLimits,
  pump,
  setInterval as setCycle,
  setTheme,
  PRESET_INTERVALS,
} from '../store/store.js'
import { computeStatus } from '../lib/date.js'
import { resolveTheme } from '../lib/theme.js'
import './HomeScreen.css'

// 状態 → Lucide アイコン / 短ラベル / リングtone / メッセージ。
const HERO = {
  ok: { icon: 'circle-check', label: 'まだ大丈夫', tone: 'accent' },
  soon: { icon: 'clock', label: 'そろそろ', tone: 'warning' },
  overdue: { icon: 'alert-triangle', label: '空気入れどき', tone: 'danger' },
  unset: { icon: 'bike', label: '未記録', tone: 'accent' },
}

function heroMessage(status) {
  switch (status.state) {
    case 'ok':
      return `次の空気入れまであと${status.remaining}日。良いペースです。`
    case 'soon':
      return `残り${status.remaining}日。そろそろ空気を入れましょう。`
    case 'overdue':
      return `${status.overdueBy}日超過。タイヤの空気を入れましょう。`
    default:
      return 'まずは空気を入れて記録しましょう。'
  }
}

export default function HomeScreen({ onTab }) {
  const state = useStore()
  const bike = getActiveBike(state)
  const item = getActiveAirItem(state)
  const limits = getLimits(state)
  const isLight = resolveTheme(state.settings.theme) === 'light'

  const [sheetOpen, setSheetOpen] = useState(false)
  const [bikeSheetOpen, setBikeSheetOpen] = useState(false)
  const [showPremium, setShowPremium] = useState(false)

  // 開いたまま日付が変わってもカウントダウンを更新。
  const [, tick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 60000)
    return () => window.clearInterval(id)
  }, [])

  const status = useMemo(
    () => computeStatus(item.lastReset, item.intervalDays, new Date()),
    [item.lastReset, item.intervalDays],
  )
  const hero = HERO[status.state] || HERO.unset
  const isCustom = !PRESET_INTERVALS.includes(item.intervalDays)

  const onConfirmPump = (iso) => {
    pump(iso)
    track(EV.RESET)
    // 初回リセット後に通知許可を求め、許可済みなら次回予定日に(再)スケジュール（nativeのみ）。
    requestPermissionAfterReset()
    setSheetOpen(false)
  }
  const onSelectPreset = (d) => {
    setShowPremium(false)
    setCycle(d)
    syncActiveReminder() // 周期変更で予定日が変わる→再スケジュール（許可済みのみ）
  }
  const onCustomClick = () => {
    if (!limits.customCycle) {
      track(EV.PAYWALL, { source: 'custom_interval' })
      setShowPremium((v) => !v)
      return
    }
    const input = window.prompt('カスタム間隔（日数）', String(item.intervalDays))
    const v = Number(input)
    if (Number.isFinite(v) && v >= 1) {
      setCycle(Math.round(v))
      syncActiveReminder()
    }
  }

  // リング中央（白文字・色だけに頼らず数字＋ラベル）。
  const ringCenter = (() => {
    if (status.state === 'unset') {
      return (
        <>
          <span className="home__ring-eyebrow">未記録</span>
          <span className="cad-display home__ring-num">—</span>
        </>
      )
    }
    const isOver = status.state === 'overdue'
    return (
      <>
        <span className="home__ring-eyebrow">{isOver ? '超過' : 'あと'}</span>
        <span className={`cad-display home__ring-num${isOver ? ' home__ring-num--over' : ''}`}>
          {isOver ? status.overdueBy : status.remaining}
        </span>
        <span className="home__ring-unit">日</span>
      </>
    )
  })()

  return (
    <div className="home">
      <header className="home__header">
        <button
          type="button"
          className="home__id"
          onClick={() => setBikeSheetOpen(true)}
          aria-label={`自転車を切り替え（現在: ${bike.name}）`}
        >
          <span className="home__eyebrow"><QuukiMark size={12} /> QUUKI</span>
          <span className="home__bikename">
            {bike.name}
            <Icon name="chevron-right" size={18} className="home__bike-caret" />
          </span>
        </button>
        <div className="home__chrome">
          <IconButton
            label="テーマを切り替え"
            variant="glass"
            size="sm"
            onClick={() => setTheme(isLight ? 'dark' : 'light')}
          >
            <Icon name={isLight ? 'sun' : 'moon'} size={18} />
          </IconButton>
          <IconButton
            label="設定を開く"
            variant="glass"
            size="sm"
            onClick={() => onTab && onTab('settings')}
          >
            <Icon name="settings" size={18} />
          </IconButton>
        </div>
      </header>

      <main className="home__main">
        {/* HERO A — spotlight */}
        <GlassCard variant="spotlight" radius="28px" className="home__hero">
          <div className="home__hero-inner" role="group" aria-label={heroMessage(status)}>
            <span className="home__hero-eyebrow">NEXT AIR CHECK</span>
            <div className="home__ring-inset">
              <ProgressRing progress={status.fill} tone={hero.tone} size={196} stroke={16} gloss>
                {ringCenter}
              </ProgressRing>
            </div>
            <p className={`home__hero-pill home__hero-pill--${status.state}`} role="status">
              <Icon name={hero.icon} size={16} />
              {hero.label}
            </p>
            <p className="home__hero-msg">{heroMessage(status)}</p>
          </div>
        </GlassCard>

        {/* RESET CTA */}
        <Button
          variant="energy"
          size="lg"
          block
          className="home__cta"
          iconLeft={<Icon name="plus-circle" size={20} />}
          onClick={() => setSheetOpen(true)}
        >
          空気入れた！
        </Button>

        {/* CYCLE */}
        <section className="home__cycles" aria-labelledby="cycle-heading">
          <div className="home__cycles-head">
            <span id="cycle-heading" className="home__cycles-title">空気を入れる間隔</span>
            <span className="home__cycles-hint">現在 {item.intervalDays}日</span>
          </div>
          <div className="home__chips">
            {PRESET_INTERVALS.map((d) => (
              <Chip key={d} selected={!isCustom && item.intervalDays === d} onClick={() => onSelectPreset(d)}>
                {d}日
              </Chip>
            ))}
            <Chip
              selected={isCustom}
              locked={!limits.customCycle}
              onClick={onCustomClick}
              aria-label={limits.customCycle ? 'カスタム間隔' : 'カスタム間隔（Proで解放）'}
            >
              {isCustom ? `${item.intervalDays}日` : 'カスタム間隔'}
            </Chip>
          </div>
          {showPremium && (
            <p className="home__premium" role="status">
              <Icon name="lock" size={14} /> カスタム間隔はProで解放されます
            </p>
          )}
        </section>
      </main>

      <PumpSheet open={sheetOpen} onClose={() => setSheetOpen(false)} onConfirm={onConfirmPump} />
      <BikeSheet open={bikeSheetOpen} onClose={() => setBikeSheetOpen(false)} />
    </div>
  )
}
