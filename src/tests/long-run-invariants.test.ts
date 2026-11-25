import { describe, it, expect } from 'vitest'
import { SimEngine } from '../simulation/engine'
import { walkableGrid, GRID_W, GRID_H } from '../simulation/map'

// Long-run invariant sweep: 30k sim-minutes on three seeds, checking
// live-operation invariants every tick (stats in range, positions on
// walkable tiles, no stuck states, no dangling memory links, bounded
// event log) plus a snapshot/restore round-trip mid-run. Added in the
// 2026-11-25 run-6 bug hunt, which found the agent-texture leak in
// PhaserScene while the engine itself held every invariant.
describe('long-run invariants', () => {
  it('holds invariants over 30k minutes on three seeds', () => {
    const g = walkableGrid()
    for (const seed of [42, 777, 20261028]) {
      const e = new SimEngine(seed)
      const acc = { v: 0 }
      const stateSince = new Map<string, { state: string; since: number }>()
      const problems: string[] = []
      const check = (label: string) => {
        for (const a of e.agents) {
          for (const k of ['energy', 'hunger', 'mood', 'confidence', 'sociability'] as const) {
            const v = (a as any)[k]
            if (!Number.isFinite(v) || v < 0 || v > 100) problems.push(`${label} seed ${seed} ${a.name} ${k}=${v}`)
          }
          for (const k of ['sociability', 'energyNeed', 'curiosity', 'routine'] as const) {
            const v = (a.personality as any)[k]
            if (!Number.isFinite(v) || v < 0 || v > 100) problems.push(`${label} seed ${seed} ${a.name} personality.${k}=${v}`)
          }
          const rx = Math.round(a.pos.x), ry = Math.round(a.pos.y)
          if (rx < 0 || ry < 0 || rx >= GRID_W || ry >= GRID_H || !g[ry][rx]) problems.push(`${label} seed ${seed} ${a.name} off-grid pos (${a.pos.x},${a.pos.y}) state ${a.state}`)
          if (a.state === 'Walking' && !a.path.length) problems.push(`${label} seed ${seed} ${a.name} Walking with empty path`)
          if (a.state === 'Idle' && a.dest !== null) problems.push(`${label} seed ${seed} ${a.name} Idle with dest (${a.dest.x},${a.dest.y})`)
          if (a.state === 'Conversing' && !(e as any).conv.has(a.id)) problems.push(`${label} seed ${seed} ${a.name} Conversing with no conv entry`)
          if (a.activityUntil > e.simMinutes + 130) problems.push(`${label} seed ${seed} ${a.name} activityUntil ${a.activityUntil} far future (now ${e.simMinutes}) state ${a.state}`)
          if (a.cooldownUntil > e.simMinutes + 10) problems.push(`${label} seed ${seed} ${a.name} cooldownUntil ${a.cooldownUntil} far future (now ${e.simMinutes})`)
          if (a.path.some(p => !g[p.y]?.[p.x])) problems.push(`${label} seed ${seed} ${a.name} path crosses unwalkable tile`)
        }
        if (!/^\d{2}:\d{2}$/.test(e.timeStr()) || e.hour < 0 || e.hour > 23) problems.push(`${label} seed ${seed} bad clock ${e.timeStr()}`)
        if (e.events.length > 500 + e.memories.length) problems.push(`${label} seed ${seed} event log ${e.events.length} exceeds 500+memories ${e.memories.length}`)
        const evIds = new Set(e.events.map(ev => ev.id))
        for (const m of e.memories) if (!evIds.has(m.sourceEventId)) problems.push(`${label} seed ${seed} memory ${m.id} dangling sourceEventId`)
        if (problems.length > 20) throw new Error(problems.slice(0, 20).join('\n'))
      }
      check('start')
      for (let i = 0; i < 30000; i++) {
        e.step(1, acc)
        // State-duration tracking must run every tick: sampling every
        // 500 min cannot tell a 500-minute streak from re-entering the
        // same state between samples.
        for (const a of e.agents) {
          const prev = stateSince.get(a.id)
          if (!prev || prev.state !== a.state) stateSince.set(a.id, { state: a.state, since: e.simMinutes })
          else {
            const dur = e.simMinutes - prev.since
            const cap: Record<string, number> = { Walking: 60, Conversing: 15, Eating: 60, Resting: 90, Sleeping: 150, Shopping: 55, Commuting: 45, Socializing: 60, Working: 120, Idle: 30, Waiting: 30 }
            if (dur > (cap[a.state] ?? 60)) problems.push(`t+${i + 1} seed ${seed} ${a.name} stuck in ${a.state} for ${dur} min`)
          }
        }
        if (i % 500 === 499) check(`t+${i + 1}`)
      }
      check('end')
      // Snapshot/restore mid-run must keep the world healthy.
      const snap = e.snapshot()
      const e2 = new SimEngine(1)
      e2.restore(JSON.parse(JSON.stringify(snap)))
      expect(e2.agents.length).toBe(e.agents.length)
      const acc2 = { v: 0 }
      for (let i = 0; i < 2000; i++) e2.step(1, acc2)
      for (const a of e2.agents) {
        expect(Number.isFinite(a.energy) && a.energy >= 0 && a.energy <= 100).toBe(true)
        expect(Number.isFinite(a.hunger) && a.hunger >= 0 && a.hunger <= 100).toBe(true)
      }
      expect(problems).toEqual([])
      // Sanity: the city actually lived — goals completed, conversations happened.
      expect(e.completed).toBeGreaterThan(1000)
      expect(e.interactions).toBeGreaterThan(50)
    }
  }, 300000)
})
