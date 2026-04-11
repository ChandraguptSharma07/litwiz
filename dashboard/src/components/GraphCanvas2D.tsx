// ──────────────────────────────────────────────────────────────
//  GraphCanvas2D.tsx — 2D narrative graph visualization
//
//  Renders the narrative graph as an interactive 2D force-directed
//  graph using D3.js. This is the default view mode and the more
//  performant option for large graphs.
//
//  Visual encoding:
//    - Node shape:  Circle (default), Diamond (start), Triangle (dead end),
//                   Cross (unreachable), Square (ending), Star (semantic)
//    - Node color:  Periwinkle (default), Sky blue (start), Gold (ending),
//                   Pink (dead end), Gray (unreachable), Violet (semantic)
//    - Node size:   Scales with connection count
//    - Edge style:  Solid (unconditional), Dashed (conditional)
//    - Active path edges glow white with increased opacity
//    - Selected node pulse animation via stroke
//    - Edge labels show choice text on hover
// ──────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import type { NormalizedGraph, FaultPayload, ValidPath, TextDictionary } from '../lib/types'

/** Props for the GraphCanvas2D component. */
interface Props {
  /** The loaded normalized narrative graph. */
  graph: NormalizedGraph
  /** Combined fault payload, or `null` if validation hasn't run. */
  faults: FaultPayload | null
  /** The currently highlighted valid path, or `null`. */
  activePath: ValidPath | null
  /** Whether the path sweep animation is currently playing. */
  sweeping: boolean
  /** Whether Hindsight semantic validation is active. */
  hindsightActive: boolean
  /** The ID of the currently selected node, or `null`. */
  selectedNodeId: string | null
  /** Text dictionary for prose-based node labels, or `null`. */
  textDict: TextDictionary | null
  /** Callback fired when a node is clicked. */
  onNodeClick: (nodeId: string) => void
}

// ── Color palette (accessibility-friendly: no red/green) ────────

/**
 * Color constants for node types. Avoids red/green color blindness
 * conflicts by using pink/gold instead.
 */
const COLORS = {
  start: '#4fc3f7', // electric sky blue
  normal: '#7c8cf8', // periwinkle / slate blue
  ending: '#ffd54f', // warm gold
  deadEnd: '#ff6b9d', // hot pink
  unreachable: '#8e8ea0', // muted gray-lavender
  semantic: '#c77dff', // vivid violet
  onPath: '#ffffff',
  selected: '#ffffff',
}

// ── Node label from prose ───────────────────────────────────────

/**
 * Generate a short label for a node from its prose text.
 * Shows the first sentence, truncated to 28 characters.
 * Falls back to the node ID if no prose is available.
 *
 * # Arguments
 * * `nodeId` — The node ID.
 * * `textDict` — Text dictionary for prose lookup.
 *
 * # Returns
 * A short label string (max 28 chars).
 */
function nodeLabel(nodeId: string, textDict: TextDictionary | null): string {
  if (!textDict?.nodes[nodeId]) return nodeId
  const prose = textDict.nodes[nodeId].prose
  const firstSentence = prose.split(/[.!?]/)[0]?.trim() ?? ''
  if (firstSentence.length <= 28) return firstSentence
  return firstSentence.slice(0, 26) + '…'
}

// ── Node classification ─────────────────────────────────────────

/**
 * Metadata about a node's visual classification.
 * Used by the rendering functions to determine shape, color, and size.
 */
interface NodeMeta {
  /** Whether this is the narrative's start node. */
  isStart: boolean
  /** Whether this node is a valid story ending. */
  isEnding: boolean
  /** Whether this node is a dead-end fault. */
  isDeadEnd: boolean
  /** Whether this node is unreachable from the start. */
  isUnreachable: boolean
  /** Whether this node has a semantic (Hindsight) fault. */
  isSemantic: boolean
  /** Whether this node is on the currently highlighted path. */
  isOnPath: boolean
  /** Whether this node is currently selected by the user. */
  isSelected: boolean
  /** Total incoming + outgoing edge count (drives node size). */
  connectionCount: number
}

/**
 * Classify a node into its visual categories based on graph data and faults.
 *
 * # Arguments
 * * `nodeId` — The node ID to classify.
 * * `graph` — The normalized graph.
 * * `faults` — The fault payload.
 * * `activePath` — The currently highlighted path.
 * * `hindsightActive` — Whether semantic faults are visible.
 * * `selectedNodeId` — The currently selected node ID.
 *
 * # Returns
 * A `NodeMeta` object describing the node's visual state.
 */
function classify(
  nodeId: string,
  graph: NormalizedGraph,
  faults: FaultPayload | null,
  activePath: ValidPath | null,
  hindsightActive: boolean,
  selectedNodeId: string | null,
): NodeMeta {
  const node = graph.nodes.find((n) => n.id === nodeId)
  const incomingCount = graph.nodes.reduce(
    (sum, n) => sum + n.choices.filter((c) => c.target === nodeId).length, 0,
  )
  return {
    isStart: nodeId === graph.start_node,
    isEnding: !!node?.is_ending,
    isDeadEnd: !!faults?.structural_faults.some((f) => f.type === 'DEAD_END' && f.node_id === nodeId),
    isUnreachable: !!faults?.structural_faults.some(
      (f) => f.type === 'UNREACHABLE' && f.affected_nodes.includes(nodeId),
    ),
    isSemantic:
      hindsightActive && !!faults?.semantic_faults.some((f) => f.affected_nodes.includes(nodeId)),
    isOnPath: !!activePath?.node_sequence.includes(nodeId),
    isSelected: nodeId === selectedNodeId,
    connectionCount: (node?.choices.length ?? 0) + incomingCount,
  }
}

/**
 * Determine the fill color for a node based on its classification.
 * Priority: Dead end > Unreachable > Semantic > Ending > Start > Default.
 */
function nodeColor(m: NodeMeta): string {
  if (m.isDeadEnd) return COLORS.deadEnd
  if (m.isUnreachable) return COLORS.unreachable
  if (m.isSemantic) return COLORS.semantic
  if (m.isEnding) return COLORS.ending
  if (m.isStart) return COLORS.start
  return COLORS.normal
}

/**
 * Calculate the area for a D3 symbol based on node connectivity.
 * More connections → larger node. Start and selected nodes get a bonus.
 */
function nodeSize(m: NodeMeta): number {
  const base = 180 + Math.min(m.connectionCount * 40, 200)
  if (m.isStart) return base + 80
  if (m.isSelected) return base + 100
  return base
}

/**
 * Select the D3 symbol type for a node based on its classification.
 *
 * Shape encoding:
 * - Diamond `◆` = start node
 * - Triangle `▲` = dead end
 * - Cross `✚` = unreachable
 * - Square `■` = ending
 * - Star `★` = semantic fault
 * - Circle `●` = default scene
 */
function nodeSymbol(m: NodeMeta): d3.SymbolType {
  if (m.isStart) return d3.symbolDiamond     // ◆ diamond = start
  if (m.isDeadEnd) return d3.symbolTriangle   // ▲ triangle = danger/dead-end
  if (m.isUnreachable) return d3.symbolCross  // ✚ cross = unreachable/broken
  if (m.isEnding) return d3.symbolSquare      // ■ square = destination/ending
  if (m.isSemantic) return d3.symbolStar      // ★ star = semantic anomaly
  return d3.symbolCircle                      // ● circle = normal scene
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySelection = d3.Selection<any, any, any, any>

// ── Simulation data types ───────────────────────────────────────

/** D3 simulation node with narrative metadata attached. */
interface SimNode extends d3.SimulationNodeDatum {
  /** The node ID from the normalized graph. */
  id: string
  /** Pre-computed visual classification for this node. */
  meta: NodeMeta
}

/** D3 simulation link with edge metadata attached. */
interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  /** Source node ID (before D3 resolves to object reference). */
  sourceId: string
  /** Target node ID (before D3 resolves to object reference). */
  targetId: string
  /** Choice text displayed as edge label on hover. */
  label: string
  /** Whether this edge has a condition gate. */
  conditional: boolean
}

// ── Component ───────────────────────────────────────────────────

/**
 * 2D narrative graph visualization using D3.js force-directed layout.
 *
 * Manages a D3 force simulation with SVG rendering. The simulation
 * is rebuilt when graph data or text dictionary changes. Visual
 * properties (colors, sizes, shapes) update reactively when faults
 * or the active path change.
 *
 * Supports:
 * - Pan and zoom via D3 zoom behavior
 * - Node dragging via D3 drag behavior
 * - Animated path highlighting with edge glow
 * - Node selection with pulse stroke animation
 * - Curved directed edges with arrowhead markers
 * - Prose-based node labels (first sentence, max 28 chars)
 */
export default function GraphCanvas2D({
  graph,
  faults,
  activePath,
  sweeping: _sweeping,
  hindsightActive,
  selectedNodeId,
  textDict,
  onNodeClick,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const simRef = useRef<d3.Simulation<SimNode, SimLink> | null>(null)
  const nodesRef = useRef<SimNode[]>([])
  const linksRef = useRef<SimLink[]>([])

  // ── Build simulation when graph or textDict changes ─────────

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    container.innerHTML = ''
    const width = container.clientWidth
    const height = container.clientHeight

    // Build data
    const nodes: SimNode[] = graph.nodes.map((n) => ({
      id: n.id,
      meta: classify(n.id, graph, faults, activePath, hindsightActive, selectedNodeId),
    }))

    const nodeIds = new Set(nodes.map((n) => n.id))
    const links: SimLink[] = graph.nodes.flatMap((n) =>
      n.choices
        .filter((c) => nodeIds.has(c.target))
        .map((c) => ({
          source: n.id,
          target: c.target,
          sourceId: n.id,
          targetId: c.target,
          label: c.text,
          conditional: !!c.condition,
        })),
    )

    nodesRef.current = nodes
    linksRef.current = links

    // SVG
    const svg = d3
      .select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .style('background', '#0d0d0d')

    svgRef.current = svg.node()

    // Defs — glow filter
    const defs = svg.append('defs')
    const filter = defs.append('filter').attr('id', 'glow').attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%')
    filter.append('feGaussianBlur').attr('stdDeviation', '8').attr('result', 'coloredBlur')
    const merge = filter.append('feMerge')
    merge.append('feMergeNode').attr('in', 'coloredBlur')
    merge.append('feMergeNode').attr('in', 'SourceGraphic')

    // Arrow marker
    defs
      .append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 22)
      .attr('refY', 0)
      .attr('markerWidth', 5)
      .attr('markerHeight', 5)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-4L10,0L0,4')
      .attr('fill', '#ffffff60')

    // Zoom/pan
    const g = svg.append('g')

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 5])
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
      })

    svg.call(zoom)
    svg.call(zoom.transform, d3.zoomIdentity.translate(width / 2, height / 2).scale(0.85))

    // Links
    const linkGroup = g
      .append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', (d) => (d.conditional ? '#c77dff80' : '#ffffff40'))
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', (d) => (d.conditional ? '6,3' : 'none'))
      .attr('marker-end', 'url(#arrowhead)')

    // Link labels (choice text) — hidden by default, shown on hover
    const linkLabelGroup = g
      .append('g')
      .attr('class', 'link-labels')
      .selectAll('text')
      .data(links)
      .join('text')
      .text((d) => d.label)
      .attr('font-size', 9)
      .attr('fill', '#a1a1aa')
      .attr('text-anchor', 'middle')
      .attr('dy', -6)
      .attr('opacity', 0)
      .style('pointer-events', 'none')
      .style('user-select', 'none')

    // Nodes — using <path> with d3.symbol for different shapes
    const nodeGroup = g
      .append('g')
      .attr('class', 'nodes')
      .selectAll<SVGPathElement, SimNode>('path')
      .data(nodes)
      .join('path')
      .attr('d', (d) => d3.symbol().type(nodeSymbol(d.meta)).size(nodeSize(d.meta))() ?? '')
      .attr('fill', (d) => nodeColor(d.meta))
      .attr('stroke', (d) =>
        d.meta.isSelected ? COLORS.selected : d.meta.isOnPath ? '#ffffffa0' : `${nodeColor(d.meta)}40`,
      )
      .attr('stroke-width', (d) => (d.meta.isSelected ? 4 : d.meta.isOnPath ? 3 : 2))
      .style('filter', 'url(#glow)')
      .style('cursor', 'pointer')
      .on('click', (_event, d) => onNodeClick(d.id))
      .on('mouseenter', (_event, d) => {
        updateHighlight(d.id, nodeGroup as AnySelection, linkGroup as AnySelection, labelGroup as AnySelection, linkLabelGroup as AnySelection, links)
      })
      .on('mouseleave', () => {
        clearHighlight(nodeGroup as AnySelection, linkGroup as AnySelection, labelGroup as AnySelection, linkLabelGroup as AnySelection)
      })
      .call(
        d3
          .drag<SVGPathElement, SimNode>()
          .on('start', (event, d) => {
            if (!event.active) sim.alphaTarget(0.3).restart()
            d.fx = d.x
            d.fy = d.y
          })
          .on('drag', (event, d) => {
            d.fx = event.x
            d.fy = event.y
          })
          .on('end', (event, d) => {
            if (!event.active) sim.alphaTarget(0)
            d.fx = null
            d.fy = null
          }) as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      )

    // Node labels — uses prose from textDict
    const labelGroup = g
      .append('g')
      .attr('class', 'labels')
      .selectAll('text')
      .data(nodes)
      .join('text')
      .text((d) => nodeLabel(d.id, textDict))
      .attr('font-size', 11)
      .attr('fill', '#d4d4d8')
      .attr('text-anchor', 'middle')
      .attr('dy', (d) => Math.sqrt(nodeSize(d.meta) / Math.PI) + 16)
      .style('font-family', "'Source Sans 3', 'Segoe UI', sans-serif")
      .style('font-weight', '500')
      .style('pointer-events', 'none')
      .style('user-select', 'none')
      .style('letter-spacing', '0.01em')
      .attr('opacity', (d) => (d.meta?.isSelected ? 1 : 0))

    // Force simulation
    const sim = d3
      .forceSimulation(nodes)
      .force(
        'link',
        d3
          .forceLink<SimNode, SimLink>(links)
          .id((d) => d.id)
          .distance(120),
      )
      .force('charge', d3.forceManyBody().strength(-350))
      .force('center', d3.forceCenter(0, 0))
      .force('collision', d3.forceCollide<SimNode>().radius((d) => Math.sqrt(nodeSize(d.meta) / Math.PI) + 12))
      .on('tick', () => {
        linkGroup
          .attr('x1', (d) => (d.source as SimNode).x ?? 0)
          .attr('y1', (d) => (d.source as SimNode).y ?? 0)
          .attr('x2', (d) => (d.target as SimNode).x ?? 0)
          .attr('y2', (d) => (d.target as SimNode).y ?? 0)

        linkLabelGroup
          .attr('x', (d) => (((d.source as SimNode).x ?? 0) + ((d.target as SimNode).x ?? 0)) / 2)
          .attr('y', (d) => (((d.source as SimNode).y ?? 0) + ((d.target as SimNode).y ?? 0)) / 2)

        nodeGroup.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`)
        labelGroup.attr('x', (d) => d.x ?? 0).attr('y', (d) => d.y ?? 0)
      })

    simRef.current = sim

    // Resize
    const onResize = () => {
      svg.attr('width', container.clientWidth).attr('height', container.clientHeight)
    }
    window.addEventListener('resize', onResize)

    return () => {
      sim.stop()
      window.removeEventListener('resize', onResize)
      container.innerHTML = ''
    }
  }, [graph, textDict]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reactively update node visuals on faults/selection/path ──

  useEffect(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)

    nodesRef.current.forEach((n) => {
      n.meta = classify(n.id, graph, faults, activePath, hindsightActive, selectedNodeId)
    })

    svg
      .selectAll<SVGPathElement, SimNode>('.nodes path')
      .attr('d', (d) => d3.symbol().type(nodeSymbol(d.meta)).size(nodeSize(d.meta))() ?? '')
      .attr('fill', (d) => nodeColor(d.meta))
      .attr('stroke', (d) =>
        d.meta.isSelected ? COLORS.selected : d.meta.isOnPath ? '#ffffffa0' : `${nodeColor(d.meta)}40`,
      )
      .attr('stroke-width', (d) => (d.meta.isSelected ? 3 : d.meta.isOnPath ? 2 : 1))

    svg
      .selectAll<SVGTextElement, SimNode>('.labels text')
      .attr('fill', (d) => (d.meta.isSelected ? '#ffffff' : '#d4d4d8'))
      .attr('font-weight', (d) => (d.meta.isSelected ? 'bold' : 'normal'))
      .attr('opacity', (d) => (d.meta.isSelected ? 1 : 0))
  }, [graph, faults, activePath, hindsightActive, selectedNodeId])

  // ── Smooth pan to selected node ──────────────────────────────

  useEffect(() => {
    if (!svgRef.current || !selectedNodeId) return
    const node = nodesRef.current.find((n) => n.id === selectedNodeId)
    if (!node || node.x === undefined || node.y === undefined) return

    const svg = d3.select<SVGSVGElement, unknown>(svgRef.current!)
    const width = svgRef.current!.clientWidth
    const height = svgRef.current!.clientHeight

    const targetTransform = d3.zoomIdentity
      .translate(width / 2, height / 2)
      .scale(1.2)
      .translate(-node.x, -node.y)

    svg
      .transition()
      .duration(600)
      .ease(d3.easeCubicInOut)
      .call(d3.zoom<SVGSVGElement, unknown>().transform, targetTransform)
  }, [selectedNodeId])

  const LEGEND = [
    { symbol: d3.symbolDiamond, color: COLORS.start, label: 'Start Node' },
    { symbol: d3.symbolCircle, color: COLORS.normal, label: 'Normal Scene' },
    { symbol: d3.symbolSquare, color: COLORS.ending, label: 'Ending' },
    { symbol: d3.symbolTriangle, color: COLORS.deadEnd, label: 'Dead End' },
    { symbol: d3.symbolCross, color: COLORS.unreachable, label: 'Unreachable' },
    { symbol: d3.symbolStar, color: COLORS.semantic, label: 'Semantic Fault' },
  ]

  const [atlasOpen, setAtlasOpen] = useState(true)

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: '#0d0d0d' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Shape Atlas / Legend — retractable */}
      <div
        style={{
          position: 'absolute',
          bottom: 16,
          left: 16,
          background: '#111113e8',
          border: '1px solid #1f1f23',
          borderRadius: 8,
          zIndex: 20,
          backdropFilter: 'blur(8px)',
          overflow: 'hidden',
          transition: 'all 0.25s ease',
          minWidth: atlasOpen ? 160 : 0,
        }}
      >
        {/* Header — always visible, acts as toggle */}
        <button
          onClick={() => setAtlasOpen((o) => !o)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            padding: '8px 12px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#71717a',
            fontFamily: "'Source Sans 3', sans-serif",
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            Shape Atlas
          </span>
          <span
            style={{
              fontSize: 11,
              transition: 'transform 0.25s ease',
              transform: atlasOpen ? 'rotate(0deg)' : 'rotate(180deg)',
              display: 'inline-block',
            }}
          >
            ▾
          </span>
        </button>

        {/* Body — collapsible */}
        <div
          style={{
            maxHeight: atlasOpen ? 200 : 0,
            opacity: atlasOpen ? 1 : 0,
            transition: 'max-height 0.25s ease, opacity 0.2s ease, padding 0.25s ease',
            padding: atlasOpen ? '0 12px 10px' : '0 12px',
            overflow: 'hidden',
          }}
        >
          {LEGEND.map((item) => (
            <div
              key={item.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                marginBottom: 5,
              }}
            >
              <svg width="18" height="18" viewBox="-10 -10 20 20">
                <path
                  d={d3.symbol().type(item.symbol).size(120)() ?? ''}
                  fill={item.color}
                  style={{ filter: `drop-shadow(0 0 3px ${item.color}80)` }}
                />
              </svg>
              <span
                style={{
                  fontSize: 12,
                  color: '#b0b0be',
                  fontFamily: "'Source Sans 3', sans-serif",
                  fontWeight: 400,
                }}
              >
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Hover highlight helpers ─────────────────────────────────────

function updateHighlight(
  hoveredId: string,
  nodeGroup: AnySelection,
  linkGroup: AnySelection,
  labelGroup: AnySelection,
  linkLabelGroup: AnySelection,
  links: SimLink[],
) {
  const connectedIds = new Set<string>()
  connectedIds.add(hoveredId)
  links.forEach((l) => {
    const sId = typeof l.source === 'object' ? (l.source as SimNode).id : l.sourceId
    const tId = typeof l.target === 'object' ? (l.target as SimNode).id : l.targetId
    if (sId === hoveredId) connectedIds.add(tId)
    if (tId === hoveredId) connectedIds.add(sId)
  })

  nodeGroup
    .transition()
    .duration(200)
    .attr('opacity', (d: SimNode) => (connectedIds.has(d.id) ? 1 : 0.35))

  labelGroup
    .transition()
    .duration(200)
    .attr('opacity', (d: SimNode) => (connectedIds.has(d.id) || d.meta.isSelected ? 1 : 0))

  linkGroup
    .transition()
    .duration(200)
    .attr('opacity', (d: SimLink) => {
      const sId = typeof d.source === 'object' ? (d.source as SimNode).id : d.sourceId
      const tId = typeof d.target === 'object' ? (d.target as SimNode).id : d.targetId
      return sId === hoveredId || tId === hoveredId ? 0.9 : 0.2
    })
    .attr('stroke-width', (d: SimLink) => {
      const sId = typeof d.source === 'object' ? (d.source as SimNode).id : d.sourceId
      const tId = typeof d.target === 'object' ? (d.target as SimNode).id : d.targetId
      return sId === hoveredId || tId === hoveredId ? 3.5 : 2
    })

  linkLabelGroup
    .transition()
    .duration(200)
    .attr('opacity', (d: SimLink) => {
      const sId = typeof d.source === 'object' ? (d.source as SimNode).id : d.sourceId
      const tId = typeof d.target === 'object' ? (d.target as SimNode).id : d.targetId
      return sId === hoveredId || tId === hoveredId ? 1 : 0
    })
}

function clearHighlight(
  nodeGroup: AnySelection,
  linkGroup: AnySelection,
  labelGroup: AnySelection,
  linkLabelGroup: AnySelection,
) {
  nodeGroup.transition().duration(200).attr('opacity', 1)
  labelGroup.transition().duration(200).attr('opacity', (d: SimNode) => (d.meta.isSelected ? 1 : 0))
  linkGroup.transition().duration(200).attr('opacity', 1).attr('stroke-width', 2)
  linkLabelGroup.transition().duration(200).attr('opacity', 0)
}
