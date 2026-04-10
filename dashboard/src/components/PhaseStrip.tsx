import type { ValidationPhase } from '../lib/types'

interface Props {
  phase: ValidationPhase
  structuralFaultCount: number
  semanticFaultCount: number
}

export default function PhaseStrip({ phase, structuralFaultCount, semanticFaultCount }: Props) {
  const structuralDone = ['structural-done', 'semantic-running', 'semantic-done'].includes(phase)
  const semanticActive = ['semantic-running', 'semantic-done'].includes(phase)
  const semanticDone = phase === 'semantic-done'

  return (
    <div
      className="flex items-center gap-4 px-5 shrink-0"
      style={{
        height: 36,
        background: 'var(--bg-panel)',
        borderTop: '1px solid var(--border)',
        fontSize: 10,
      }}
    >
      {/* Phase 1 pill */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '3px 10px',
          borderRadius: 4,
          border: `1px solid ${structuralDone ? '#16a34a50' : '#3b82f650'}`,
          background: structuralDone ? '#16a34a14' : '#3b82f614',
          color: structuralDone ? '#4ade80' : '#60a5fa',
          transition: 'all 0.4s ease',
        }}
      >
        <span style={{ opacity: 0.6 }}>⬡</span>
        <span>PHASE 1: STRUCTURAL · Rust Engine</span>
        {structuralDone && (
          <span style={{ marginLeft: 4 }}>
            · ✓ {structuralFaultCount} {structuralFaultCount === 1 ? 'error' : 'errors'} found
          </span>
        )}
        {phase === 'structural-running' && (
          <span style={{ marginLeft: 4, opacity: 0.6 }}>· Running...</span>
        )}
        {phase === 'idle' && (
          <span style={{ marginLeft: 4, opacity: 0.4 }}>· Waiting</span>
        )}
      </div>

      {/* Arrow — slides right when transitioning */}
      <span
        style={{
          fontSize: 12,
          opacity: structuralDone ? 1 : 0.3,
          transform: semanticActive ? 'translateX(4px)' : 'none',
          transition: 'transform 0.6s ease, opacity 0.4s ease',
        }}
      >
        →
      </span>

      {/* Phase 2 pill */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '3px 10px',
          borderRadius: 4,
          border: `1px solid ${semanticActive ? '#7c3aed50' : '#3f3f4650'}`,
          background: semanticActive ? '#7c3aed14' : 'transparent',
          color: semanticActive ? '#c084fc' : '#52525b',
          transition: 'all 0.4s ease',
        }}
      >
        <span style={{ opacity: 0.6 }}>◈</span>
        <span>PHASE 2: SEMANTIC · Hindsight</span>
        {semanticDone && (
          <span style={{ marginLeft: 4 }}>
            · ✓ {semanticFaultCount} {semanticFaultCount === 1 ? 'warning' : 'warnings'} found
          </span>
        )}
        {phase === 'semantic-running' && (
          <span style={{ marginLeft: 4, opacity: 0.6 }}>· Running...</span>
        )}
        {!semanticActive && (
          <span style={{ marginLeft: 4, opacity: 0.4 }}>· Waiting...</span>
        )}
      </div>
    </div>
  )
}
