import './StatusBarFade.css'

// ステータスバー(edge-to-edge)フェード。画面共通で1つだけ App.jsx がマウントする
// position:fixed の遮蔽レイヤー。env(safe-area-inset-top) が端末ごとの実インセットを
// 返すので、このコンポーネント自体には端末分岐のロジックは一切ない。
export default function StatusBarFade() {
  return <div className="status-fade" aria-hidden="true" />
}
