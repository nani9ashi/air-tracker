import { useEffect, useId, useRef, useState } from 'react'
import Sheet from './Sheet.jsx'
import Button from './Button.jsx'

/**
 * シート本体だけのフォーム（既に Sheet の中にいる呼び出し側用）。
 * BikeSheet / HistoryScreen は自身が Sheet なので、Sheet を入れ子にせず
 * こちらをモード切替で差し込む。
 *
 * parse: 入力文字列 → 採用値 | null。null のあいだ決定ボタンは disabled。
 * window.prompt 時代の受理条件をそのまま関数として持ち上げるための口で、
 * 既定は trim して空文字を弾くだけ。
 */
export function PromptForm({
  label,
  defaultValue = '',
  placeholder,
  maxLength,
  inputMode,
  type = 'text',
  confirmLabel = '決定',
  cancelLabel = 'キャンセル',
  parse = (v) => (v.trim() ? v.trim() : null),
  onConfirm,
  onCancel,
}) {
  const [value, setValue] = useState(defaultValue)
  const inputRef = useRef(null)
  const inputId = useId()

  useEffect(() => {
    setValue(defaultValue)
  }, [defaultValue])

  // Sheet の初期フォーカスは open が変化したときしか走らない。モード切替で
  // 後から差し込まれる場合に備えて自前でも当てる（タップ由来なので IME も上がる）。
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const parsed = parse(value)
  const submit = (e) => {
    e.preventDefault()
    if (parsed !== null) onConfirm(parsed)
  }

  return (
    <form className="prompt-form" onSubmit={submit}>
      <div className="prompt-form__field">
        {label && (
          <label className="cad-label prompt-form__label" htmlFor={inputId}>
            {label}
          </label>
        )}
        <input
          id={inputId}
          ref={inputRef}
          type={type}
          inputMode={inputMode}
          className="sheet-input"
          value={value}
          maxLength={maxLength}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
      <Button type="submit" variant="energy" size="md" block disabled={parsed === null}>
        {confirmLabel}
      </Button>
      <button type="button" className="sheet-cancel" onClick={onCancel}>
        {cancelLabel}
      </button>
    </form>
  )
}

/**
 * 単独で開く入力シート（window.prompt の置き換え）。
 * 既に Sheet の中にいる場合は入れ子になるので PromptForm を使うこと。
 */
export default function PromptSheet({ open, onClose, title, subtitle, ...form }) {
  return (
    <Sheet open={open} onClose={onClose} title={title} subtitle={subtitle}>
      <PromptForm {...form} onCancel={onClose} />
    </Sheet>
  )
}
