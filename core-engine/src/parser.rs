// ──────────────────────────────────────────────────────────────
//  parser.rs — JSON ingestion + petgraph construction
//
//  Reads normalized_graph.json into typed structs, then builds
//  a petgraph DiGraph with node-index lookup for the validators.
// ──────────────────────────────────────────────────────────────

use std::collections::HashMap;
use std::error::Error;
use std::fs;

use petgraph::graph::{DiGraph, NodeIndex};

use crate::types::*;

/// Holds the petgraph representation of the narrative graph plus
/// lookup maps needed by every validation algorithm.
///
/// Built by [`build_petgraph`] from a parsed [`NormalizedGraph`].
pub struct GraphData {
    /// Directed graph where node weights are node ID strings and
    /// edge weights are [`ChoiceEdge`] structs containing choice metadata.
    pub graph: DiGraph<String, ChoiceEdge>,
    /// Maps node ID string → petgraph `NodeIndex` for O(1) lookup.
    pub node_indices: HashMap<String, NodeIndex>,
    /// Maps node ID string → full `Node` struct for attribute access
    /// (e.g. `is_ending`, `set_state`, `prose`).
    pub node_map: HashMap<String, Node>,
}

/// Parse a `normalized_graph.json` file from disk into a typed [`NormalizedGraph`].
///
/// Performs basic validation: ensures the `start_node` ID exists among
/// the listed nodes. Returns an error if the file cannot be read, the
/// JSON is malformed, or the start node is missing.
///
/// # Arguments
/// * `path` — Filesystem path to the JSON file.
///
/// # Errors
/// Returns `Err` if the file can't be read, JSON parsing fails, or
/// `start_node` doesn't match any node ID.
pub fn parse_graph(path: &str) -> Result<NormalizedGraph, Box<dyn Error>> {
    let content = fs::read_to_string(path)?;
    parse_graph_from_str(&content)
}

/// Parse a `normalized_graph` JSON string into a typed [`NormalizedGraph`].
///
/// Performs the same basic validation as `parse_graph` but operates entirely
/// in-memory without filesystem access constraints. Useful for WASM environments.
pub fn parse_graph_from_str(content: &str) -> Result<NormalizedGraph, Box<dyn Error>> {
    let graph: NormalizedGraph = serde_json::from_str(content)?;

    // Validate start_node exists
    let node_ids: Vec<&str> = graph.nodes.iter().map(|n| n.id.as_str()).collect();
    if !node_ids.contains(&graph.start_node.as_str()) {
        return Err(format!(
            "start_node '{}' not found among {} nodes",
            graph.start_node,
            graph.nodes.len()
        )
        .into());
    }

    Ok(graph)
}

/// Build a `petgraph` `DiGraph` from the parsed normalized graph.
///
/// This is the core data structure used by all validation algorithms.
/// Phase 1 adds all nodes, Phase 2 wires up all edges from choices.
/// Prints warnings to stderr for any choice targeting a non-existent node.
///
/// # Arguments
/// * `normalized` — Reference to the parsed graph.
///
/// # Returns
/// A [`GraphData`] containing the directed graph, node index lookup,
/// and node attribute lookup.
pub fn build_petgraph(normalized: &NormalizedGraph) -> GraphData {
    let mut graph = DiGraph::new();
    let mut node_indices = HashMap::new();
    let mut node_map = HashMap::new();

    // Phase 1: Add all nodes
    for node in &normalized.nodes {
        let idx = graph.add_node(node.id.clone());
        node_indices.insert(node.id.clone(), idx);
        node_map.insert(node.id.clone(), node.clone());
    }

    // Phase 2: Add all edges (choices → directed edges)
    for node in &normalized.nodes {
        let src_idx = node_indices[&node.id];
        for choice in &node.choices {
            if let Some(&tgt_idx) = node_indices.get(&choice.target) {
                graph.add_edge(
                    src_idx,
                    tgt_idx,
                    ChoiceEdge {
                        choice_id: choice.id.clone(),
                        text: choice.text.clone(),
                        condition: choice.condition.clone(),
                    },
                );
            } else {
                eprintln!(
                    "  ⚠ Warning: choice '{}' targets non-existent node '{}'",
                    choice.id, choice.target
                );
            }
        }
    }

    GraphData {
        graph,
        node_indices,
        node_map,
    }
}
