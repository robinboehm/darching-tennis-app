import { useSyncExternalStore } from 'react'
import { createDemoState } from './seed'
import type { AppState } from './types'

const KEY = 'darching-tennis-prototype-v1'
const listeners = new Set<() => void>()

function load(): AppState {
  const raw = localStorage.getItem(KEY)
  if (raw) {
    try {
      return JSON.parse(raw) as AppState
    } catch {
      /* fall through to demo data */
    }
  }
  return createDemoState()
}

let state = load()

export function getState() {
  return state
}

export function setState(update: (s: AppState) => AppState) {
  state = update(state)
  localStorage.setItem(KEY, JSON.stringify(state))
  listeners.forEach((l) => l())
}

export function resetDemo() {
  setState(() => createDemoState())
}

export function useAppState() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}
