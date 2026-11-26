import { describe, it, expect } from 'vitest'
import { SimEngine } from '../simulation/engine'
import { walkableGrid, GRID_W, GRID_H, LOCATIONS } from '../simulation/map'
import { mulberry32 } from '../simulation/rng'

// Chaos sweep: random UI operations — pause, unpause, reset, add agent,
// setSociability, snapshot/restore — interleaved with a long run, checking
// live-operation invariants the deterministic long-run sweep does not cover
// (conversation symmetry under pause/reset, _target validity, id uniqueness
// after adds). Added in the 2026-11-26 run-5 bug hunt, which found a paused
// Conversing agent whose timers a load had cleared standing Conversing for
// 500+ sim-minutes.
describe('chaos probe', () => {
  it('holds invariants under random UI operations', () => {
    const g = walkableGrid()
    for (const seed of [42, 777, 20261028]) {
      const e = new SimEngine(seed)
      const acc = { v: 0 }
      const rng = mulberry32(seed * 31 + 7)
      const problems: string[] = []
      let added = 0
      const live = () => e.agents
      const check = (label: string) => {
        const ids = new Set<string>()
        for (const a of live()) {
          if (ids.has(a.id)) problems.push(`${label} seed ${seed} duplicate id ${a.id}`)
          ids.add(a.id)
          for (const k of ['energy', 'hunger', 'mood', 'confidence', 'sociability'] as const) {
            const v = (a as any)[k]
            if (!Number.isFinite(v) || v < 0 || v > 100) problems.push(`${label} seed ${seed} ${a.name} ${k}=${v}`)
          }
          if (a.sociability !== a.personality.sociability) problems.push(`${label} seed ${seed} ${a.name} sociability ${a.sociability} != personality ${a.personality.sociability}`)
          for (const [rid, v] of Object.entries(a.relationships)) {
            if (!Number.isFinite(v) || (v as number) < 0 || (v as number) > 100) problems.push(`${label} seed ${seed} ${a.name} relationship ${rid}=${v}`)
          }
          const rx = Math.round(a.pos.x), ry = Math.round(a.pos.y)
          if (rx < 0 || ry < 0 || rx >= GRID_W || ry >= GRID_H || !g[ry][rx]) problems.push(`${label} seed ${seed} ${a.name} off-grid pos (${a.pos.x},${a.pos.y}) state ${a.state}`)
          if (a.state === 'Walking' && !a.path.length) problems.push(`${label} seed ${seed} ${a.name} Walking with empty path`)
          if (a.state === 'Idle' && a.dest !== null) problems.push(`${label} seed ${seed} ${a.name} Idle with dest`)
          if (a.dest && (!Number.isFinite(a.dest.x) || !Number.isFinite(a.dest.y) || a.dest.y < 0 || a.dest.y >= GRID_H || a.dest.x < 0 || a.dest.x >= GRID_W || !g[a.dest.y][a.dest.x])) problems.push(`${label} seed ${seed} ${a.name} bad dest (${JSON.stringify(a.dest)}) state ${a.state}`)
          if (a.path.some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.y < 0 || p.y >= GRID_H || p.x < 0 || p.x >= GRID_W || !g[p.y][p.x])) problems.push(`${label} seed ${seed} ${a.name} path crosses bad tile`)
          if (a.activityUntil > e.simMinutes + 130) problems.push(`${label} seed ${seed} ${a.name} activityUntil ${a.activityUntil} far future (now ${e.simMinutes}) state ${a.state}`)
          if (a.cooldownUntil > e.simMinutes + 10) problems.push(`${label} seed ${seed} ${a.name} cooldownUntil ${a.cooldownUntil} far future (now ${e.simMinutes})`)
          const t = (a as any)._target
          if (t !== undefined) {
            if (!t.loc || !LOCATIONS.some(l => l.id === t.loc.id)) problems.push(`${label} seed ${seed} ${a.name} _target names no real location`)
            if (typeof t.state !== 'string' || !['Idle', 'Walking', 'Commuting', 'Working', 'Eating', 'Resting', 'Socializing', 'Shopping', 'Waiting', 'Sleeping', 'Conversing'].includes(t.state)) problems.push(`${label} seed ${seed} ${a.name} _target bad state ${t?.state}`)
          }
          if (a.state === 'Conversing') {
            const conv = (e as any).conv.get(a.id)
            if (!conv) problems.push(`${label} seed ${seed} ${a.name} Conversing with no conv entry (paused=${a.paused})`)
            else {
              const other = live().find(x => x.id === conv.other)
              if (!other) problems.push(`${label} seed ${seed} ${a.name} Conversing with missing partner ${conv.other}`)
              else if (!a.paused && !other.paused) {
                if (other.state !== 'Conversing') problems.push(`${label} seed ${seed} ${a.name} Conversing but partner ${other.name} is ${other.state}`)
                const back = (e as any).conv.get(other.id)
                if (!back || back.other !== a.id) problems.push(`${label} seed ${seed} ${a.name} conv not symmetric with ${other.name}`)
                if (Math.round(other.pos.x) !== rx || Math.round(other.pos.y) !== ry) problems.push(`${label} seed ${seed} ${a.name} Conversing apart from partner ${other.name}`)
              }
            }
          }
        }
        if (e.events.length > 500 + e.memories.length) problems.push(`${label} seed ${seed} event log ${e.events.length} exceeds 500+memories`)
        const evIds = new Set(e.events.map(ev => ev.id))
        for (const m of e.memories) if (!evIds.has(m.sourceEventId)) problems.push(`${label} seed ${seed} memory ${m.id} dangling sourceEventId`)
        if (problems.length > 20) throw new Error(problems.slice(0, 20).join('\n'))
      }
      check('start')
      for (let i = 0; i < 10000; i++) {
        e.step(1, acc)
        // One random UI op roughly every 37 minutes.
        if (i % 37 === 36) {
          const roll = rng()
          const agents = live()
          const pick = agents[Math.floor(rng() * agents.length)]
          if (roll < 0.2) {
            pick.paused = true
          } else if (roll < 0.35) {
            const paused = agents.filter(a => a.paused)
            if (paused.length) paused[Math.floor(rng() * paused.length)].paused = false
          } else if (roll < 0.55) {
            e.resetAgent(pick.id)
          } else if (roll < 0.7) {
            added++
            e.addAgent({ name: `Probe${seed}-${added}`, role: 'Student', personality: { sociability: 50, energyNeed: 60, curiosity: 60, routine: 50 }, locationId: 'park', energy: 80, mood: 70 })
          } else if (roll < 0.85) {
            e.setSociability(pick.id, Math.floor(rng() * 101))
          } else {
            e.restore(JSON.parse(JSON.stringify(e.snapshot())))
          }
          // A restore clears live conversation timers by design: restored
          // Conversing agents carry no conv entry until the next decision
          // tick's guard releases them. Step once so the check reads
          // post-tick state, the same state the long-run sweep checks.
          e.step(1, acc)
          check(`t+${i + 1} after op ${roll.toFixed(2)}`)
        }
        if (i % 500 === 499) check(`t+${i + 1}`)
      }
      check('end')
      expect(problems).toEqual([])
      expect(e.agents.length).toBe(24 + added)
      expect(e.completed).toBeGreaterThan(100)
    }
  }, 300000)
})
