import { useEffect, useRef } from 'react'
import { spritePixels } from '../city/sprites'

// Thumbnail from the SAME pixel grid used for the Phaser city sprite,
// so registry/inspector identity matches the agent in the city exactly.
export default function AgentAvatar({ role, index, size = 24 }: { role: string; index: number; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current; if (!c) return
    const ctx = c.getContext('2d'); if (!ctx) return
    const { rows, colors } = spritePixels(role, 'down', 'idle', index)
    ctx.clearRect(0, 0, 24, 32)
    rows.forEach((row, r) => { [...row].forEach((ch, col) => { if (ch === '.') return; ctx.fillStyle = colors[ch] ?? '#111827'; ctx.fillRect(col, r, 1, 1) }) })
  }, [role, index])
  return <canvas ref={ref} width={24} height={32} className="shrink-0" style={{ width: size, height: Math.round(size * 32 / 24), imageRendering: 'pixelated' }} aria-hidden />
}
