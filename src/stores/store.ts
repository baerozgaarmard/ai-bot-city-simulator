import { create } from 'zustand'
import { engine } from '../simulation/engine'
import type { Agent } from '../simulation/types'

interface UIState {
  tick: number; rev: number; selectedId: string | null; view: string; paused: boolean; speed: number
  showThoughts: boolean; showPaths: boolean; showLocationLabels: boolean; logDensity: 'low' | 'normal' | 'high'; leftCollapsed: boolean; rightCollapsed: boolean; consoleCollapsed: boolean
  search: string; roleFilter: string; stateFilter: string; consoleSearch: string; consoleCategory: string; memorySearch: string
  set: (p: Partial<UIState>) => void; sync: () => void; select: (id: string | null) => void
}
// Narrow screens start with panels collapsed so the city gets the viewport.
export const narrowAtLoad = () => typeof window !== 'undefined' && window.innerWidth < 768
export const useUI = create<UIState>((set) => ({
  // rev: a monotonically increasing revision bumped by every sync().
  // sync() used to set only tick: engine.tick, so a UI action that
  // mutates engine state without advancing the clock (Add Agent, Reset
  // Agent, Clear event log) left tick unchanged — and the memos below
  // key on ui.tick, so they kept serving the stale list until the next
  // sim minute ticked over. A newly added agent was invisible in the
  // registry for 2-5s (longer on a slow frame loop), looking like the
  // add had silently failed. rev changes on every sync, so the memos
  // recompute after any action that calls sync().
  tick: 0, rev: 0, selectedId: null, view: 'City', paused: false, speed: 1,
  showThoughts: true, showPaths: false, showLocationLabels: false, logDensity: 'normal', leftCollapsed: narrowAtLoad(), rightCollapsed: narrowAtLoad(), consoleCollapsed: false,
  search: '', roleFilter: 'All', stateFilter: 'All', consoleSearch: '', consoleCategory: 'All', memorySearch: '',
  set: (p) => set(p), sync: () => set((s) => ({ tick: engine.tick, rev: s.rev + 1 })), select: (id) => set({ selectedId: id }),
}))
export function selectedAgent(): Agent | null {
  const id = useUI.getState().selectedId
  // No selection still shows the first agent (the initial view). But a
  // selection naming no live agent is stale, not a request for the first
  // agent: loading a save replaces engine.agents wholesale, so an agent
  // selected before the load may no longer exist. Falling back to
  // agents[0] there showed the inspector for an agent the user never
  // picked, while the registry highlighted no row at all.
  if (!id) return engine.agents[0] ?? null
  return engine.agents.find(a => a.id === id) ?? null
}
