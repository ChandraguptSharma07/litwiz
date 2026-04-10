import type { ValidationPhase } from '../lib/types'

interface Props {
  phase: ValidationPhase
  nodeCount: number
  structuralFaultCount: number
  semanticFaultCount: number
}

export default function PhaseStrip({ phase, nodeCount, structuralFaultCount, semanticFaultCount }: Props) {
  const ingestDone = !['idle', 'ingesting'].includes(phase)
  const structuralDone = ['structural-done', 'semantic-running', 'semantic-done'].includes(phase)
  const semanticDone = phase === 'semantic-done'

  return (
    <div
      className="flex items-center gap-3 px-5 shrink-0"
      style={{
        height: 36,
        background: 'var(--bg-panel)',
        borderTop: '1px solid var(--border)',
        fontSize: 10,
        overflowX: 'auto',
      }}
    >
      {/* Phase 0 — Ingest */}
      <Pill
        icon="✦"
        label="INGEST"
        sub="Claude AI"
        detail={ingestDone ? `· ✓ ${nodeCount} nodes extracted` : phase === 'ingesting' ? '· Parsing...' : '· Waiting'}
        active={phase === 'ingesting'}
        done={ingestDone}
        doneColor="#60a5fa"
        activeColor="#3b82f6"
      />

      <Arrow lit={ingestDone} />

      {/* Phase 1 — Structural */}
      <Pill
        icon="⬡"
        label="STRUCTURAL"
        sub="Rust Engine"
        detail={structuralDone ? `· ✓ ${structuralFaultCount} ${structuralFaultCount === 1 ? 'error' : 'errors'}` : phase === 'structural-running' ? '· Running...' : '· Waiting...'}
        active={phase === 'structural-running'}
        done={structuralDone}
        doneColor="#4ade80"
        activeColor="#22c55e"
      />

      <Arrow lit={structuralDone} />

      {/* Phase 2 — Semantic */}
      <Pill
        icon="◈"
        label="SEMANTIC"
        sub="Hindsight"
        detail={semanticDone ? `· ✓ ${semanticFaultCount} ${semanticFaultCount === 1 ? 'warning' : 'warnings'}` : phase === 'semantic-running' ? '· Running...' : '· Waiting...'}
        active={phase === 'semantic-running'}
        done={semanticDone}
        doneColor="#c084fc"
        activeColor="#a855f7"
      />
    </div>
  )
}

function Pill({
  icon, label, sub, detail, active, done, doneColor, activeColor,
}: {
  icon: string
  label: string
  sub: string
  detail: string
  active: boolean
  done: boolean
  doneColor: string
  activeColor: string
}) {
  const color = done ? doneColor : active ? activeColor : '#52525b'
  const bg = done ? `${doneColor}14` : active ? `${activeColor}14` : 'transparent'
  const border = done ? `${doneColor}40` : active ? `${activeColor}40` : '#3f3f4650'

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 10px',
        borderRadius: 4,
        border: `1px solid ${border}`,
        background: bg,
        color,
        whiteSpace: 'nowrap',
        transition: 'all 0.4s ease',
        flexShrink: 0,
      }}
    >
      <span style={{ opacity: 0.7 }}>{icon}</span>
      <span style={{ fontWeight: 500 }}>{label}</span>
      <span style={{ opacity: 0.5 }}>· {sub}</span>
      <span style={{ opacity: 0.8 }}>{detail}</span>
    </div>
  )
}

function Arrow({ lit }: { lit: boolean }) {
  return (
    <span
      style={{
        fontSize: 12,
        opacity: lit ? 0.7 : 0.2,
        flexShrink: 0,
        transition: 'opacity 0.4s ease',
      }}
    >
      →
    </span>
  )
}
