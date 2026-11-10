import Dexie, { type Table } from 'dexie'
import { z } from 'zod'
export const WorldSchema = z.object({ agents: z.array(z.any()), memories: z.array(z.any()), events: z.array(z.any()), tick: z.number(), simMinutes: z.number(), seed: z.number(), completed: z.number(), interactions: z.number(),
  // Pairs mid-conversation when saved, and the per-pair no-repeat
  // windows. Both are needed so a load does not silently drop the
  // 30-minute window that stops a just-finished pair re-forming.
  // Optional so saves from before these fields still load.
  convPairs: z.array(z.tuple([z.string(), z.string()])).optional(),
  lastTalk: z.array(z.tuple([z.string(), z.array(z.tuple([z.string(), z.number()]))])).optional(),
  // When each agent last finished a Socializing activity (simMinutes).
  // Optional so saves from before this field still load.
  lastSocial: z.array(z.tuple([z.string(), z.number()])).optional() })
export type WorldSnapshot = z.infer<typeof WorldSchema>
class CityDB extends Dexie { worlds!: Table<{ id: string; savedAt: number; data: unknown }, string>; constructor() { super('ai-bot-city'); this.version(1).stores({ worlds: 'id,savedAt' }) } }
export const db = new CityDB()
export async function saveWorld(data: unknown) { const parsed = WorldSchema.parse(data); await db.worlds.put({ id: 'latest', savedAt: Date.now(), data: parsed }); localStorage.setItem('ai-bot-city-tick', String(parsed.tick)); return true }
export async function loadWorld() { const row = await db.worlds.get('latest'); if (!row) return null; return WorldSchema.parse(row.data) }
