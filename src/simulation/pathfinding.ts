import type { Pos } from './types'
// A* on a walkable boolean grid. Buildings/roads for cars are not walkable;
// sidewalks, crosswalks and park paths are. Returns tile waypoints or [].
export function astar(walkable: boolean[][], start: Pos, goal: Pos): Pos[] {
  const h = walkable.length, w = walkable[0]?.length ?? 0
  const inB = (p: Pos) => p.y >= 0 && p.y < h && p.x >= 0 && p.x < w
  if (!inB(start) || !inB(goal) || !walkable[start.y][start.x] || !walkable[goal.y][goal.x]) return []
  const key = (p: Pos) => `${p.x},${p.y}`
  const open: Pos[] = [start]; const came = new Map<string, Pos>(); const g = new Map<string, number>([[key(start), 0]])
  const heur = (p: Pos) => Math.abs(p.x - goal.x) + Math.abs(p.y - goal.y)
  while (open.length) {
    open.sort((a, b) => (g.get(key(a))! + heur(a)) - (g.get(key(b))! + heur(b)))
    const cur = open.shift()!
    if (cur.x === goal.x && cur.y === goal.y) { const path: Pos[] = []; let c: Pos | undefined = cur; while (c) { path.unshift(c); c = came.get(key(c)) } return path.slice(1) }
    for (const d of [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]) {
      const n = { x: cur.x + d.x, y: cur.y + d.y }
      if (!inB(n) || !walkable[n.y][n.x]) continue
      const ng = g.get(key(cur))! + 1
      if (ng < (g.get(key(n)) ?? Infinity)) { g.set(key(n), ng); came.set(key(n), cur); if (!open.some(p => p.x === n.x && p.y === n.y)) open.push(n) }
    }
  }
  return []
}
