import { useMemo, useState } from 'react'
import { Pause, Play, Plus, Users, MapPin, Brain, ListOrdered, Settings as SettingsIcon, Building2, Save, FolderOpen, RotateCcw } from 'lucide-react'
import CityView from './components/CityView'
import AgentAvatar from './components/AgentAvatar'
import { engine } from './simulation/engine'
import { LOCATIONS } from './simulation/map'
import { useUI, selectedAgent } from './stores/store'
import { saveWorld, loadWorld } from './persistence/db'
// Camera helpers are loaded on demand so App's first bundle never pulls in Phaser.
const focusAgent = async (id: string) => (await import('./city/PhaserScene')).focusAgent(id)
const focusLocation = async (id: string) => (await import('./city/PhaserScene')).focusLocation(id)
const resetCamera = async () => (await import('./city/PhaserScene')).resetCamera()

const VIEWS = [{ id: 'City', icon: Building2, label: 'City' }, { id: 'Agents', icon: Users, label: 'Agents' }, { id: 'Locations', icon: MapPin, label: 'Locations' }, { id: 'Memories', icon: Brain, label: 'Memories' }, { id: 'Event Log', icon: ListOrdered, label: 'Event Log' }, { id: 'Settings', icon: SettingsIcon, label: 'Settings' }]

export default function App() {
  const ui = useUI(); const [showAdd, setShowAdd] = useState(false); const [autoscroll, setAutoscroll] = useState(true)
  const [form, setForm] = useState({ name: '', role: 'Software Developer', locationId: 'cafe', energy: 80, mood: 70, sociability: 60 })
  const [formError, setFormError] = useState('')
  const sel = selectedAgent()
  const agents = engine.agents
  const filtered = useMemo(() => agents.filter(a => (!ui.search || a.name.toLowerCase().includes(ui.search.toLowerCase())) && (ui.roleFilter === 'All' || a.role === ui.roleFilter) && (ui.stateFilter === 'All' || a.state === ui.stateFilter)), [agents, ui.search, ui.roleFilter, ui.stateFilter, ui.tick])
  const metrics = useMemo(() => ({ total: agents.length, active: agents.filter(a => !['Idle', 'Resting', 'Sleeping'].includes(a.state)).length, idle: agents.filter(a => ['Idle', 'Resting', 'Sleeping'].includes(a.state)).length, interactions: engine.interactions, avgEnergy: Math.round(agents.reduce((s, a) => s + a.energy, 0) / Math.max(1, agents.length)), avgMood: Math.round(agents.reduce((s, a) => s + a.mood, 0) / Math.max(1, agents.length)), completed: engine.completed, events: engine.events.length, memories: engine.memories.length, tickRate: 'measured in ticks — see tick counter' }), [agents, ui.tick])
  const consoleEvents = useMemo(() => engine.events.filter(e => (ui.consoleCategory === 'All' || e.category === ui.consoleCategory) && (!ui.consoleSearch || e.message.toLowerCase().includes(ui.consoleSearch.toLowerCase()))).slice(0, ui.logDensity === 'low' ? 50 : ui.logDensity === 'high' ? 300 : 150), [ui.tick, ui.consoleCategory, ui.consoleSearch, ui.logDensity])
  const submitAdd = () => {
    if (!form.name.trim()) { setFormError('Name is required.'); return }
    if (agents.some(a => a.name.toLowerCase() === form.name.trim().toLowerCase())) { setFormError('An agent with that name already exists.'); return }
    engine.addAgent({ name: form.name.trim(), role: form.role, personality: { sociability: form.sociability, energyNeed: 60, curiosity: 60, routine: 50 }, locationId: form.locationId, energy: form.energy, mood: form.mood })
    setShowAdd(false); setFormError(''); ui.sync()
  }
  const doSave = async () => { await saveWorld(engine.snapshot()); alert('World saved locally (IndexedDB).') }
  const doLoad = async () => { try { const s = await loadWorld(); if (!s) { alert('No saved world found.'); return } engine.restore(s); ui.sync(); alert('World loaded.') } catch { alert('Saved world is corrupted or incompatible and was not loaded.') } }
  const doReset = () => { if (window.confirm('Reset the simulation? Unsaved progress will be discarded.')) { window.location.reload() } }
  return (
    <div className="h-dvh w-screen flex flex-col bg-[#0a0a0b] text-gray-100 overflow-hidden">
      <header className="flex flex-wrap items-center gap-3 px-4 py-2 border-b border-gray-800 shrink-0">
        <h1 className="font-bold text-lg">AI Bot City Simulator <span className="text-xs text-gray-400">v0.1 · Smallville</span></h1>
        <button className="px-3 py-1 rounded bg-gray-800 hover:bg-gray-700" onClick={() => ui.set({ paused: !ui.paused })} aria-label="Pause or resume">{ui.paused ? <Play size={16} /> : <Pause size={16} />}</button>
        {[1, 2, 4, 8].map(s => <button key={s} className={`px-2 py-1 rounded ${ui.speed === s ? 'bg-emerald-600' : 'bg-gray-800'}`} onClick={() => ui.set({ speed: s })}>{s}x</button>)}
        <button className="px-3 py-1 rounded bg-emerald-700 hover:bg-emerald-600 flex items-center gap-1" onClick={() => setShowAdd(true)}><Plus size={16} /> Add Agent</button>
        <button className="px-2 py-1 rounded bg-gray-800 flex items-center gap-1" onClick={doSave}><Save size={14} /> Save</button>
        <button className="px-2 py-1 rounded bg-gray-800 flex items-center gap-1" onClick={doLoad}><FolderOpen size={14} /> Load</button>
        <button className="px-2 py-1 rounded bg-gray-800 flex items-center gap-1" onClick={doReset}><RotateCcw size={14} /> Reset</button>
        <span className="ml-auto text-sm text-gray-300 min-h-[44px] flex items-center">Agents: {agents.length} · Tick: {engine.tick} · Time: {engine.timeStr()} · District: Smallville</span>
      </header>
      <div className="flex flex-1 min-h-0">
        <nav className="w-14 border-r border-gray-800 flex flex-col items-center py-2 gap-1 shrink-0" aria-label="Main navigation">
          {VIEWS.map(v => <button key={v.id} title={v.label} className={`p-2 rounded ${ui.view === v.id ? 'bg-gray-800 text-emerald-400' : 'text-gray-400 hover:bg-gray-800'}`} onClick={() => ui.set({ view: v.id })}><v.icon size={20} /></button>)}
        </nav>
        {!ui.leftCollapsed && (
          <aside className="w-72 border-r border-gray-800 flex flex-col min-h-0 shrink-0">
            <div className="p-3 border-b border-gray-800">
              <h2 className="font-semibold mb-2">Agent Registry</h2>
              <input className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm" placeholder="Search agents…" value={ui.search} onChange={e => ui.set({ search: e.target.value })} aria-label="Search agents" />
              <div className="flex gap-2 mt-2">
                <select className="bg-gray-900 border border-gray-700 rounded text-sm flex-1" value={ui.roleFilter} onChange={e => ui.set({ roleFilter: e.target.value })}><option>All</option>{[...new Set(agents.map(a => a.role))].map(r => <option key={r}>{r}</option>)}</select>
                <select className="bg-gray-900 border border-gray-700 rounded text-sm flex-1" value={ui.stateFilter} onChange={e => ui.set({ stateFilter: e.target.value })}><option>All</option>{[...new Set(agents.map(a => a.state))].map(s => <option key={s}>{s}</option>)}</select>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-2 space-y-1">
              {filtered.map(a => <button key={a.id} onClick={() => ui.select(a.id)} className={`w-full text-left p-2 rounded flex items-center gap-2 ${ui.selectedId === a.id ? 'bg-gray-800 ring-1 ring-emerald-500' : 'hover:bg-gray-900'}`}><AgentAvatar role={a.role} index={agents.indexOf(a)} size={24} /><span className="flex-1 min-w-0"><span className="block truncate font-medium">{a.name}</span><span className="block truncate text-xs text-gray-400">{a.role} · {a.state}</span></span><span className={`w-2 h-2 rounded-full ${a.state === 'Idle' ? 'bg-amber-400' : 'bg-emerald-400'}`} title={a.state} /></button>)}
              {filtered.length === 0 && <p className="text-sm text-gray-400 p-2">No agents match this search/filter.</p>}
            </div>
            <div className="p-3 border-t border-gray-800 text-sm space-y-1">
              <h3 className="font-semibold">Metrics (from live state)</h3>
              <p>Total: {metrics.total} · Active: {metrics.active} · Idle: {metrics.idle}</p>
              <p>Interactions: {metrics.interactions} · Completed: {metrics.completed}</p>
              <p>Avg energy: {metrics.avgEnergy}% · Avg mood: {metrics.avgMood}%</p>
              <p>Events: {metrics.events} · Memories: {metrics.memories}</p>
              <p className="text-xs text-gray-400">Tick rate: measured in ticks (tick counter above); FPS / latency are unavailable in this local build and are not shown.</p>
              <button className="text-xs underline" onClick={() => ui.set({ leftCollapsed: true })}>Collapse panel</button>
            </div>
          </aside>
        )}
        {ui.leftCollapsed && <button className="px-2 border-r border-gray-800 text-xs min-h-[44px]" aria-label="Show agent registry panel" onClick={() => ui.set({ leftCollapsed: false })}>▶ Panels</button>}
        <main className="flex-1 relative min-w-0 flex flex-col">
          <div className={ui.view === 'City' ? 'flex-1 min-h-0' : 'invisible absolute inset-0 overflow-hidden'}><CityView /></div>
          {ui.view !== 'City' && (
            <div className="flex-1 overflow-auto p-4">
              {ui.view === 'Agents' && <div><h2 className="text-xl font-bold mb-3">Agents</h2>{agents.map(a => <p key={a.id} className="py-1 border-b border-gray-800">{a.name} — {a.role} — {a.state} at ({Math.round(a.pos.x)}, {Math.round(a.pos.y)}) — {a.goal}</p>)}</div>}
              {ui.view === 'Locations' && <div><h2 className="text-xl font-bold mb-3">Locations</h2>{LOCATIONS.map(l => <div key={l.id} className="py-2 border-b border-gray-800 flex justify-between"><span>{l.name} ({l.type}) — entrance ({l.entrance.x}, {l.entrance.y}) — actions: {l.actions.join(', ')}</span><button className="px-2 py-1 bg-gray-800 rounded" onClick={() => { ui.set({ view: 'City' }); focusLocation(l.id) }}>Focus in City</button></div>)}</div>}
              {ui.view === 'Memories' && <div><h2 className="text-xl font-bold mb-3">Memories</h2><input className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 mb-3" placeholder="Search memories…" value={ui.memorySearch} onChange={e => ui.set({ memorySearch: e.target.value })} />{engine.memories.filter(m => !ui.memorySearch || m.summary.toLowerCase().includes(ui.memorySearch.toLowerCase())).slice(0, 200).map(m => <p key={m.id} className="py-1 border-b border-gray-800 text-sm">[{m.type}] tick {m.tick}: {m.summary} — importance {m.importance}. Relevance: {engine.relevanceWhy(m)}</p>)}</div>}
              {ui.view === 'Event Log' && <div><h2 className="text-xl font-bold mb-3">Event Log</h2>{engine.events.map(e => <p key={e.id} className="py-1 border-b border-gray-800 text-sm font-mono">[{e.time}] [{e.category}] {e.agentName}: {e.message}</p>)}</div>}
              {ui.view === 'Settings' && <div className="space-y-3"><h2 className="text-xl font-bold">Settings</h2>
                <label className="flex gap-2"><input type="checkbox" checked={ui.showThoughts} onChange={e => ui.set({ showThoughts: e.target.checked })} /> Thought labels</label>
                <label className="flex gap-2"><input type="checkbox" checked={ui.showPaths} onChange={e => ui.set({ showPaths: e.target.checked })} /> Path visualization</label>
                <label className="flex gap-2"><input type="checkbox" checked={ui.showLocationLabels} onChange={e => ui.set({ showLocationLabels: e.target.checked })} /> Location labels (off by default; buildings render without them)</label>
                <label className="flex gap-2">Event-log density <select className="bg-gray-900 border border-gray-700 rounded" value={ui.logDensity} onChange={e => ui.set({ logDensity: e.target.value as any })}><option value="low">low</option><option value="normal">normal</option><option value="high">high</option></select></label>
                <p className="text-sm text-gray-400">Simulation runs locally in your browser. No backend, no account, no external AI. Optional browser-local LLM is not enabled — the rules-based engine is the default and only decision loop in this build.</p>
                <button className="px-3 py-1 bg-gray-800 rounded" onClick={resetCamera}>Reset Camera</button>
              </div>}
            </div>
          )}
          {!ui.consoleCollapsed && (
            <div className="h-44 border-t border-gray-800 flex flex-col shrink-0">
              <div className="flex gap-2 px-3 py-1 items-center border-b border-gray-800">
                <span className="font-semibold text-sm">Event Console</span>
                <input className="bg-gray-900 border border-gray-700 rounded px-2 py-0.5 text-sm flex-1" placeholder="Search events…" value={ui.consoleSearch} onChange={e => ui.set({ consoleSearch: e.target.value })} />
                <select className="bg-gray-900 border border-gray-700 rounded text-sm" value={ui.consoleCategory} onChange={e => ui.set({ consoleCategory: e.target.value })}><option>All</option><option>MOVEMENT</option><option>SOCIAL</option><option>GOAL</option><option>MEMORY</option><option>STATE</option><option>SYSTEM</option></select>
                <label className="text-xs flex gap-1"><input type="checkbox" checked={autoscroll} onChange={e => setAutoscroll(e.target.checked)} /> Autoscroll</label>
                <button className="text-xs px-2 py-1 bg-gray-800 rounded" onClick={() => { engine.events.length = 0; ui.sync() }}>Clear</button>
                <button className="text-xs px-2 py-1 bg-gray-800 rounded" onClick={() => ui.set({ consoleCollapsed: true })}>Collapse</button>
              </div>
              <div className="flex-1 overflow-auto px-3 py-1 font-mono text-xs" data-autoscroll={autoscroll}>
                {consoleEvents.map(e => <p key={e.id}>[{e.time}] [{e.category}] {e.agentName}: {e.message}</p>)}
              </div>
            </div>
          )}
          {ui.consoleCollapsed && <button className="px-3 py-1 border-t border-gray-800 text-xs text-left" onClick={() => ui.set({ consoleCollapsed: false })}>▶ Show Event Console</button>}
        </main>
        {!ui.rightCollapsed && sel && (
          <aside className="w-80 border-l border-gray-800 p-3 overflow-auto shrink-0">
            <div className="flex justify-between"><h2 className="font-semibold">Agent Inspector</h2><button className="text-xs underline" onClick={() => ui.set({ rightCollapsed: true })}>Collapse</button></div>
            <div className="flex items-center gap-2 mt-2"><AgentAvatar role={sel.role} index={agents.indexOf(sel)} size={32} /><div><p className="font-bold">{sel.name}</p><p className="text-sm text-gray-400">{sel.role} · {sel.state}</p></div></div>
            <p className="text-sm mt-3">Activity: {sel.activity}</p>
            <p className="text-sm">Position: ({Math.round(sel.pos.x)}, {Math.round(sel.pos.y)}) → Destination: {sel.dest ? `(${sel.dest.x}, ${sel.dest.y})` : '—'}</p>
            <p className="text-sm">Goal: {sel.goal} · Intention: {sel.intention}</p>
            <p className="text-sm mt-2">Thought: “{sel.thought}”</p>
            {(['energy', 'hunger', 'mood', 'sociability', 'confidence'] as const).map(k => <p key={k} className="text-sm capitalize">{k}: {Math.round(sel[k])}%</p>)}
            <div className="flex flex-wrap gap-2 mt-3">
              <button className="px-2 py-1 bg-gray-800 rounded text-sm" onClick={() => { ui.set({ view: 'City' }); focusAgent(sel.id) }}>Follow in City</button>
              <button className="px-2 py-1 bg-gray-800 rounded text-sm" onClick={() => ui.set({ view: 'Memories' })}>View Memories</button>
              <button className="px-2 py-1 bg-gray-800 rounded text-sm" onClick={() => { sel.paused = !sel.paused; ui.sync() }}>{sel.paused ? 'Resume Agent' : 'Pause Agent'}</button>
              <button className="px-2 py-1 bg-gray-800 rounded text-sm" onClick={() => { engine.resetAgent(sel.id); ui.sync() }}>Reset Agent</button>
            </div>
            <h3 className="font-semibold mt-4">Relationships</h3>
            {Object.entries(sel.relationships).length === 0 ? <p className="text-sm text-gray-400">No relationships yet — talk to someone in the park or cafe.</p> : Object.entries(sel.relationships).map(([id, v]) => <p key={id} className="text-sm">{engine.agents.find(a => a.id === id)?.name ?? id}: {v}/100</p>)}
            <h3 className="font-semibold mt-4">Recent Memories</h3>
            {engine.memories.filter(m => m.ownerId === sel.id).slice(0, 5).map(m => <p key={m.id} className="text-sm py-1 border-b border-gray-800">{m.summary}</p>)}
            <h3 className="font-semibold mt-4">Recent Actions</h3>
            {sel.recentActions.map((a, i) => <p key={i} className="text-sm">{a}</p>)}
            <label className="block mt-4 text-sm">Sociability: {sel.personality.sociability}<input type="range" min={0} max={100} value={sel.personality.sociability} onChange={e => { sel.personality.sociability = Number(e.target.value); ui.sync() }} className="w-full" /></label>
          </aside>
        )}
        {ui.rightCollapsed && sel && <button className="px-2 border-l border-gray-800 text-xs min-h-[44px]" aria-label="Show agent inspector panel" onClick={() => ui.set({ rightCollapsed: false })}>◀ Inspector</button>}
      </div>
      {showAdd && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" role="dialog" aria-modal="true" aria-label="Add agent">
          <div className="bg-gray-900 border border-gray-700 rounded p-4 w-96 max-w-[calc(100vw-2rem)] space-y-3">
            <h2 className="font-bold text-lg">Add Agent</h2>
            <label className="block text-sm">Name<input className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 mt-1" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoFocus /></label>
            <label className="block text-sm">Occupation<input className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 mt-1" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} /></label>
            <label className="block text-sm">Starting location<select className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 mt-1" value={form.locationId} onChange={e => setForm({ ...form, locationId: e.target.value })}>{LOCATIONS.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
            <label className="block text-sm">Energy: {form.energy}<input type="range" min={0} max={100} value={form.energy} onChange={e => setForm({ ...form, energy: Number(e.target.value) })} className="w-full" /></label>
            <label className="block text-sm">Mood: {form.mood}<input type="range" min={0} max={100} value={form.mood} onChange={e => setForm({ ...form, mood: Number(e.target.value) })} className="w-full" /></label>
            <label className="block text-sm">Sociability: {form.sociability}<input type="range" min={0} max={100} value={form.sociability} onChange={e => setForm({ ...form, sociability: Number(e.target.value) })} className="w-full" /></label>
            {formError && <p className="text-red-400 text-sm" role="alert">{formError}</p>}
            <div className="flex gap-2 justify-end"><button className="px-3 py-1 bg-gray-800 rounded" onClick={() => setShowAdd(false)}>Cancel</button><button className="px-3 py-1 bg-emerald-700 rounded" onClick={submitAdd}>Create Agent</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
