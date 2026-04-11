// ──────────────────────────────────────────────────────────────
//  App.tsx — Root orchestrator component
//
//  Manages all top-level application state and coordinates the
//  three-phase validation pipeline:
//
//    1. Ingestion  — Send raw literature to /api/ingest (Groq LLM)
//    2. Structural — Run 5 graph algorithms via /api/validate/structural
//    3. Semantic   — Run Hindsight analysis via /api/validate/semantic
//
//  State ownership:
//    - Narrative data (graph, textDict, faults, validPaths)
//    - UI state       (phase, viewMode, sidebarTab, selectedNode)
//    - Animation      (sweeping, activePath, playthroughRunning)
//    - Errors         (ingestError, error)
//
//  Components:
//    Header         — Top bar with action buttons
//    LiteratureInput — Modal for loading narrative text
//    GraphCanvas2D  — D3-based 2D graph view (default)
//    GraphCanvas3D  — Three.js-based 3D graph view
//    PhaseStrip     — Pipeline progress indicator
//    Sidebar        — Fault list + node detail inspector
// ──────────────────────────────────────────────────────────────

import { useState, useCallback } from 'react'

import Header from './components/Header'
import PhaseStrip from './components/PhaseStrip'
import Sidebar from './components/Sidebar'
import GraphCanvas2D from './components/GraphCanvas2D'
import GraphCanvas3D from './components/GraphCanvas3D'
import LiteratureInput from './components/LiteratureInput'

import { ingest, validateStructural, validateSemantic } from './lib/api'

import type {
  NormalizedGraph,
  TextDictionary,
  FaultPayload,
  ValidPathsFile,
  ValidPath,
  ValidationPhase,
  SidebarTab,
} from './lib/types'

import mockGraphJson from './data/mock_normalized_graph.json'
import mockTextJson from './data/mock_text_dictionary.json'
import mockPathsJson from './data/mock_valid_paths.json'
import mockFaultsJson from './data/mock_fault_payload.json'

const mockGraph: NormalizedGraph = mockGraphJson as unknown as NormalizedGraph
const mockText: TextDictionary = mockTextJson as unknown as TextDictionary
const mockPaths: ValidPathsFile = mockPathsJson as unknown as ValidPathsFile
const mockFaults: FaultPayload = mockFaultsJson as unknown as FaultPayload

/**
 * Root application component — orchestrates the NVE validation pipeline.
 *
 * Manages all top-level state and coordinates API calls through the
 * three-phase pipeline. Each phase transitions the `ValidationPhase`
 * state machine which drives the UI (button states, phase strip, etc.).
 *
 * Also provides a "demo mode" that loads mock data from `/data/` for
 * development and demonstration without needing a running server.
 */
export default function App() {
  // ── Narrative data ────────────────────────────────────────────
  const [graph, setGraph] = useState<NormalizedGraph | null>(null)
  const [textDict, setTextDict] = useState<TextDictionary | null>(null)
  const [faultPayload, setFaultPayload] = useState<FaultPayload | null>(null)
  const [validPaths, setValidPaths] = useState<ValidPathsFile | null>(null)

  // ── UI state ──────────────────────────────────────────────────
  const [phase, setPhase] = useState<ValidationPhase>('idle')
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d')
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('errors')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [showInput, setShowInput] = useState(true)

  // ── Animation flags ───────────────────────────────────────────
  const [sweeping, setSweeping] = useState(false)
  const [sweepLeft, setSweepLeft] = useState(0)
  const [hindsightActive, setHindsightActive] = useState(false)
  const [activePath, setActivePath] = useState<ValidPath | null>(null)
  const [playthroughRunning, setPlaythroughRunning] = useState(false)

  // ── Error state ───────────────────────────────────────────────
  const [ingestError, setIngestError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // ── Derived ───────────────────────────────────────────────────
  const edgeCount = graph?.nodes.reduce((sum, n) => sum + n.choices.length, 0) ?? 0
  const structuralFaultCount = faultPayload?.structural_faults.length ?? 0
  const semanticFaultCount = faultPayload?.semantic_faults.length ?? 0

  // ── Load demo narrative ───────────────────────────────────────
  const loadDemo = useCallback(() => {
    setGraph(mockGraph)
    setTextDict(mockText)
    setFaultPayload(mockFaults)
    setValidPaths(mockPaths)
    setPhase('structural-done')
    setHindsightActive(false)
    setSelectedNodeId(null)
    setShowInput(false)
    setIngestError(null)
    setError(null)
  }, [])

  // ── Ingest raw literature ─────────────────────────────────────
  const handleIngest = useCallback(async (text: string, title: string) => {
    setIngestError(null)
    setPhase('ingesting')
    try {
      const result = await ingest(text, title || undefined)
      setGraph(result.normalized_graph)
      setTextDict(result.text_dictionary)
      setFaultPayload(null)
      setValidPaths(null)
      setHindsightActive(false)
      setSelectedNodeId(null)
      setPhase('ingest-done')
      setShowInput(false)
    } catch (err) {
      setPhase('idle')
      setIngestError((err as Error).message)
    }
  }, [])

  // ── Structural validation ─────────────────────────────────────
  const handleRunStructural = useCallback(async () => {
    if (!graph || phase === 'structural-running') return
    setError(null)
    setPhase('structural-running')

    // Sweep line animation — purely visual, runs in parallel with the fetch
    setSweeping(true)
    setSweepLeft(0)
    const startTime = performance.now()
    const animate = (now: number) => {
      const t = Math.min((now - startTime) / 1800, 1)
      setSweepLeft(t * 100)
      if (t < 1) requestAnimationFrame(animate)
    }
    requestAnimationFrame(animate)

    try {
      const result = await validateStructural(graph)

      setSweeping(false)

      // Merge into the fault payload shape the dashboard expects
      setFaultPayload({
        narrative_title: result.narrative_title,
        validated_at: result.validated_at,
        structural_faults: result.structural_faults,
        semantic_faults: [],
        valid_endings: result.valid_endings,
      })
      setValidPaths(result.valid_paths)
      setPhase('structural-done')
    } catch (err) {
      setSweeping(false)
      setPhase('ingest-done')
      setError(`Structural validation failed: ${(err as Error).message}`)
    }
  }, [graph, phase])

  // ── Semantic validation ───────────────────────────────────────
  const handleRunHindsight = useCallback(async () => {
    if (!textDict || !validPaths || phase !== 'structural-done') return
    setError(null)
    setPhase('semantic-running')

    try {
      const result = await validateSemantic(textDict, validPaths)

      setFaultPayload((prev): FaultPayload => {
        if (prev) {
          return { ...prev, semantic_faults: result.semantic_faults } as FaultPayload
        }
        return {
          narrative_title: result.narrative_title,
          validated_at: result.validated_at,
          structural_faults: [],
          semantic_faults: result.semantic_faults,
          valid_endings: [],
        } as FaultPayload
      })
      setHindsightActive(true)
      setPhase('semantic-done')
    } catch (err) {
      setPhase('structural-done')
      setError(`Semantic validation failed: ${(err as Error).message}`)
    }
  }, [textDict, validPaths, phase])

  // ── Simulate playthrough ──────────────────────────────────────
  const handleSimulatePlaythrough = useCallback(() => {
    if (!validPaths || playthroughRunning || validPaths.valid_paths.length === 0) return

    const path = validPaths.valid_paths[0]
    setActivePath(path)
    setPlaythroughRunning(true)

    path.node_sequence.forEach((nodeId, i) => {
      setTimeout(() => {
        setSelectedNodeId(nodeId)
        if (i === path.node_sequence.length - 1) {
          setTimeout(() => {
            setPlaythroughRunning(false)
            setActivePath(null)
          }, 800)
        }
      }, i * 600)
    })
  }, [validPaths, playthroughRunning])

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

  const displayGraph: NormalizedGraph = graph ?? mockGraph

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Literature input modal */}
      {showInput && (
        <LiteratureInput
          onIngest={handleIngest}
          onLoadDemo={loadDemo}
          isLoading={phase === 'ingesting'}
          error={ingestError}
        />
      )}

      <Header
        title={graph?.title ?? ''}
        nodeCount={graph?.nodes.length ?? 0}
        edgeCount={edgeCount}
        phase={phase}
        viewMode={viewMode}
        onLoadFile={() => { setShowInput(true); setIngestError(null) }}
        onRunStructural={handleRunStructural}
        onRunHindsight={handleRunHindsight}
        onToggleView={() => setViewMode((v) => (v === '2d' ? '3d' : '2d'))}
      />

      {/* Main body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Graph canvas */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {/* Error banner */}
          {error && (
            <div
              style={{
                position: 'absolute',
                top: 12,
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 30,
                padding: '8px 16px',
                background: '#ef444420',
                border: '1px solid #ef444450',
                borderRadius: 4,
                color: '#f87171',
                fontSize: 11,
                maxWidth: 500,
                textAlign: 'center',
              }}
            >
              {error}
              <button
                onClick={() => setError(null)}
                style={{ marginLeft: 10, background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 12 }}
              >
                ✕
              </button>
            </div>
          )}

          {/* Validation sweep line */}
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

          {/* Hindsight ink spread overlay */}
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

          {/* Simulate Playthrough button */}
          {validPaths && (
            <button
              onClick={handleSimulatePlaythrough}
              disabled={playthroughRunning}
              style={{
                position: 'absolute',
                bottom: 12,
                left: 195,
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
          )}

          {/* Empty state — shown before any narrative is loaded */}
          {!graph && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 16,
                color: '#3f3f46',
                pointerEvents: 'none',
              }}
            >
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none" opacity={0.3}>
                <circle cx="8" cy="24" r="6" fill="#3b82f6" />
                <circle cx="40" cy="10" r="6" fill="#22c55e" />
                <circle cx="40" cy="38" r="6" fill="#a855f7" />
                <line x1="14" y1="22" x2="34" y2="12" stroke="white" strokeWidth="1.5" opacity="0.4" />
                <line x1="14" y1="26" x2="34" y2="36" stroke="white" strokeWidth="1.5" opacity="0.4" />
              </svg>
              <span style={{ fontSize: 13, fontFamily: 'var(--font-display)', fontStyle: 'italic' }}>
                Load any piece of literature to begin
              </span>
            </div>
          )}

          {viewMode === '2d' ? (
            <GraphCanvas2D
              graph={displayGraph}
              faults={faultPayload}
              activePath={activePath}
              sweeping={sweeping}
              hindsightActive={hindsightActive}
              selectedNodeId={selectedNodeId}
              textDict={textDict}
              onNodeClick={handleNodeClick}
            />
          ) : (
            <GraphCanvas3D
              graph={displayGraph}
              faults={faultPayload}
              hindsightActive={hindsightActive}
              selectedNodeId={selectedNodeId}
              onNodeClick={handleNodeClick}
            />
          )}
        </div>

        {/* Sidebar */}
        <Sidebar
          tab={sidebarTab}
          onTabChange={setSidebarTab}
          faults={faultPayload}
          graph={displayGraph}
          textDict={textDict}
          selectedNodeId={selectedNodeId}
          hindsightActive={hindsightActive}
          onJumpToNode={handleJumpToNode}
        />
      </div>

      <PhaseStrip
        phase={phase}
        nodeCount={graph?.nodes.length ?? 0}
        structuralFaultCount={structuralFaultCount}
        semanticFaultCount={semanticFaultCount}
      />
    </div>
  )
}
