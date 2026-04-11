//! # NVE Core Engine
//!
//! The Narrative Validation Engine (NVE) Core Engine is a Rust library that performs
//! structural validation on branching narrative graphs. It detects five categories
//! of structural faults and generates all valid end-to-end paths through the story.
//!
//! ## Architecture
//!
//! The engine is composed of three modules:
//!
//! - **[`parser`]** — Reads a `normalized_graph.json` file, deserializes it into
//!   typed Rust structs, and builds a directed graph (via `petgraph`) with O(1)
//!   node lookup for the validators.
//!
//! - **[`types`]** — All data structures: input types (deserialized from JSON),
//!   internal types (petgraph edge weights), and output types (serialized to
//!   `structural_faults.json` and `valid_paths.json`).
//!
//! - **[`validator`]** — The five structural validation algorithms:
//!   1. Dead End Detection
//!   2. Unreachable Node Detection (BFS)
//!   3. Infinite Loop Detection (Tarjan SCC)
//!   4. Locked Condition Detection (DFS + state simulation)
//!   5. Valid Path Generation (DFS + state tracking)
//!
//! ## Usage
//!
//! ```bash
//! nve-validate <path-to-normalized_graph.json>
//! ```
//!
//! When the input file is inside the project's `demo/` directory, the engine
//! automatically deploys the results to `dashboard/src/data/` for live preview.

pub mod parser;
pub mod types;
pub mod validator;

use serde_json::json;

#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

/// Validate a narrative graph JSON string and return a JSON string of results.
/// 
/// This is the entry point for the WASM build.
#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
pub fn wasm_validate(graph_json: &str) -> String {
    // 1. Parse the string directly (no file I/O)
    let normalized = match parser::parse_graph_from_str(graph_json) {
        Ok(g) => g,
        Err(e) => {
            return json!({ "error": format!("Failed to parse graph JSON: {}", e) }).to_string();
        }
    };

    let graph_data = parser::build_petgraph(&normalized);

    // 2. Run validations
    let mut all_faults: Vec<types::StructuralFault> = Vec::new();
    
    let mut dead_ends = validator::detect_dead_ends(&graph_data);
    let mut unreachable = validator::detect_unreachable(&graph_data, &normalized.start_node);
    let mut loops = validator::detect_infinite_loops(&graph_data);
    let mut locked_conditions = validator::detect_locked_conditions(&normalized, &graph_data);
    
    all_faults.append(&mut dead_ends);
    all_faults.append(&mut unreachable);
    all_faults.append(&mut loops);
    all_faults.append(&mut locked_conditions);

    // Generate paths and endings
    let valid_paths = validator::generate_valid_paths(&normalized, &graph_data);
    
    use std::collections::HashSet;
    let ending_ids: Vec<String> = valid_paths
        .iter()
        .map(|p| p.ending_node.clone())
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();

    let mut valid_endings: Vec<types::ValidEnding> = ending_ids
        .iter()
        .map(|node_id| {
            let prose = graph_data
                .node_map
                .get(node_id.as_str())
                .map(|n| {
                    if n.prose.len() > 150 {
                        let truncated = &n.prose[..150];
                        if let Some(last_space) = truncated.rfind(' ') {
                            format!("{}…", &n.prose[..last_space])
                        } else {
                            format!("{}…", truncated)
                        }
                    } else {
                        n.prose.clone()
                    }
                })
                .unwrap_or_else(|| format!("[Ending at {}]", node_id));
            types::ValidEnding {
                node_id: node_id.clone(),
                prose_preview: prose,
            }
        })
        .collect();
    valid_endings.sort_by(|a, b| a.node_id.cmp(&b.node_id));

    // 3. Serialize structural faults
    let structural_output = types::FaultPayload {
        narrative_title: normalized.title.clone(),
        validated_at: "".to_string(), // Omit or mock for WASM
        structural_faults: all_faults,
        semantic_faults: vec![],
        valid_endings,
    };

    serde_json::to_string(&structural_output).unwrap_or_else(|e| {
        json!({ "error": format!("Failed to serialize results: {}", e) }).to_string()
    })
}
