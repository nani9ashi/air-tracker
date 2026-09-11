import { useEffect, useMemo, useState } from 'react'
import ProgressRing from '../components/ProgressRing.jsx'
import Button from '../components/Button.jsx'
import Chip from '../components/Chip.jsx'
import GlassCard from '../components/GlassCard.jsx'
import IconButton from '../components/IconButton.jsx'
import Icon from '../components/Icon.jsx'
import QuukiMark from '../components/QuukiMark.jsx'
import { track, EV } from '../lib/analytics.js'
import {
  requestPermissionAfterReset,
  syncActiveReminder,
  isNotificationEnabled,
} from '../lib/notifications.js'
import { reminderStatus } from '../lib/notify-plan.js'
import PumpSheet from './PumpSheet.jsx'
import BikeSheet from './BikeSheet.jsx'
import PromptSheet from '../components/PromptSheet.jsx'
import PaywallSheet from '../components/PaywallSheet.jsx'
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
import { computeStatus, formatDateJP } from '../lib/date.js'
import { resolveTheme } from '../lib/theme.js'
import './HomeScreen.css'

// 状態 → Lucide アイコン / 短ラベル / リングtone / メッセージ。
const HERO = {
  ok: { icon: 'circle-check', label: 'まだ大丈夫', tone: 'accent' },
  soon: { icon: 'clock', label: 'そろそろ', tone: 'warning' },
  overdue: { icon: 'alert-triangle', label: '空気入れどき', tone: 'danger' },
  unset: { icon: 'bike', label: '未記録', tone: 'accent' },
}

// カスタム間隔の受理条件。window.prompt 時代と同一（Number → isFinite && >=1 → round）。
// 不正値は null を返し、決定ボタンが disabled になる。
// 旧実装は不正値でもダイアログが閉じて黙って no-op だったので、そこだけ挙動が変わる。
export function parseCycle(raw) {
  const v = Number(raw)
  return Number.isFinite(v) && v >= 1 ? Math.round(v) : null
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
  const [cycleSheetOpen, setCycleSheetOpen] = useState(false)
  // カスタム間隔ロック・BikeSheetの追加ロック（複数台）が共有する単一のペイウォール。
  // Toast のような単一インスタンス共有パターン（SettingsScreen と同じ）。
  const [paywallSource, setPaywallSource] = useState(null)
  // 通知が有効（native＆許可済み）か。予約の可視化インラインの表示可否に使う。
  const [notifOn, setNotifOn] = useState(false)

  // 開いたまま日付が変わってもカウントダウンを更新。
  const [, tick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 60000)
    return () => window.clearInterval(id)
  }, [])

  // 起動時に通知の有効状態を取得（web/未許可は false＝インライン非表示）。
  useEffect(() => {
    isNotificationEnabled().then(setNotifOn)
  }, [])

  const status = useMemo(
    () => computeStatus(item.lastReset, item.intervalDays, new Date()),
    [item.lastReset, item.intervalDays],
  )
  const hero = HERO[status.state] || HERO.unset
  const isCustom = !PRESET_INTERVALS.includes(item.intervalDays)
  const reminder = reminderStatus(item.lastReset, item.intervalDays, new Date())

  const onConfirmPump = (iso) => {
    pump(iso)
    track(EV.RESET)
    // 初回リセット後に通知許可を求め、許可済みなら次回予定日に(再)スケジュール（nativeのみ）。
    // 許可結果が確定してからインラインの表示状態を更新。
    requestPermissionAfterReset().finally(() => isNotificationEnabled().then(setNotifOn))
    setSheetOpen(false)
  }
  const onSelectPreset = (d) => {
    setCycle(d)
    syncActiveReminder({ userAction: true }) // 周期変更→再スケジュール（超過なら直近20時にキャッチアップ）
  }
  const onCustomClick = () => {
    if (!limits.customCycle) {
      setPaywallSource('custom_interval')
      return
    }
    setCycleSheetOpen(true)
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
        </section>

        {/* 予約の可視化（native＆通知許可時のみ）。信頼＝「いつ来るか」を常時見せる。 */}
        {notifOn && reminder.state !== 'none' && (
          <p className="home__reminder" role="status">
            <Icon name="alarm-clock" size={14} />
            {reminder.state === 'scheduled'
              ? `次回 ${formatDateJP(reminder.at)} 20:00 にお知らせ`
              : '予定日を過ぎています'}
          </p>
        )}
      </main>

      <PumpSheet open={sheetOpen} onClose={() => setSheetOpen(false)} onConfirm={onConfirmPump} />
      <BikeSheet
        open={bikeSheetOpen}
        onClose={() => setBikeSheetOpen(false)}
        onLocked={() => {
          // BikeSheet自身がSheetなので、入れ子にせず閉じてから差し替える
          // （Sheetの入れ子回避パターン。BikeSheet.jsx側のmode切替と同じ考え方）。
          setBikeSheetOpen(false)
          setPaywallSource('add_bike')
        }}
      />
      <PaywallSheet open={!!paywallSource} onClose={() => setPaywallSource(null)} source={paywallSource} />
      <PromptSheet
        open={cycleSheetOpen}
        onClose={() => setCycleSheetOpen(false)}
        title="カスタム間隔"
        subtitle="空気を入れる間隔を日数で指定します。"
        label="日数"
        type="number"
        inputMode="numeric"
        defaultValue={String(item.intervalDays)}
        confirmLabel="この間隔にする"
        parse={parseCycle}
        onConfirm={(days) => {
          setCycle(days)
          syncActiveReminder({ userAction: true }) // 周期変更→再スケジュール
          setCycleSheetOpen(false)
        }}
      />
    </div>
  )
}
