import { useEffect, useRef, useState } from 'react'
// shortcut: Phaser is loaded on demand, not at page load — the shell renders first.
// If Phaser fails (e.g. WebGL blocked), the error state replaces a stuck blank canvas.
export default function CityView() {
  const ref = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  useEffect(() => {
    if (!ref.current) return
    let cancelled = false
    let game: { destroy: (removeCanvas: boolean) => void } | null = null
    Promise.all([import('phaser'), import('../city/PhaserScene')]).then(([Phaser, scene]) => {
      if (cancelled || !ref.current) return
      game = new Phaser.default.Game({ type: Phaser.default.AUTO, parent: ref.current, width: 960, height: 560, backgroundColor: '#0a0a0b', scene: [scene.PhaserScene], scale: { mode: Phaser.default.Scale.RESIZE, autoCenter: Phaser.default.Scale.CENTER_BOTH } })
      setStatus('ready')
    }).catch(() => { if (!cancelled) setStatus('error') })
    return () => { cancelled = true; game?.destroy(true) }
  }, [])
  return (
    <div ref={ref} className="w-full h-full min-h-0 bg-[#0a0a0b]" aria-label="City viewport">
      {status === 'loading' && <p className="p-4 text-sm text-gray-300" role="status">Loading city…</p>}
      {status === 'error' && <p className="p-4 text-sm text-red-400" role="alert">City could not load. Try reloading the page — the agent list and controls above still work.</p>}
    </div>
  )
}
