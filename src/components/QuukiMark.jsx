import { useId } from 'react'

/**
 * QUUKI ブランドマーク（前進する二重シェブロン＝ケイデンス）。ロゴガイド準拠。
 * gradient=false で currentColor 単色（インク/白抜き用）。
 */
export default function QuukiMark({ size = 28, gradient = true, className = '' }) {
  const id = useId()
  const stroke = gradient ? `url(#${id})` : 'currentColor'
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      role="img"
      aria-label="QUUKI"
      className={className}
    >
      {gradient && (
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#34E0D2" />
            <stop offset="1" stopColor="#0DA9A9" />
          </linearGradient>
        </defs>
      )}
      <g
        stroke={stroke}
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
        transform="translate(-2 0)"
      >
        <path d="M16 16 L34 32 L16 48" />
        <path d="M34 16 L52 32 L34 48" />
      </g>
    </svg>
  )
}
