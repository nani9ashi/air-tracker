import { useEffect, useRef, useState } from 'react'
import Sheet from './Sheet.jsx'
import Button from './Button.jsx'
import Icon from './Icon.jsx'
import { CAN_PURCHASE, getPriceLabel, purchase } from '../lib/billing.js'
import { track, EV } from '../lib/analytics.js'

const FEATURES =
  '複数の自転車・全履歴・全期間のヒートマップ・カスタム間隔・バックアップが使えるようになります。'

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
 * status: 'idle' | 'purchasing' | 'success' | 'error'。
 * EV.PURCHASE は source を「結果」として使う（EV.PAYWALL の source＝入口とは
 * 別軸）: started/success/cancelled/failed。
 *
 * 非native時（公開PWA本番）は CTA を出さず案内文に置き換える。DEV は
 * CAN_PURCHASE が true になるため、ブラウザの npm run dev でも
 * devSimulatedPurchase 経由で購入フロー全体（idle→purchasing→success）を
 * 検証できる。
 */
export default function PaywallSheet({ open, onClose, source }) {
  const [status, setStatus] = useState('idle')
  const [price, setPrice] = useState(undefined) // undefined=取得中 / string / null=取得できなかった
  const closeTimer = useRef(0)

  useEffect(() => {
    if (!open) return
    track(EV.PAYWALL, { source })
    setStatus('idle')
    setPrice(undefined)
    getPriceLabel().then(setPrice)
  }, [open, source])

  useEffect(() => () => window.clearTimeout(closeTimer.current), [])

  const handlePurchase = async () => {
    setStatus('purchasing')
    track(EV.PURCHASE, { source: 'started' })
    const res = await purchase()
    if (res.ok) {
      track(EV.PURCHASE, { source: 'success' })
      setStatus('success')
      closeTimer.current = window.setTimeout(onClose, 1200)
    } else if (res.reason === 'cancelled') {
      // 自分でやめた操作にエラー表示しない（backup.js の isCancellation と同じ原則）。
      track(EV.PURCHASE, { source: 'cancelled' })
      setStatus('idle')
    } else {
      track(EV.PURCHASE, { source: 'failed' })
      setStatus('error')
    }
  }

  const priceLabel = price === undefined ? '価格を確認中…' : (price ?? '価格を取得できませんでした')

  return (
    <Sheet open={open} onClose={onClose} title="Proにアップグレード" subtitle={FEATURES}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {!CAN_PURCHASE ? (
          <p className="cad-body" style={{ color: 'var(--text-secondary)' }}>
            有料版の購入はAndroidアプリからのみ行えます。
          </p>
        ) : status === 'success' ? (
          <p
            className="cad-body"
            role="status"
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', color: 'var(--text-secondary)' }}
          >
            <Icon name="circle-check" size={18} style={{ color: 'var(--text-accent)' }} />
            購入が完了しました。ありがとうございます！
          </p>
        ) : (
          <>
            <p className="cad-label" style={{ color: 'var(--text-secondary)' }}>{priceLabel}</p>
            {status === 'error' && (
              <p className="cad-body" role="alert" style={{ color: 'var(--danger)' }}>
                購入できませんでした。時間をおいてお試しください。
              </p>
            )}
            <Button variant="energy" size="md" block disabled={status === 'purchasing'} onClick={handlePurchase}>
              {status === 'purchasing' ? '購入処理中…' : status === 'error' ? 'もう一度試す' : '購入する'}
            </Button>
          </>
        )}
      </div>
      {status !== 'success' && (
        <button type="button" className="sheet-cancel" onClick={onClose}>
          {CAN_PURCHASE ? 'キャンセル' : '閉じる'}
        </button>
      )}
    </Sheet>
  )
}
