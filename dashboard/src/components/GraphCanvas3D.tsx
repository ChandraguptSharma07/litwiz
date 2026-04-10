import { useEffect, useRef } from 'react'
import ForceGraph3D from '3d-force-graph'
import * as THREE from 'three'
import type { NormalizedGraph, FaultPayload } from '../lib/types'

interface Props {
  graph: NormalizedGraph
  faults: FaultPayload | null
  hindsightActive: boolean
  selectedNodeId: string | null
  onNodeClick: (nodeId: string) => void
}

function getNodeColor(
  nodeId: string,
  graph: NormalizedGraph,
  faults: FaultPayload | null,
  hindsightActive: boolean,
): string {
  if (faults) {
    if (faults.structural_faults.some((f) => f.type === 'DEAD_END' && f.node_id === nodeId)) {
      return '#ef4444'
    }
    if (faults.structural_faults.some((f) => f.type === 'UNREACHABLE' && f.affected_nodes.includes(nodeId))) {
      return '#f59e0b'
    }
    if (hindsightActive && faults.semantic_faults.some((f) => f.affected_nodes.includes(nodeId))) {
      return '#a855f7'
    }
  }
  const node = graph.nodes.find((n) => n.id === nodeId)
  if (node?.is_ending) return '#22c55e'
  if (nodeId === graph.start_node) return '#60a5fa'
  return '#3b82f6'
}

function buildGeometry(
  nodeId: string,
  graph: NormalizedGraph,
  faults: FaultPayload | null,
): THREE.BufferGeometry {
  if (faults?.structural_faults.some((f) => f.type === 'DEAD_END' && f.node_id === nodeId)) {
    return new THREE.OctahedronGeometry(6)
  }
  if (faults?.structural_faults.some((f) => f.type === 'UNREACHABLE' && f.affected_nodes.includes(nodeId))) {
    return new THREE.TetrahedronGeometry(6)
  }
  const node = graph.nodes.find((n) => n.id === nodeId)
  if (node?.is_ending) return new THREE.IcosahedronGeometry(6)
  return new THREE.SphereGeometry(5, 16, 16)
}

export default function GraphCanvas3D({
  graph,
  faults,
  hindsightActive,
  selectedNodeId,
  onNodeClick,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef = useRef<any>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const nodes = graph.nodes.map((n) => ({ id: n.id }))
    const links = graph.nodes.flatMap((n) =>
      n.choices.map((c) => ({ source: n.id, target: c.target })),
    )

    const g = ForceGraph3D()(containerRef.current)
      .backgroundColor('#09090b')
      .graphData({ nodes, links })
      .nodeThreeObject((node: { id: string }) => {
        const color = getNodeColor(node.id, graph, faults, hindsightActive)
        const geometry = buildGeometry(node.id, graph, faults)
        const material = new THREE.MeshLambertMaterial({ color })
        const mesh = new THREE.Mesh(geometry, material)

        // Semantic nodes get a slow spin
        if (
          hindsightActive &&
          faults?.semantic_faults.some((f) => f.affected_nodes.includes(node.id))
        ) {
          const animate = () => {
            mesh.rotation.y += 0.015
            requestAnimationFrame(animate)
          }
          animate()
        }

        // Error nodes get a point light
        const isDead = faults?.structural_faults.some(
          (f) => f.type === 'DEAD_END' && f.node_id === node.id,
        )
        const isOrphan = faults?.structural_faults.some(
          (f) => f.type === 'UNREACHABLE' && f.affected_nodes.includes(node.id),
        )
        if (isDead || isOrphan) {
          const light = new THREE.PointLight(isDead ? 0xef4444 : 0xf59e0b, 2, 40)
          mesh.add(light)
        }

        return mesh
      })
      .nodeLabel((node: { id: string }) => node.id)
      .linkColor(() => '#ffffff15')
      .linkWidth(1)
      .linkDirectionalArrowLength(4)
      .linkDirectionalArrowRelPos(1)
      .onNodeClick((node: { id: string }) => onNodeClick(node.id))
      .cooldownTicks(100)

    // Camera dolly-zoom on load
    g.cameraPosition({ x: 0, y: 0, z: 300 }, undefined, 2500)

    graphRef.current = g

    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = ''
      }
    }
  }, [graph, faults, hindsightActive]) // rebuild on data change

  // Lerp camera to selected node
  useEffect(() => {
    const g = graphRef.current
    if (!g || !selectedNodeId) return

    const { nodes } = g.graphData() as { nodes: Array<{ id: string; x?: number; y?: number; z?: number }> }
    const node = nodes.find((n) => n.id === selectedNodeId)
    if (node?.x !== undefined) {
      g.cameraPosition(
        { x: node.x, y: node.y, z: (node.z ?? 0) + 80 },
        { x: node.x, y: node.y, z: node.z ?? 0 },
        800,
      )
    }
  }, [selectedNodeId])

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', background: 'var(--bg-base)' }}
    />
  )
}
