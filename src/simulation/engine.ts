import { astar } from './pathfinding'
import { mulberry32, pick } from './rng'
import { LOCATIONS, walkableGrid } from './map'
import type { Agent, AgentState, Location, Memory, SimEvent } from './types'

const SEED_AGENTS: Array<[string, string, number, number, number, number, string, string]> = [
  // name, role, sociability, energyNeed, curiosity, routine, home, workplace
  ['Alice', 'Software Developer', 55, 60, 80, 85, 'residential', 'office'],
  ['Bob', 'Chef', 70, 70, 50, 70, 'residential', 'restaurant'],
  ['Charlie', 'Student', 80, 40, 90, 40, 'residential', 'park'],
  ['Diana', 'Artist', 65, 50, 95, 30, 'residential', 'park'],
  ['Ethan', 'Shopkeeper', 60, 65, 40, 90, 'residential', 'shop'],
  ['Fiona', 'Office Worker', 45, 60, 50, 95, 'residential', 'office'],
  ['George', 'Retired Resident', 75, 30, 60, 60, 'residential', 'park'],
  ['Hannah', 'Doctor', 50, 75, 70, 85, 'residential', 'townhall'],
  ['Ian', 'Bus Driver', 55, 70, 30, 90, 'residential', 'bus'],
  ['Jack', 'Teacher', 65, 60, 75, 85, 'residential', 'townhall'],
  ['Kayla', 'Designer', 70, 50, 90, 50, 'residential', 'office'],
  ['Leo', 'Security Guard', 35, 80, 30, 95, 'residential', 'townhall'],
  ['Mia', 'Barista', 85, 55, 60, 70, 'residential', 'cafe'],
  ['Noah', 'Engineer', 40, 65, 85, 80, 'residential', 'office'],
  ['Olivia', 'Nurse', 60, 75, 55, 85, 'residential', 'townhall'],
  ['Peter', 'Baker', 55, 70, 45, 90, 'residential', 'restaurant'],
  ['Quinn', 'Writer', 45, 40, 95, 35, 'residential', 'cafe'],
  ['Rosa', 'Florist', 75, 50, 70, 60, 'residential', 'shop'],
  ['Sam', 'Courier', 50, 80, 40, 70, 'residential', 'bus'],
  ['Tara', 'Musician', 85, 45, 90, 25, 'residential', 'park'],
  ['Uma', 'Accountant', 35, 60, 50, 95, 'residential', 'office'],
  ['Victor', 'Mechanic', 45, 75, 50, 80, 'residential', 'shop'],
  ['Wendy', 'Librarian', 50, 45, 85, 80, 'residential', 'townhall'],
  ['Yusuf', 'Student', 80, 40, 85, 45, 'residential', 'cafe'],
]
const COLORS = ['#e11d48', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#14b8a6', '#f97316']

let uid = 0
const nid = (p: string) => `${p}-${++uid}-${Date.now().toString(36)}`

export class SimEngine {
  agents: Agent[] = []; memories: Memory[] = []; events: SimEvent[] = []
  tick = 0; simMinutes = 8 * 60; seed: number; rng: () => number
  completed = 0; interactions = 0; paused = false; speed = 1
  private grid = walkableGrid(); private conv = new Map<string, { other: string; until: number }>()
  private lastTalk = new Map<string, { partner: string; until: number }>()
  // Who each agent last finished a conversation with, and until when a
  // re-pair with that partner is blocked. Without this, release and
  // re-pick happen inside one decision tick: both ex-partners are still
  // standing at the same entrance, both re-pick Socialize there, arrive()
  // runs instantly (already at the entrance) and pairs them again — so
  // the same pair chains 10-minute conversations back-to-back with no
  // visible break, looking like one endless conversation (31+ ticks
  // observed for a 10-minute timer) instead of ever dispersing.
  constructor(seed = 20261028) {
    this.seed = seed; this.rng = mulberry32(seed); this.seedAgents()
    // Agents start with a goal, not Idle: without this the first screen
    // shows 24 idle agents and zero events until the first decision tick.
    for (const a of this.agents) this.pickGoal(a)
  }
  get hour() { return Math.floor(this.simMinutes / 60) % 24 }
  timeStr() { const h = this.hour, m = this.simMinutes % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` }
  private log(category: SimEvent['category'], agent: Agent | null, loc: Location | null, message: string) {
    const e: SimEvent = { id: nid('ev'), tick: this.tick, time: this.timeStr(), category, agentId: agent?.id ?? null, agentName: agent?.name ?? 'System', locationId: loc?.id ?? null, message }
    this.events.unshift(e); if (this.events.length > 500) this.events.length = 500
  }
  private addMemory(owner: Agent, type: Memory['type'], summary: string, importance: number, valence: number, agentIds: string[], loc: Location | null, sourceEventId: string, tags: string[]) {
    const m: Memory = { id: nid('mem'), ownerId: owner.id, type, tick: this.tick, agentIds, locationId: loc?.id ?? null, summary, importance, valence, sourceEventId, tags }
    this.memories.unshift(m); if (this.memories.length > 1000) this.memories.length = 1000; return m
  }
  relevantMemories(agentId: string, otherId?: string): Memory[] {
    const scored = this.memories.filter(m => m.ownerId === agentId).map(m => {
      let s = m.importance * 10 - (this.tick - m.tick) * 0.2
      if (otherId && m.agentIds.includes(otherId)) s += 50
      return { m, s, why: otherId && m.agentIds.includes(otherId) ? 'Same participant + recent + important' : 'Recent + important' }
    }).sort((a, b) => b.s - a.s)
    return scored.slice(0, 5).map(x => x.m)
  }
  relevanceWhy(m: Memory, otherId?: string) { return otherId && m.agentIds.includes(otherId) ? 'Shares a participant with this agent' : `Importance ${m.importance}, tick ${m.tick}` }
  private seedAgents() {
    this.agents = SEED_AGENTS.map(([name, role, soc, en, cur, routine, home, work], i) => {
      const loc = LOCATIONS.find(l => l.id === home)!
      // Spawn on the entrance itself: entrance tiles are walkable, the tile
      // beside an entrance can be a building tile, which made A* return [].
      return { id: `agent-${i}-${name.toLowerCase()}`, name, role, color: COLORS[i % COLORS.length], personality: { sociability: soc, energyNeed: en, curiosity: cur, routine }, pos: { ...loc.entrance }, dest: null, path: [], state: 'Idle' as AgentState, activity: 'Arriving in Smallville', goal: 'Settle in', intention: 'Find a routine', thought: 'Just arrived in Smallville.', energy: 60 + Math.floor(this.rng() * 30), hunger: Math.floor(this.rng() * 40), mood: 60 + Math.floor(this.rng() * 30), sociability: soc, confidence: 55 + Math.floor(this.rng() * 30), home, workplace: work, paused: false, activityUntil: 0, cooldownUntil: 0, relationships: {}, recentActions: [] } as Agent
    })
  }
  private locById(id: string) { return LOCATIONS.find(l => l.id === id)! }
  private talkedRecently(aId: string, bId: string) {
    const t = this.lastTalk.get(aId)
    return !!t && t.partner === bId && this.simMinutes < t.until
  }
  private setGoal(a: Agent, goal: string, loc: Location, state: AgentState, activity: string, durationMin: number) {
    const path = astar(this.grid, { x: Math.round(a.pos.x), y: Math.round(a.pos.y) }, loc.entrance)
    if (!path.length && !(Math.round(a.pos.x) === loc.entrance.x && Math.round(a.pos.y) === loc.entrance.y)) return
    a.goal = goal; a.dest = loc.entrance; a.path = path; a.intention = goal; (a as any)._target = { loc, state, activity, durationMin }
    if (path.length) { a.state = 'Walking'; a.activity = `Walking to ${loc.name}`; a.thought = `Heading to ${loc.name} to ${goal.toLowerCase()}.` }
    // Already at the entrance: arrive now. Previously the state was set
    // directly without activityUntil, so the next decision tick instantly
    // "completed" a goal the agent never spent any time on — and an agent
    // re-picking the same location looped one fake completion per minute.
    else this.arrive(a)
  }
  private pickGoal(a: Agent) {
    const hour = this.hour
    const candidates: Array<[string, Location, AgentState, string, number, number]> = []
    // [goal, location, state, activity, duration, utility]
    const workLoc = this.locById(a.workplace)
    candidates.push(['Work', workLoc, 'Working', `Working at ${workLoc.name}`, 90, (hour >= 9 && hour < 17 ? 70 : 10) + a.personality.routine * 0.3])
    candidates.push(['Eat', this.locById(a.hunger > 50 ? 'restaurant' : 'cafe'), 'Eating', 'Eating', 30, a.hunger * 1.2 + (hour === 12 || hour === 19 ? 20 : 0)])
    candidates.push(['Rest', this.locById('residential'), 'Resting', 'Resting at home', 60, (100 - a.energy) * 1.1])
    candidates.push(['Sleep', this.locById('residential'), 'Sleeping', 'Sleeping', 120, (hour >= 22 || hour < 6 ? 90 : 0) + (100 - a.energy) * 0.4])
    candidates.push(['Socialize', this.locById(this.rng() > 0.5 ? 'park' : 'cafe'), 'Socializing', 'Socializing', 40, a.personality.sociability * 0.8 + (a.mood < 50 ? 20 : 0)])
    candidates.push(['Shop', this.locById('shop'), 'Shopping', 'Shopping', 25, 25 + a.personality.curiosity * 0.2])
    candidates.push(['Commute', this.locById('bus'), 'Commuting', 'Waiting for the bus', 15, hour === 8 || hour === 17 ? 45 : 5])
    candidates.sort((x, y) => y[5] - x[5])
    const [goal, loc, state, activity, dur] = candidates[0]
    this.setGoal(a, goal, loc, state, activity, dur)
  }
  private arrive(a: Agent) {
    const t: any = (a as any)._target; if (!t) { a.state = 'Idle'; return }
    const loc: Location = t.loc
    a.state = t.state; a.activity = t.activity; a.activityUntil = this.simMinutes + t.durationMin; a.thought = `${t.activity} at ${loc.name}.`
    this.log('MOVEMENT', a, loc, `${a.name} arrived at ${loc.name} to ${a.goal.toLowerCase()}.`)
    // Proximity interaction: pair with another socializing/conversing agent at same entrance
    if (t.state === 'Socializing') {
      const other = this.agents.find(o => o.id !== a.id && Math.round(o.pos.x) === loc.entrance.x && Math.round(o.pos.y) === loc.entrance.y && (o.state === 'Socializing' || o.state === 'Conversing') && !this.conv.has(o.id) && !this.talkedRecently(a.id, o.id) && !this.talkedRecently(o.id, a.id))
      if (other) {
        const evId = nid('ev')
        this.conv.set(a.id, { other: other.id, until: this.simMinutes + 10 }); this.conv.set(other.id, { other: a.id, until: this.simMinutes + 10 })
        a.state = 'Conversing'; other.state = 'Conversing'; this.interactions++
        const summary = `${a.name} and ${other.name} talked at ${loc.name} about their day.`
        this.log('SOCIAL', a, loc, summary)
        this.addMemory(a, 'episodic', summary, 7, 1, [other.id], loc, evId, ['social', loc.id])
        this.addMemory(other, 'episodic', summary, 7, 1, [a.id], loc, evId, ['social', loc.id])
        a.relationships[other.id] = Math.min(100, (a.relationships[other.id] ?? 50) + 8); other.relationships[a.id] = Math.min(100, (other.relationships[a.id] ?? 50) + 8)
        this.addMemory(a, 'relationship', `Relationship with ${other.name} improved after talking at ${loc.name}.`, 5, 1, [other.id], loc, evId, ['relationship'])
      }
    }
  }
  private complete(a: Agent) {
    const loc = LOCATIONS.find(l => l.entrance.x === Math.round(a.pos.x) && l.entrance.y === Math.round(a.pos.y))
    this.completed++; a.recentActions.unshift(`${a.goal} at ${loc?.name ?? 'town'}`); a.recentActions = a.recentActions.slice(0, 5)
    if (a.state === 'Eating') { a.hunger = Math.max(0, a.hunger - 50); a.energy = Math.min(100, a.energy + 10) }
    if (a.state === 'Resting') a.energy = Math.min(100, a.energy + 40)
    // Sleeping must restore more than Resting: a sleep lasts 120 minutes
    // (vs 60 for a rest) while energy drains 0.4/min, so the old shared
    // +40 left an agent MORE tired after a full night's sleep (50 -> 42).
    // +80 nets +32 over the night, the same recovery rate as a rest.
    if (a.state === 'Sleeping') a.energy = Math.min(100, a.energy + 80)
    if (a.state === 'Working') a.confidence = Math.min(100, a.confidence + 5)
    this.log('GOAL', a, loc ?? null, `${a.name} completed ${a.goal.toLowerCase()}.`)
    a.cooldownUntil = this.simMinutes + 2; a.state = 'Idle'; a.activity = 'Deciding what to do next'; a.dest = null; a.path = []
  }
  /** Advance simulation by real seconds (already speed-scaled by caller).
   * Time scale: 1 real second at 1x = 1 sim minute. Previously the
   * accumulator added raw seconds, so one sim minute took 60 real
   * seconds, activities (15-120 sim minutes) took hours, and the UI
   * showed 24 idle agents with zero interactions/completions/events
   * for the first minutes. Movement speed is unchanged (tiles/sec). */
  step(simSeconds: number, accumulated: { v: number }) {
    if (this.paused) return
    accumulated.v += simSeconds * 60
    // Move continuously
    for (const a of this.agents) {
      if (a.paused) continue
      if (a.path.length) {
        const next = a.path[0]; const dx = next.x - a.pos.x, dy = next.y - a.pos.y; const dist = Math.hypot(dx, dy)
        const stepDist = 3 * simSeconds
        if (dist <= stepDist) { a.pos = { ...next }; a.path.shift(); if (!a.path.length) this.arrive(a) } else { a.pos = { x: a.pos.x + dx / dist * stepDist, y: a.pos.y + dy / dist * stepDist } }
      }
    }
    // Decision tick: one sim minute per accumulated 60 sim-seconds
    while (accumulated.v >= 60) {
      accumulated.v -= 60; this.tick++; this.simMinutes++
      for (const a of this.agents) {
        if (a.paused) continue
        a.energy = Math.max(0, a.energy - 0.4); a.hunger = Math.min(100, a.hunger + 0.7)
        if (a.mood < 40) a.mood = Math.min(100, a.mood + 0.2)
        const conv = this.conv.get(a.id)
        // A Conversing agent with no conv entry is desynced — this happens
        // after snapshot/restore, because the conv timer map is not part of
        // the saved snapshot. Without this it stays Conversing forever:
        // the decision branches below both skip Conversing agents, and no
        // timer ever fires to release it.
        if (a.state === 'Conversing' && (!conv || this.simMinutes >= conv.until)) {
          // Remember the ex-partner so the pair cannot instantly re-form:
          // both are still standing at the same entrance, and without
          // this the next pickGoal can re-pick Socialize there, arrive
          // instantly and pair them again in the same tick they split.
          if (conv) this.lastTalk.set(a.id, { partner: conv.other, until: this.simMinutes + 30 })
          this.conv.delete(a.id); a.state = 'Idle'; a.activity = 'Finished conversation'
        }
        if (!a.path.length && a.state !== 'Conversing' && this.simMinutes >= a.activityUntil && this.simMinutes >= a.cooldownUntil) {
          if (a.activityUntil > 0 && a.state !== 'Idle') this.complete(a); else this.pickGoal(a)
        } else if (!a.path.length && a.state === 'Idle' && this.simMinutes >= a.cooldownUntil) this.pickGoal(a)
      }
    }
  }
  addAgent(input: { name: string; role: string; personality: Agent['personality']; locationId: string; energy: number; mood: number }) {
    const loc = this.locById(input.locationId)
    const a: Agent = { id: `agent-${Date.now()}`, name: input.name, role: input.role, color: pick(this.rng, COLORS), personality: input.personality, pos: { ...loc.entrance }, dest: null, path: [], state: 'Idle', activity: 'Arriving', goal: 'Settle in', intention: 'Settle in', thought: 'New in Smallville.', energy: input.energy, hunger: 20, mood: input.mood, sociability: input.personality.sociability, confidence: 60, home: 'residential', workplace: 'office', paused: false, activityUntil: 0, cooldownUntil: 0, relationships: {}, recentActions: [] }
    this.agents.push(a); this.log('SYSTEM', a, loc, `${a.name} joined Smallville as ${a.role}.`); return a
  }
  resetAgent(id: string) {
    const a = this.agents.find(x => x.id === id); if (!a) return
    // Unwind any conversation: without this the agent's conv entry stayed
    // in the map, so arrive() would never pick it as a conversation partner
    // again (it requires !conv.has(o.id)), and its partner kept talking to
    // someone who had been reset away. Deleting both sides releases the
    // partner now instead of leaving it Conversing until its timer fires.
    const conv = this.conv.get(id)
    if (conv) {
      this.conv.delete(id)
      const other = this.agents.find(x => x.id === conv.other)
      if (other && this.conv.get(other.id)?.other === id) {
        this.conv.delete(other.id)
        if (other.state === 'Conversing') { other.state = 'Idle'; other.activity = 'Finished conversation' }
      }
    }
    a.state = 'Idle'; a.path = []; a.dest = null; a.energy = 80; a.hunger = 20; a.mood = 70; a.activity = 'Reset'; a.goal = 'Settle in'
  }
  snapshot() { return JSON.parse(JSON.stringify({ agents: this.agents, memories: this.memories, events: this.events.slice(0, 200), tick: this.tick, simMinutes: this.simMinutes, seed: this.seed, completed: this.completed, interactions: this.interactions })) }
  restore(s: any) {
    this.agents = s.agents; this.memories = s.memories; this.events = s.events; this.tick = s.tick; this.simMinutes = s.simMinutes; this.completed = s.completed; this.interactions = s.interactions
    // Clear live conversation timers: they are not part of the snapshot,
    // and a stale entry from the pre-load session would outlive the load
    // — its `until` is on the old timeline, so a restored Conversing
    // agent could stay Conversing, talking to nobody, until that stale
    // timer passed, and a restored Socializing agent could never be
    // picked as a partner again (arrive() requires !conv.has(o.id)).
    // Clearing matches a fresh page load, where the guard releases
    // restored Conversing agents on the next tick.
    this.conv.clear()
    // Same timeline argument as the conv map: lastTalk windows are on
    // the live timeline, and loading an older save rewinds simMinutes,
    // which would stretch a stale no-repeat window far past its intent.
    this.lastTalk.clear()
  }
}
export const engine = new SimEngine()
