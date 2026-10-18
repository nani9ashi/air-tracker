import { useEffect, useRef, useState } from 'react'
import Sheet from './Sheet.jsx'
import Button from './Button.jsx'
import Icon from './Icon.jsx'
import { CAN_PURCHASE, getPriceLabel, purchase, restorePurchases } from '../lib/billing.js'
import { track, EV } from '../lib/analytics.js'
import { useStore } from '../store/useStore.js'

const FEATURES =
  '複数の自転車・全履歴・全期間のヒートマップ・カスタム間隔・バックアップが使えるようになります。'

// reason → エラー文言（v2.5.0。docs/test-design-istqb.md §6-6）。
// ここに無い reason（failed や将来増えるもの）は MSG_FAILED。
const MSG_NETWORK = '通信できませんでした。通信環境を確認して、もう一度お試しください。'
const MSG_UNAVAILABLE = '現在購入できません。時間をおいてお試しください。'
const MSG_FAILED = '購入できませんでした。時間をおいてお試しください。'
const ERROR_MESSAGES = {
  network: MSG_NETWORK,
  timeout: MSG_NETWORK,
  'not-allowed': 'この端末またはアカウントでは購入できません。Google Play の設定をご確認ください。',
  unavailable: MSG_UNAVAILABLE,
  'no-offering': MSG_UNAVAILABLE,
  'not-ready': MSG_UNAVAILABLE,
  'in-progress': '購入処理中です。しばらくお待ちください。',
  'not-entitled': '購入は完了しましたが、まだ反映されていません。少し待ってから「購入を復元」をお試しください。',
  'already-owned': '購入済みの記録を確認できませんでした。「購入を復元」をお試しください。',
}
const SUCCESS_MESSAGES = {
  purchased: '購入が完了しました。ありがとうございます！',
  'purchase-restored': '購入済みの記録を確認し、Proを有効にしました。',
  restored: '購入を復元しました。',
  activated: 'Proが有効になりました。',
}
const MSG_PENDING =
  'お支払いの手続き中です。完了すると自動で有効になります（コンビニ払いなどは、お支払い後に反映されます）。'
const MSG_RESTORE_NONE =
  '購入履歴が見つかりませんでした。購入したときと同じ Google アカウントでお試しください。'
const MSG_RESTORE_FAILED = '確認できませんでした。通信環境を確認して、もう一度お試しください。'

const AUTO_CLOSE_MS = 1200

/**
 * 課金導線の唯一の入口（自前実装）。RevenueCatUI.presentPaywall() は使わない
 * ——価格文言・エラー文言・非native案内をこちら側で完全に制御するため。
 *
 * source: どのロック導線から開かれたか（'custom_interval' 等）。開いた瞬間に
 * EV.PAYWALL(source) を1回だけ発火する——呼び出し側（HomeScreen等）はもう
 * 個別に track しない（散らばっていたのをここに一本化）。ただし StatsScreen の
 * 「画面を開いただけ」の既存イベントだけは別軸（タップ無しの画面表示計測）
 * なのでそのまま残る。
 *
 * phase（v2.5.0。状態遷移は docs/test-design-istqb.md §6-6）:
 *   'idle' | 'purchasing' | 'restoring' | 'pending' | 'success' | 'error' |
 *   'restore-none' | 'restore-failed'
 * EV.PURCHASE は source を「結果」として使う（EV.PAYWALL の source＝入口とは
 * 別軸）: started / success / cancelled / failed / pending / restored。
 *
 * 開くたびに番号（session）を振り、閉じたあと・開き直したあとに届いた古い結果は
 * 画面に反映しない。自動で閉じるタイマーは、閉じたとき・画面が消えたときに解除する。
 *
 * 非native時（公開PWA本番）は CTA を出さず案内文に置き換える。DEV は
 * CAN_PURCHASE が true になるため、ブラウザの npm run dev でも
 * devSimulatedPurchase 経由で購入フロー全体（idle→purchasing→success）を
 * 検証できる。
 */
export default function PaywallSheet({ open, onClose, source }) {
  const [phase, setPhase] = useState('idle')
  const [detail, setDetail] = useState(null) // success の種類 / error の reason
  const [price, setPrice] = useState(undefined) // undefined=取得中 / string / null=取得できなかった
  const session = useRef(0)
  const closeTimer = useRef(0)
  // 購入・復元の最中。billing はその完了前に setPlan('paid') するため、この間の plan の変化は
  // 「更新通知による有効化」ではなく、購入・復元の結果の表示に任せる（ST-U14・U15）。
  const busy = useRef(false)
  const plan = useStore((s) => s.settings.plan)
  const prevPlan = useRef(plan)

  const loadPrice = (token) => {
    setPrice(undefined)
    getPriceLabel().then((p) => {
      if (token === session.current) setPrice(p)
    })
  }

  useEffect(() => {
    if (!open) return
    const token = ++session.current
    track(EV.PAYWALL, { source })
    setPhase('idle')
    setDetail(null)
    busy.current = false
    loadPrice(token)
    return () => {
      // 閉じた（または画面が消えた）→ 進行中の結果を無効化し、自動で閉じるタイマーも解除する。
      session.current += 1
      window.clearTimeout(closeTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 開いたとき・入口が変わったときだけ
  }, [open, source])

  const showSuccess = (kind) => {
    setPhase('success')
    setDetail(kind)
    window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(onClose, AUTO_CLOSE_MS)
  }

  // 開いている間に plan が paid になった（支払い保留の完了などの更新通知）→ 成功の表示へ（ST-U12）。
  useEffect(() => {
    const was = prevPlan.current
    prevPlan.current = plan
    if (!open || busy.current || was === 'paid' || plan !== 'paid') return
    showSuccess('activated')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- plan の変化にだけ反応する
  }, [plan])

  const handlePurchase = async () => {
    const token = session.current
    busy.current = true
    setPhase('purchasing')
    setDetail(null)
    track(EV.PURCHASE, { source: 'started' })
    const res = await purchase()
    if (token !== session.current) return // 閉じた・開き直したあとに届いた古い結果
    busy.current = false
    if (res.ok) {
      track(EV.PURCHASE, { source: res.restored ? 'restored' : 'success' })
      showSuccess(res.restored ? 'purchase-restored' : 'purchased')
    } else if (res.reason === 'cancelled') {
      // 自分でやめた操作にエラー表示しない（backup.js の isCancellation と同じ原則）。
      track(EV.PURCHASE, { source: 'cancelled' })
      setPhase('idle')
    } else if (res.reason === 'pending') {
      // 支払い保留（コンビニ払い等）は失敗ではない。完了は更新通知で反映される。
      track(EV.PURCHASE, { source: 'pending' })
      setPhase('pending')
    } else {
      track(EV.PURCHASE, { source: 'failed' })
      setPhase('error')
      setDetail(res.reason)
    }
  }

  const handleRestore = async () => {
    const token = session.current
    busy.current = true
    setPhase('restoring')
    setDetail(null)
    const res = await restorePurchases()
    if (token !== session.current) return
    busy.current = false
    if (res.status === 'confirmed' && res.entitled) {
      track(EV.PURCHASE, { source: 'restored' })
      showSuccess('restored')
    } else if (res.status === 'confirmed') {
      setPhase('restore-none')
    } else {
      setPhase('restore-failed')
    }
  }

  const working = phase === 'purchasing' || phase === 'restoring'
  const priceLabel = price === undefined ? '価格を確認中…' : (price ?? '価格を取得できませんでした')

  return (
    <Sheet open={open} onClose={onClose} title="Proにアップグレード" subtitle={FEATURES}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {!CAN_PURCHASE ? (
          <p className="cad-body" style={{ color: 'var(--text-secondary)' }}>
            有料版の購入はAndroidアプリからのみ行えます。
          </p>
        ) : phase === 'success' ? (
          <p
            className="cad-body"
            role="status"
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', color: 'var(--text-secondary)' }}
          >
            <Icon name="circle-check" size={18} style={{ color: 'var(--text-accent)' }} />
            {SUCCESS_MESSAGES[detail]}
          </p>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
              <p className="cad-label" style={{ color: 'var(--text-secondary)' }}>{priceLabel}</p>
              {price === null && (
                <Button variant="ghost" size="sm" onClick={() => loadPrice(session.current)}>
                  再読み込み
                </Button>
              )}
            </div>
            {phase === 'pending' && (
              <p className="cad-body" role="status" style={{ color: 'var(--text-secondary)' }}>
                {MSG_PENDING}
              </p>
            )}
            {phase === 'error' && (
              <p className="cad-body" role="alert" style={{ color: 'var(--danger)' }}>
                {ERROR_MESSAGES[detail] ?? MSG_FAILED}
              </p>
            )}
            {phase === 'restore-none' && (
              <p className="cad-body" role="status" style={{ color: 'var(--text-secondary)' }}>
                {MSG_RESTORE_NONE}
              </p>
            )}
            {phase === 'restore-failed' && (
              <p className="cad-body" role="alert" style={{ color: 'var(--danger)' }}>
                {MSG_RESTORE_FAILED}
              </p>
            )}
            {phase !== 'pending' && (
              <Button variant="energy" size="md" block disabled={working} onClick={handlePurchase}>
                {phase === 'purchasing' ? '購入処理中…' : phase === 'error' ? 'もう一度試す' : '購入する'}
              </Button>
            )}
            <Button variant="ghost" size="sm" block disabled={working} onClick={handleRestore}>
              {phase === 'restoring' ? '確認中…' : '購入を復元'}
            </Button>
          </>
        )}
      </div>
      {phase !== 'success' && (
        <button type="button" className="sheet-cancel" onClick={onClose}>
          {CAN_PURCHASE ? 'キャンセル' : '閉じる'}
        </button>
      )}
    </Sheet>
  )
}
