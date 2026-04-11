// ──────────────────────────────────────────────────────────────
//  structural.ts — TypeScript implementation of the 5 structural
//                  validation algorithms
//
//  These mirror the Rust core-engine exactly — same logic, same
//  output schema. Having them here means the web server is
//  self-contained and doesn't need the Rust binary compiled.
//
//  Algorithms:
//    1. Dead End Detection
//    2. Unreachable Node Detection  (BFS)
//    3. Infinite Loop Detection     (DFS + coloring)
//    4. Locked Condition Detection  (DFS + state simulation)
//    5. Valid Path Generation       (DFS + state tracking)
// ──────────────────────────────────────────────────────────────

import type {
  NormalizedGraph,
  GraphNode,
  StructuralFault,
  ValidPath,
  ValidPathsOutput,
  ValidEnding,
  StructuralResult,
} from './types'

/** Narrative game state — maps variable names to booleans or strings. */
type State = Record<string, boolean | string>

// ═══════════════════════════════════════════════════════════════
//  ALGORITHM 1 — Dead End Detection
// ═══════════════════════════════════════════════════════════════
//
//  For each node N:
//    if choices.length == 0 AND is_ending == false:
//      FAULT: DEAD_END on N
//
//  A dead-end traps the reader — they reach a node with no
//  choices and no narrative conclusion.
// ───────────────────────────────────────────────────────────────

/**
 * Detect dead-end nodes in the narrative graph (Algorithm 1).
 *
 * A dead end is any node where `choices.length === 0` but `is_ending === false`.
 * These nodes trap the reader with no choices and no narrative conclusion.
 *
 * # Arguments
 * * `nodes` — Array of all graph nodes to inspect.
 *
 * # Returns
 * Array of `StructuralFault` with severity `"error"` for each dead end.
 */
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

// ═══════════════════════════════════════════════════════════════
//  ALGORITHM 2 — Unreachable Node Detection
// ═══════════════════════════════════════════════════════════════
//
//  BFS from start_node.
//  For each node N not visited: FAULT: UNREACHABLE on N.
//
//  Unreachable nodes are wasted content — no reader can ever
//  reach them regardless of their choices.
// ───────────────────────────────────────────────────────────────

/**
 * Detect unreachable nodes in the narrative graph (Algorithm 2).
 *
 * Runs BFS from the `start_node`. Any node not visited is unreachable —
 * wasted content that no reader can ever see. For each unreachable node,
 * the fault includes its isolated cluster size.
 *
 * # Arguments
 * * `graph` — The full normalized graph with `start_node` and `nodes`.
 *
 * # Returns
 * Array of `StructuralFault` with severity `"warning"` for each orphan.
 */
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

// ═══════════════════════════════════════════════════════════════
//  ALGORITHM 3 — Infinite Loop Detection
// ═══════════════════════════════════════════════════════════════
//
//  DFS cycle detection with white/grey/black coloring.
//  A cycle is a fault if:
//    - No node in the cycle has an outgoing edge outside it, AND
//    - No node in the cycle is marked as an ending.
//
//  An inescapable cycle traps the reader in an infinite loop
//  with no way to reach an ending.
// ───────────────────────────────────────────────────────────────

/**
 * Detect inescapable infinite loops in the narrative graph (Algorithm 3).
 *
 * Uses DFS with white/grey/black coloring to find cycles. A cycle
 * is reported as a fault only if it has no exit edge to any node
 * outside the cycle AND contains no ending node.
 *
 * # Arguments
 * * `graph` — The full normalized graph.
 *
 * # Returns
 * Array of `StructuralFault` with severity `"error"` for each inescapable cycle.
 */
function detectInfiniteLoops(graph: NormalizedGraph): StructuralFault[] {
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]))
  const faults: StructuralFault[] = []

  // Find all cycles using DFS with coloring (white/grey/black)
  const colors = new Map<string, 'white' | 'grey' | 'black'>()
  for (const n of graph.nodes) colors.set(n.id, 'white')

  /**
   * Recursive DFS visitor for cycle detection.
   * Grey nodes on the current DFS stack indicate a back-edge (cycle).
   *
   * # Arguments
   * * `id` — Current node ID being visited.
   * * `path` — The current DFS stack of node IDs.
   */
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

// ═══════════════════════════════════════════════════════════════
//  ALGORITHM 4 — Locked Condition Detection
// ═══════════════════════════════════════════════════════════════
//
//  For each edge E with condition C:
//    Trace all paths from start_node to E's source
//    Simulate state accumulation along each path
//    If NO path produces a state that satisfies C:
//      FAULT: LOCKED_CONDITION on E's target
//
//  A locked condition means a reader can see the choice text
//  but can never select it — the required state is impossible.
// ───────────────────────────────────────────────────────────────

/**
 * Evaluate a condition string against the current narrative state.
 *
 * Supports the format `"key operator value"` where:
 * - `key` is a state variable name (e.g. `"has_torch"`)
 * - `operator` is `==` or `!=`
 * - `value` is `true`, `false`, or a string
 *
 * Returns `true` if the condition is satisfied, or if the condition
 * string is unparseable (fail-open for safety).
 *
 * # Arguments
 * * `condition` — The condition expression string.
 * * `state` — The current accumulated state map.
 *
 * # Returns
 * `true` if the condition is met or unparseable; `false` otherwise.
 */
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

/**
 * Compute all possible accumulated states at a target node via DFS.
 *
 * Explores every path from `start_node` to `targetId`, collecting
 * the accumulated state map at each arrival. Used by Algorithm 4 to
 * determine whether any path can satisfy a locked condition.
 *
 * # Arguments
 * * `graph` — The full normalized graph.
 * * `targetId` — The node ID to reach.
 *
 * # Returns
 * Array of all possible states at the target node.
 */
function allStatesAt(
  graph: NormalizedGraph,
  targetId: string,
): State[] {
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]))
  const results: State[] = []
  const visited = new Set<string>()

  /**
   * Recursive DFS helper for state accumulation.
   * Walks from `id` toward `targetId`, applying set_state at each node.
   * Uses backtracking to explore all paths.
   *
   * # Arguments
   * * `id` — Current node ID.
   * * `state` — Accumulated state at this point.
   */
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

/**
 * Detect locked conditions — choices that can never be selected (Algorithm 4).
 *
 * For each edge with a condition, traces all possible paths from `start_node`
 * to the edge's source node, simulating state accumulation. If no path
 * produces a state that satisfies the condition, the choice is permanently
 * locked — the reader sees the text but can never click it.
 *
 * Skips unreachable nodes (already flagged by Algorithm 2).
 *
 * # Arguments
 * * `graph` — The full normalized graph.
 *
 * # Returns
 * Array of `StructuralFault` with severity `"error"` for each locked choice.
 */
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

// ═══════════════════════════════════════════════════════════════
//  ALGORITHM 5 — Valid Path Generation
// ═══════════════════════════════════════════════════════════════
//
//  DFS from start_node, collecting all paths that reach an
//  is_ending node. Each path records the state snapshot at
//  every node traversed.
//
//  Output: valid_paths array consumed by semantic-ai module
//  (one reflect() call per path).
// ───────────────────────────────────────────────────────────────

/**
 * Generate all valid end-to-end paths through the narrative (Algorithm 5).
 *
 * Performs exhaustive DFS from `start_node`, respecting condition gates,
 * and collecting every path that reaches an `is_ending` node. Each path
 * records the full state snapshot at every node visited.
 *
 * Output is consumed by the Hindsight semantic-AI module for continuity
 * analysis (one `reflect()` call per path).
 *
 * # Arguments
 * * `graph` — The full normalized graph.
 *
 * # Returns
 * Array of `ValidPath` with sequential IDs (`path_1`, `path_2`, ...).
 */
function generateValidPaths(graph: NormalizedGraph): ValidPath[] {
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]))
  const paths: ValidPath[] = []
  const visited = new Set<string>()

  /**
   * Recursive DFS helper that builds valid paths from the current node to any ending.
   *
   * Tracks visited nodes to prevent infinite loops. At each node, applies
   * `set_state` mutations to the running state, then explores each choice
   * whose condition is satisfied. When an ending node is reached, the
   * accumulated path is recorded. Uses backtracking to allow the same
   * node to appear in multiple distinct paths.
   *
   * # Arguments
   * * `id` — Current node ID.
   * * `state` — Accumulated state at the current node.
   * * `sequence` — Ordered list of node IDs visited so far.
   * * `snapshots` — State snapshots parallel to `sequence`.
   */
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

// ═══════════════════════════════════════════════════════════════
//  PUBLIC API — runStructuralValidation
// ═══════════════════════════════════════════════════════════════

/**
 * Run all five structural validation algorithms on a normalized graph.
 *
 * Executes algorithms 1–4 (fault detection) and algorithm 5 (path generation)
 * in sequence, assigns sequential fault IDs (`sf_001`, `sf_002`, ...),
 * collects valid endings, and returns the complete structural result.
 *
 * This is the main export consumed by the Express route handler.
 *
 * # Arguments
 * * `graph` — The normalized graph to validate.
 *
 * # Returns
 * A `StructuralResult` containing faults, valid endings, and valid paths.
 */
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
