import { useEffect, useRef } from 'react'
import cytoscape, { type Core, type NodeSingular } from 'cytoscape'
import type { NormalizedGraph, FaultPayload, ValidPath } from '../lib/types'

interface Props {
  graph: NormalizedGraph
  faults: FaultPayload | null
  activePath: ValidPath | null
  sweeping: boolean
  hindsightActive: boolean
  selectedNodeId: string | null
  onNodeClick: (nodeId: string) => void
}

// Returns which fault categories apply to a given node ID
function getNodeClasses(
  nodeId: string,
  graph: NormalizedGraph,
  faults: FaultPayload | null,
  activePath: ValidPath | null,
  sweeping: boolean,
  hindsightActive: boolean,
  selectedNodeId: string | null,
): string[] {
  const classes: string[] = []

  if (nodeId === graph.start_node) classes.push('start')

  const node = graph.nodes.find((n) => n.id === nodeId)
  if (node?.is_ending) classes.push('ending')

  if (faults) {
    const isDeadEnd = faults.structural_faults.some(
      (f) => f.type === 'DEAD_END' && f.node_id === nodeId,
    )
    const isUnreachable = faults.structural_faults.some(
      (f) => f.type === 'UNREACHABLE' && f.affected_nodes.includes(nodeId),
    )
    const isSemantic = faults.semantic_faults.some((f) =>
      f.affected_nodes.includes(nodeId),
    )

    if (isDeadEnd) classes.push('dead-end')
    if (isUnreachable) classes.push('unreachable')
    if (isSemantic && hindsightActive) classes.push('semantic')
  }

  if (activePath?.node_sequence.includes(nodeId)) classes.push('on-path')
  if (sweeping) classes.push('sweeping')
  if (nodeId === selectedNodeId) classes.push('selected')

  return classes
}

export default function GraphCanvas2D({
  graph,
  faults,
  activePath,
  sweeping,
  hindsightActive,
  selectedNodeId,
  onNodeClick,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<Core | null>(null)

  // Build or rebuild the graph whenever the narrative changes
  useEffect(() => {
    if (!containerRef.current) return

    const elements = buildElements(graph)

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: buildStyle(),
      layout: {
        name: 'breadthfirst',
        directed: true,
        padding: 40,
        spacingFactor: 1.4,
      },
      userZoomingEnabled: true,
      userPanningEnabled: true,
      boxSelectionEnabled: false,
    })

    cy.on('tap', 'node', (evt) => {
      const node = evt.target as NodeSingular
      onNodeClick(node.id())
    })

    // Edge hover tooltip
    cy.on('mouseover', 'edge', (evt) => {
      const edge = evt.target
      edge.style('opacity', 0.8)
    })
    cy.on('mouseout', 'edge', (evt) => {
      const edge = evt.target
      edge.style('opacity', 1)
    })

    cyRef.current = cy
    return () => cy.destroy()
  }, [graph]) // intentionally only on graph change

  // Update node classes reactively when faults/selection/path changes
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return

    cy.nodes().forEach((node) => {
      const id = node.id()
      const classes = getNodeClasses(
        id,
        graph,
        faults,
        activePath,
        sweeping,
        hindsightActive,
        selectedNodeId,
      )
      node.classes(classes)
    })

    // Dim unconnected edges when a node is selected
    if (selectedNodeId) {
      const connected = new Set<string>()
      const sel = cy.$(`#${selectedNodeId}`)
      sel.connectedEdges().forEach((e) => { connected.add(e.id()) })

      cy.edges().forEach((edge) => {
        edge.style('opacity', connected.has(edge.id()) ? '1' : '0.05')
      })
    } else {
      cy.edges().style('opacity', '1')
    }
  }, [graph, faults, activePath, sweeping, hindsightActive, selectedNodeId])

  // Jump-to-node from sidebar
  useEffect(() => {
    const cy = cyRef.current
    if (!cy || !selectedNodeId) return
    const node = cy.$(`#${selectedNodeId}`)
    if (node.length) {
      cy.animate({ fit: { eles: node, padding: 120 } }, { duration: 400 })
    }
  }, [selectedNodeId])

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', background: 'var(--bg-base)' }}
    />
  )
}

function buildElements(graph: NormalizedGraph) {
  const nodes = graph.nodes.map((n) => ({
    data: { id: n.id, label: n.id },
  }))

  const edges = graph.nodes.flatMap((n) =>
    n.choices.map((c) => ({
      data: {
        id: `${n.id}-${c.id}`,
        source: n.id,
        target: c.target,
        label: c.text,
        conditional: !!c.condition,
      },
    })),
  )

  return [...nodes, ...edges]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildStyle(): any[] {
  return [
    {
      selector: 'node',
      style: {
        'background-color': 'var(--node-default)',
        'border-width': 2,
        'border-color': 'transparent',
        width: 56,
        height: 56,
        label: 'data(id)',
        'text-valign': 'center',
        'text-halign': 'center',
        color: '#fff',
        'font-size': 9,
        'font-family': 'JetBrains Mono, monospace',
        'text-outline-width': 0,
        'overlay-padding': 6,
        'transition-property': 'background-color border-color border-width',
        'transition-duration': 300,
      } as cytoscape.Css.Node,
    },
    {
      selector: 'node.start',
      style: {
        width: 68,
        height: 68,
        'border-width': 3,
        'border-color': '#60a5fa',
        content: '▶  data(id)' as unknown as string,
      } as cytoscape.Css.Node,
    },
    {
      selector: 'node.ending',
      style: {
        'border-width': 3,
        'border-color': 'var(--node-valid)',
        'background-color': '#166534',
      } as cytoscape.Css.Node,
    },
    {
      selector: 'node.dead-end',
      style: {
        'background-color': 'var(--node-dead-end)',
        'border-color': '#fca5a5',
        'border-width': 3,
        'border-style': 'solid',
      } as cytoscape.Css.Node,
    },
    {
      selector: 'node.unreachable',
      style: {
        'background-color': '#78350f',
        'border-color': 'var(--node-orphan)',
        'border-width': 2,
        'border-style': 'dashed',
        opacity: 0.7,
      } as cytoscape.Css.Node,
    },
    {
      selector: 'node.semantic',
      style: {
        'background-color': '#581c87',
        'border-color': 'var(--node-semantic)',
        'border-width': 3,
      } as cytoscape.Css.Node,
    },
    {
      selector: 'node.on-path',
      style: {
        'border-color': '#ffffff',
        'border-width': 2,
      } as cytoscape.Css.Node,
    },
    {
      selector: 'node.selected',
      style: {
        'border-color': 'var(--node-selected)',
        'border-width': 4,
        width: 72,
        height: 72,
      } as cytoscape.Css.Node,
    },
    {
      selector: 'edge',
      style: {
        width: 1.5,
        'line-color': '#ffffff18',
        'target-arrow-color': '#ffffff30',
        'target-arrow-shape': 'triangle',
        'arrow-scale': 0.8,
        'curve-style': 'bezier',
        'control-point-step-size': 40,
        'transition-property': 'opacity',
        'transition-duration': 200,
      } as cytoscape.Css.Edge,
    },
    {
      selector: 'edge[?conditional]',
      style: {
        'line-style': 'dashed',
        'line-dash-pattern': [6, 3],
        'line-color': '#a78bfa50',
      } as cytoscape.Css.Edge,
    },
  ]
}
