import { create } from 'zustand'
import { engine } from '../simulation/engine'
import type { Agent } from '../simulation/types'

interface UIState {
  tick: number; selectedId: string | null; view: string; paused: boolean; speed: number
  showThoughts: boolean; showPaths: boolean; logDensity: 'low' | 'normal' | 'high'; leftCollapsed: boolean; rightCollapsed: boolean; consoleCollapsed: boolean
  search: string; roleFilter: string; stateFilter: string; consoleSearch: string; consoleCategory: string; memorySearch: string
  set: (p: Partial<UIState>) => void; sync: () => void; select: (id: string | null) => void
}
export const useUI = create<UIState>((set) => ({
  tick: 0, selectedId: null, view: 'City', paused: false, speed: 1,
  showThoughts: true, showPaths: false, logDensity: 'normal', leftCollapsed: false, rightCollapsed: false, consoleCollapsed: false,
  search: '', roleFilter: 'All', stateFilter: 'All', consoleSearch: '', consoleCategory: 'All', memorySearch: '',
  set: (p) => set(p), sync: () => set({ tick: engine.tick }), select: (id) => set({ selectedId: id }),
}))
export function selectedAgent(): Agent | null { const id = useUI.getState().selectedId; return engine.agents.find(a => a.id === id) ?? engine.agents[0] ?? null }
