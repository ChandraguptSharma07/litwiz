import { useEffect, useState } from 'react'
import type { FaultPayload, NormalizedGraph, TextDictionary, GraphNode, SidebarTab } from '../lib/types'

interface Props {
  tab: SidebarTab
  onTabChange: (tab: SidebarTab) => void
  faults: FaultPayload | null
  graph: NormalizedGraph
  textDict: TextDictionary | null
  selectedNodeId: string | null
  hindsightActive: boolean
  onJumpToNode: (nodeId: string) => void
}

// ─── Errors Tab ────────────────────────────────────────────────

function ErrorsTab({
  faults,
  hindsightActive,
  onJumpToNode,
}: {
  faults: FaultPayload | null
  hindsightActive: boolean
  onJumpToNode: (id: string) => void
}) {
  const [visibleStructural, setVisibleStructural] = useState(0)
  const [visibleSemantic, setVisibleSemantic] = useState(0)

  // Stagger structural errors in as they "arrive"
  useEffect(() => {
    if (!faults) return
    setVisibleStructural(0)
    let count = 0
    const id = setInterval(() => {
      count++
      setVisibleStructural(count)
      if (count >= faults.structural_faults.length) clearInterval(id)
    }, 60)
    return () => clearInterval(id)
  }, [faults])

  // Stagger semantic errors only when hindsight activates
  useEffect(() => {
    if (!faults || !hindsightActive) {
      setVisibleSemantic(0)
      return
    }
    let count = 0
    const id = setInterval(() => {
      count++
      setVisibleSemantic(count)
      if (count >= faults.semantic_faults.length) clearInterval(id)
    }, 60)
    return () => clearInterval(id)
  }, [faults, hindsightActive])

  if (!faults) {
    return (
      <div style={{ padding: 16, color: '#52525b', fontSize: 11 }}>
        Run structural validation to see results.
      </div>
    )
  }

  return (
    <div style={{ overflowY: 'auto', flex: 1 }}>
      {/* Structural section */}
      <Section
        label="STRUCTURAL ERRORS"
        accent="#3b82f6"
        icon="●"
        count={faults.structural_faults.length}
      >
        {faults.structural_faults.slice(0, visibleStructural).map((fault, i) => (
          <FaultRow
            key={fault.fault_id}
            index={i}
            type={fault.type}
            nodeId={fault.node_id}
            message={fault.message}
            accent={fault.severity === 'error' ? '#ef4444' : '#f59e0b'}
            icon="●"
            onJump={() => onJumpToNode(fault.node_id)}
          />
        ))}
      </Section>

      {/* Semantic section — gated on hindsight running */}
      {hindsightActive && (
        <Section
          label="SEMANTIC WARNINGS"
          accent="#a855f7"
          icon="◈"
          count={faults.semantic_faults.length}
        >
          {faults.semantic_faults.slice(0, visibleSemantic).map((fault, i) => (
            <FaultRow
              key={fault.fault_id}
              index={i}
              type={fault.type}
              nodeId={fault.node_id}
              message={fault.message}
              accent="#a855f7"
              icon="◈"
              confidence={fault.hindsight_confidence}
              onJump={() => onJumpToNode(fault.node_id)}
            />
          ))}
        </Section>
      )}

      {/* Valid endings */}
      {faults.valid_endings.length > 0 && (
        <Section label="VALID ENDINGS" accent="#22c55e" icon="✓" count={faults.valid_endings.length}>
          {faults.valid_endings.map((ending) => (
            <div
              key={ending.node_id}
              className="slide-in"
              onClick={() => onJumpToNode(ending.node_id)}
              style={{
                padding: '7px 12px',
                borderBottom: '1px solid var(--border)',
                cursor: 'pointer',
                display: 'flex',
                gap: 8,
                alignItems: 'flex-start',
              }}
            >
              <span style={{ color: '#22c55e', marginTop: 1 }}>✓</span>
              <div>
                <div style={{ fontSize: 10, color: '#a1a1aa', fontWeight: 500 }}>
                  {ending.node_id}
                </div>
                <div style={{ fontSize: 10, color: '#71717a', marginTop: 2, lineHeight: 1.4 }}>
                  "{ending.prose_preview.slice(0, 60)}..."
                </div>
              </div>
            </div>
          ))}
        </Section>
      )}
    </div>
  )
}

// ─── Node Detail Tab ───────────────────────────────────────────

function DetailTab({
  nodeId,
  graph,
  textDict,
  faults,
  hindsightActive,
}: {
  nodeId: string | null
  graph: NormalizedGraph
  textDict: TextDictionary | null
  faults: FaultPayload | null
  hindsightActive: boolean
}) {
  if (!nodeId) {
    return (
      <div style={{ padding: 16, color: '#52525b', fontSize: 11 }}>
        Click a node in the graph to inspect it.
      </div>
    )
  }

  const node: GraphNode | undefined = graph.nodes.find((n) => n.id === nodeId)
  const text = textDict?.nodes[nodeId]

  if (!node) return null

  const isReachable = faults
    ? !faults.structural_faults.some(
        (f) => f.type === 'UNREACHABLE' && f.affected_nodes.includes(nodeId),
      )
    : true

  const semanticFlags = faults && hindsightActive
    ? faults.semantic_faults.filter((f) => f.affected_nodes.includes(nodeId))
    : []

  const incomingNodes = graph.nodes.filter((n) =>
    n.choices.some((c) => c.target === nodeId),
  )

  const nodeLabel = node.is_ending
    ? '✓ ENDING'
    : faults?.structural_faults.find(
        (f) => f.type === 'DEAD_END' && f.node_id === nodeId,
      )
    ? '● DEAD END'
    : semanticFlags.length > 0
    ? '◈ SEMANTIC ERROR'
    : null

  return (
    <div style={{ overflowY: 'auto', flex: 1, fontSize: 11 }}>
      {/* Node header */}
      <div style={{ padding: '12px 12px 8px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 600, fontSize: 12, color: '#e4e4e7' }}>
            NODE  {nodeId}
          </span>
          {nodeLabel && (
            <span
              style={{
                fontSize: 9,
                padding: '2px 6px',
                borderRadius: 3,
                background:
                  nodeLabel.startsWith('✓')
                    ? '#16a34a30'
                    : nodeLabel.startsWith('◈')
                    ? '#7c3aed30'
                    : '#ef444430',
                color:
                  nodeLabel.startsWith('✓')
                    ? '#4ade80'
                    : nodeLabel.startsWith('◈')
                    ? '#c084fc'
                    : '#f87171',
              }}
            >
              {nodeLabel}
            </span>
          )}
        </div>
      </div>

      {/* Scene text */}
      {text && (
        <DetailSection label="SCENE TEXT">
          <p style={{ color: '#a1a1aa', lineHeight: 1.6, margin: 0 }}>
            "{text.prose}"
          </p>
        </DetailSection>
      )}

      {/* State changes */}
      {Object.keys(node.set_state).length > 0 && (
        <DetailSection label="STATE CHANGES">
          {Object.entries(node.set_state).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', gap: 6, marginBottom: 3 }}>
              <span style={{ color: '#71717a' }}>{k}</span>
              <span style={{ color: '#52525b' }}>→</span>
              <span style={{ color: '#a78bfa' }}>{String(v)}</span>
            </div>
          ))}
        </DetailSection>
      )}

      {/* Incoming */}
      <DetailSection label={`INCOMING PATHS     ${incomingNodes.length}`}>
        {incomingNodes.length === 0 ? (
          <span style={{ color: '#52525b' }}>None (this is the start)</span>
        ) : (
          incomingNodes.map((n) => {
            const choice = n.choices.find((c) => c.target === nodeId)
            return (
              <div key={n.id} style={{ marginBottom: 3 }}>
                <span style={{ color: '#60a5fa' }}>{n.id}</span>
                <span style={{ color: '#52525b' }}> → "{choice?.text}"</span>
              </div>
            )
          })
        )}
      </DetailSection>

      {/* Outgoing */}
      <DetailSection label={`OUTGOING CHOICES   ${node.choices.length}`}>
        {node.choices.length === 0 ? (
          <span style={{ color: '#52525b' }}>None</span>
        ) : (
          node.choices.map((c) => (
            <div key={c.id} style={{ marginBottom: 3 }}>
              <span style={{ color: '#52525b' }}>→</span>
              <span style={{ color: '#a1a1aa' }}> "{c.text}" </span>
              <span style={{ color: '#52525b' }}>→ </span>
              <span style={{ color: '#60a5fa' }}>{c.target}</span>
              {c.condition && (
                <span style={{ color: '#a78bfa', marginLeft: 4 }}>[if {c.condition}]</span>
              )}
            </div>
          ))
        )}
      </DetailSection>

      {/* Meta */}
      <DetailSection label="INFO">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Row label="REACHABLE?" value={isReachable ? '✓ Yes' : '✗ No'} ok={isReachable} />
          <Row label="VALID ENDING?" value={node.is_ending ? '✓ Yes' : '✗ No'} ok={node.is_ending} />
          {hindsightActive && (
            <Row
              label="HINDSIGHT FLAGS"
              value={semanticFlags.length > 0 ? `${semanticFlags.length} warning` : 'none'}
              ok={semanticFlags.length === 0}
            />
          )}
        </div>
      </DetailSection>
    </div>
  )
}

// ─── Small shared pieces ───────────────────────────────────────

function Section({
  label,
  accent,
  icon,
  count,
  children,
}: {
  label: string
  accent: string
  icon: string
  count: number
  children: React.ReactNode
}) {
  return (
    <div>
      <div
        style={{
          padding: '8px 12px',
          fontSize: 9,
          letterSpacing: '0.08em',
          color: accent,
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>▼  {label}</span>
        <span>
          {count} {icon}
        </span>
      </div>
      {children}
    </div>
  )
}

function FaultRow({
  index,
  type,
  nodeId,
  message,
  accent,
  icon,
  confidence,
  onJump,
}: {
  index: number
  type: string
  nodeId: string
  message: string
  accent: string
  icon: string
  confidence?: number
  onJump: () => void
}) {
  return (
    <div
      className="slide-in"
      style={{
        padding: '8px 12px',
        borderBottom: '1px solid var(--border)',
        animationDelay: `${index * 60}ms`,
        display: 'flex',
        gap: 8,
        alignItems: 'flex-start',
      }}
    >
      <span style={{ color: accent, marginTop: 1 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 9, fontWeight: 600, color: accent }}>
            {type}
          </span>
          <span style={{ fontSize: 9, color: '#52525b' }}>{nodeId}</span>
        </div>
        <div style={{ fontSize: 10, color: '#71717a', marginTop: 3, lineHeight: 1.5 }}>
          "{message.slice(0, 90)}{message.length > 90 ? '...' : ''}"
        </div>
        {confidence !== undefined && (
          <div style={{ fontSize: 9, color: '#7c3aed', marginTop: 3 }}>
            confidence {Math.round(confidence * 100)}%
          </div>
        )}
      </div>
      <button
        onClick={onJump}
        style={{
          fontSize: 9,
          padding: '2px 6px',
          borderRadius: 3,
          border: '1px solid var(--border)',
          background: 'transparent',
          color: '#71717a',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          marginTop: 1,
        }}
      >
        Jump →
      </button>
    </div>
  )
}

function DetailSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontSize: 9, letterSpacing: '0.08em', color: '#52525b', marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </div>
  )
}

function Row({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ color: '#52525b' }}>{label}</span>
      <span style={{ color: ok ? '#4ade80' : '#f87171' }}>{value}</span>
    </div>
  )
}

// ─── Sidebar shell ─────────────────────────────────────────────

export default function Sidebar({
  tab,
  onTabChange,
  faults,
  graph,
  textDict,
  selectedNodeId,
  hindsightActive,
  onJumpToNode,
}: Props) {
  return (
    <div
      style={{
        width: '30%',
        minWidth: 260,
        maxWidth: 380,
        display: 'flex',
        flexDirection: 'column',
        borderLeft: '1px solid var(--border)',
        background: 'var(--bg-panel)',
        overflow: 'hidden',
      }}
    >
      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          flexShrink: 0,
          borderBottom: '1px solid var(--border)',
        }}
      >
        {(['errors', 'detail'] as SidebarTab[]).map((t) => (
          <button
            key={t}
            onClick={() => onTabChange(t)}
            style={{
              flex: 1,
              padding: '8px 0',
              fontSize: 10,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              border: 'none',
              borderBottom: tab === t ? '2px solid #3b82f6' : '2px solid transparent',
              background: 'transparent',
              color: tab === t ? '#e4e4e7' : '#52525b',
              cursor: 'pointer',
            }}
          >
            {t === 'errors' ? 'Errors' : 'Detail'}
          </button>
        ))}
      </div>

      {tab === 'errors' ? (
        <ErrorsTab faults={faults} hindsightActive={hindsightActive} onJumpToNode={onJumpToNode} />
      ) : (
        <DetailTab
          nodeId={selectedNodeId}
          graph={graph}
          textDict={textDict}
          faults={faults}
          hindsightActive={hindsightActive}
        />
      )}
    </div>
  )
}
