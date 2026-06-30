import './ProgressRing.css'

/**
 * 残日数を円弧で表す主役（Cadence 準拠：SVG linearGradient ストローク）。
 * progress: 0..1（残り割合。1=満タン, 0=期限）。
 * tone: 'accent'|'warning'|'energy'|'success'|'contrast'（contrast=白→淡ミント。色地パネル上用）。
 * gloss: ガラス調のリム（上ハイライト＋ヘアライン）。
 * children: 中央に置く内容（大きな数字など）。
 */
const TONES = {
  accent: ['#34E0D2', '#0DA9A9'],
  warning: ['#FFD27A', '#FFB23E'],
  energy: ['#FFA24D', '#F2641A'],
  success: ['#5FE3A8', '#1FB876'],
  contrast: ['#FFFFFF', '#CFFBF4'],
}

export default function ProgressRing({
  progress = 1,
  tone = 'accent',
  size = 240,
  stroke = 16,
  gloss = false,
  children,
  className = '',
}) {
  const p = Math.max(0, Math.min(1, progress))
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - p)
  const center = size / 2
  const [g0, g1] = TONES[tone] || TONES.accent
  const gid = `ring-${tone}-${size}`

  return (
    <div
      className={['ring', className].filter(Boolean).join(' ')}
      style={{ width: size, height: size }}
    >
      <svg
        className="ring__svg"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={g0} />
            <stop offset="100%" stopColor={g1} />
          </linearGradient>
        </defs>
        {/* トラック */}
        <circle
          className="ring__track"
          cx={center}
          cy={center}
          r={r}
          strokeWidth={stroke}
          fill="none"
        />
        {/* 進捗の弧（12時方向から時計回り） */}
        <circle
          className="ring__value"
          cx={center}
          cy={center}
          r={r}
          strokeWidth={stroke}
          fill="none"
          stroke={`url(#${gid})`}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${center} ${center})`}
        />
      </svg>
      {gloss && <div className="ring__gloss" aria-hidden="true" />}
      <div className="ring__center">{children}</div>
    </div>
  )
}
