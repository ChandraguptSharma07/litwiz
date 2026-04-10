import { useState, useRef, useCallback } from 'react'

import Header from './components/Header'
import PhaseStrip from './components/PhaseStrip'
import Sidebar from './components/Sidebar'
import GraphCanvas2D from './components/GraphCanvas2D'
import GraphCanvas3D from './components/GraphCanvas3D'

import type {
  NormalizedGraph,
  TextDictionary,
  FaultPayload,
  ValidPathsFile,
  ValidPath,
  ValidationPhase,
  SidebarTab,
} from './lib/types'

import mockGraph from './data/mock_normalized_graph.json'
import mockText from './data/mock_text_dictionary.json'
import mockFaults from './data/mock_fault_payload.json'
import mockPaths from './data/mock_valid_paths.json'

export default function App() {
  // ── Narrative data ────────────────────────────────────────────
  const [graph, setGraph] = useState<NormalizedGraph>(mockGraph as NormalizedGraph)
  const [textDict, setTextDict] = useState<TextDictionary>(mockText as TextDictionary)
  const [faultPayload, setFaultPayload] = useState<FaultPayload | null>(null)
  const [validPaths, setValidPaths] = useState<ValidPathsFile>(mockPaths as ValidPathsFile)

  // ── UI state ──────────────────────────────────────────────────
  const [phase, setPhase] = useState<ValidationPhase>('idle')
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d')
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('errors')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  // ── Animation flags ───────────────────────────────────────────
  const [sweeping, setSweeping] = useState(false)
  const [hindsightActive, setHindsightActive] = useState(false)
  const [activePath, setActivePath] = useState<ValidPath | null>(null)
  const [playthroughRunning, setPlaythroughRunning] = useState(false)

  // Sweep line position (0–100% across graph canvas)
  const [sweepLeft, setSweepLeft] = useState(0)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Edge count helper ─────────────────────────────────────────
  const edgeCount = graph.nodes.reduce((sum, n) => sum + n.choices.length, 0)

  // ── File loading ──────────────────────────────────────────────
  const handleLoadFile = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return

      const reader = new FileReader()
      reader.onload = (evt) => {
        try {
          const parsed = JSON.parse(evt.target?.result as string)
          // Detect which contract file it is by shape
          if ('start_node' in parsed) {
            setGraph(parsed as NormalizedGraph)
          } else if ('structural_faults' in parsed) {
            setFaultPayload(parsed as FaultPayload)
          } else if ('valid_paths' in parsed) {
            setValidPaths(parsed as ValidPathsFile)
          } else if ('world_rules' in parsed) {
            setTextDict(parsed as TextDictionary)
          }
        } catch {
          alert('Could not parse file. Make sure it is valid JSON.')
        }
      }
      reader.readAsText(file)
      // Reset so the same file can be reloaded
      e.target.value = ''
    },
    [],
  )

  // ── Structural validation sweep ───────────────────────────────
  const handleRunStructural = useCallback(() => {
    if (phase !== 'idle') return

    setPhase('structural-running')
    setSweeping(true)
    setSweepLeft(0)

    // Animate sweep line left → right over 1.8s
    const startTime = performance.now()
    const duration = 1800
    const tick = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1)
      setSweepLeft(t * 100)
      if (t < 1) {
        requestAnimationFrame(tick)
      } else {
        // Sweep done — load fault data and settle
        setTimeout(() => {
          setSweeping(false)
          setFaultPayload(mockFaults as unknown as FaultPayload)
          setPhase('structural-done')
        }, 150)
      }
    }
    requestAnimationFrame(tick)
  }, [phase])

  // ── Hindsight ink spread ──────────────────────────────────────
  const handleRunHindsight = useCallback(() => {
    if (phase !== 'structural-done') return

    setPhase('semantic-running')

    // 2s ink spread, then done
    setTimeout(() => {
      setHindsightActive(true)
      setPhase('semantic-done')
    }, 2000)
  }, [phase])

  // ── Simulate playthrough ──────────────────────────────────────
  const handleSimulatePlaythrough = useCallback(() => {
    if (playthroughRunning || validPaths.valid_paths.length === 0) return

    // Use the first valid path for the demo
    const path = validPaths.valid_paths[0]
    setActivePath(path)
    setPlaythroughRunning(true)

    // Step through each node with a delay, like a traveling dot
    path.node_sequence.forEach((nodeId, i) => {
      setTimeout(() => {
        setSelectedNodeId(nodeId)
        if (i === path.node_sequence.length - 1) {
          // Finished
          setTimeout(() => {
            setPlaythroughRunning(false)
            setActivePath(null)
          }, 800)
        }
      }, i * 600)
    })
  }, [playthroughRunning, validPaths])

  // ── Node selection ────────────────────────────────────────────
  const handleNodeClick = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId)
    setSidebarTab('detail')
  }, [])

  const handleJumpToNode = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId)
    setSidebarTab('detail')
  }, [])

  // ── Render ────────────────────────────────────────────────────

  const structuralFaultCount = faultPayload?.structural_faults.length ?? 0
  const semanticFaultCount = faultPayload?.semantic_faults.length ?? 0

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      <Header
        title={graph.title}
        nodeCount={graph.nodes.length}
        edgeCount={edgeCount}
        phase={phase}
        viewMode={viewMode}
        onLoadFile={handleLoadFile}
        onRunStructural={handleRunStructural}
        onRunHindsight={handleRunHindsight}
        onToggleView={() => setViewMode((v) => (v === '2d' ? '3d' : '2d'))}
      />

      {/* Main body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Graph canvas — 70% */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {/* Validation sweep overlay */}
          {sweeping && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                width: 2,
                background: 'linear-gradient(to bottom, transparent, #3b82f6, #60a5fa, #3b82f6, transparent)',
                left: `${sweepLeft}%`,
                zIndex: 10,
                pointerEvents: 'none',
                boxShadow: '0 0 12px 4px #3b82f680',
              }}
            />
          )}

          {/* Hindsight ink overlay — fades in over semantic nodes */}
          {hindsightActive && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'radial-gradient(ellipse at center, #7c3aed08 0%, transparent 70%)',
                pointerEvents: 'none',
                zIndex: 5,
                animation: 'ink-spread 2s ease both',
              }}
            />
          )}

          {/* Simulate Playthrough button — bottom left of canvas */}
          <button
            onClick={handleSimulatePlaythrough}
            disabled={playthroughRunning || validPaths.valid_paths.length === 0}
            style={{
              position: 'absolute',
              bottom: 12,
              left: 12,
              zIndex: 20,
              fontSize: 10,
              padding: '4px 10px',
              borderRadius: 4,
              border: '1px solid var(--border)',
              background: playthroughRunning ? '#1c1c1e' : '#18181b',
              color: playthroughRunning ? '#52525b' : '#a1a1aa',
              cursor: playthroughRunning ? 'default' : 'pointer',
            }}
          >
            {playthroughRunning ? '⬤ Playing...' : '▷ Simulate Playthrough'}
          </button>

          {viewMode === '2d' ? (
            <GraphCanvas2D
              graph={graph}
              faults={faultPayload}
              activePath={activePath}
              sweeping={sweeping}
              hindsightActive={hindsightActive}
              selectedNodeId={selectedNodeId}
              onNodeClick={handleNodeClick}
            />
          ) : (
            <GraphCanvas3D
              graph={graph}
              faults={faultPayload}
              hindsightActive={hindsightActive}
              selectedNodeId={selectedNodeId}
              onNodeClick={handleNodeClick}
            />
          )}
        </div>

        {/* Sidebar — 30% */}
        <Sidebar
          tab={sidebarTab}
          onTabChange={setSidebarTab}
          faults={faultPayload}
          graph={graph}
          textDict={textDict}
          selectedNodeId={selectedNodeId}
          hindsightActive={hindsightActive}
          onJumpToNode={handleJumpToNode}
        />
      </div>

      <PhaseStrip
        phase={phase}
        structuralFaultCount={structuralFaultCount}
        semanticFaultCount={semanticFaultCount}
      />
    </div>
  )
}
