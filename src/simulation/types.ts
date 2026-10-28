export type AgentState = 'Idle'|'Walking'|'Commuting'|'Working'|'Eating'|'Resting'|'Socializing'|'Shopping'|'Waiting'|'Sleeping'|'Conversing'
export interface Pos { x: number; y: number }
export interface Agent {
  id: string; name: string; role: string; color: string
  personality: { sociability: number; energyNeed: number; curiosity: number; routine: number }
  pos: Pos; dest: Pos | null; path: Pos[]; state: AgentState; activity: string
  goal: string; intention: string; thought: string
  energy: number; hunger: number; mood: number; sociability: number; confidence: number
  home: string; workplace: string; paused: boolean; activityUntil: number; cooldownUntil: number
  relationships: Record<string, number>; recentActions: string[]
}
export interface Memory { id: string; ownerId: string; type: 'episodic'|'semantic'|'relationship'|'short-term'; tick: number; agentIds: string[]; locationId: string | null; summary: string; importance: number; valence: number; sourceEventId: string; tags: string[] }
export interface SimEvent { id: string; tick: number; time: string; category: 'MOVEMENT'|'SOCIAL'|'GOAL'|'MEMORY'|'STATE'|'SYSTEM'; agentId: string | null; agentName: string; locationId: string | null; message: string }
export interface Location { id: string; name: string; type: string; entrance: Pos; tiles: Pos[]; actions: string[] }
export interface Metrics { total: number; active: number; idle: number; interactions: number; avgEnergy: number; avgMood: number; completed: number; events: number; memories: number; tickRate: number }
