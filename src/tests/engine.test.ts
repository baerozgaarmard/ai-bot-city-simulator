import { describe, it, expect } from 'vitest'
import { astar } from '../simulation/pathfinding'
import { walkableGrid, LOCATIONS } from '../simulation/map'
import { SimEngine } from '../simulation/engine'
import { WorldSchema } from '../persistence/db'
import { engine } from '../simulation/engine'
import { useUI, selectedAgent } from '../stores/store'

describe('pathfinding', () => {
  it('finds a path that never crosses building tiles', () => {
    const g = walkableGrid(); const p = astar(g, { x: 0, y: 0 }, { x: 6, y: 3 })
    expect(p.length).toBeGreaterThan(0); for (const t of p) expect(g[t.y][t.x]).toBe(true)
  })
  it('returns empty for a blocked goal', () => { const g = walkableGrid(); expect(astar(g, { x: 0, y: 0 }, { x: 3, y: 3 })).toEqual([]) })
})
describe('engine', () => {
  it('seeds distinct agents and advances ticks', () => {
    const e = new SimEngine(42); expect(e.agents.length).toBeGreaterThanOrEqual(20)
    const names = new Set(e.agents.map(a => a.name)); expect(names.size).toBe(e.agents.length)
    const acc = { v: 0 }; e.step(120, acc); expect(e.tick).toBeGreaterThan(0)
  })
  it('low energy agents prefer rest over work', () => {
    const e = new SimEngine(7); const a = e.agents[0]; a.energy = 5; a.hunger = 10; a.state = 'Idle'; a.activityUntil = 0; a.cooldownUntil = 0; a.path = []; a.dest = null; (a as any)._target = undefined // reset the constructor's initial goal so the low-energy choice is re-made
    const acc = { v: 0 }; for (let i = 0; i < 3; i++) e.step(1, acc)
    expect(['Resting', 'Sleeping', 'Walking']).toContain(a.state)
  })
  it('a starving agent eats before sleeping at night', () => {
    // Regression: at night Sleep's utility (90 night bonus + up to 40
    // for low energy = 130) beat Eat at maximum hunger (100 * 1.2 =
    // 120), so a starving, tired agent went to bed instead of eating a
    // 30-minute meal — in a 10k-minute probe agents sat at 100 hunger
    // for up to 117 continuous minutes, and most nights the whole city
    // slept starving. A meal must dominate once hunger is critical.
    const e = new SimEngine(7); e.simMinutes = 23 * 60 // 23:00, night
    const a = e.agents[0]; a.hunger = 95; a.energy = 10; a.state = 'Idle'; a.activityUntil = 0; a.cooldownUntil = 0; a.path = []; a.dest = null; a.pos = { x: 6, y: 12 }; (a as any)._target = undefined
    const acc = { v: 0 }; e.step(1, acc)
    expect(a.goal).toBe('Eat')
  })
  it('mood falls when an agent is starving or exhausted, and recovers when fed and rested', () => {
    // Regression: nothing ever lowered mood — agents spawned at 60-90
    // and the only mood write was a recovery below 40, which no agent
    // could ever reach — so the inspector's Mood % and the metrics' Avg
    // mood were frozen for an agent's whole life (0 of 24 agents' mood
    // changed over 10k sim-minutes), and the Socialize utility's
    // `mood < 50` bonus was dead code. Hunger and exhaustion must drag
    // mood down; being fed and rested must let it recover.
    const e = new SimEngine(42); const acc = { v: 0 }
    const a = e.agents[0]
    a.mood = 70; a.hunger = 90; a.energy = 50
    for (let i = 0; i < 10; i++) e.step(1, acc)
    expect(a.mood).toBeLessThan(70)
    a.mood = 30; a.hunger = 0; a.energy = 90; a.state = 'Idle'; a.activityUntil = 0; a.cooldownUntil = 0; a.path = []; a.dest = null; (a as any)._target = undefined
    for (let i = 0; i < 10; i++) e.step(1, acc)
    expect(a.mood).toBeGreaterThan(30)
  })
  it('mood recovers from the middle of the range, not only below 40', () => {
    // Regression: the recovery branch fired only while mood < 40, so
    // mood could only fall in the 40-100 band and never climb back — a
    // fed, rested agent at 45 stayed at 45 forever, and over a long run
    // every agent ratcheted down to 40 (24/24 at 11-40, median 39,
    // after 10k minutes). Recovery must apply whenever the agent is fed
    // and rested, at any mood.
    const e = new SimEngine(42); const acc = { v: 0 }
    const a = e.agents[0]
    a.mood = 45; a.hunger = 0; a.energy = 90
    a.state = 'Idle'; a.activityUntil = 0; a.cooldownUntil = 0; a.path = []; a.dest = null; (a as any)._target = undefined
    for (let i = 0; i < 60; i++) e.step(1, acc)
    expect(a.mood).toBeGreaterThan(45)
  })
  it('mood moves over a long run instead of staying frozen at its spawn value', () => {
    const e = new SimEngine(42); const acc = { v: 0 }
    const before = e.agents.map(a => a.mood)
    for (let i = 0; i < 10000; i++) e.step(1, acc)
    const changed = e.agents.filter((a, i) => a.mood !== before[i]).length
    expect(changed).toBeGreaterThan(0)
  })
  it('mood does not saturate at 100 over a long run', () => {
    // Regression: mood's per-minute update was symmetric ±0.2, but bad
    // minutes (hunger >= 80 or energy <= 10) are only ~28% of
    // agent-minutes, so it netted about +0.09/min and ratcheted to the
    // cap — mood sat at exactly 100 for 43-44% of agent-minutes and
    // below 50 for under 1%, all 24 agents ending a 30k-minute run at
    // 72-100 on every seed, the same pinned-at-the-cap failure
    // confidence had before its fix. The inspector's Mood % was
    // effectively maxed for the whole city nearly half the time. Mood
    // now dents faster than it recovers (-0.2 vs +0.11), so it wanders
    // mid-range instead of living at the cap (measured: ~20% of
    // agent-minutes at 100 on three seeds, vs 43-44% before).
    const e = new SimEngine(777); const acc = { v: 0 }
    let at100 = 0; let total = 0
    for (let i = 0; i < 30000; i++) {
      e.step(1, acc)
      for (const a of e.agents) { total++; if (a.mood >= 100) at100++ }
    }
    expect(at100 / total).toBeLessThan(0.25)
    const spread = Math.max(...e.agents.map(a => a.mood)) - Math.min(...e.agents.map(a => a.mood))
    expect(spread).toBeGreaterThan(10)
  })
  it('confidence does not saturate at 100 for every agent over a long run', () => {
    // Regression: confidence only ever rose (+5 per completed Work) and
    // nothing ever lowered it, so by 10k minutes all 24 agents were
    // pinned at 100 and the stat never moved again. It must fall when
    // the agent is very hungry or exhausted and recover when fed and
    // rested, the same rule as mood.
    const e = new SimEngine(777); const acc = { v: 0 }
    for (let i = 0; i < 30000; i++) e.step(1, acc)
    const at100 = e.agents.filter(a => a.confidence >= 100).length
    expect(at100).toBeLessThan(24)
    const spread = Math.max(...e.agents.map(a => a.confidence)) - Math.min(...e.agents.map(a => a.confidence))
    expect(spread).toBeGreaterThan(10)
  })
  it('mood and confidence are different stats, not the same number', () => {
    // Regression: mood and confidence received byte-identical per-minute
    // updates (±0.2 on the same hunger/energy trigger, same 0-100
    // clamp), so once either hit the 100 cap they locked together
    // permanently — in a 30k-minute probe on four seeds the two values
    // were exactly equal for 76-77% of agent-minutes, and all 24 agents
    // ended the run with identical mood and confidence on every seed.
    // The inspector showed two stats that were one number, and
    // confidence's +5 per completed Work was erased at the cap the
    // moment it would have opened a gap. Confidence now moves on its
    // own scale (-0.3 dent, +0.1 recovery), so the two differ for
    // nearly every agent and confidence sits mid-range instead of
    // pinned at 100 (measured: 21-24/24 differ, 0-3/24 at 100).
    const e = new SimEngine(777); const acc = { v: 0 }
    for (let i = 0; i < 30000; i++) e.step(1, acc)
    const differ = e.agents.filter(a => Math.abs(a.mood - a.confidence) > 0.01).length
    expect(differ).toBeGreaterThan(12)
    const confAt100 = e.agents.filter(a => a.confidence >= 100).length
    expect(confAt100).toBeLessThan(12)
  })
  it('memories come from real events and can be retrieved', () => {
    const e = new SimEngine(9); const a = e.agents[0]; const b = e.agents[1]
    ;(e as any).addMemory(a, 'episodic', 'Met Bob at cafe', 8, 1, [b.id], null, 'ev-1', ['social'])
    expect(e.relevantMemories(a.id, b.id)[0].summary).toContain('Bob')
  })
  it('conversation memories reference the event that actually logged the conversation', () => {
    // Regression: arrive() generated a fresh id for the memories'
    // sourceEventId while log() generated its own different id for the
    // SOCIAL event, so every conversation memory pointed at an event
    // that never existed in engine.events. The memory must carry the id
    // of the event just logged. (Checked at creation: the event log is
    // capped at 500, so over a long run old source events are pruned
    // while their memories survive — a separate retention limit, not
    // a broken link at creation.)
    const e = new SimEngine(1234)
    const park = LOCATIONS.find(l => l.id === 'park')!
    const [a, b] = e.agents
    for (const agent of [b, a]) {
      agent.pos = { ...park.entrance }; agent.state = 'Idle'; agent.path = []; agent.dest = null
      agent.activityUntil = 0; agent.cooldownUntil = 0
      ;(e as any).setGoal(agent, 'Socialize', park, 'Socializing', 'Socializing', 40)
    }
    expect(a.state).toBe('Conversing'); expect(b.state).toBe('Conversing')
    const evById = new Map(e.events.map(ev => [ev.id, ev]))
    const convMems = e.memories.filter(m => m.tags.includes('social'))
    expect(convMems.length).toBe(2)
    for (const m of convMems) {
      const ev = evById.get(m.sourceEventId)
      expect(ev).toBeDefined()
      expect(ev!.category).toBe('SOCIAL')
      expect(ev!.message).toBe(m.summary)
    }
  })
  it('pruning the event log keeps events that a memory links to', () => {
    // Regression: the 500-event cap pruned SOCIAL events while their
    // conversation memories survived, so after a long run every
    // memory's sourceEventId named an event that no longer existed in
    // engine.events (327/327 dangling in a 30k-minute probe) — the
    // same broken link a72a16b fixed at creation, re-broken by
    // retention. Pruning must spare events a live memory references.
    const e = new SimEngine(3); const a = e.agents[0]
    const ev = (e as any).log('SOCIAL', a, null, 'test conversation')
    ;(e as any).addMemory(a, 'episodic', 'test conversation', 7, 1, [], null, ev.id, ['social'])
    for (let i = 0; i < 600; i++) (e as any).log('GOAL', a, null, `filler ${i}`)
    expect(e.events.some(x => x.id === ev.id)).toBe(true)
    expect(e.memories.every(m => e.events.some(x => x.id === m.sourceEventId))).toBe(true)
    // Still bounded: the cap plus the referenced events, no unbounded growth.
    expect(e.events.length).toBeLessThanOrEqual(500 + e.memories.length)
  })
  it('a snapshot keeps the source events its memories link to', () => {
    // Regression: snapshot() kept only the newest 200 events, so a
    // save/load round-trip left every saved memory pointing at an
    // event that was not in the loaded world (222/222 dangling in a
    // 20k-minute probe) — the same broken link as the live log cap,
    // on the persistence path.
    const e = new SimEngine(3); const a = e.agents[0]
    const ev = (e as any).log('SOCIAL', a, null, 'test conversation')
    ;(e as any).addMemory(a, 'episodic', 'test conversation', 7, 1, [], null, ev.id, ['social'])
    for (let i = 0; i < 300; i++) (e as any).log('GOAL', a, null, `filler ${i}`)
    const snap = e.snapshot()
    expect(snap.events.some((x: any) => x.id === ev.id)).toBe(true)
    const e2 = new SimEngine(99); e2.restore(snap)
    expect(e2.memories.every(m => e2.events.some(x => x.id === m.sourceEventId))).toBe(true)
    expect(() => WorldSchema.parse(e2.snapshot())).not.toThrow()
  })
  it('clearing the event log keeps events that a memory links to', () => {
    // Regression: the Event Console's Clear button did
    // `engine.events.length = 0`, which left every memory's
    // sourceEventId dangling (102/102 in a 6k-minute probe) — the same
    // broken link the log-cap and snapshot retention rules were added
    // to prevent, re-broken from the UI. Clearing must spare events a
    // live memory references, like pruning and snapshots already do.
    const e = new SimEngine(1234); const acc = { v: 0 }
    for (let i = 0; i < 6000; i++) e.step(1, acc)
    expect(e.memories.length).toBeGreaterThan(0)
    const before = e.events.length
    e.clearEvents()
    expect(e.events.length).toBeLessThan(before)
    expect(e.memories.every(m => e.events.some(x => x.id === m.sourceEventId))).toBe(true)
  })
  it('world snapshot validates with Zod', () => { const e = new SimEngine(3); expect(() => WorldSchema.parse(e.snapshot())).not.toThrow() })
  it('loading a save restores the world seed instead of keeping the fresh engine\'s seed', () => {
    // Regression: restore() copied every snapshot field except seed, so
    // an engine built with one seed kept it after loading a save made
    // from another — and a save made after that load wrote the wrong
    // seed against the loaded world's state. The snapshot must round-trip.
    const e = new SimEngine(42)
    const e2 = new SimEngine(99)
    e2.restore(e.snapshot())
    expect(e2.seed).toBe(42)
    expect(e2.snapshot().seed).toBe(42)
    expect(() => WorldSchema.parse(e2.snapshot())).not.toThrow()
  })
  it('setting sociability keeps the displayed stat in sync with the goal-choice value', () => {
    // Regression: the inspector slider edited personality.sociability
    // (the value pickGoal reads) while the stats list showed the
    // top-level sociability field, set only at spawn — so moving the
    // slider changed behaviour while the displayed stat stayed frozen
    // at the seed value, and the panel showed two different
    // "Sociability" numbers for one agent.
    const e = new SimEngine(3); const a = e.agents[0]
    expect(a.sociability).toBe(a.personality.sociability)
    e.setSociability(a.id, 95)
    expect(a.personality.sociability).toBe(95); expect(a.sociability).toBe(95)
    e.setSociability(a.id, 150); expect(a.sociability).toBe(100)
    e.setSociability(a.id, -20); expect(a.sociability).toBe(0)
    e.setSociability('no-such-agent', 50) // no throw
  })
  it('goal at the agent\'s current entrance sets activityUntil instead of instantly completing', () => {
    // Regression: setGoal used to set the target state directly when the
    // path was empty (already at the entrance) without setting
    // activityUntil, so the next decision tick instantly "completed" a goal
    // the agent never spent time on — and re-picking the same location
    // looped one fake completion per minute.
    const e = new SimEngine(11); const a = e.agents[0]
    const home = LOCATIONS.find(l => l.id === 'residential')!
    a.pos = { ...home.entrance }; a.state = 'Idle'; a.path = []; a.dest = null
    a.activityUntil = e.simMinutes - 10; a.cooldownUntil = 0 // stale value from a previous activity
    ;(e as any).setGoal(a, 'Rest', home, 'Resting', 'Resting at home', 60)
    expect(a.state).toBe('Resting'); expect(a.activityUntil).toBe(e.simMinutes + 60)
    const acc = { v: 0 }; e.step(1, acc)
    expect(a.state).toBe('Resting'); expect(a.recentActions).not.toContain('Rest at Residential District')
    for (let i = 0; i < 61; i++) e.step(1, acc)
    expect(a.recentActions.filter(r => r === 'Rest at Residential District').length).toBe(1)
  })
  it('restored Conversing agent is not stuck: the conv timer is not in the snapshot, so a missing entry must release it', () => {
    const e = new SimEngine(11); const a = e.agents[0]
    a.state = 'Conversing'; a.path = []; a.activityUntil = e.simMinutes + 40; a.cooldownUntil = 0
    const e2 = new SimEngine(99); e2.restore(e.snapshot())
    const acc = { v: 0 }; for (let i = 0; i < 200; i++) e2.step(1, acc)
    expect(e2.agents[0].state).not.toBe('Conversing')
  })
  it('loading a save clears live conversation state instead of leaving stale conv entries', () => {
    // Regression: restore() replaced the agents but kept the live conv
    // map. Loading an older save while a conversation was live left a
    // stale entry whose `until` was in the restored timeline's future:
    // a restored Conversing agent stayed Conversing, talking to nobody,
    // until that stale timer passed, and a restored Socializing agent
    // could never be picked as a conversation partner again (arrive()
    // requires !conv.has(o.id), and the guard only runs for Conversing
    // agents, so the stale entry never expired for it).
    const e = new SimEngine(77); const park = LOCATIONS.find(l => l.id === 'park')!
    const [a, b] = e.agents
    for (const ag of [a, b]) {
      ag.pos = { ...park.entrance }; ag.state = 'Socializing'; ag.path = []; ag.dest = null
      ag.activityUntil = e.simMinutes + 40; ag.cooldownUntil = 0
      ;(ag as any)._target = { loc: park, state: 'Socializing', activity: 'Socializing', durationMin: 40 }
    }
    ;(e as any).arrive(a)
    expect(a.state).toBe('Conversing'); expect((e as any).conv.size).toBe(2)
    // Simulate loading an older save: rewind the clock, partner elsewhere.
    const snap = e.snapshot()
    snap.simMinutes = e.simMinutes - 200
    snap.agents[0].state = 'Conversing'; snap.agents[0].path = []
    snap.agents[1].state = 'Working'; snap.agents[1].path = []
    e.restore(snap)
    expect((e as any).conv.size).toBe(0)
    const acc = { v: 0 }; for (let i = 0; i < 5; i++) e.step(1, acc)
    expect(e.agents[0].state).not.toBe('Conversing')
  })
  it('a restored Conversing agent is not re-paired by a passer-by before the release guard runs', () => {
    // Regression: restore() clears the conv map but leaves agents flagged
    // Conversing until the next decision tick's guard releases them. In
    // that window the movement phase runs first, and arrive() used to
    // accept Conversing agents as partners when they held no conv entry
    // — so a third agent arriving at the same entrance re-paired with the
    // desynced agent, silently re-starting its 10-minute timer
    // mid-conversation (a 17-minute Conversing streak observed in a
    // 30k-tick stress run) instead of letting the guard release it to
    // Idle. Only Socializing agents are now eligible partners.
    const e = new SimEngine(77); const park = LOCATIONS.find(l => l.id === 'park')!
    const [a, b] = e.agents
    for (const ag of [a, b]) {
      ag.pos = { ...park.entrance }; ag.state = 'Socializing'; ag.path = []; ag.dest = null
      ag.activityUntil = e.simMinutes + 40; ag.cooldownUntil = 0
      ;(ag as any)._target = { loc: park, state: 'Socializing', activity: 'Socializing', durationMin: 40 }
    }
    ;(e as any).arrive(a)
    expect(a.state).toBe('Conversing'); expect(b.state).toBe('Conversing')
    e.restore(e.snapshot())
    const [a2, b2, c] = e.agents
    expect((e as any).conv.size).toBe(0)
    expect(a2.state).toBe('Conversing'); expect(b2.state).toBe('Conversing')
    c.pos = { ...park.entrance }; c.state = 'Socializing'; c.path = []; c.dest = null
    c.activityUntil = e.simMinutes + 40; c.cooldownUntil = 0
    ;(c as any)._target = { loc: park, state: 'Socializing', activity: 'Socializing', durationMin: 40 }
    ;(e as any).arrive(c)
    expect(c.state).toBe('Socializing'); expect((e as any).conv.size).toBe(0)
    const acc = { v: 0 }; e.step(1, acc)
    expect(a2.state).toBe('Idle'); expect(b2.state).toBe('Idle')
  })
  it('add agent appears and ticks', () => {
    const e = new SimEngine(5); const before = e.agents.length
    e.addAgent({ name: 'Zoe Test', role: 'Tester', personality: { sociability: 50, energyNeed: 50, curiosity: 50, routine: 50 }, locationId: 'cafe', energy: 80, mood: 70 })
    expect(e.agents.length).toBe(before + 1)
  })
  it('rapidly added agents get unique ids', () => {
    // Regression: addAgent built ids from Date.now() alone, so agents
    // added within the same millisecond shared one id — 200 rapid adds
    // produced only 2 distinct ids. Everything downstream keys on id
    // (the Phaser sprite map, selection, relationships), so the colliding
    // agents merged into a single sprite and a single selectable row.
    // Ids now go through the same incrementing counter as events/memories.
    const e = new SimEngine(5); const ids: string[] = []
    for (let i = 0; i < 200; i++) {
      ids.push(e.addAgent({ name: `Probe${i}`, role: 'Tester', personality: { sociability: 50, energyNeed: 50, curiosity: 50, routine: 50 }, locationId: 'cafe', energy: 80, mood: 70 }).id)
    }
    expect(new Set(ids).size).toBe(200)
    expect(new Set([...e.agents.map(a => a.id)]).size).toBe(e.agents.length)
  })
  it('resetting a Conversing agent unwinds the conversation instead of leaving a stale conv entry', () => {
    // Regression: resetAgent left the agent's entry in the conv map, so
    // arrive() would never pick it as a conversation partner again (it
    // requires !conv.has(o.id)), and its partner kept Conversing with
    // someone who had been reset away.
    const e = new SimEngine(77); const park = LOCATIONS.find(l => l.id === 'park')!
    const [a, b, c] = e.agents
    for (const ag of [a, b]) {
      ag.pos = { ...park.entrance }; ag.state = 'Socializing'; ag.path = []; ag.dest = null
      ag.activityUntil = e.simMinutes + 40; ag.cooldownUntil = 0
      ;(ag as any)._target = { loc: park, state: 'Socializing', activity: 'Socializing', durationMin: 40 }
    }
    ;(e as any).arrive(a)
    expect(a.state).toBe('Conversing'); expect(b.state).toBe('Conversing')
    e.resetAgent(b.id)
    expect(b.state).toBe('Idle'); expect(a.state).toBe('Idle')
    expect((e as any).conv.size).toBe(0)
    // b can be a conversation partner again
    for (const ag of [b, c]) {
      ag.pos = { ...park.entrance }; ag.state = 'Socializing'; ag.path = []; ag.dest = null
      ag.activityUntil = e.simMinutes + 40; ag.cooldownUntil = 0
      ;(ag as any)._target = { loc: park, state: 'Socializing', activity: 'Socializing', durationMin: 40 }
    }
    ;(e as any).arrive(c)
    expect(c.state).toBe('Conversing'); expect(b.state).toBe('Conversing')
  })
  it('resetting a Conversing agent gives its partner the same Idle break as a natural release', () => {
    // Regression: resetAgent released the partner to Idle with no
    // cooldown, while a natural release sets a 5-minute cooldown. The
    // partner — still standing at the same entrance — instantly re-picked
    // Socialize there on the next tick, arrived instantly and paired
    // with the next agent standing there, so a reset chained straight
    // into a new conversation with no visible Idle gap (observed in 6/8
    // staged trials). The partner must now stand Idle for the cooldown
    // before it can converse again, matching a natural release.
    const e = new SimEngine(77); const park = LOCATIONS.find(l => l.id === 'park')!
    const [a, b, c] = e.agents
    for (const ag of [a, b]) {
      ag.pos = { ...park.entrance }; ag.state = 'Socializing'; ag.path = []; ag.dest = null
      ag.activityUntil = e.simMinutes + 40; ag.cooldownUntil = 0
      ;(ag as any)._target = { loc: park, state: 'Socializing', activity: 'Socializing', durationMin: 40 }
    }
    ;(e as any).arrive(a)
    expect(a.state).toBe('Conversing'); expect(b.state).toBe('Conversing')
    // A third agent socializing at the same entrance: the instant
    // re-pair candidate in the buggy version.
    c.pos = { ...park.entrance }; c.state = 'Socializing'; c.path = []; c.dest = null
    c.activityUntil = e.simMinutes + 40; c.cooldownUntil = 0
    ;(c as any)._target = { loc: park, state: 'Socializing', activity: 'Socializing', durationMin: 40 }
    // Make the partner strongly prefer Socialize, so a missing cooldown
    // would deterministically re-pair it instead of picking another goal.
    a.energy = 100; a.hunger = 0; a.mood = 80
    a.personality = { sociability: 100, energyNeed: 50, curiosity: 0, routine: 0 }
    e.resetAgent(b.id)
    expect(a.state).toBe('Idle')
    const acc = { v: 0 }
    for (let i = 0; i < 4; i++) { e.step(1, acc); expect(a.state).toBe('Idle'); expect(a.state).not.toBe('Conversing') }
  })
  it('resetting a Conversing agent does not let the pair instantly re-form either', () => {
    // Regression: resetAgent unwound the conversation but never recorded
    // the no-repeat window a natural release sets, so the ex-partners
    // could re-pair at the same entrance as soon as the partner's
    // 5-minute cooldown passed — staged here, the pair re-formed on the
    // very next arrive(), while a naturally finished pair is blocked
    // for 30 minutes. A reset must carry the same window.
    const e = new SimEngine(77); const park = LOCATIONS.find(l => l.id === 'park')!
    const [a, b] = e.agents
    const stage = (ag: any) => {
      ag.pos = { ...park.entrance }; ag.state = 'Socializing'; ag.path = []; ag.dest = null
      ag.activityUntil = e.simMinutes + 40; ag.cooldownUntil = 0
      ag._target = { loc: park, state: 'Socializing', activity: 'Socializing', durationMin: 40 }
    }
    stage(a); stage(b); (e as any).arrive(a)
    expect(a.state).toBe('Conversing'); expect(b.state).toBe('Conversing')
    e.resetAgent(b.id)
    stage(a); stage(b); (e as any).arrive(a)
    expect(a.state).toBe('Socializing'); expect(b.state).toBe('Socializing')
  })
  it('a finished conversation does not instantly re-form with the same partner at the same entrance', () => {
    // Regression: release and re-pick happened inside one decision tick,
    // so both ex-partners — still standing at the same entrance — could
    // re-pick Socialize there, arrive instantly and pair again, chaining
    // 10-minute conversations back-to-back with no visible break (one
    // pair observed Conversing continuously for 31+ ticks). A pair that
    // just split must not re-pair until the no-repeat window passes.
    const e = new SimEngine(77); const park = LOCATIONS.find(l => l.id === 'park')!
    const [a, b] = e.agents
    const stage = () => {
      for (const ag of [a, b]) {
        ag.pos = { ...park.entrance }; ag.state = 'Socializing'; ag.path = []; ag.dest = null
        ag.activityUntil = e.simMinutes + 40; ag.cooldownUntil = 0
        ;(ag as any)._target = { loc: park, state: 'Socializing', activity: 'Socializing', durationMin: 40 }
        ;(e as any).conv.delete(ag.id) // staged fresh, not mid-conversation with a passer-by
      }
    }
    const acc = { v: 0 }
    stage(); (e as any).arrive(a)
    expect(a.state).toBe('Conversing'); expect(b.state).toBe('Conversing')
    for (let i = 0; i < 11; i++) e.step(1, acc) // past the 10-minute timer
    expect((e as any).conv.get(a.id)?.other).not.toBe(b.id)
    expect((e as any).conv.get(b.id)?.other).not.toBe(a.id)
    stage(); (e as any).arrive(a)
    expect(b.state).toBe('Socializing') // blocked: just finished talking to a
    for (let i = 0; i < 31; i++) e.step(1, acc) // past the 30-minute no-repeat window
    stage(); (e as any).arrive(a)
    expect(a.state).toBe('Conversing'); expect(b.state).toBe('Conversing')
  })
  it('loading a save keeps the no-repeat window for a pair mid-conversation when saved', () => {
    // Regression: restore() cleared the conv map and the lastTalk
    // windows, so a pair mid-conversation when saved was released by
    // the guard with no 30-minute no-repeat block — after the 5-minute
    // cooldown both could re-pick Socialize at the same entrance and
    // pair again, looking like one endless conversation. A load now
    // treats the cut-short conversation as finished: the pair cannot
    // re-form for 30 minutes.
    const e = new SimEngine(77); const park = LOCATIONS.find(l => l.id === 'park')!
    const [a, b] = e.agents
    const stage = (eng: SimEngine, ag: any) => {
      ag.pos = { ...park.entrance }; ag.state = 'Socializing'; ag.path = []; ag.dest = null
      ag.activityUntil = eng.simMinutes + 40; ag.cooldownUntil = 0
      ag._target = { loc: park, state: 'Socializing', activity: 'Socializing', durationMin: 40 }
    }
    stage(e, a); stage(e, b); (e as any).arrive(a)
    expect(a.state).toBe('Conversing'); expect(b.state).toBe('Conversing')
    // The pair and the window must survive the save/load round-trip.
    expect(() => WorldSchema.parse(e.snapshot())).not.toThrow()
    expect(WorldSchema.parse(e.snapshot()).convPairs?.length).toBe(1)
    const e2 = new SimEngine(99)
    e2.restore(e.snapshot())
    const [a2, b2] = e2.agents
    expect(a2.state).toBe('Conversing')
    const acc = { v: 0 }; e2.step(1, acc) // guard releases the cut-short pair
    expect(a2.state).toBe('Idle'); expect(b2.state).toBe('Idle')
    stage(e2, a2); stage(e2, b2); (e2 as any).arrive(a2)
    expect(a2.state).toBe('Socializing'); expect(b2.state).toBe('Socializing')
    expect((e2 as any).conv.size).toBe(0)
    // Once the 30-minute window passes, the pair may talk again.
    e2.agents = e2.agents.slice(0, 2) // only the pair left, so no passer-by can pair mid-wait
    for (let i = 0; i < 31; i++) e2.step(1, acc)
    stage(e2, a2); stage(e2, b2); (e2 as any).arrive(a2)
    expect(a2.state).toBe('Conversing'); expect(b2.state).toBe('Conversing')
  })
  it('an intervening conversation does not erase the no-repeat window against an earlier partner', () => {
    // Regression: lastTalk kept only each agent's most recent ex-partner,
    // so one intervening conversation with anyone else silently erased
    // the 30-minute window against the previous partner — a pair that
    // just split could re-form inside the window as soon as both had
    // talked to someone else. The window must be kept per partner.
    const e = new SimEngine(77); const park = LOCATIONS.find(l => l.id === 'park')!
    const [a, b, c, d] = e.agents
    // Only a and b live at first: other agents roaming free form their
    // own conversations at the park entrance and steal staged partners.
    for (const ag of e.agents) if (![a, b].includes(ag)) { ag.paused = true; ag.pos = { x: 0, y: 0 }; ag.state = 'Idle'; ag.path = [] }
    const stage = (ag: any) => {
      ag.pos = { ...park.entrance }; ag.state = 'Socializing'; ag.path = []; ag.dest = null
      ag.activityUntil = e.simMinutes + 40; ag.cooldownUntil = 0
      ag._target = { loc: park, state: 'Socializing', activity: 'Socializing', durationMin: 40 }
    }
    const acc = { v: 0 }
    const step = (n: number) => { for (let i = 0; i < n; i++) e.step(1, acc) }
    stage(a); stage(b); (e as any).arrive(a)
    expect((e as any).conv.get(a.id)?.other).toBe(b.id)
    step(11) // past the 10-minute timer: a and b split
    expect(a.state).toBe('Idle'); expect(b.state).toBe('Idle')
    const splitAt = e.simMinutes
    c.paused = false; d.paused = false
    stage(a); stage(c); (e as any).arrive(a)
    expect((e as any).conv.get(a.id)?.other).toBe(c.id)
    stage(b); stage(d); (e as any).arrive(b)
    expect((e as any).conv.get(b.id)?.other).toBe(d.id)
    step(11) // both intervening conversations end
    expect(e.simMinutes - splitAt).toBeLessThan(30)
    stage(a); stage(b); (e as any).arrive(a)
    expect(a.state).toBe('Socializing') // still blocked: inside a-b's window
    expect(b.state).toBe('Socializing')
  })
  it('conversations do not chain into one unbroken Conversing stretch with different partners', () => {
    // Regression: the 30-minute no-repeat window only blocks the SAME
    // partner, so a released agent instantly re-picked Socialize at the
    // same entrance, arrived instantly and paired with the NEXT agent
    // standing there — a 29-minute unbroken "Conversing" stretch made of
    // three chained 10-minute conversations (seed 1, Tara at the park).
    // After a conversation ends the agent must show a visible Idle break
    // before it can converse again, so no single episode exceeds one
    // conversation length and no two episodes of one agent touch.
    const e = new SimEngine(1); const acc = { v: 0 }
    const open = new Map<string, number>()
    const episodes: Array<{ agent: string; start: number; end: number }> = []
    for (let i = 0; i < 2000; i++) {
      e.step(1, acc)
      for (const a of e.agents) {
        if (a.state === 'Conversing' && !open.has(a.id)) open.set(a.id, e.simMinutes)
        if (a.state !== 'Conversing' && open.has(a.id)) { episodes.push({ agent: a.id, start: open.get(a.id)!, end: e.simMinutes }); open.delete(a.id) }
      }
    }
    expect(episodes.length).toBeGreaterThan(0)
    for (const ep of episodes) expect(ep.end - ep.start).toBeLessThanOrEqual(12)
    const byAgent = new Map<string, typeof episodes>()
    for (const ep of episodes) { const arr = byAgent.get(ep.agent) ?? []; arr.push(ep); byAgent.set(ep.agent, arr) }
    for (const arr of byAgent.values()) for (let k = 1; k < arr.length; k++) expect(arr[k].start - arr[k - 1].end).toBeGreaterThanOrEqual(3)
  })
  it('a Socializing agent that has a conversation still completes its Socialize goal', () => {
    // Regression: a conversation interrupted the agent's Socializing
    // activity, and the release dropped the activity outright — the
    // agent went Idle, picked a new goal after the cooldown, and its
    // Socialize goal was never recorded as completed (no GOAL event,
    // no completed++, nothing in recentActions), even though it spent
    // the time socializing. An agent that talked to someone therefore
    // completed fewer goals than one that stood alone, and up to ~30
    // minutes of its scheduled social time was abandoned after every
    // chat. The release now keeps the Idle break, then the agent
    // resumes its remaining social time and completes the goal when
    // the window ends.
    const e = new SimEngine(77); const park = LOCATIONS.find(l => l.id === 'park')!
    const [a, b] = e.agents
    for (const ag of e.agents) if (![a, b].includes(ag)) { ag.paused = true; ag.pos = { x: 0, y: 0 }; ag.state = 'Idle'; ag.path = [] }
    const stage = (ag: any) => {
      ag.pos = { ...park.entrance }; ag.state = 'Socializing'; ag.path = []; ag.dest = null
      ag.goal = 'Socialize'; ag.activityUntil = e.simMinutes + 40; ag.cooldownUntil = 0
      ag._target = { loc: park, state: 'Socializing', activity: 'Socializing', durationMin: 40 }
    }
    stage(a); stage(b); (e as any).arrive(a)
    expect(a.state).toBe('Conversing')
    const completedBefore = e.completed
    const acc = { v: 0 }
    for (let i = 0; i < 11; i++) e.step(1, acc) // past the 10-minute conversation
    expect(a.state).toBe('Idle') // the visible break is kept
    expect(a.activity).toBe('Finished conversation')
    for (let i = 0; i < 5; i++) e.step(1, acc) // past the 5-minute cooldown
    expect(a.state).toBe('Socializing') // resumes the remaining window
    for (let i = 0; i < 30; i++) e.step(1, acc) // past the 40-minute window
    expect(a.recentActions).toContain('Socialize at Central Park')
    expect(e.completed).toBeGreaterThan(completedBefore)
  })
  it('a conversation that runs past the Socializing window still completes the goal', () => {
    // Regression: a conversation starting near the end of the 40-minute
    // Socializing window ran past activityUntil, and the release
    // discarded the goal entirely — no GOAL event, no completed++, an
    // empty recentActions. The goal still counts: the agent socialized
    // for the full window and beyond, so the release records the
    // completion while keeping the 5-minute cooldown.
    const e = new SimEngine(77); const park = LOCATIONS.find(l => l.id === 'park')!
    const [a, b] = e.agents
    for (const ag of e.agents) if (![a, b].includes(ag)) { ag.paused = true; ag.pos = { x: 0, y: 0 }; ag.state = 'Idle'; ag.path = [] }
    const stage = (ag: any) => {
      ag.pos = { ...park.entrance }; ag.state = 'Socializing'; ag.path = []; ag.dest = null
      ag.goal = 'Socialize'; ag.activityUntil = e.simMinutes + 40; ag.cooldownUntil = 0
      ag._target = { loc: park, state: 'Socializing', activity: 'Socializing', durationMin: 40 }
    }
    stage(a); stage(b); (e as any).arrive(a)
    expect(a.state).toBe('Conversing')
    // Shrink a's window after arrive(): arrive() resets activityUntil
    // from durationMin, so a near-end window must be staged after it.
    a.activityUntil = e.simMinutes + 5
    const acc = { v: 0 }
    for (let i = 0; i < 11; i++) e.step(1, acc) // conversation ends 5 minutes past the window
    expect(a.state).toBe('Idle')
    expect(a.recentActions).toContain('Socialize at Central Park')
  })
  it('a conversation that runs past the Socializing window still resets the loneliness clock', () => {
    // Regression: the conversation release set state to 'Idle' before
    // calling complete(), and complete() reset the loneliness clock only
    // when state was 'Socializing' — so a conversation that ran past the
    // window recorded the goal but left lastSocial at the agent's
    // previous outing. The partner is the live-play case: its window can
    // have under 10 minutes left when the other agent arrives and pairs
    // with it, so the conversation outlasts the partner's window and the
    // partner's Socialize utility stayed inflated, sending it straight
    // back out after the cooldown. The clock must reset whenever a
    // Socialize goal completes, whatever state the agent is in.
    const e = new SimEngine(77); const park = LOCATIONS.find(l => l.id === 'park')!
    const [a, b] = e.agents
    for (const ag of e.agents) if (![a, b].includes(ag)) { ag.paused = true; ag.pos = { x: 0, y: 0 }; ag.state = 'Idle'; ag.path = [] }
    const stage = (ag: any) => {
      ag.pos = { ...park.entrance }; ag.state = 'Socializing'; ag.path = []; ag.dest = null
      ag.goal = 'Socialize'; ag.activityUntil = e.simMinutes + 40; ag.cooldownUntil = 0
      ag._target = { loc: park, state: 'Socializing', activity: 'Socializing', durationMin: 40 }
    }
    stage(a); stage(b); (e as any).arrive(a)
    expect(a.state).toBe('Conversing')
    // Shrink the PARTNER's window: b was already socializing when a
    // arrived, so the 10-minute conversation outlasts it.
    b.activityUntil = e.simMinutes + 5
    const clockBefore = (e as any).lastSocial.get(b.id)
    const acc = { v: 0 }
    for (let i = 0; i < 10; i++) e.step(1, acc) // conversation ends exactly as b's window passed 5 minutes earlier
    expect(b.state).toBe('Idle')
    expect(b.recentActions).toContain('Socialize at Central Park')
    expect((e as any).lastSocial.get(b.id)).toBeGreaterThan(clockBefore)
    expect((e as any).lastSocial.get(b.id)).toBe(e.simMinutes)
  })
  it('a selection naming an agent that no longer exists shows nothing, not the first agent', () => {
    // Regression: selectedAgent() fell back to agents[0] whenever the
    // selected id matched nothing. Loading a save replaces engine.agents
    // wholesale, so an agent selected before the load may no longer
    // exist — and the inspector then showed a different agent's details
    // while the registry highlighted no row. A stale selection must
    // show nothing; no selection at all still shows the first agent.
    const ui = useUI.getState()
    try {
      ui.select('agent-that-does-not-exist')
      expect(selectedAgent()).toBeNull()
      ui.select(engine.agents[0].id)
      expect(selectedAgent()?.id).toBe(engine.agents[0].id)
      ui.select(null)
      expect(selectedAgent()?.id).toBe(engine.agents[0].id)
    } finally {
      ui.select(null)
    }
  })
  it('a full night of sleep restores energy instead of draining it', () => {
    // Regression: Sleeping shared Resting's +40 restore, but a sleep lasts
    // 120 minutes (vs 60 for a rest) while energy drained 0.4/min at the
    // time, so an agent that slept the whole night woke up MORE tired
    // (50 -> 42).
    const e = new SimEngine(5); const a = e.agents[0]
    a.state = 'Sleeping'; a.path = []; a.dest = null
    a.activityUntil = e.simMinutes + 120; a.cooldownUntil = 0
    a.energy = 50; a.hunger = 10
    const acc = { v: 0 }
    for (let i = 0; i < 130; i++) { e.step(1, acc); if ((a.state as string) === 'Idle') break }
    expect(a.state).toBe('Idle')
    expect(a.energy).toBeGreaterThan(50)
  })
  it('sync() bumps rev on every call so memos recompute even when the tick has not advanced', () => {
    // Regression: sync() used to set only tick: engine.tick, so a UI
    // action that mutates engine state without advancing the clock
    // (Add Agent, Reset Agent, Clear event log) left every memo dep
    // unchanged — the registry, metrics and console kept serving stale
    // lists until the next sim minute. A newly added agent was
    // invisible for 2-5s after the dialog closed, looking like the add
    // had silently failed. sync() now bumps a revision counter, and the
    // memos key on it.
    const ui = useUI.getState()
    const before = ui.rev
    ui.sync(); ui.sync()
    expect(useUI.getState().rev).toBe(before + 2)
    expect(useUI.getState().tick).toBe(engine.tick)
  })
  it('resetting a paused agent unpauses it instead of freezing it on Reset', () => {
    // Regression: resetAgent left paused=true untouched, so step() kept
    // skipping the agent forever — it sat on Idle/"Reset" with no goal
    // and nothing ever resumed it. A reset must restart the agent.
    const e = new SimEngine(7); const a = e.agents[0]
    a.paused = true
    e.resetAgent(a.id)
    expect(a.paused).toBe(false)
    const acc = { v: 0 }
    for (let i = 0; i < 5; i++) e.step(1, acc)
    expect(a.state).not.toBe('Idle')
    expect(a.activity).not.toBe('Reset')
  })
  it('an agent that hits zero energy mid-shift stops working instead of finishing the shift at zero', () => {
    // Regression: pickGoal's utilities only decide at the START of an
    // activity — Work beats Rest down to ~energy 20 — so an agent that
    // began a 90-minute shift tired drained to 0 halfway through and
    // kept working a full hour at 0 energy (a 138-minute streak at zero
    // in a 30k-minute probe, identical on every seed). Hitting 0
    // mid-activity now ends it: the goal is recorded, and the agent
    // goes home to rest on the next pick instead of working on empty.
    const e = new SimEngine(7); const a = e.agents[0]
    const office = LOCATIONS.find(l => l.id === 'office')!
    a.pos = { ...office.entrance }; a.state = 'Working'; a.goal = 'Work'; a.path = []; a.dest = null
    a.activity = 'Working at Office Building'; a.activityUntil = e.simMinutes + 90; a.cooldownUntil = 0
    a.energy = 5; a.hunger = 0
    ;(a as any)._target = { loc: office, state: 'Working', activity: 'Working at Office Building', durationMin: 90 }
    const acc = { v: 0 }
    for (let i = 0; i < 20; i++) e.step(1, acc) // energy hits 0 after ~13 minutes
    expect(a.state).not.toBe('Working')
    expect(a.recentActions).toContain('Work at Office Building')
  })
  it('no agent works, shops, commutes or socializes at zero energy for more than a few minutes', () => {
    // Regression: same 138-minute zero-energy streak as above — a
    // 30k-minute probe showed Peter working ~60 continuous minutes at 0
    // every day, then walking home and resting an hour at 0. The
    // interrupt ends a non-restorative activity the minute energy hits
    // 0, so the streak in those states is at most sampling noise.
    // Resting/Sleeping/Eating at 0 are the recovery itself (lump sum at
    // completion, by design) and are not counted here.
    const e = new SimEngine(1); const acc = { v: 0 }
    const INTERRUPTIBLE = ['Working', 'Shopping', 'Commuting', 'Socializing']
    let maxStreak = 0
    const streak = new Map<string, number>()
    for (let i = 0; i < 30000; i++) {
      e.step(1, acc)
      for (const a of e.agents) {
        const s = a.energy <= 0 && INTERRUPTIBLE.includes(a.state) ? (streak.get(a.id) ?? 0) + 1 : 0
        streak.set(a.id, s); maxStreak = Math.max(maxStreak, s)
      }
    }
    expect(maxStreak).toBeLessThanOrEqual(5)
  })
  it('agents shop sometimes instead of never visiting the Corner Shop', () => {
    // Regression: Shop scored 25 + curiosity * 0.2 (29-44), below every
    // other goal's floor — Work is 70+ in the day, Sleep 90+ at night,
    // Rest up to 110, Eat up to 160, Socialize up to 88 — so it could
    // only win in a narrow corner (fed, rested, off-hours, low
    // sociability and low routine at once): 4-23 shopping trips per
    // 30k minutes across the whole city, vs ~3,300 meals, and the
    // Corner Shop was effectively decorative. It now scales with
    // curiosity like Socialize scales with sociability, so curious
    // agents shop in their spare hours: ~2% of agent-minutes and
    // ~550 trips per 30k minutes, on par with socializing, without
    // outbidding work, meals or sleep. Thresholds are loose — they
    // catch a return to a dead goal, not small drift.
    const e = new SimEngine(1)
    const acc = { v: 0 }
    let shopMin = 0, trips = 0
    for (let i = 0; i < 30000; i++) {
      const before = new Map(e.agents.map(a => [a.id, a.state]))
      e.step(1, acc)
      for (const a of e.agents) {
        if (a.state === 'Shopping') shopMin++
        if (before.get(a.id) !== 'Shopping' && a.state === 'Shopping') trips++
      }
    }
    const agentMin = 30000 * e.agents.length
    expect(shopMin / agentMin).toBeGreaterThan(0.005)
    expect(shopMin / agentMin).toBeLessThan(0.1)
    expect(trips).toBeGreaterThan(100)
  })
  it('every agent shops sometimes, not just the curious ones', () => {
    // Regression: the curiosity scaling above fixed Shop city-wide
    // (~550 trips per 30k minutes) but left it mathematically
    // unwinnable for the 10 agents whose sociability exceeds their
    // curiosity — Socialize's floor (sociability * 0.8, before its
    // mood and loneliness bonuses) already beats Shop's maximum
    // (curiosity * 0.8) for them, so Shop could never be the highest
    // utility, not just rarely: on two seeds the same 10 agents (Bob,
    // Ethan, George, Ian, Leo, Mia, Olivia, Peter, Rosa, Sam) never
    // shopped once in 30k minutes, exactly the agents with
    // sociability > curiosity, while the other 14 shopped 4-66 times
    // each. Shop now gains +1/hour since the agent last finished
    // shopping (capped at 30), the same time-based bonus Socialize
    // has, so every agent eventually shops in a spare hour — and the
    // bonus only lifts Shop when it has been starved, so it must not
    // let shopping crowd out work. Thresholds are loose — they catch
    // a return to a dead goal, not small drift.
    for (const seed of [11, 42]) {
      const e = new SimEngine(seed)
      const acc = { v: 0 }
      const shopMin = new Map(e.agents.map(a => [a.id, 0]))
      const workMin = new Map(e.agents.map(a => [a.id, 0]))
      for (let i = 0; i < 30000; i++) {
        e.step(1, acc)
        for (const a of e.agents) {
          if (a.state === 'Shopping') shopMin.set(a.id, (shopMin.get(a.id) ?? 0) + 1)
          if (a.state === 'Working') workMin.set(a.id, (workMin.get(a.id) ?? 0) + 1)
        }
      }
      for (const a of e.agents) {
        expect(shopMin.get(a.id)).toBeGreaterThan(0)
        expect(workMin.get(a.id)).toBeGreaterThan(1000)
      }
    }
  })
  it('a snapshot round-trips the shopping clock instead of resetting it', () => {
    const e = new SimEngine(5)
    const acc = { v: 0 }
    for (let i = 0; i < 5000; i++) e.step(1, acc)
    const before = (e.snapshot() as any).lastShop as Array<[string, number]>
    expect(before.length).toBe(e.agents.length)
    const e2 = new SimEngine(9)
    e2.restore(e.snapshot())
    const after = (e2.snapshot() as any).lastShop as Array<[string, number]>
    expect(after).toEqual(before)
  })
  it('agents commute sometimes instead of never waiting for the bus', () => {
    // Regression: Commute scored a flat 45 at rush hour (8 and 17) and
    // 5 otherwise, below almost every competing utility in its own
    // window — a morning meal scores hunger * 1.2, typically 48-84
    // after a night's sleep — so it could only win for an agent that
    // happened to be fed, rested and unsociable at exactly 8 or 17:
    // 30-38 trips per 30k minutes across the whole city, vs ~3,400
    // meals, and 20 of 24 agents never commuted once in 21 sim-days,
    // including Ian the Bus Driver and Sam the Courier, whose
    // workplace is the bus stop itself. It now scales with routine
    // the way Work does (45 + routine * 0.3 at rush hour), so routine
    // agents commute when fed and rested: ~340-380 trips per 30k
    // minutes, with 17 of 24 agents commuting at least once.
    // Follow-on: the routine scaling alone left Commute mathematically
    // unwinnable for the 7 agents whose Shop or Socialize floor beats
    // its maximum (see 'every agent commutes sometimes' below), so
    // the city-wide rate hid a dead goal for nearly a third of the
    // city. Thresholds are loose — they catch a return to a dead goal, not
    // small drift.
    const e = new SimEngine(1)
    const acc = { v: 0 }
    let commuteMin = 0, trips = 0
    const commuters = new Set<string>()
    for (let i = 0; i < 30000; i++) {
      const before = new Map(e.agents.map(a => [a.id, a.state]))
      e.step(1, acc)
      for (const a of e.agents) {
        if (a.state === 'Commuting') commuteMin++
        if (before.get(a.id) !== 'Commuting' && a.state === 'Commuting') { trips++; commuters.add(a.id) }
      }
    }
    const agentMin = 30000 * e.agents.length
    expect(commuteMin / agentMin).toBeGreaterThan(0.002)
    expect(commuteMin / agentMin).toBeLessThan(0.05)
    expect(trips).toBeGreaterThan(100)
    expect(commuters.size).toBeGreaterThan(10)
  })
  it('every agent commutes sometimes, not just the routine ones', () => {
    // Regression: the routine scaling above fixed Commute city-wide
    // (~340-380 trips per 30k minutes) but left it mathematically
    // unwinnable for the 7 agents whose Shop or Socialize floor already
    // beats its maximum — Shop's floor (curiosity * 0.8) for Charlie
    // (72), Diana (76), Kayla (72), Quinn (76), Tara (72) and Yusuf
    // (68) against Commute maxima of 52.5-60, and Socialize's floor
    // (sociability * 0.8) for Mia (68 against her Commute maximum of
    // 66) — so on three seeds those same 7 agents spent exactly 0
    // minutes Commuting in 30k minutes each, while the other 17
    // commuted 100-750 minutes each. Commute now gains +1/hour since
    // the agent last finished commuting (capped at 30, rush hour
    // only), the same time-based bonus Shop has, so every agent
    // eventually catches the bus in a spare rush hour — and the bonus
    // only lifts Commute when it has been starved, so it must not let
    // commuting crowd out work. Thresholds are loose — they catch a
    // return to a dead goal, not small drift.
    for (const seed of [11, 42]) {
      const e = new SimEngine(seed)
      const acc = { v: 0 }
      const commuteMin = new Map(e.agents.map(a => [a.id, 0]))
      const workMin = new Map(e.agents.map(a => [a.id, 0]))
      for (let i = 0; i < 30000; i++) {
        e.step(1, acc)
        for (const a of e.agents) {
          if (a.state === 'Commuting') commuteMin.set(a.id, (commuteMin.get(a.id) ?? 0) + 1)
          if (a.state === 'Working') workMin.set(a.id, (workMin.get(a.id) ?? 0) + 1)
        }
      }
      for (const a of e.agents) {
        expect(commuteMin.get(a.id)).toBeGreaterThan(0)
        expect(workMin.get(a.id)).toBeGreaterThan(1000)
      }
    }
  })
  it('a snapshot round-trips the commuting clock instead of resetting it', () => {
    const e = new SimEngine(5)
    const acc = { v: 0 }
    for (let i = 0; i < 5000; i++) e.step(1, acc)
    const before = (e.snapshot() as any).lastCommute as Array<[string, number]>
    expect(before.length).toBe(e.agents.length)
    const e2 = new SimEngine(9)
    e2.restore(e.snapshot())
    const after = (e2.snapshot() as any).lastCommute as Array<[string, number]>
    expect(after).toEqual(before)
  })
  it('lonely agents eventually socialize instead of never talking to anyone', () => {
    // Regression: Socialize's fixed utility always lost to a higher
    // fixed one in spare time — Shop (curiosity * 0.8, up to 76) beat
    // it for every curious agent, and Work's off-hours floor
    // (10 + routine * 0.3, up to 38.5) beat it for every agent with
    // sociability under ~48 — so on four seeds 10-14 of 24 agents never
    // socialized once in 30k minutes, including the two most sociable
    // agents (Tara 85, Charlie 80), and the whole city managed only
    // 134-184 conversations in 21 sim-days. Socialize now gains a
    // loneliness bonus of +1/hour since the agent last finished a
    // Socializing activity (capped at 45), so every agent eventually
    // seeks company and every agent forms at least one relationship.
    // Thresholds are loose — they catch a return to a dead goal, not
    // small drift.
    const e = new SimEngine(1)
    const acc = { v: 0 }
    const socialMin = new Map(e.agents.map(a => [a.id, 0]))
    for (let i = 0; i < 30000; i++) {
      e.step(1, acc)
      for (const a of e.agents) {
        if (a.state === 'Socializing' || a.state === 'Conversing') socialMin.set(a.id, (socialMin.get(a.id) ?? 0) + 1)
      }
    }
    for (const a of e.agents) {
      expect(socialMin.get(a.id)).toBeGreaterThan(60)
      expect(Object.keys(a.relationships).length).toBeGreaterThan(0)
    }
    expect(e.interactions).toBeGreaterThan(300)
  })
  it('a snapshot round-trips the loneliness clock instead of resetting it', () => {
    const e = new SimEngine(5)
    const acc = { v: 0 }
    for (let i = 0; i < 5000; i++) e.step(1, acc)
    const before = (e.snapshot() as any).lastSocial as Array<[string, number]>
    expect(before.length).toBe(e.agents.length)
    const e2 = new SimEngine(9)
    e2.restore(e.snapshot())
    const after = (e2.snapshot() as any).lastSocial as Array<[string, number]>
    expect(after).toEqual(before)
  })
  it('hunger does not saturate: agents rarely sit at 100 and sleeps rarely end starving', () => {
    // Regression: hunger rose 0.7/min (+1008/day) while a meal only
    // removes 50, so even eating 10 times a day could not keep up — in
    // a 30k-minute probe agents spent ~49% of their lives pinned at
    // hunger 100 and 98.5% of sleeps ended starving, so the hunger stat
    // was meaningless. The +40 Eat bonus at hunger >= 80 only treated
    // the extreme; the drain itself outran every meal. The 0.25/min
    // fix repeated the same arithmetic error: +360/day against meals
    // that net only -42.5 each (a meal removes 50 but hunger still
    // rises +7.5 during the 30 minutes spent eating), so at the
    // observed ~6.8 meals/day the city removed ~291/day and the
    // deficit was absorbed by the 100 cap — average hunger ~83, 27%
    // of agent-minutes at hunger >= 80, 84% of sleeps ending hungry
    // and mood below 50 half the time. At 0.2/min (+288/day) the same
    // meal frequency balances: ~2.3% of time at 100, ~6% of sleeps
    // ending at 100, ~38% ending at hunger >= 80, average hunger ~70.
    // Thresholds are loose (this probe drives step(1), so walks take
    // 3x longer than in real-time play and meals arrive late) — they
    // catch a return to saturation, not small drift.
    const e = new SimEngine(11)
    const acc = { v: 0 }
    let hunger100Min = 0, sleeps = 0, sleepsEndingAt100 = 0, sleepsEndingHungry = 0, hungerSum = 0, hungerSamples = 0
    for (let i = 0; i < 30000; i++) {
      const before = new Map(e.agents.map(a => [a.id, a.state]))
      e.step(1, acc)
      for (const a of e.agents) {
        if (a.hunger >= 100) hunger100Min++
        hungerSum += a.hunger; hungerSamples++
        if (before.get(a.id) !== 'Sleeping' && a.state === 'Sleeping') sleeps++
        if (before.get(a.id) === 'Sleeping' && a.state !== 'Sleeping') {
          if (a.hunger >= 100) sleepsEndingAt100++
          if (a.hunger >= 80) sleepsEndingHungry++
        }
      }
    }
    const agentMin = 30000 * e.agents.length
    expect(hunger100Min / agentMin).toBeLessThan(0.05)
    expect(sleepsEndingAt100 / sleeps).toBeLessThan(0.08)
    // The cap metrics alone miss a city that lives hungry without
    // pinning: average hunger and the share of sleeps ending hungry
    // (>= 80) catch the imbalance even when nothing hits 100.
    expect(sleepsEndingHungry / sleeps).toBeLessThan(0.5)
    expect(hungerSum / hungerSamples).toBeLessThan(80)
  })
  it('energy does not saturate at zero: agents rarely sit exhausted and rests/sleeps rarely end at 0', () => {
    // Regression: energy drained 0.4/min (+576/day) while recovery is
    // lump sums — Rest +40, Sleep +80, Eat +10 — so at the observed
    // frequencies (~4.6 rests, ~3.1 sleeps, ~5.4 meals a day) the city
    // recovered only ~486/day and the deficit was absorbed by the 0
    // clamp: in a 30k-minute probe average energy was ~33, 18.5% of
    // agent-minutes sat at exactly 0 (up to 115 continuous minutes),
    // 92% of rests and ~29% of sleeps ended at 0 energy, and agents
    // spent 45% of the day resting or sleeping. At 0.25/min (+360/day)
    // the same frequencies balance: average energy ~49, ~4.6% of time
    // at 0, ~3% of sleeps ending at 0. Energy is sampled the minute
    // before an activity completes, because complete() applies the
    // lump-sum recovery — sampling after completion would read the
    // restored value and hide the exhaustion. Thresholds are loose —
    // they catch a return to saturation, not small drift.
    const e = new SimEngine(42)
    const acc = { v: 0 }
    let zeroMin = 0, energySum = 0, energySamples = 0
    let rests = 0, restsEndingAt0 = 0, sleeps = 0, sleepsEndingAt0 = 0
    for (let i = 0; i < 30000; i++) {
      for (const a of e.agents) {
        if (a.activityUntil > 0 && a.activityUntil === e.simMinutes + 1) {
          if (a.state === 'Resting') { rests++; if (a.energy <= 0) restsEndingAt0++ }
          if (a.state === 'Sleeping') { sleeps++; if (a.energy <= 0) sleepsEndingAt0++ }
        }
      }
      e.step(1, acc)
      for (const a of e.agents) {
        if (a.energy <= 0) zeroMin++
        energySum += a.energy; energySamples++
      }
    }
    const agentMin = 30000 * e.agents.length
    expect(zeroMin / agentMin).toBeLessThan(0.08)
    expect(energySum / energySamples).toBeGreaterThan(35)
    expect(energySum / energySamples).toBeLessThan(65)
    expect(sleepsEndingAt0 / sleeps).toBeLessThan(0.1)
    expect(restsEndingAt0 / rests).toBeLessThan(0.65)
  })
  it('energyNeed changes how fast an agent tires instead of being dead data', () => {
    // Regression: energyNeed was seeded per agent (30-80), typed in
    // the Agent personality, and required by addAgent — but nothing
    // ever read it. The drain was a flat 0.25/min for everyone, so an
    // agent with energyNeed 90 and one with 30 had identical energy
    // trajectories (both 80 -> 77.5 over 10 minutes of Working). The
    // drain now scales with energyNeed around the 60 baseline, so a
    // high-need agent tires measurably faster than a low-need one,
    // while the city-wide mean stays ~0.25/min and the calibrated
    // energy balance is preserved.
    const e = new SimEngine(5)
    const office = LOCATIONS.find(l => l.id === 'office')!
    const acc = { v: 0 }
    const [low, high] = [e.agents[0], e.agents[1]]
    for (const [a, need] of [[low, 30], [high, 90]] as const) {
      a.personality.energyNeed = need
      a.pos = { ...office.entrance }
      a.state = 'Working'; a.goal = 'Work'; a.path = []; a.dest = null
      a.activity = 'Working at Office Building'
      a.activityUntil = e.simMinutes + 90; a.cooldownUntil = 0
      a.energy = 80; a.hunger = 0
      ;(a as any)._target = { loc: office, state: 'Working', activity: 'Working at Office Building', durationMin: 90 }
    }
    for (let i = 0; i < 10; i++) e.step(1, acc)
    expect(low.energy).toBeGreaterThan(high.energy)
    expect(low.energy).toBeCloseTo(80 - 10 * (0.25 + (30 - 60) * 0.001), 9)
    expect(high.energy).toBeCloseTo(80 - 10 * (0.25 + (90 - 60) * 0.001), 9)
  })
})
