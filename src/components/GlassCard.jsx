import './GlassCard.css'

/**
 * すりガラス調の情報パネル（.cad-glass 準拠）。
 * as: ラップ要素のタグ（既定 div、section 等に変更可）。
 */
export default function GlassCard({
  children,
  as: Tag = 'div',
  strong = false,
  className = '',
  ...rest
}) {
  const cls = ['glass-card', strong ? 'glass-card--strong' : '', className]
    .filter(Boolean)
    .join(' ')
  return (
    <Tag className={cls} {...rest}>
      {children}
    </Tag>
  )
}
