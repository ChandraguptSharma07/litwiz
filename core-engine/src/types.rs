// ──────────────────────────────────────────────────────────────
//  types.rs — All data structures for the NVE Core Engine
//
//  Input types  → deserialized from normalized_graph.json
//  Output types → serialized to structural_faults.json and valid_paths.json
// ──────────────────────────────────────────────────────────────

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ─── State Alias ───────────────────────────────────────────────
/// Game state at any point in the narrative: variable name → value.
/// Values are booleans or strings (never nested objects per contract).
pub type State = HashMap<String, serde_json::Value>;

// ═══════════════════════════════════════════════════════════════
//  INPUT TYPES — from normalized_graph.json
// ═══════════════════════════════════════════════════════════════

/// Top-level normalized graph structure. This is the sole input
/// to the core engine, produced by the ingestion module.
#[derive(Debug, Deserialize, Clone)]
pub struct NormalizedGraph {
    pub title: String,
    pub version: String,
    pub start_node: String,
    pub nodes: Vec<Node>,
}

/// A single narrative node — one scene in the branching story.
#[derive(Debug, Deserialize, Clone)]
pub struct Node {
    pub id: String,
    pub is_ending: bool,
    pub set_state: HashMap<String, serde_json::Value>,
    pub choices: Vec<Choice>,
}

/// A choice the reader can make, leading to another node.
/// May carry a condition (e.g. "has_torch == true") that gates traversal.
#[derive(Debug, Deserialize, Clone)]
pub struct Choice {
    pub id: String,
    pub text: String,
    pub target: String,
    pub condition: Option<String>,
}

// ═══════════════════════════════════════════════════════════════
//  INTERNAL TYPES — petgraph edge weight
// ═══════════════════════════════════════════════════════════════

/// Weight on a directed edge in the petgraph representation.
/// Carries the choice metadata so algorithms can inspect conditions.
#[derive(Debug, Clone)]
pub struct ChoiceEdge {
    pub choice_id: String,
    pub text: String,
    pub condition: Option<String>,
}

// ═══════════════════════════════════════════════════════════════
//  OUTPUT TYPES — structural_faults.json
// ═══════════════════════════════════════════════════════════════

/// A single structural fault detected by one of the 5 algorithms.
#[derive(Debug, Serialize, Clone)]
pub struct StructuralFault {
    pub fault_id: String,
    #[serde(rename = "type")]
    pub fault_type: String,
    pub severity: String,
    pub node_id: String,
    pub message: String,
    pub affected_nodes: Vec<String>,
    pub affected_paths: Vec<String>,
}

/// The full fault payload written to structural_faults.json.
/// Includes empty semantic_faults placeholder (populated by semantic-ai module).
#[derive(Debug, Serialize)]
pub struct FaultPayload {
    pub narrative_title: String,
    pub validated_at: String,
    pub structural_faults: Vec<StructuralFault>,
    pub semantic_faults: Vec<serde_json::Value>,
    pub valid_endings: Vec<ValidEnding>,
}

/// A reachable ending node with prose preview.
#[derive(Debug, Serialize, Clone)]
pub struct ValidEnding {
    pub node_id: String,
    pub prose_preview: String,
}

// ═══════════════════════════════════════════════════════════════
//  OUTPUT TYPES — valid_paths.json
// ═══════════════════════════════════════════════════════════════

/// Top-level valid_paths.json output.
#[derive(Debug, Serialize)]
pub struct ValidPathsOutput {
    pub metadata: PathMetadata,
    pub valid_paths: Vec<ValidPath>,
}

/// Summary statistics about the graph and validation results.
#[derive(Debug, Serialize)]
pub struct PathMetadata {
    pub total_nodes: usize,
    pub total_edges: usize,
    pub valid_path_count: usize,
    pub structural_fault_count: usize,
}

/// A single valid end-to-end path through the narrative graph,
/// from start_node to an is_ending node, with state snapshots.
#[derive(Debug, Serialize, Clone)]
pub struct ValidPath {
    pub path_id: String,
    pub node_sequence: Vec<String>,
    pub state_at_each_node: Vec<StateSnapshot>,
    pub ending_node: String,
    pub is_valid: bool,
}

/// State snapshot at a specific node along a path.
#[derive(Debug, Serialize, Clone)]
pub struct StateSnapshot {
    pub node_id: String,
    pub state: State,
}
