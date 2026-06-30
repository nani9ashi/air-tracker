import './GlassCard.css'

/**
 * Cadence サーフェス。variant: 'glass' | 'solid' | 'spotlight'(teal grad)。
 * radius / padding は CSS変数で上書き可。glow でアクセントグロー。
 */
export default function GlassCard({
  children,
  variant = 'glass',
  radius,
  padding,
  glow = false,
  as: Tag = 'div',
  className = '',
  style = {},
  ...rest
}) {
  const cls = [
    'glass-card',
    `glass-card--${variant}`,
    glow ? 'glass-card--glow' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  const s = { ...style }
  if (radius) s['--gc-radius'] = radius
  if (padding) s['--gc-pad'] = padding
  return (
    <Tag className={cls} style={s} {...rest}>
      {children}
    </Tag>
  )
}
