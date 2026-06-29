import './ProgressRing.css'

/**
 * 残日数を円弧で表す主役コンポーネント。
 * progress: 0..1（残り割合。1=満タン, 0=期限）。1超や負も内部でクランプ。
 * tone: 'accent' | 'warning' | 'danger' | 'energy'（状態色。トークン参照）。
 * children: 中央に置く内容（大きな数字など）。
 */
const TONE_VAR = {
  accent: 'var(--accent)',
  warning: 'var(--warning)',
  danger: 'var(--danger)',
  energy: 'var(--energy)',
}

export default function ProgressRing({
  progress = 1,
  tone = 'accent',
  size = 240,
  stroke = 16,
  children,
  className = '',
}) {
  const p = Math.max(0, Math.min(1, progress))
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const dash = c * p
  const center = size / 2
  const color = TONE_VAR[tone] || TONE_VAR.accent

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
        {/* トラック（背景の円） */}
        <circle
          className="ring__track"
          cx={center}
          cy={center}
          r={r}
          strokeWidth={stroke}
          fill="none"
        />
        {/* 進捗の弧。12時方向から時計回り。 */}
        <circle
          className="ring__value"
          cx={center}
          cy={center}
          r={r}
          strokeWidth={stroke}
          fill="none"
          stroke={color}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          transform={`rotate(-90 ${center} ${center})`}
          style={{ filter: `drop-shadow(0 0 8px ${color})` }}
        />
      </svg>
      <div className="ring__center">{children}</div>
    </div>
  )
}
