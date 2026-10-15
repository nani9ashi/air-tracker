// ============================================================
// textZoom.js — 文字の倍率の実測と --tz の書き込み（v2.4.5）。
//
// jsdom は文字サイズ設定（WebView の textZoom）を再現できないので、
// getComputedStyle をモックして「測定用の要素の計算後の font-size」を与える。
// 実際に倍率が反映されること自体はブラウザ（text-size-adjust）で確認済み。
// ============================================================
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  normalizeZoom,
  measureTextZoom,
  applyTextZoom,
  initTextZoom,
  getTextZoom,
} from './textZoom.js'

// 測定用の要素（font-size:100px）が zoom 倍で計算されたことにする。
const mockZoom = (zoom) =>
  vi.spyOn(window, 'getComputedStyle').mockImplementation(() => ({ fontSize: `${100 * zoom}px` }))

afterEach(() => {
  vi.restoreAllMocks()
  document.documentElement.style.removeProperty('--tz')
})

describe('normalizeZoom — 実測値を倍率にそろえる', () => {
  it.each([
    [1, 1],
    [0.85, 0.85],
    [1.15, 1.15],
    [2, 2],
    [1.1499999999, 1.15], // 浮動小数の誤差は小数2桁に
  ])('EP: 正常値 %s → %s', (v, want) => {
    expect(normalizeZoom(v)).toBe(want)
  })

  it.each([NaN, 0, -1, Infinity, undefined])('EP: 測れなかった値 %s → 1', (v) => {
    expect(normalizeZoom(v)).toBe(1)
  })

  it.each([
    [0.3, 0.5],
    [0.5, 0.5],
    [4, 4],
    [5, 4],
  ])('BVA: 範囲外は 0.5〜4 に丸める %s → %s', (v, want) => {
    expect(normalizeZoom(v)).toBe(want)
  })
})

describe('measureTextZoom — 測定用の要素で倍率を測る', () => {
  it('計算後の font-size から倍率を返す', () => {
    mockZoom(2)
    expect(measureTextZoom()).toBe(2)
  })

  it('測定用の要素を必ず片付ける', () => {
    mockZoom(1.3)
    const before = document.body.childElementCount
    measureTextZoom()
    expect(document.body.childElementCount).toBe(before)
  })

  it('getComputedStyle が例外を投げても測定用の要素は残らない', () => {
    vi.spyOn(window, 'getComputedStyle').mockImplementation(() => {
      throw new Error('boom')
    })
    const before = document.body.childElementCount
    expect(() => measureTextZoom()).toThrow('boom')
    expect(document.body.childElementCount).toBe(before)
  })

  it('font-size が読めなければ 1', () => {
    vi.spyOn(window, 'getComputedStyle').mockImplementation(() => ({ fontSize: '' }))
    expect(measureTextZoom()).toBe(1)
  })
})

describe('applyTextZoom — <html> に --tz を書く', () => {
  it('測った倍率を --tz に書き、getTextZoom() で読める', () => {
    mockZoom(1.5)
    expect(applyTextZoom()).toBe(1.5)
    expect(document.documentElement.style.getPropertyValue('--tz')).toBe('1.5')
    expect(getTextZoom()).toBe(1.5)
  })

  it('値が変わらなければ書き直さない', () => {
    mockZoom(1.3)
    applyTextZoom()
    const spy = vi.spyOn(document.documentElement.style, 'setProperty')
    applyTextZoom()
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('initTextZoom — 起動時と resize／タブ復帰で測り直す', () => {
  const setVisibility = (state) =>
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })

  afterEach(() => {
    delete document.visibilityState
  })

  it('起動時に1回測る', () => {
    mockZoom(1.15)
    const stop = initTextZoom()
    expect(getTextZoom()).toBe(1.15)
    stop()
  })

  it('resize で測り直す', () => {
    mockZoom(1)
    const stop = initTextZoom()
    mockZoom(2)
    window.dispatchEvent(new Event('resize'))
    expect(getTextZoom()).toBe(2)
    expect(document.documentElement.style.getPropertyValue('--tz')).toBe('2')
    stop()
  })

  it('タブ復帰（visible）で測り直し、隠れたときは測らない', () => {
    mockZoom(1)
    const stop = initTextZoom()
    mockZoom(1.8)
    setVisibility('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(getTextZoom()).toBe(1)
    setVisibility('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(getTextZoom()).toBe(1.8)
    stop()
  })

  it('解除後は測り直さない', () => {
    mockZoom(1)
    const stop = initTextZoom()
    stop()
    mockZoom(2)
    window.dispatchEvent(new Event('resize'))
    setVisibility('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(getTextZoom()).toBe(1)
  })
})
