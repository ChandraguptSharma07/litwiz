// ──────────────────────────────────────────────────────────────
//  types.rs — All data structures for the NVE Core Engine
//
//  Input types  → deserialized from normalized_graph.json
//  Output types → serialized to structural_faults.json and valid_paths.json
// ──────────────────────────────────────────────────────────────

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ─── State Alias ───────────────────────────────────────────────
/// The narrative game state at any point in the story.
///
/// Maps variable names (e.g. `"has_torch"`) to JSON values (booleans,
/// strings, or numbers). State is accumulated along a path by merging
/// each node's `set_state` map. Used by the condition evaluator to
/// gate edge traversal.
pub type State = HashMap<String, serde_json::Value>;

// ═══════════════════════════════════════════════════════════════
//  INPUT TYPES — from normalized_graph.json
// ═══════════════════════════════════════════════════════════════

/// Top-level normalized graph structure.
///
/// This is the sole input to the core engine, produced by the ingestion
/// module. It contains a title, version string, a designated start node
/// ID, and the full list of narrative nodes.
#[derive(Debug, Deserialize, Clone)]
pub struct NormalizedGraph {
    /// Human-readable title of the narrative (e.g. "Harry Potter and the Sorcerer's Stone").
    pub title: String,
    /// Schema version string (e.g. "1.0").
    pub version: String,
    /// The ID of the node where the story begins. Must match one of the node IDs.
    pub start_node: String,
    /// All narrative nodes in the graph. Order does not matter.
    pub nodes: Vec<Node>,
}

/// A single narrative node — one scene or beat in the branching story.
///
/// Each node has an ID, optional prose text, state mutations, and
/// outgoing choices (edges) leading to other nodes. Nodes marked
/// `is_ending = true` are valid story conclusions.
#[derive(Debug, Deserialize, Clone)]
pub struct Node {
    /// Unique identifier for this node (e.g. `"sorted_gryffindor"`).
    pub id: String,
    /// The narrative prose text displayed to the reader at this node.
    /// Defaults to empty string if not present in the input JSON.
    #[serde(default)]
    pub prose: String,
    /// Whether this node is a valid story ending. If `true`, a reader
    /// reaching this node has completed the narrative.
    pub is_ending: bool,
    /// State mutations applied when this node is visited. Each key-value
    /// pair is merged into the running state (e.g. `{"has_wand": true}`).
    pub set_state: HashMap<String, serde_json::Value>,
    /// Outgoing choices available to the reader at this node.
    /// An empty `choices` list on a non-ending node is a dead end (fault).
    pub choices: Vec<Choice>,
}

/// A choice the reader can make, creating a directed edge to another node.
///
/// Choices may carry an optional condition string (e.g. `"has_torch == true"`)
/// that gates traversal — the reader can see the choice text but cannot
/// select it unless the current state satisfies the condition.
#[derive(Debug, Deserialize, Clone)]
pub struct Choice {
    /// Unique identifier for this choice edge.
    pub id: String,
    /// Human-readable label shown to the reader (e.g. "Open the door").
    pub text: String,
    /// The ID of the node this choice leads to.
    pub target: String,
    /// Optional condition expression. Format: `"key operator value"`
    /// (e.g. `"has_key == true"`, `"gold != 0"`). If `None`, the edge
    /// is unconditional.
    pub condition: Option<String>,
}

// ═══════════════════════════════════════════════════════════════
//  INTERNAL TYPES — petgraph edge weight
// ═══════════════════════════════════════════════════════════════

/// Weight on a directed edge in the petgraph representation.
///
/// Carries the choice metadata (ID, display text, and optional condition)
/// so validation algorithms can inspect edge properties without looking
/// up the original `Choice` struct.
#[derive(Debug, Clone)]
pub struct ChoiceEdge {
    /// The original choice ID from the input JSON.
    pub choice_id: String,
    /// The display text of the choice.
    pub text: String,
    /// Optional condition gating this edge.
    pub condition: Option<String>,
}

// ═══════════════════════════════════════════════════════════════
//  OUTPUT TYPES — structural_faults.json
// ═══════════════════════════════════════════════════════════════

/// A single structural fault detected by one of the five validation algorithms.
///
/// Each fault identifies the type of problem, the primary node involved,
/// a human-readable message (including prose context for identification),
/// and the full list of affected nodes.
#[derive(Debug, Serialize, Clone)]
pub struct StructuralFault {
    /// Sequential fault identifier (e.g. `"sf_001"`).
    pub fault_id: String,
    /// Fault type: `"DEAD_END"`, `"UNREACHABLE"`, `"INFINITE_LOOP"`, or `"LOCKED_CONDITION"`.
    #[serde(rename = "type")]
    pub fault_type: String,
    /// Severity level: `"error"` (blocks the reader) or `"warning"` (content issue).
    pub severity: String,
    /// The primary node where this fault is anchored.
    pub node_id: String,
    /// Human-readable description including truncated prose for identification.
    pub message: String,
    /// All node IDs involved in this fault (e.g. all nodes in an infinite loop cycle).
    pub affected_nodes: Vec<String>,
    /// Path IDs affected by this fault (currently unused, reserved for future use).
    pub affected_paths: Vec<String>,
}

/// The full fault payload serialized to `structural_faults.json`.
///
/// Contains structural faults, a placeholder for semantic faults
/// (populated by the Hindsight semantic-AI module), and the list
/// of valid story endings.
#[derive(Debug, Serialize)]
pub struct FaultPayload {
    /// Title of the narrative being validated.
    pub narrative_title: String,
    /// ISO 8601 timestamp of when validation was performed.
    pub validated_at: String,
    /// All structural faults detected by the five algorithms.
    pub structural_faults: Vec<StructuralFault>,
    /// Semantic faults (empty from the core engine; populated by Hindsight).
    pub semantic_faults: Vec<serde_json::Value>,
    /// All reachable ending nodes with prose previews.
    pub valid_endings: Vec<ValidEnding>,
}

/// A reachable ending node with a truncated prose preview.
///
/// Used by the dashboard sidebar to display story conclusions
/// with enough context for identification.
#[derive(Debug, Serialize, Clone)]
pub struct ValidEnding {
    /// The node ID of the ending.
    pub node_id: String,
    /// First ~150 characters of the ending's prose text.
    pub prose_preview: String,
}

// ═══════════════════════════════════════════════════════════════
//  OUTPUT TYPES — valid_paths.json
// ═══════════════════════════════════════════════════════════════

/// Top-level output structure for `valid_paths.json`.
///
/// Contains summary metadata and the full list of valid paths
/// through the narrative graph.
#[derive(Debug, Serialize)]
pub struct ValidPathsOutput {
    /// Summary statistics about the graph and validation results.
    pub metadata: PathMetadata,
    /// All valid end-to-end paths from `start_node` to an `is_ending` node.
    pub valid_paths: Vec<ValidPath>,
}

/// Summary statistics written to the metadata section of `valid_paths.json`.
#[derive(Debug, Serialize)]
pub struct PathMetadata {
    /// Total number of nodes in the graph.
    pub total_nodes: usize,
    /// Total number of edges (choices) in the graph.
    pub total_edges: usize,
    /// Number of valid end-to-end paths discovered.
    pub valid_path_count: usize,
    /// Number of structural faults detected.
    pub structural_fault_count: usize,
}

/// A single valid end-to-end path through the narrative graph.
///
/// Represents one possible reading of the story from `start_node`
/// to an `is_ending` node. Each path includes the ordered sequence
/// of visited nodes and a snapshot of the accumulated state at each step.
/// Used by the Hindsight semantic-AI module for continuity analysis.
#[derive(Debug, Serialize, Clone)]
pub struct ValidPath {
    /// Sequential path identifier (e.g. `"path_42"`).
    pub path_id: String,
    /// Ordered list of node IDs visited along this path.
    pub node_sequence: Vec<String>,
    /// State snapshot at each node (parallel to `node_sequence`).
    pub state_at_each_node: Vec<StateSnapshot>,
    /// The ID of the ending node where this path terminates.
    pub ending_node: String,
    /// Always `true` for paths in the output (reserved for future filtering).
    pub is_valid: bool,
}

/// A snapshot of the accumulated narrative state at a specific node.
///
/// Captures the full state map after applying the node's `set_state`
/// mutations, enabling step-by-step state inspection along a path.
#[derive(Debug, Serialize, Clone)]
pub struct StateSnapshot {
    /// The node ID where this snapshot was taken.
    pub node_id: String,
    /// The accumulated state at this point in the path.
    pub state: State,
}
