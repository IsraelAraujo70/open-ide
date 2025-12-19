/**
 * useStore hook - Subscribes to store changes and triggers re-renders
 */

import { useState, useEffect, useCallback } from "react"
import { store } from "../../application/store.ts"
import type { AppState, AppAction } from "../../domain/types.ts"

export function useStore(): [AppState, (action: AppAction) => void] {
  const [state, setState] = useState(store.getState())

  useEffect(() => {
    const unsubscribe = store.subscribe(newState => {
      setState(newState)
    })
    return unsubscribe
  }, [])

  const dispatch = useCallback((action: AppAction) => {
    store.dispatch(action)
  }, [])

  return [state, dispatch]
}

export function useStoreSelector<T>(selector: (state: AppState) => T): T {
  const [value, setValue] = useState(() => selector(store.getState()))

  useEffect(() => {
    const unsubscribe = store.subscribe(state => {
      const newValue = selector(state)
      setValue(newValue)
    })
    return unsubscribe
  }, [selector])

  return value
}
