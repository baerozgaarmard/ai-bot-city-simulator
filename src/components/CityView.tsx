import { useEffect, useRef } from 'react'
import Phaser from 'phaser'
import { PhaserScene } from '../city/PhaserScene'
export default function CityView() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current) return
    const game = new Phaser.Game({ type: Phaser.AUTO, parent: ref.current, width: 960, height: 560, backgroundColor: '#0a0a0b', scene: [PhaserScene], scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH } })
    const onVis = () => { /* Phaser keeps running; engine pauses only via UI pause, visibility does not corrupt state */ }
    document.addEventListener('visibilitychange', onVis)
    return () => { document.removeEventListener('visibilitychange', onVis); game.destroy(true) }
  }, [])
  return <div ref={ref} className="w-full h-full min-h-[560px] bg-[#0a0a0b]" aria-label="City viewport" />
}
