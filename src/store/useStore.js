import { useSyncExternalStore } from 'react'
import { subscribe, getState } from './store.js'

/**
 * ストア全体を購読する。state が変わると再レンダリング。
 * selector を渡すと一部だけ購読（参照安定なら不要な再描画を避けられる）。
 */
export function useStore(selector = (s) => s) {
  return useSyncExternalStore(
    subscribe,
    () => selector(getState()),
    () => selector(getState()),
  )
}
