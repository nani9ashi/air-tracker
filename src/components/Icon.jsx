import {
  Gauge,
  History,
  BarChart3,
  Settings,
  CalendarCheck,
  CalendarMinus,
  CalendarDays,
  CalendarCog,
  Moon,
  Sun,
  Download,
  Upload,
  Trash2,
  ChevronRight,
  PlusCircle,
  MoreVertical,
  Check,
  CircleCheck,
  Clock,
  AlarmClock,
  AlertTriangle,
  Bike,
  Lock,
  Pencil,
  X,
  Smartphone,
} from 'lucide-react'

// プロトタイプの data-lucide 名 → lucide-react コンポーネント。
const MAP = {
  gauge: Gauge,
  history: History,
  'bar-chart-3': BarChart3,
  settings: Settings,
  'calendar-check': CalendarCheck,
  'calendar-minus': CalendarMinus,
  'calendar-days': CalendarDays,
  'calendar-cog': CalendarCog,
  moon: Moon,
  sun: Sun,
  download: Download,
  upload: Upload,
  'trash-2': Trash2,
  'chevron-right': ChevronRight,
  'plus-circle': PlusCircle,
  'more-vertical': MoreVertical,
  check: Check,
  'circle-check': CircleCheck,
  clock: Clock,
  'alarm-clock': AlarmClock,
  'alert-triangle': AlertTriangle,
  bike: Bike,
  lock: Lock,
  pencil: Pencil,
  x: X,
  smartphone: Smartphone,
}

/**
 * Lucide アイコンを名前で描画する薄いラッパ（プロト準拠）。
 * 装飾アイコンは aria-hidden、ラベル用途は title/aria を付けて使う。
 */
export default function Icon({ name, size = 20, strokeWidth = 2, className, style, ...rest }) {
  const C = MAP[name]
  if (!C) return null
  return (
    <C
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      style={style}
      aria-hidden="true"
      {...rest}
    />
  )
}
