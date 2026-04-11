// ──────────────────────────────────────────────────────────────
//  types.ts — Dashboard type definitions
//
//  These interfaces mirror the four contract JSON schemas used
//  throughout the NVE system. The dashboard only reads data —
//  it never mutates or validates.
//
//  Organized by data source:
//    1. Normalized Graph  (from core-engine / ingestion)
//    2. Text Dictionary   (from ingestion)
//    3. Valid Paths        (from core-engine)
//    4. Fault Payload      (from core-engine + semantic-ai)
//    5. App-level state    (dashboard-internal)
// ──────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════
//  NORMALIZED GRAPH — from core-engine / ingestion
// ═══════════════════════════════════════════════════════════════

/**
 * A reader choice that creates a directed edge to another node.
 * Carries optional condition gating for state-dependent traversal.
 */
export interface Choice {
  /** Unique identifier for this choice edge. */
  id: string
  /** Human-readable label shown to the reader. */
  text: string
  /** The ID of the node this choice leads to. */
  target: string
  /** Optional condition expression (e.g. `"has_key == true"`). */
  condition: string | null
}

/**
 * A single narrative node — one scene or decision point.
 * Contains structural data only (no prose in the normalized graph).
 */
export interface GraphNode {
  /** Unique node identifier (e.g. `"node_5"`). */
  id: string
  /** Whether this node is a valid story ending. */
  is_ending: boolean
  /** State mutations applied when this node is visited. */
  set_state: Record<string, boolean | string>
  /** Outgoing choices (edges) available to the reader. */
  choices: Choice[]
}

/**
 * Top-level normalized graph structure — the structural skeleton
 * of the narrative with no textual content.
 */
export interface NormalizedGraph {
  /** Human-readable title of the narrative. */
  title: string
  /** Schema version string (e.g. `"1.0"`). */
  version: string
  /** The ID of the node where the story begins. */
  start_node: string
  /** All narrative nodes in the graph. */
  nodes: GraphNode[]
}

// ═══════════════════════════════════════════════════════════════
//  TEXT DICTIONARY — from ingestion
// ═══════════════════════════════════════════════════════════════

/**
 * A node's textual content — prose, character states, and facts.
 * Displayed in the sidebar detail tab when a node is selected.
 */
export interface TextNode {
  /** The narrative prose displayed to the reader at this node. */
  prose: string
  /** Descriptions of character states at this point. */
  character_states: string[]
  /** Facts established by this scene. */
  established_facts: string[]
}

/**
 * The text dictionary — maps node IDs to textual content.
 * Separated from the normalized graph to keep validation text-free.
 */
export interface TextDictionary {
  /** Title of the narrative. */
  title: string
  /** Global narrative world rules. */
  world_rules: string[]
  /** Maps node ID → textual content for that node. */
  nodes: Record<string, TextNode>
}

// ═══════════════════════════════════════════════════════════════
//  VALID PATHS — from core-engine
// ═══════════════════════════════════════════════════════════════

/**
 * A snapshot of accumulated narrative state at a specific node.
 */
export interface StateSnapshot {
  /** The node ID where this snapshot was taken. */
  node_id: string
  /** The accumulated state at this point in the path. */
  state: Record<string, boolean | string>
}

/**
 * A single valid end-to-end path through the narrative graph.
 * Records the full state snapshot at every node visited.
 */
export interface ValidPath {
  /** Sequential path identifier (e.g. `"path_1"`). */
  path_id: string
  /** Ordered list of node IDs visited along this path. */
  node_sequence: string[]
  /** State snapshot at each node (parallel to `node_sequence`). */
  state_at_each_node: StateSnapshot[]
  /** The ID of the ending node where this path terminates. */
  ending_node: string
  /** Always `true` for paths in the output. */
  is_valid: boolean
}

/**
 * Top-level output structure for valid paths — contains
 * summary metadata and the full list of valid paths.
 */
export interface ValidPathsFile {
  /** Summary statistics about the graph and validation. */
  metadata: {
    /** Total number of nodes in the graph. */
    total_nodes: number
    /** Total number of edges (choices) in the graph. */
    total_edges: number
    /** Number of valid end-to-end paths discovered. */
    valid_path_count: number
    /** Number of structural faults detected. */
    structural_fault_count: number
  }
  /** All valid end-to-end paths. */
  valid_paths: ValidPath[]
}

// ═══════════════════════════════════════════════════════════════
//  FAULT PAYLOAD — from core-engine + semantic-ai
// ═══════════════════════════════════════════════════════════════

/**
 * A structural fault detected by one of the five validation algorithms.
 * These are hard errors (dead ends, unreachable nodes, infinite loops,
 * locked conditions).
 */
export interface StructuralFault {
  /** Sequential fault identifier (e.g. `"sf_001"`). */
  fault_id: string
  /** Fault type: `"DEAD_END"`, `"UNREACHABLE"`, `"INFINITE_LOOP"`, or `"LOCKED_CONDITION"`. */
  type: string
  /** Severity: `"error"` or `"warning"`. */
  severity: 'error' | 'warning'
  /** The primary node where this fault is anchored. */
  node_id: string
  /** Human-readable description of the fault. */
  message: string
  /** All node IDs involved in this fault. */
  affected_nodes: string[]
  /** Path IDs affected (currently unused). */
  affected_paths: string[]
}

/**
 * A semantic fault detected by Hindsight AI during narrative analysis.
 * Softer warnings for continuity errors (dead characters, item issues).
 */
export interface SemanticFault {
  /** Sequential fault identifier (e.g. `"sem_001"`). */
  fault_id: string
  /** Fault type (e.g. `"CHARACTER_CONTINUITY"`). */
  type: string
  /** Severity based on Hindsight confidence. */
  severity: 'error' | 'warning'
  /** The primary node where the fault was detected. */
  node_id: string
  /** The path ID on which this fault was observed. */
  path_id: string
  /** Human-readable description of the contradiction. */
  message: string
  /** All node IDs involved. */
  affected_nodes: string[]
  /** Hindsight's confidence score (0.0 – 1.0). */
  hindsight_confidence: number
}

/**
 * A reachable ending node with a truncated prose preview.
 */
export interface ValidEnding {
  /** The node ID of the ending. */
  node_id: string
  /** First ~150 characters of the ending's prose text. */
  prose_preview: string
}

/**
 * The combined fault payload — structural faults, semantic faults,
 * and valid endings in one object. This is the primary data structure
 * driving the sidebar's "Errors" tab.
 */
export interface FaultPayload {
  /** Title of the validated narrative. */
  narrative_title: string
  /** ISO 8601 timestamp of when validation was performed. */
  validated_at: string
  /** All structural faults detected. */
  structural_faults: StructuralFault[]
  /** All semantic faults detected. */
  semantic_faults: SemanticFault[]
  /** All reachable ending nodes. */
  valid_endings: ValidEnding[]
}

// ═══════════════════════════════════════════════════════════════
//  APP-LEVEL STATE — dashboard-internal types
// ═══════════════════════════════════════════════════════════════

/**
 * The current phase of the validation pipeline.
 * Drives which UI elements are enabled and what the phase strip shows.
 *
 *   idle → ingesting → ingest-done → structural-running
 *   → structural-done → semantic-running → semantic-done
 */
export type ValidationPhase =
  | 'idle'
  | 'ingesting'
  | 'ingest-done'
  | 'structural-running'
  | 'structural-done'
  | 'semantic-running'
  | 'semantic-done'

/**
 * Which sidebar tab is currently active.
 * - `"errors"` — Shows structural and semantic fault lists.
 * - `"detail"` — Shows detailed info for the selected node.
 */
export type SidebarTab = 'errors' | 'detail'
