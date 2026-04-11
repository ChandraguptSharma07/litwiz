// ──────────────────────────────────────────────────────────────
//  Header.tsx — Top navigation bar
//
//  Displays the NVE logo, narrative title/stats, and action
//  buttons for load, structural validation, semantic validation,
//  and 2D/3D view toggling. Button states are driven by the
//  current `ValidationPhase`.
// ──────────────────────────────────────────────────────────────

import type { ValidationPhase } from '../lib/types'

/** Props for the Header component. */
interface Props {
  /** Title of the currently loaded narrative (or empty). */
  title: string
  /** Total number of nodes in the loaded graph. */
  nodeCount: number
  /** Total number of edges (choices) in the loaded graph. */
  edgeCount: number
  /** Current phase of the validation pipeline. */
  phase: ValidationPhase
  /** Active graph rendering mode — `"2d"` (D3) or `"3d"` (Three.js). */
  viewMode: '2d' | '3d'
  /** Callback to open the literature input modal. */
  onLoadFile: () => void
  /** Callback to start structural validation. */
  onRunStructural: () => void
  /** Callback to start semantic (Hindsight) validation. */
  onRunHindsight: () => void
  /** Callback to toggle between 2D and 3D view modes. */
  onToggleView: () => void
}

/**
 * Top navigation bar with logo, narrative info, and action controls.
 *
 * Button enable/disable logic:
 * - "Load Literature" is always enabled
 * - "Run Structural" requires a loaded narrative (phase ≥ ingest-done)
 * - "Run Hindsight" requires structural validation to be complete
 * - View toggle is always available
 */
export default function Header({
  title,
  nodeCount,
  edgeCount,
  phase,
  viewMode,
  onLoadFile,
  onRunStructural,
  onRunHindsight,
  onToggleView,
}: Props) {
  const structuralDone = ['structural-done', 'semantic-running', 'semantic-done'].includes(phase)
  const structuralRunning = phase === 'structural-running'
  const structuralEnabled = ['ingest-done', 'structural-done', 'semantic-running', 'semantic-done'].includes(phase)
  const hindsightEnabled = structuralDone
  const hindsightRunning = phase === 'semantic-running'

  return (
    <header
      className="flex items-center justify-between px-5 shrink-0"
      style={{
        height: 52,
        background: 'var(--bg-panel)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {/* Left — logo + wordmark */}
      <div className="flex items-center gap-3">
        {/* SVG logo: three-node directed graph */}
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <circle cx="4" cy="11" r="3" fill="var(--node-default)" />
          <circle cx="18" cy="5" r="3" fill="var(--node-valid)" />
          <circle cx="18" cy="17" r="3" fill="var(--node-semantic)" />
          <line x1="7" y1="10" x2="15" y2="6" stroke="#ffffff40" strokeWidth="1.2" />
          <line x1="7" y1="12" x2="15" y2="16" stroke="#ffffff40" strokeWidth="1.2" />
          <polygon points="15,6 13,4 13,8" fill="#ffffff40" />
          <polygon points="15,16 13,14 13,18" fill="#ffffff40" />
        </svg>

        <div className="flex items-baseline gap-2">
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 700 }}>
            NVE
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', letterSpacing: '0.04em', fontFamily: 'var(--font-body)' }}>
            Narrative Validation Engine
          </span>
        </div>
      </div>

      {/* Center — narrative title + stats */}
      <div className="flex items-center gap-3">
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--text-primary)' }}>
          {title || 'No narrative loaded'}
        </span>
        {nodeCount > 0 && (
          <span
            style={{
              fontSize: 12,
              padding: '3px 10px',
              borderRadius: 999,
              background: '#ffffff0a',
              border: '1px solid var(--border)',
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-secondary)',
            }}
          >
            {nodeCount} nodes · {edgeCount} edges
          </span>
        )}
      </div>

      {/* Right — action buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={onLoadFile}
          style={{
            fontSize: 13,
            padding: '5px 12px',
            borderRadius: 5,
            border: '1px solid #5b9cf540',
            background: '#5b9cf510',
            color: '#93c5fd',
            cursor: 'pointer',
            fontFamily: 'var(--font-body)',
            fontWeight: 500,
          }}
        >
          ✦ Load Literature
        </button>

        <button
          onClick={onRunStructural}
          disabled={!structuralEnabled || structuralRunning}
          title={structuralEnabled ? undefined : 'Load a narrative first'}
          style={{
            fontSize: 13,
            padding: '5px 12px',
            borderRadius: 5,
            border: 'none',
            background: !structuralEnabled ? '#27272a' : structuralRunning ? '#1d4ed8' : '#2563eb',
            color: !structuralEnabled ? '#52525b' : '#fff',
            cursor: !structuralEnabled || structuralRunning ? 'default' : 'pointer',
            opacity: structuralRunning ? 0.7 : 1,
            fontFamily: 'var(--font-body)',
            fontWeight: 600,
          }}
        >
          {structuralRunning ? '▶ Running...' : '▶ Run Structural'}
        </button>

        <button
          onClick={onRunHindsight}
          disabled={!hindsightEnabled || hindsightRunning}
          title={hindsightEnabled ? undefined : 'Run structural validation first'}
          style={{
            fontSize: 13,
            padding: '5px 12px',
            borderRadius: 5,
            border: 'none',
            background: hindsightEnabled ? '#7c3aed' : '#27272a',
            color: hindsightEnabled ? '#fff' : '#52525b',
            cursor: hindsightEnabled && !hindsightRunning ? 'pointer' : 'default',
            opacity: hindsightRunning ? 0.7 : 1,
            fontFamily: 'var(--font-body)',
            fontWeight: 600,
          }}
        >
          {hindsightRunning ? '◈ Running...' : '◈ Run Hindsight'}
        </button>

        {/* 2D / 3D pill toggle */}
        <div
          style={{
            display: 'flex',
            border: '1px solid var(--border)',
            borderRadius: 4,
            overflow: 'hidden',
          }}
        >
          {(['2d', '3d'] as const).map((mode) => (
            <button
              key={mode}
              onClick={onToggleView}
              style={{
                fontSize: 12,
                padding: '5px 10px',
                border: 'none',
                background: viewMode === mode ? '#3f3f46' : 'transparent',
                color: viewMode === mode ? '#e4e4e7' : '#71717a',
                cursor: 'pointer',
                textTransform: 'uppercase',
                fontFamily: 'var(--font-mono)',
                fontWeight: 500,
              }}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>
    </header>
  )
}
