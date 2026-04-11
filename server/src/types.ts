/**
 * @module types
 * @description Shared TypeScript type definitions for the NVE server.
 * These interfaces mirror the JSON schemas defined in `/contracts/` exactly,
 * providing type safety for all data flowing between modules.
 */

/**
 * A single choice presented to the reader at a narrative node.
 * Creates a directed edge in the narrative graph to another node.
 * May carry an optional condition string that gates traversal.
 */
export interface Choice {
  /** Unique identifier for this choice edge (e.g. `"c1a"`). */
  id: string
  /** Human-readable label shown to the reader (e.g. `"Open the door"`). */
  text: string
  /** The ID of the node this choice leads to. */
  target: string
  /** Optional condition expression (e.g. `"has_key == true"`). If `null`, the edge is unconditional. */
  condition: string | null
}

/**
 * A single narrative node — one scene or decision point in the story graph.
 * Contains structural data only (no prose). Nodes with `is_ending: true`
 * represent valid story conclusions.
 */
export interface GraphNode {
  /** Unique identifier for this node (e.g. `"node_5"`). */
  id: string
  /** Whether this node is a valid story ending. */
  is_ending: boolean
  /** State mutations applied when this node is visited (e.g. `{ "has_wand": true }`). */
  set_state: Record<string, boolean | string>
  /** Outgoing choices (edges) available to the reader at this node. */
  choices: Choice[]
}

/**
 * Top-level normalized graph structure — the sole input to structural validation.
 * Contains the narrative skeleton: nodes, edges, conditions, and state mutations.
 * No prose or textual content — that lives in {@link TextDictionary}.
 */
export interface NormalizedGraph {
  /** Human-readable title of the narrative. */
  title: string
  /** Schema version string (e.g. `"1.0"`). */
  version: string
  /** The ID of the node where the story begins. Must match one of the node IDs. */
  start_node: string
  /** All narrative nodes in the graph. Order does not matter. */
  nodes: GraphNode[]
}

/**
 * A single node's textual content in the text dictionary.
 * Contains prose, character state descriptions, and established facts
 * used for semantic analysis and dashboard display.
 */
export interface TextDictionaryNode {
  /** The narrative prose displayed to the reader at this node. */
  prose: string
  /** Descriptions of character states at this point (e.g. `"Volkov is dead"`). */
  character_states: string[]
  /** Facts established by this scene that could matter later. */
  established_facts: string[]
}

/**
 * The text dictionary — maps each node ID to its textual content.
 * Consumed by the semantic validator (Hindsight) and the dashboard sidebar.
 * Separated from the normalized graph to keep structural validation text-free.
 */
export interface TextDictionary {
  /** Title of the narrative. */
  title: string
  /** Global narrative world rules (e.g. `"No supernatural elements"`). */
  world_rules: string[]
  /** Maps node ID → textual content for that node. */
  nodes: Record<string, TextDictionaryNode>
}

/**
 * A snapshot of the accumulated narrative state at a specific node.
 * Captures the full state map after applying the node's `set_state` mutations,
 * enabling step-by-step state inspection along a valid path.
 */
export interface StateSnapshot {
  /** The node ID where this snapshot was taken. */
  node_id: string
  /** The accumulated state at this point in the path. */
  state: Record<string, boolean | string>
}

/**
 * A single valid end-to-end path through the narrative graph.
 * Represents one possible reading from `start_node` to an `is_ending` node.
 * Used by the Hindsight semantic-AI module for continuity analysis.
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
  /** Always `true` for paths in the output (reserved for future filtering). */
  is_valid: boolean
}

/**
 * Output structure for valid paths — contains summary metadata
 * and the full list of valid paths through the narrative graph.
 */
export interface ValidPathsOutput {
  /** Summary statistics about the graph and validation results. */
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
  /** All valid end-to-end paths from `start_node` to an `is_ending` node. */
  valid_paths: ValidPath[]
}

/**
 * A single structural fault detected by one of the five validation algorithms.
 * Identifies the type of problem, the primary node involved, a human-readable
 * message, and the full list of affected nodes.
 */
export interface StructuralFault {
  /** Sequential fault identifier (e.g. `"sf_001"`). */
  fault_id: string
  /** Fault type: `"DEAD_END"`, `"UNREACHABLE"`, `"INFINITE_LOOP"`, or `"LOCKED_CONDITION"`. */
  type: string
  /** Severity level: `"error"` (blocks the reader) or `"warning"` (content issue). */
  severity: 'error' | 'warning'
  /** The primary node where this fault is anchored. */
  node_id: string
  /** Human-readable description of the fault with context for identification. */
  message: string
  /** All node IDs involved in this fault (e.g. all nodes in an infinite loop cycle). */
  affected_nodes: string[]
  /** Path IDs affected by this fault (currently unused, reserved for future use). */
  affected_paths: string[]
}

/**
 * A single semantic fault detected by the Hindsight AI during narrative analysis.
 * These are softer "warnings" compared to structural faults — they identify
 * narrative continuity errors like dead characters reappearing.
 */
export interface SemanticFault {
  /** Sequential fault identifier (e.g. `"sem_001"`). */
  fault_id: string
  /** Fault type (e.g. `"CHARACTER_CONTINUITY"`, `"WORLD_RULE_VIOLATION"`). */
  type: string
  /** Severity based on Hindsight confidence: ≥0.85 = `"error"`, else `"warning"`. */
  severity: 'error' | 'warning'
  /** The primary node where the semantic error was detected. */
  node_id: string
  /** The path ID on which this fault was observed. */
  path_id: string
  /** Human-readable description of the narrative contradiction. */
  message: string
  /** All node IDs involved in this fault. */
  affected_nodes: string[]
  /** Hindsight's confidence score (0.0 – 1.0) for this finding. */
  hindsight_confidence: number
}

/**
 * A reachable ending node with a truncated prose preview.
 * Used by the dashboard sidebar to display valid story conclusions.
 */
export interface ValidEnding {
  /** The node ID of the ending. */
  node_id: string
  /** First ~150 characters of the ending's prose text. */
  prose_preview: string
}

/**
 * Complete result object returned by the structural validation endpoint.
 * Contains all faults detected, valid endings, and full valid paths data.
 */
export interface StructuralResult {
  /** Title of the validated narrative. */
  narrative_title: string
  /** ISO 8601 timestamp of when validation was performed. */
  validated_at: string
  /** All structural faults detected by the five algorithms. */
  structural_faults: StructuralFault[]
  /** All reachable ending nodes with prose previews. */
  valid_endings: ValidEnding[]
  /** Full valid paths output with metadata. */
  valid_paths: ValidPathsOutput
}

/**
 * Complete result object returned by the semantic validation endpoint.
 * Contains all semantic faults detected by Hindsight analysis.
 */
export interface SemanticResult {
  /** Title of the validated narrative. */
  narrative_title: string
  /** ISO 8601 timestamp of when validation was performed. */
  validated_at: string
  /** All semantic faults detected across all valid paths. */
  semantic_faults: SemanticFault[]
}

/**
 * The combined result returned by the `/api/ingest` endpoint.
 * Contains both the structural graph and the textual dictionary
 * extracted from raw literature by the Groq LLM.
 */
export interface IngestResult {
  /** The structural skeleton of the narrative graph. */
  normalized_graph: NormalizedGraph
  /** The textual content dictionary for each node. */
  text_dictionary: TextDictionary
}
