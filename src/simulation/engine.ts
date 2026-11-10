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
  private lastTalk = new Map<string, Map<string, number>>()
  // When each agent last finished a Socializing activity, on the
  // simMinutes timeline. Socialize's utility grows the longer an agent
  // goes without social time (see pickGoal): without it the goal was
  // effectively dead for nearly half the city — 10-14 of 24 agents
  // never socialized once in a 30k-minute probe on four seeds, including
  // the two most sociable agents (Tara 85, Charlie 80), because its
  // fixed utility always lost to a higher fixed one in spare time: Shop
  // (curiosity * 0.8, up to 76) beat it for every curious agent, and
  // Work's off-hours floor (10 + routine * 0.3, up to 38.5) beat it for
  // every agent with sociability under ~48. The Relationships panel
  // showed "No relationships yet" for those agents forever, and the
  // whole city managed only 134-184 conversations in 21 sim-days.
  // The bonus caps at 45 (about two days alone): enough that the most
  // curious agent (Quinn, 36 + 45 = 81) eventually outbids Shop (76),
  // and the least sociable (Leo, 28) eventually outbids Work's
  // off-hours floor, but a single social outing resets it, so in
  // steady state it stays low and never outbids work, meals or sleep
  // the way a flat base would.
  private lastSocial = new Map<string, number>()
  // One no-repeat expiry per (agent, ex-partner) pair, not one per
  // agent: the old single-slot map kept only each agent's MOST RECENT
  // ex-partner, so one intervening conversation with anyone else
  // silently erased the 30-minute window against the previous partner —
  // a pair that just split could re-form inside the window as soon as
  // both had talked to someone else. Entries are keyed by partner, so
  // a map holds at most one entry per other agent and never grows
  // unboundedly; expired entries simply stop blocking.
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
    this.events.unshift(e)
    if (this.events.length > 500) {
      // Pruning must spare events a live memory links to. The a72a16b
      // fix made arrive() link each conversation memory to the event
      // just logged, but the 500-event cap then pruned those SOCIAL
      // events away while their memories survived — after a long run
      // every memory's sourceEventId named an event that no longer
      // existed in engine.events (327/327 dangling in a 30k-minute
      // probe). Once a memory itself is pruned (cap 1000) its event
      // becomes droppable again, so the log stays bounded at 500 plus
      // the number of live memories.
      const referenced = new Set(this.memories.map(m => m.sourceEventId))
      const kept = this.events.filter((ev, i) => i < 500 || referenced.has(ev.id))
      this.events.length = 0; this.events.push(...kept)
    }
    return e
  }
  /** Clear the event log the way the console's Clear button means it:
   * drop every event no live memory links to, but keep the ones memories
   * reference. The button used to do `events.length = 0`, which left
   * every memory's sourceEventId dangling (102/102 in a 6k-minute
   * probe) — the same broken link the log-cap and snapshot retention
   * rules were added to prevent. A memory outlives its source event
   * only by being pruned itself (cap 1000); clearing the log must not
   * orphan it first. */
  clearEvents() {
    const referenced = new Set(this.memories.map(m => m.sourceEventId))
    this.events = this.events.filter(ev => referenced.has(ev.id))
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
    // The loneliness clock starts at spawn: an agent that never
    // socializes must accrue the bonus from its first day, not from a
    // missing map entry (pickGoal treats a missing entry as "just
    // socialized", so without this the bonus stayed 0 forever for the
    // very agents it was meant to rescue).
    for (const a of this.agents) this.lastSocial.set(a.id, this.simMinutes)
  }
  private locById(id: string) { return LOCATIONS.find(l => l.id === id)! }
  private talkedRecently(aId: string, bId: string) {
    const until = this.lastTalk.get(aId)?.get(bId)
    return until !== undefined && this.simMinutes < until
  }
  private blockRePair(aId: string, bId: string, until: number) {
    let m = this.lastTalk.get(aId); if (!m) { m = new Map(); this.lastTalk.set(aId, m) }
    m.set(bId, until)
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
    // Starving agents eat first: without the critical-hunger bonus,
    // Sleep's night bonus (90) plus its low-energy term (up to 40)
    // totals 130 and beats a meal at maximum hunger (100 * 1.2 = 120),
    // so a starving, tired agent went to bed instead of eating — agents
    // sat at 100 hunger for up to 117 continuous minutes in a 10k-minute
    // probe, and most nights the whole city slept starving. At hunger
    // 80 the meal scores 96 + 40 = 136, above every other candidate's
    // maximum; below 80 the choice is unchanged.
    candidates.push(['Eat', this.locById(a.hunger > 50 ? 'restaurant' : 'cafe'), 'Eating', 'Eating', 30, a.hunger * 1.2 + (hour === 12 || hour === 19 ? 20 : 0) + (a.hunger >= 80 ? 40 : 0)])
    candidates.push(['Rest', this.locById('residential'), 'Resting', 'Resting at home', 60, (100 - a.energy) * 1.1])
    candidates.push(['Sleep', this.locById('residential'), 'Sleeping', 'Sleeping', 120, (hour >= 22 || hour < 6 ? 90 : 0) + (100 - a.energy) * 0.4])
    candidates.push(['Socialize', this.locById(this.rng() > 0.5 ? 'park' : 'cafe'), 'Socializing', 'Socializing', 40, a.personality.sociability * 0.8 + (a.mood < 50 ? 20 : 0) + Math.min(45, (this.simMinutes - (this.lastSocial.get(a.id) ?? this.simMinutes)) / 60)])
    // Shop used to score 25 + curiosity * 0.2 (29-44), below every other
    // goal's floor — Work is 70+ in the day, Sleep 90+ at night, Rest up
    // to 110, Eat up to 160, Socialize up to 88 — so it could only win
    // in a narrow corner (fed, rested, off-hours, low sociability and
    // low routine at once): 4-23 shopping trips per 30k minutes across
    // the whole city, vs ~3,300 meals, and the Corner Shop was
    // effectively decorative. It now scales with curiosity the way
    // Socialize scales with sociability (24-76), so curious agents shop
    // in their spare hours without it outbidding work, meals or sleep.
    candidates.push(['Shop', this.locById('shop'), 'Shopping', 'Shopping', 25, a.personality.curiosity * 0.8])
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
    // Proximity interaction: pair with another socializing agent at same entrance
    if (t.state === 'Socializing') {
      // Only Socializing agents are eligible partners. A Conversing agent
      // always holds a conv entry in live operation, so the old
      // Conversing branch could only match a desynced one — e.g. after
      // restore() cleared the conv map, when the agent is still flagged
      // Conversing until the next decision tick's guard releases it.
      // Pairing it here re-started its timer mid-conversation in the
      // movement phase, before that guard could run: a 10-minute
      // conversation stretched to a 17-minute Conversing streak, with a
      // new partner and no Idle break. A Conversing agent is already
      // talking; it must be released first, never re-paired.
      const other = this.agents.find(o => o.id !== a.id && Math.round(o.pos.x) === loc.entrance.x && Math.round(o.pos.y) === loc.entrance.y && o.state === 'Socializing' && !this.conv.has(o.id) && !this.talkedRecently(a.id, o.id) && !this.talkedRecently(o.id, a.id))
      if (other) {
        const summary = `${a.name} and ${other.name} talked at ${loc.name} about their day.`
        // Memories link back to the event that created them, so use the
        // id of the event log() just created. A separately generated id
        // used to be passed here instead, so every conversation memory's
        // sourceEventId named an event that never existed in engine.events.
        const ev = this.log('SOCIAL', a, loc, summary)
        this.conv.set(a.id, { other: other.id, until: this.simMinutes + 10 }); this.conv.set(other.id, { other: a.id, until: this.simMinutes + 10 })
        a.state = 'Conversing'; other.state = 'Conversing'; this.interactions++
        this.addMemory(a, 'episodic', summary, 7, 1, [other.id], loc, ev.id, ['social', loc.id])
        this.addMemory(other, 'episodic', summary, 7, 1, [a.id], loc, ev.id, ['social', loc.id])
        a.relationships[other.id] = Math.min(100, (a.relationships[other.id] ?? 50) + 8); other.relationships[a.id] = Math.min(100, (other.relationships[a.id] ?? 50) + 8)
        this.addMemory(a, 'relationship', `Relationship with ${other.name} improved after talking at ${loc.name}.`, 5, 1, [other.id], loc, ev.id, ['relationship'])
      }
    }
  }
  private complete(a: Agent) {
    const loc = LOCATIONS.find(l => l.entrance.x === Math.round(a.pos.x) && l.entrance.y === Math.round(a.pos.y))
    this.completed++; a.recentActions.unshift(`${a.goal} at ${loc?.name ?? 'town'}`); a.recentActions = a.recentActions.slice(0, 5)
    // Recovery stays a lump sum at completion (see step()): Resting +40
    // and Sleeping +80 are calibrated against the 0.4/min drain, and the
    // drain clamps at 0 mid-activity, so an exhausted sleeper wakes with
    // more than the nominal net — the day's rhythm (prompt morning
    // meals, rare starving sleeps) is calibrated on those totals.
    // Clearing the target and window matters: complete() can now run
    // mid-activity (the exhaustion interrupt below), and without this
    // the Idle branch would resume the "completed" activity — re-picking
    // Socialize at the same entrance, hitting zero energy again, and
    // completing it again, farming completions in a loop. Existing
    // callers only complete when the window already passed, so the
    // resume check (activityUntil in the future) was already false
    // for them.
    if (a.state === 'Eating') { a.hunger = Math.max(0, a.hunger - 50); a.energy = Math.min(100, a.energy + 10) }
    if (a.state === 'Resting') a.energy = Math.min(100, a.energy + 40)
    // Sleeping must restore more than Resting: a sleep lasts 120 minutes
    // (vs 60 for a rest) while energy drains 0.4/min, so the old shared
    // +40 left an agent MORE tired after a full night's sleep (50 -> 42).
    // +80 nets +32 over the night, the same recovery rate as a rest.
    if (a.state === 'Sleeping') a.energy = Math.min(100, a.energy + 80)
    if (a.state === 'Working') a.confidence = Math.min(100, a.confidence + 5)
    // A finished Socializing activity resets the loneliness clock, even
    // if no conversation happened: the agent went out to a social place
    // and spent the time there, so the "hasn't socialized in days"
    // bonus must not keep stacking and send it straight back out. The
    // conversation path reaches here too (complete() runs when the
    // Socializing window ends, including after a conversation), so one
    // recording point covers every way the activity ends.
    if (a.state === 'Socializing') this.lastSocial.set(a.id, this.simMinutes)
    this.log('GOAL', a, loc ?? null, `${a.name} completed ${a.goal.toLowerCase()}.`)
    a.cooldownUntil = this.simMinutes + 2; a.state = 'Idle'; a.activity = 'Deciding what to do next'; a.dest = null; a.path = []; a.activityUntil = 0; (a as any)._target = undefined
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
        // Hunger rises 0.25/min, not 0.7: at 0.7 it climbed +1008/day
        // while a meal only removes 50, so even eating 10 times a day
        // could not keep up — agents spent ~49% of their lives pinned
        // at hunger 100, 98.5% of sleeps ended starving, and the hunger
        // stat sat at max instead of varying. At 0.25 (+360/day) a meal
        // every few hours balances: ~3% of time at 100, ~2% of sleeps
        // ending starving, meals ~7/agent/day.
        a.energy = Math.max(0, a.energy - 0.4); a.hunger = Math.min(100, a.hunger + 0.25)
        // Mood responds to how the agent feels: being very hungry or
        // exhausted drags it down, and being fed and rested lets it
        // recover. The recovery used to fire only below 40, so mood could
        // only fall in the 40-100 band and never climb back: over a long
        // run every agent ratcheted down to 40 and stayed there (24/24
        // agents at 11-40, median 39, after 10k minutes), the whole city
        // permanently glum and the inspector's Mood % flat at the same
        // value for days. Recovery now applies whenever the agent is fed
        // and rested, at any mood, so mood rises and falls with how the
        // agent is actually doing instead of converging on 40.
        if (a.hunger >= 80 || a.energy <= 10) a.mood = Math.max(0, a.mood - 0.2)
        else a.mood = Math.min(100, a.mood + 0.2)
        // Confidence follows the same rule as mood: it used to only ever
        // rise (+5 per completed Work, capped at 100) and nothing ever
        // lowered it, so after ~10k minutes every agent sat at 100
        // (24/24 in a 30k-minute probe) and the inspector's Confidence %
        // was a flat, meaningless number — the same dead-stat failure
        // mood had before its fix. Being very hungry or exhausted now
        // dents it, and being fed and rested lets it recover, so it
        // moves with how the agent is actually doing instead of
        // saturating; the +5 on completing Work still rewards a shift.
        if (a.hunger >= 80 || a.energy <= 10) a.confidence = Math.max(0, a.confidence - 0.2)
        else a.confidence = Math.min(100, a.confidence + 0.2)
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
          if (conv) this.blockRePair(a.id, conv.other, this.simMinutes + 30)
          // Visible break after a conversation: without a cooldown the
          // released agent instantly re-picks Socialize at the same
          // entrance, arrives instantly (already there) and pairs with
          // the next agent standing there — chaining distinct 10-minute
          // conversations into one unbroken 20-30 minute "Conversing"
          // stretch with no Idle gap. The no-repeat window above only
          // blocks the same partner, so it does not stop this. A short
          // cooldown makes the agent stand Idle ("Finished
          // conversation") before its next goal, so each conversation
          // reads as a separate event.
          this.conv.delete(a.id); a.state = 'Idle'; a.activity = 'Finished conversation'; a.cooldownUntil = this.simMinutes + 5
          // A conversation interrupts the agent's Socializing activity,
          // it does not end it — but the release used to drop the
          // activity outright. The agent went Idle, picked a new goal
          // after the cooldown, and its Socialize goal was never
          // recorded as completed (no GOAL event, no completed++,
          // nothing in recentActions), even though it spent the time
          // socializing; an agent that talked to someone therefore
          // completed fewer goals than one that stood alone. Worse, a
          // conversation starting near the end of the 40-minute window
          // ran past activityUntil, and the goal was silently discarded.
          // If the window already passed, the goal still counts:
          // record the completion here, but keep the 5-minute cooldown
          // (complete() alone would set 2) so the anti-chain gap holds.
          // If time is left, the Idle branch below resumes the activity
          // once the cooldown passes.
          const t: any = (a as any)._target
          if (t?.state === 'Socializing' && a.activityUntil > 0 && a.activityUntil <= this.simMinutes) {
            this.complete(a)
            a.state = 'Idle'; a.activity = 'Finished conversation'; a.cooldownUntil = this.simMinutes + 5
          }
        }
        // Exhaustion interrupt: an agent that hits 0 energy mid-activity
        // stops instead of finishing the shift at zero. Without this,
        // pickGoal's utilities only decide at the START of an activity —
        // Work beats Rest down to ~energy 20 — so an agent that began a
        // 90-minute shift tired drained to 0 halfway through and then
        // worked a full hour at 0, walked home, and rested a full hour
        // at 0: a 138-minute streak at zero energy, identical on every
        // seed (Peter the Baker, deterministic work hours). Eating,
        // Resting and Sleeping are restorative and never interrupted;
        // Conversing is capped at 10 minutes by its own timer. Ending
        // the activity through complete() records the goal (no dropped
        // goals, same as the conversation release) and the 2-minute
        // cooldown sends the agent home to rest on the next pick.
        if (!a.path.length && a.energy <= 0 && this.simMinutes < a.activityUntil && ['Working', 'Shopping', 'Commuting', 'Socializing'].includes(a.state)) {
          this.complete(a)
        }
        if (!a.path.length && a.state !== 'Conversing' && this.simMinutes >= a.activityUntil && this.simMinutes >= a.cooldownUntil) {
          if (a.activityUntil > 0 && a.state !== 'Idle') this.complete(a); else this.pickGoal(a)
        } else if (!a.path.length && a.state === 'Idle' && this.simMinutes >= a.cooldownUntil) {
          // Resume an interrupted Socializing activity instead of
          // picking a new goal: a conversation only paused it, and the
          // agent used to abandon up to ~30 minutes of its scheduled
          // social time after every chat. Only while the window still
          // has time left and the agent is still standing at that
          // location's entrance — a completed or distant activity still
          // picks a fresh goal. The resume happens here, after the
          // cooldown, so the agent keeps its visible Idle break and
          // cannot be re-paired until the cooldown has passed.
          const t: any = (a as any)._target
          if (t?.state === 'Socializing' && a.activityUntil > this.simMinutes && Math.round(a.pos.x) === t.loc.entrance.x && Math.round(a.pos.y) === t.loc.entrance.y) {
            a.state = 'Socializing'; a.activity = t.activity; a.thought = `${t.activity} at ${t.loc.name}.`
          } else this.pickGoal(a)
        }
      }
    }
  }
  addAgent(input: { name: string; role: string; personality: Agent['personality']; locationId: string; energy: number; mood: number }) {
    const loc = this.locById(input.locationId)
    const a: Agent = { id: nid('agent'), name: input.name, role: input.role, color: pick(this.rng, COLORS), personality: input.personality, pos: { ...loc.entrance }, dest: null, path: [], state: 'Idle', activity: 'Arriving', goal: 'Settle in', intention: 'Settle in', thought: 'New in Smallville.', energy: input.energy, hunger: 20, mood: input.mood, sociability: input.personality.sociability, confidence: 60, home: 'residential', workplace: 'office', paused: false, activityUntil: 0, cooldownUntil: 0, relationships: {}, recentActions: [] }
    this.lastSocial.set(a.id, this.simMinutes)
    this.agents.push(a); this.log('SYSTEM', a, loc, `${a.name} joined Smallville as ${a.role}.`); return a
  }
  setSociability(id: string, value: number) {
    const a = this.agents.find(x => x.id === id); if (!a) return
    // The inspector slider edits personality.sociability (the value
    // pickGoal reads), but the stats list shows the top-level sociability
    // field, which was only set at spawn — so moving the slider changed
    // behaviour while the displayed stat stayed frozen at the seed value,
    // and the panel showed two different "Sociability" numbers. Keep
    // both copies in sync; personality remains the authoritative one.
    const v = Math.max(0, Math.min(100, value))
    a.personality.sociability = v; a.sociability = v
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
      // Same no-repeat window as a natural release: without this the
      // ex-partners could re-pair at the same entrance as soon as the
      // partner's 5-minute cooldown passed, instead of waiting 30
      // minutes — so a reset pair re-formed almost immediately, while a
      // naturally finished pair could not.
      this.blockRePair(id, conv.other, this.simMinutes + 30)
      this.blockRePair(conv.other, id, this.simMinutes + 30)
      this.conv.delete(id)
      const other = this.agents.find(x => x.id === conv.other)
      if (other && this.conv.get(other.id)?.other === id) {
        this.conv.delete(other.id)
        // Same visible break as a natural conversation release: without
        // a cooldown the partner — still standing at the same entrance —
        // instantly re-picks Socialize there on the next tick, arrives
        // instantly and pairs with the next agent standing there, so a
        // reset chains straight into a new conversation with no Idle gap.
        if (other.state === 'Conversing') { other.state = 'Idle'; other.activity = 'Finished conversation'; other.cooldownUntil = this.simMinutes + 5 }
      }
    }
    a.state = 'Idle'; a.path = []; a.dest = null; a.energy = 80; a.hunger = 20; a.mood = 70; a.activity = 'Reset'; a.goal = 'Settle in'
    // A reset must actually restart the agent: a paused agent that is
    // reset kept paused=true, so step() skipped it forever — frozen on
    // Idle/"Reset" with no goal, and nothing ever unpaused it. Likewise
    // a stale activityUntil/cooldownUntil from the pre-reset goal could
    // leave it standing Idle past the reset, and a stale _target could
    // be re-entered by the next arrival. Clear all four so the next
    // decision tick picks a fresh goal.
    a.paused = false; a.activityUntil = 0; a.cooldownUntil = 0; (a as any)._target = undefined
  }
  snapshot() {
    // conv is a live timer map, not serializable as-is: record the
    // unordered pairs mid-conversation (one entry per pair, not per
    // direction) so restore() can carry their no-repeat window, and
    // the per-pair lastTalk windows in array form. Both are on the
    // simMinutes timeline, so they stay valid across the round-trip.
    const convPairs = [...this.conv].filter(([id, c]) => id < c.other).map(([id, c]) => [id, c.other])
    const lastTalk = [...this.lastTalk].map(([id, m]) => [id, [...m]])
    // The loneliness clock is per-agent state on the simMinutes timeline,
    // like lastTalk: without it a load reset every agent to "never
    // socialized", maxing the Socialize bonus for the whole city at once
    // and sending everyone to the park/cafe instead of work.
    const lastSocial = [...this.lastSocial]
    // Same retention rule as log(): the snapshot keeps the newest 200
    // events, which used to drop every source event a saved memory
    // links to — a load left 100% of memories dangling (222/222 in a
    // 20k-minute probe). Keep referenced events alongside the newest 200.
    const referenced = new Set(this.memories.map(m => m.sourceEventId))
    const events = this.events.filter((ev, i) => i < 200 || referenced.has(ev.id))
    return JSON.parse(JSON.stringify({ agents: this.agents, memories: this.memories, events, tick: this.tick, simMinutes: this.simMinutes, seed: this.seed, completed: this.completed, interactions: this.interactions, convPairs, lastTalk, lastSocial }))
  }
  restore(s: any) {
    this.agents = s.agents; this.memories = s.memories; this.events = s.events; this.tick = s.tick; this.simMinutes = s.simMinutes; this.completed = s.completed; this.interactions = s.interactions
    // The seed is part of the snapshot (and required by WorldSchema), so
    // loading a save must restore it: without this the engine kept its
    // constructor seed (20261028 by default), and a save made after the
    // load wrote that seed against a different world's state. The live
    // rng stream itself is not reset — the snapshot records no draw
    // count, so re-creating it would replay the sequence from the start.
    if (typeof s.seed === 'number') this.seed = s.seed
    // Clear live conversation timers: they are not part of the snapshot,
    // and a stale entry from the pre-load session would outlive the load
    // — its `until` is on the old timeline, so a restored Conversing
    // agent could stay Conversing, talking to nobody, until that stale
    // timer passed, and a restored Socializing agent could never be
    // picked as a partner again (arrive() requires !conv.has(o.id)).
    // Clearing matches a fresh page load, where the guard releases
    // restored Conversing agents on the next tick.
    this.conv.clear()
    // Restore the no-repeat windows from the snapshot, keeping only
    // entries on the restored timeline (a real save can only hold
    // expiries up to 30 minutes past its simMinutes; anything else is
    // a stale or hand-edited entry and is dropped, not trusted).
    // Without this, loading a save silently erased every window:
    // pairs that finished talking before the save could re-form
    // immediately after the load.
    this.lastTalk.clear()
    if (Array.isArray(s.lastTalk)) {
      for (const [id, entries] of s.lastTalk) {
        if (!Array.isArray(entries)) continue
        const m = new Map<string, number>()
        for (const [other, until] of entries) {
          if (typeof other === 'string' && typeof until === 'number' && until > this.simMinutes && until <= this.simMinutes + 30) m.set(other, until)
        }
        if (m.size) this.lastTalk.set(id, m)
      }
    }
    // Restore the loneliness clock from the snapshot, keeping only
    // timestamps on the restored timeline (a save can only hold a time
    // up to its own simMinutes; anything later is stale or hand-edited
    // and is dropped, so the agent starts from "just socialized" rather
    // than from a maxed bonus). Saves from before this field simply have
    // no entry, and pickGoal treats a missing entry as "just
    // socialized", so a load never triggers a city-wide social rush.
    this.lastSocial.clear()
    if (Array.isArray(s.lastSocial)) {
      for (const [id, at] of s.lastSocial) {
        if (typeof id === 'string' && typeof at === 'number' && at <= this.simMinutes) this.lastSocial.set(id, at)
      }
    }
    // Agents from a save made before this field existed have no entry:
    // start their clock at the load, not at "never socialized", so the
    // load does not max everyone's bonus at once (see snapshot()).
    for (const a of this.agents) if (!this.lastSocial.has(a.id)) this.lastSocial.set(a.id, this.simMinutes)
    // the guard releases both on the next tick — so treat the load as
    // the moment they split: give them the same 30-minute no-repeat
    // window a natural release sets. Without this the pair could
    // re-pick Socialize at the same entrance after the 5-minute
    // cooldown and pair again, looking like one endless conversation.
    if (Array.isArray(s.convPairs)) {
      for (const [a, b] of s.convPairs) {
        if (typeof a === 'string' && typeof b === 'string') {
          this.blockRePair(a, b, this.simMinutes + 30)
          this.blockRePair(b, a, this.simMinutes + 30)
        }
      }
    }
  }
}
export const engine = new SimEngine()
