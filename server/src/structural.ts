// TypeScript implementation of the 5 structural validation algorithms.
// These mirror the Rust core-engine exactly — same logic, same output schema.
// Having them here means the web server is self-contained and doesn't need
// the Rust binary to be compiled or present.

import type {
  NormalizedGraph,
  GraphNode,
  StructuralFault,
  ValidPath,
  ValidPathsOutput,
  ValidEnding,
  StructuralResult,
} from './types'

type State = Record<string, boolean | string>

// ── Algorithm 1 — Dead End Detection ──────────────────────────
//
// A node with no choices that isn't marked as an ending traps
// the reader with no way to proceed and no narrative resolution.

function detectDeadEnds(nodes: GraphNode[]): StructuralFault[] {
  return nodes
    .filter((n) => n.choices.length === 0 && !n.is_ending)
    .map((n) => ({
      fault_id: '',
      type: 'DEAD_END',
      severity: 'error' as const,
      node_id: n.id,
      message: `Node has no outgoing choices and is not marked as an ending. A reader who reaches ${n.id} is permanently stuck.`,
      affected_nodes: [n.id],
      affected_paths: [],
    }))
}

// ── Algorithm 2 — Unreachable Node Detection ──────────────────
//
// BFS from start_node. Anything not visited is unreachable —
// a reader can never reach it regardless of their choices.

function detectUnreachable(graph: NormalizedGraph): StructuralFault[] {
  const visited = new Set<string>()
  const queue = [graph.start_node]

  while (queue.length > 0) {
    const id = queue.shift()!
    if (visited.has(id)) continue
    visited.add(id)
    const node = graph.nodes.find((n) => n.id === id)
    if (node) {
      for (const choice of node.choices) queue.push(choice.target)
    }
  }

  const faults: StructuralFault[] = []
  for (const node of graph.nodes) {
    if (visited.has(node.id)) continue

    // Find the cluster of unreachable nodes connected to this one
    const cluster = new Set<string>()
    const clusterQueue = [node.id]
    while (clusterQueue.length > 0) {
      const cid = clusterQueue.shift()!
      if (cluster.has(cid) || visited.has(cid)) continue
      cluster.add(cid)
      const cn = graph.nodes.find((n) => n.id === cid)
      if (cn) {
        for (const ch of cn.choices) clusterQueue.push(ch.target)
      }
    }

    faults.push({
      fault_id: '',
      type: 'UNREACHABLE',
      severity: 'warning',
      node_id: node.id,
      message: `No path from the start node reaches ${node.id}. It forms an isolated cluster of ${cluster.size} node(s) with no incoming edges from the main graph.`,
      affected_nodes: Array.from(cluster).sort(),
      affected_paths: [],
    })
  }

  return faults
}

// ── Algorithm 3 — Infinite Loop Detection ────────────────────
//
// DFS cycle detection. A cycle that has no outgoing edge to a
// node outside the cycle, and contains no ending node, traps
// the reader forever.

function detectInfiniteLoops(graph: NormalizedGraph): StructuralFault[] {
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]))
  const faults: StructuralFault[] = []

  // Find all cycles using DFS with coloring (white/grey/black)
  const colors = new Map<string, 'white' | 'grey' | 'black'>()
  for (const n of graph.nodes) colors.set(n.id, 'white')

  function dfs(id: string, path: string[]): void {
    colors.set(id, 'grey')
    path.push(id)

    const node = nodeMap.get(id)
    if (!node) { colors.set(id, 'black'); path.pop(); return }

    for (const choice of node.choices) {
      const targetColor = colors.get(choice.target)
      if (targetColor === 'grey') {
        // Found a cycle — extract cycle members
        const cycleStart = path.indexOf(choice.target)
        if (cycleStart === -1) continue
        const cycle = path.slice(cycleStart)

        // Check if the cycle has an exit or an ending
        const hasExit = cycle.some((nid) => {
          const cn = nodeMap.get(nid)
          return cn?.choices.some((ch) => !cycle.includes(ch.target)) ?? false
        })
        const hasEnding = cycle.some((nid) => nodeMap.get(nid)?.is_ending)

        if (!hasExit && !hasEnding) {
          const sorted = [...cycle].sort()
          const key = sorted.join(',')
          const alreadyReported = faults.some(
            (f) => [...f.affected_nodes].sort().join(',') === key,
          )
          if (!alreadyReported) {
            faults.push({
              fault_id: '',
              type: 'INFINITE_LOOP',
              severity: 'error',
              node_id: cycle[0],
              message: `Cycle detected with no exit: ${cycle.join(' → ')}. A reader entering this cycle can never reach an ending.`,
              affected_nodes: sorted,
              affected_paths: [],
            })
          }
        }
      } else if (targetColor === 'white') {
        dfs(choice.target, path)
      }
    }

    path.pop()
    colors.set(id, 'black')
  }

  for (const node of graph.nodes) {
    if (colors.get(node.id) === 'white') dfs(node.id, [])
  }

  return faults
}

// ── Algorithm 4 — Locked Condition Detection ─────────────────
//
// For each conditional edge, check whether any path from start
// to its source node can accumulate the state that satisfies
// the condition. If not, that choice can never be made.

function evaluateCondition(condition: string, state: State): boolean {
  const parts = condition.trim().split(/\s+/)
  if (parts.length !== 3) return true // unparseable — fail open

  const [key, op, valStr] = parts
  const expected: boolean | string =
    valStr === 'true' ? true : valStr === 'false' ? false : valStr

  const actual = state[key]
  if (op === '==') return actual === expected
  if (op === '!=') return actual !== expected
  return true
}

function allStatesAt(
  graph: NormalizedGraph,
  targetId: string,
): State[] {
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]))
  const results: State[] = []
  const visited = new Set<string>()

  function dfs(id: string, state: State): void {
    if (visited.has(id)) return
    visited.add(id)

    const node = nodeMap.get(id)
    if (!node) { visited.delete(id); return }

    const next: State = { ...state, ...node.set_state }

    if (id === targetId) {
      results.push(next)
      visited.delete(id)
      return
    }

    for (const choice of node.choices) {
      const cond = choice.condition
      if (!cond || evaluateCondition(cond, next)) {
        dfs(choice.target, next)
      }
    }

    visited.delete(id)
  }

  dfs(graph.start_node, {})
  return results
}

function detectLockedConditions(graph: NormalizedGraph): StructuralFault[] {
  const reachable = new Set<string>()
  const q = [graph.start_node]
  while (q.length > 0) {
    const id = q.shift()!
    if (reachable.has(id)) continue
    reachable.add(id)
    const n = graph.nodes.find((node) => node.id === id)
    if (n) for (const c of n.choices) q.push(c.target)
  }

  const faults: StructuralFault[] = []

  for (const node of graph.nodes) {
    if (!reachable.has(node.id)) continue

    for (const choice of node.choices) {
      if (!choice.condition) continue

      const statesAtSource = allStatesAt(graph, node.id)
      const satisfiable = statesAtSource.some((s) =>
        evaluateCondition(choice.condition!, s),
      )

      if (!satisfiable) {
        faults.push({
          fault_id: '',
          type: 'LOCKED_CONDITION',
          severity: 'error',
          node_id: choice.target,
          message: `Edge requires "${choice.condition}" but no path to ${node.id} produces that state. The choice "${choice.text}" can never be selected.`,
          affected_nodes: [node.id, choice.target],
          affected_paths: [],
        })
      }
    }
  }

  return faults
}

// ── Algorithm 5 — Valid Path Generation ──────────────────────
//
// DFS from start_node collecting all root-to-ending paths,
// recording the full state snapshot at each node.

function generateValidPaths(graph: NormalizedGraph): ValidPath[] {
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]))
  const paths: ValidPath[] = []
  const visited = new Set<string>()

  function dfs(
    id: string,
    state: State,
    sequence: string[],
    snapshots: ValidPath['state_at_each_node'],
  ): void {
    if (visited.has(id)) return

    const node = nodeMap.get(id)
    if (!node) return

    visited.add(id)

    const newState: State = { ...state, ...node.set_state }
    sequence.push(id)
    snapshots.push({ node_id: id, state: { ...newState } })

    if (node.is_ending) {
      paths.push({
        path_id: '',
        node_sequence: [...sequence],
        state_at_each_node: [...snapshots],
        ending_node: id,
        is_valid: true,
      })
    } else {
      for (const choice of node.choices) {
        if (!choice.condition || evaluateCondition(choice.condition, newState)) {
          dfs(choice.target, newState, sequence, snapshots)
        }
      }
    }

    sequence.pop()
    snapshots.pop()
    visited.delete(id)
  }

  dfs(graph.start_node, {}, [], [])

  paths.forEach((p, i) => { p.path_id = `path_${i + 1}` })
  return paths
}

// ── Public API ────────────────────────────────────────────────

export function runStructuralValidation(graph: NormalizedGraph): StructuralResult {
  const deadEnds = detectDeadEnds(graph.nodes)
  const unreachable = detectUnreachable(graph)
  const loops = detectInfiniteLoops(graph)
  const locked = detectLockedConditions(graph)

  const allFaults: StructuralFault[] = [
    ...deadEnds,
    ...unreachable,
    ...loops,
    ...locked,
  ]

  // Assign sequential IDs
  allFaults.forEach((f, i) => { f.fault_id = `sf_${String(i + 1).padStart(3, '0')}` })

  const validPaths = generateValidPaths(graph)

  const endingIds = [...new Set(validPaths.map((p) => p.ending_node))]
  const validEndings: ValidEnding[] = endingIds
    .sort()
    .map((id) => ({
      node_id: id,
      prose_preview: `[Ending at ${id}]`,
    }))

  const totalEdges = graph.nodes.reduce((sum, n) => sum + n.choices.length, 0)

  return {
    narrative_title: graph.title,
    validated_at: new Date().toISOString(),
    structural_faults: allFaults,
    valid_endings: validEndings,
    valid_paths: {
      metadata: {
        total_nodes: graph.nodes.length,
        total_edges: totalEdges,
        valid_path_count: validPaths.length,
        structural_fault_count: allFaults.length,
      },
      valid_paths: validPaths,
    },
  }
}
