import type { ValidationPhase } from '../lib/types'

interface Props {
  title: string
  nodeCount: number
  edgeCount: number
  phase: ValidationPhase
  viewMode: '2d' | '3d'
  onLoadFile: () => void
  onRunStructural: () => void
  onRunHindsight: () => void
  onToggleView: () => void
}

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
  const structuralDone = phase === 'structural-done' || phase === 'semantic-running' || phase === 'semantic-done'
  const structuralRunning = phase === 'structural-running'
  const hindsightEnabled = structuralDone
  const hindsightRunning = phase === 'semantic-running'

  return (
    <header
      className="flex items-center justify-between px-5 shrink-0"
      style={{
        height: 48,
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
          <span style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 17, fontWeight: 600 }}>
            NVE
          </span>
          <span style={{ fontSize: 10, opacity: 0.4, letterSpacing: '0.05em' }}>
            Narrative Validation Engine
          </span>
        </div>
      </div>

      {/* Center — narrative title + stats */}
      <div className="flex items-center gap-3">
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, opacity: 0.85 }}>
          {title || 'No narrative loaded'}
        </span>
        {nodeCount > 0 && (
          <span
            style={{
              fontSize: 10,
              padding: '2px 8px',
              borderRadius: 999,
              background: '#ffffff0a',
              border: '1px solid var(--border)',
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
            fontSize: 11,
            padding: '4px 10px',
            borderRadius: 4,
            border: '1px solid var(--border)',
            background: 'transparent',
            color: '#a1a1aa',
            cursor: 'pointer',
          }}
        >
          Load Narrative
        </button>

        <button
          onClick={onRunStructural}
          disabled={structuralRunning}
          style={{
            fontSize: 11,
            padding: '4px 10px',
            borderRadius: 4,
            border: 'none',
            background: structuralRunning ? '#1d4ed8' : '#2563eb',
            color: '#fff',
            cursor: structuralRunning ? 'default' : 'pointer',
            opacity: structuralRunning ? 0.7 : 1,
          }}
        >
          {structuralRunning ? '▶ Running...' : '▶ Run Structural'}
        </button>

        <button
          onClick={onRunHindsight}
          disabled={!hindsightEnabled || hindsightRunning}
          title={hindsightEnabled ? undefined : 'Run structural validation first'}
          style={{
            fontSize: 11,
            padding: '4px 10px',
            borderRadius: 4,
            border: 'none',
            background: hindsightEnabled ? '#7c3aed' : '#27272a',
            color: hindsightEnabled ? '#fff' : '#52525b',
            cursor: hindsightEnabled && !hindsightRunning ? 'pointer' : 'default',
            opacity: hindsightRunning ? 0.7 : 1,
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
                fontSize: 11,
                padding: '4px 9px',
                border: 'none',
                background: viewMode === mode ? '#3f3f46' : 'transparent',
                color: viewMode === mode ? '#e4e4e7' : '#71717a',
                cursor: 'pointer',
                textTransform: 'uppercase',
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
