// ============================================================
// テスト用ヘルパー: 隔離された store モジュールを作る。
//
// store.js はモジュールロード時に localStorage を読んで state を組み立て、
// さらに起動時 persist() で書き戻す。テスト間で state が漏れないよう
// resetModules + localStorage.clear をしてから動的 import する。
//
// seed を渡すと、その内容を保存済みデータとして読ませることができる
// （文字列ならそのまま、オブジェクトなら JSON 化して格納）。
// ============================================================
import { vi } from 'vitest'

export const STORAGE_KEY = 'air-tracker:state'
export const LEGACY_KEY = 'airTracker'

export async function freshStore(seed, { key = STORAGE_KEY } = {}) {
  vi.resetModules()
  localStorage.clear()
  if (seed !== undefined) {
    localStorage.setItem(key, typeof seed === 'string' ? seed : JSON.stringify(seed))
  }
  return import('../store.js')
}

// 保存済み JSON を読み出す（永続化の検証用）。
export function readPersisted(key = STORAGE_KEY) {
  const raw = localStorage.getItem(key)
  return raw ? JSON.parse(raw) : null
}

// ローカル日付の ISO 文字列（TZ 非依存にするため正午で固定）。
export const iso = (y, m, d, h = 12) => new Date(y, m - 1, d, h).toISOString()
