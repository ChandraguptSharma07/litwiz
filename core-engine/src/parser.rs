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

/// Holds the petgraph representation plus lookup maps needed by
/// every validation algorithm.
pub struct GraphData {
    /// Directed graph: node weight = node ID string, edge weight = ChoiceEdge.
    pub graph: DiGraph<String, ChoiceEdge>,
    /// Maps node ID → petgraph NodeIndex for O(1) lookup.
    pub node_indices: HashMap<String, NodeIndex>,
    /// Maps node ID → full Node struct for attribute access.
    pub node_map: HashMap<String, Node>,
}

/// Parse the normalized_graph.json file into a typed struct.
pub fn parse_graph(path: &str) -> Result<NormalizedGraph, Box<dyn Error>> {
    let content = fs::read_to_string(path)?;
    let graph: NormalizedGraph = serde_json::from_str(&content)?;

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

/// Build a petgraph DiGraph from the parsed normalized graph.
/// Returns GraphData with the graph, node indices, and node map.
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
