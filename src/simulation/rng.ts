// Deterministic seeded RNG (mulberry32) so a world can be reproduced from its seed.
export function mulberry32(seed: number) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
export function pick<T>(rng: () => number, arr: T[]): T { return arr[Math.floor(rng() * arr.length)] }
