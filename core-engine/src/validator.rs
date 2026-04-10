// ──────────────────────────────────────────────────────────────
//  validator.rs — The five structural validation algorithms
//
//  1. Dead End Detection
//  2. Unreachable Node Detection  (BFS)
//  3. Infinite Loop Detection     (Tarjan SCC)
//  4. Locked Condition Detection  (DFS + state simulation)
//  5. Valid Path Generation       (DFS + state tracking)
// ──────────────────────────────────────────────────────────────

use std::collections::{HashMap, HashSet};

use petgraph::algo::tarjan_scc;
use petgraph::graph::NodeIndex;
use petgraph::visit::{Bfs, EdgeRef};

use crate::parser::GraphData;
use crate::types::*;

// ═══════════════════════════════════════════════════════════════
//  ALGORITHM 1 — Dead End Detection
// ═══════════════════════════════════════════════════════════════
//
//  For each node N:
//    if out_degree(N) == 0 AND N.is_ending == false:
//      FAULT: DEAD_END on N
//
//  A dead-end traps the reader — they reach a node with no
//  choices and no narrative conclusion.
// ───────────────────────────────────────────────────────────────

pub fn detect_dead_ends(graph_data: &GraphData) -> Vec<StructuralFault> {
    let mut faults = Vec::new();

    for node in graph_data.node_map.values() {
        if node.choices.is_empty() && !node.is_ending {
            faults.push(StructuralFault {
                fault_id: String::new(), // assigned later
                fault_type: "DEAD_END".to_string(),
                severity: "error".to_string(),
                node_id: node.id.clone(),
                message: format!(
                    "Node has no outgoing choices and is not marked as an ending. \
                     A reader who reaches {} is permanently stuck.",
                    node.id
                ),
                affected_nodes: vec![node.id.clone()],
                affected_paths: vec![],
            });
        }
    }

    // Sort by node ID for deterministic output
    faults.sort_by(|a, b| a.node_id.cmp(&b.node_id));
    faults
}

// ═══════════════════════════════════════════════════════════════
//  ALGORITHM 2 — Unreachable Node Detection
// ═══════════════════════════════════════════════════════════════
//
//  Run BFS from start_node.
//  For each node N not visited: FAULT: UNREACHABLE on N
//
//  Unreachable nodes are wasted content — no reader can ever
//  reach them regardless of their choices.
// ───────────────────────────────────────────────────────────────

pub fn detect_unreachable(
    graph_data: &GraphData,
    start_node: &str,
) -> Vec<StructuralFault> {
    let start_idx = match graph_data.node_indices.get(start_node) {
        Some(&idx) => idx,
        None => return vec![], // shouldn't happen, parser validates
    };

    // BFS from start
    let mut bfs = Bfs::new(&graph_data.graph, start_idx);
    let mut visited: HashSet<NodeIndex> = HashSet::new();
    while let Some(node_idx) = bfs.next(&graph_data.graph) {
        visited.insert(node_idx);
    }

    // Find unreachable nodes
    let mut unreachable_ids: Vec<String> = Vec::new();
    for (node_id, &idx) in &graph_data.node_indices {
        if !visited.contains(&idx) {
            unreachable_ids.push(node_id.clone());
        }
    }
    unreachable_ids.sort();

    // Build the set once for affected_nodes cross-references
    let unreachable_set: HashSet<&str> =
        unreachable_ids.iter().map(|s| s.as_str()).collect();

    let mut faults = Vec::new();
    for node_id in &unreachable_ids {
        // Find all unreachable nodes reachable FROM this one (its cluster)
        let mut cluster: Vec<String> = vec![node_id.clone()];
        if let Some(&idx) = graph_data.node_indices.get(node_id.as_str()) {
            let mut cluster_bfs = Bfs::new(&graph_data.graph, idx);
            while let Some(next) = cluster_bfs.next(&graph_data.graph) {
                let next_id = &graph_data.graph[next];
                if next_id != node_id && unreachable_set.contains(next_id.as_str()) {
                    cluster.push(next_id.clone());
                }
            }
        }
        cluster.sort();
        cluster.dedup();

        faults.push(StructuralFault {
            fault_id: String::new(),
            fault_type: "UNREACHABLE".to_string(),
            severity: "warning".to_string(),
            node_id: node_id.clone(),
            message: format!(
                "No path from the start node reaches {}. \
                 It forms an isolated cluster with {} node(s) \
                 but has no incoming edges from the main graph.",
                node_id,
                cluster.len()
            ),
            affected_nodes: cluster,
            affected_paths: vec![],
        });
    }

    faults
}

// ═══════════════════════════════════════════════════════════════
//  ALGORITHM 3 — Infinite Loop Detection
// ═══════════════════════════════════════════════════════════════
//
//  Find strongly connected components (Tarjan's algorithm).
//  For each SCC with no exit edge to any node outside the SCC:
//    FAULT: INFINITE_LOOP on all nodes in that SCC
//
//  An inescapable cycle traps the reader in an infinite loop
//  with no way to reach an ending.
// ───────────────────────────────────────────────────────────────

pub fn detect_infinite_loops(graph_data: &GraphData) -> Vec<StructuralFault> {
    let sccs = tarjan_scc(&graph_data.graph);
    let mut faults = Vec::new();

    for scc in &sccs {
        // Single-node SCCs are not cycles unless there's a self-loop
        if scc.len() == 1 {
            let node_idx = scc[0];
            let has_self_loop = graph_data
                .graph
                .edges(node_idx)
                .any(|e| e.target() == node_idx);
            if !has_self_loop {
                continue;
            }
        }

        let scc_set: HashSet<NodeIndex> = scc.iter().cloned().collect();

        // Check if ANY node in the SCC has an outgoing edge to a node OUTSIDE the SCC
        let has_exit = scc.iter().any(|&node_idx| {
            graph_data
                .graph
                .edges(node_idx)
                .any(|edge| !scc_set.contains(&edge.target()))
        });

        if has_exit {
            continue; // escapable cycle — not a fault
        }

        // Check if the SCC contains an ending node (an ending is a valid stop)
        let contains_ending = scc.iter().any(|&node_idx| {
            let node_id = &graph_data.graph[node_idx];
            graph_data
                .node_map
                .get(node_id)
                .map_or(false, |n| n.is_ending)
        });

        if contains_ending {
            continue; // the reader can choose to end here
        }

        // This SCC is an inescapable cycle
        let mut affected: Vec<String> = scc
            .iter()
            .map(|&idx| graph_data.graph[idx].clone())
            .collect();
        affected.sort();

        let cycle_str = affected.join(" → ");

        faults.push(StructuralFault {
            fault_id: String::new(),
            fault_type: "INFINITE_LOOP".to_string(),
            severity: "error".to_string(),
            node_id: affected[0].clone(),
            message: format!(
                "Cycle detected with no exit: {}. \
                 A reader entering this cycle can never reach an ending.",
                cycle_str
            ),
            affected_nodes: affected,
            affected_paths: vec![],
        });
    }

    faults
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

pub fn detect_locked_conditions(
    normalized: &NormalizedGraph,
    graph_data: &GraphData,
) -> Vec<StructuralFault> {
    // First, determine which nodes are reachable (skip unreachable ones —
    // they're already flagged by Algorithm 2)
    let reachable = compute_reachable_set(graph_data, &normalized.start_node);

    let mut faults = Vec::new();

    for node in &normalized.nodes {
        if !reachable.contains(&node.id) {
            continue;
        }

        for choice in &node.choices {
            let condition = match &choice.condition {
                Some(c) => c,
                None => continue, // unconditional edge — skip
            };

            // Compute all possible states at this node (the choice's source)
            let states_at_source =
                compute_all_states_at(normalized, graph_data, &node.id);

            // Check if ANY state satisfies the condition
            let satisfiable = states_at_source
                .iter()
                .any(|state| evaluate_condition(condition, state));

            if !satisfiable {
                faults.push(StructuralFault {
                    fault_id: String::new(),
                    fault_type: "LOCKED_CONDITION".to_string(),
                    severity: "error".to_string(),
                    node_id: choice.target.clone(),
                    message: format!(
                        "Edge requires {}, but no path to {} sets the required state. \
                         Choice '{}' can never be selected.",
                        condition, node.id, choice.text
                    ),
                    affected_nodes: vec![node.id.clone(), choice.target.clone()],
                    affected_paths: vec![],
                });
            }
        }
    }

    faults.sort_by(|a, b| a.node_id.cmp(&b.node_id));
    faults
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

pub fn generate_valid_paths(
    normalized: &NormalizedGraph,
    graph_data: &GraphData,
) -> Vec<ValidPath> {
    let mut paths: Vec<ValidPath> = Vec::new();
    let mut visited: HashSet<String> = HashSet::new();

    dfs_paths(
        &normalized.start_node,
        &State::new(),
        &mut vec![],
        &mut vec![],
        &mut visited,
        &graph_data.node_map,
        &mut paths,
    );

    // Assign sequential path IDs
    for (i, path) in paths.iter_mut().enumerate() {
        path.path_id = format!("path_{}", i + 1);
    }

    paths
}

/// Recursive DFS that builds valid paths from current node to any ending.
fn dfs_paths(
    current_id: &str,
    incoming_state: &State,
    path_so_far: &mut Vec<String>,
    snapshots_so_far: &mut Vec<StateSnapshot>,
    visited: &mut HashSet<String>,
    node_map: &HashMap<String, Node>,
    results: &mut Vec<ValidPath>,
) {
    // Cycle guard
    if visited.contains(current_id) {
        return;
    }

    let node = match node_map.get(current_id) {
        Some(n) => n,
        None => return, // dangling reference
    };

    visited.insert(current_id.to_string());

    // Apply this node's set_state to the incoming state
    let mut state = incoming_state.clone();
    for (key, value) in &node.set_state {
        state.insert(key.clone(), value.clone());
    }

    // Record this node
    path_so_far.push(current_id.to_string());
    snapshots_so_far.push(StateSnapshot {
        node_id: current_id.to_string(),
        state: state.clone(),
    });

    // If this is an ending node, record the complete path
    if node.is_ending {
        results.push(ValidPath {
            path_id: String::new(), // assigned later
            node_sequence: path_so_far.clone(),
            state_at_each_node: snapshots_so_far.clone(),
            ending_node: current_id.to_string(),
            is_valid: true,
        });
    } else {
        // Continue DFS through each traversable choice
        for choice in &node.choices {
            // Check condition gating
            if let Some(ref condition) = choice.condition {
                if !evaluate_condition(condition, &state) {
                    continue; // condition not met — skip this edge
                }
            }

            dfs_paths(
                &choice.target,
                &state,
                path_so_far,
                snapshots_so_far,
                visited,
                node_map,
                results,
            );
        }
    }

    // Backtrack
    path_so_far.pop();
    snapshots_so_far.pop();
    visited.remove(current_id);
}

// ═══════════════════════════════════════════════════════════════
//  HELPER — Condition Evaluator
// ═══════════════════════════════════════════════════════════════

/// Evaluate a condition string like "has_torch == true" against
/// the current game state. Supports == and != operators.
/// Returns true if there's no parseable condition (fail-open).
fn evaluate_condition(condition: &str, state: &State) -> bool {
    let parts: Vec<&str> = condition.split_whitespace().collect();

    if parts.len() != 3 {
        eprintln!(
            "  ⚠ Warning: unparseable condition '{}', assuming true",
            condition
        );
        return true;
    }

    let key = parts[0];
    let operator = parts[1];
    let value_str = parts[2];

    // Parse the expected value into a serde_json::Value
    let expected = match value_str {
        "true" => serde_json::Value::Bool(true),
        "false" => serde_json::Value::Bool(false),
        s => {
            // Try parsing as a number, else treat as string
            if let Ok(n) = s.parse::<i64>() {
                serde_json::Value::Number(n.into())
            } else {
                serde_json::Value::String(s.to_string())
            }
        }
    };

    let actual = state.get(key);

    match operator {
        "==" => actual == Some(&expected),
        "!=" => actual != Some(&expected),
        _ => {
            eprintln!(
                "  ⚠ Warning: unknown operator '{}' in condition, assuming true",
                operator
            );
            true
        }
    }
}

// ═══════════════════════════════════════════════════════════════
//  HELPER — Reachable Set (for filtering Algorithm 4)
// ═══════════════════════════════════════════════════════════════

/// BFS from start_node, returns set of all reachable node IDs.
fn compute_reachable_set(graph_data: &GraphData, start_node: &str) -> HashSet<String> {
    let mut reachable = HashSet::new();

    if let Some(&start_idx) = graph_data.node_indices.get(start_node) {
        let mut bfs = Bfs::new(&graph_data.graph, start_idx);
        while let Some(node_idx) = bfs.next(&graph_data.graph) {
            reachable.insert(graph_data.graph[node_idx].clone());
        }
    }

    reachable
}

// ═══════════════════════════════════════════════════════════════
//  HELPER — All Possible States at a Node (for Algorithm 4)
// ═══════════════════════════════════════════════════════════════

/// DFS from start_node to target_node, collecting all possible
/// accumulated states at the target. Used to check condition
/// satisfiability.
fn compute_all_states_at(
    normalized: &NormalizedGraph,
    graph_data: &GraphData,
    target_node_id: &str,
) -> Vec<State> {
    let mut results = Vec::new();
    let mut visited = HashSet::new();

    dfs_states(
        &normalized.start_node,
        target_node_id,
        &State::new(),
        &mut visited,
        &graph_data.node_map,
        &mut results,
    );

    results
}

/// Recursive DFS for state accumulation.
fn dfs_states(
    current_id: &str,
    target_id: &str,
    incoming_state: &State,
    visited: &mut HashSet<String>,
    node_map: &HashMap<String, Node>,
    results: &mut Vec<State>,
) {
    if visited.contains(current_id) {
        return;
    }

    let node = match node_map.get(current_id) {
        Some(n) => n,
        None => return,
    };

    visited.insert(current_id.to_string());

    // Apply this node's set_state
    let mut state = incoming_state.clone();
    for (key, value) in &node.set_state {
        state.insert(key.clone(), value.clone());
    }

    // If we've reached the target, record the state
    if current_id == target_id {
        results.push(state);
        visited.remove(current_id);
        return;
    }

    // Continue exploring choices
    for choice in &node.choices {
        // For locked condition analysis, we still need to respect
        // conditions on intermediate edges
        if let Some(ref condition) = choice.condition {
            if !evaluate_condition(condition, &state) {
                continue;
            }
        }

        dfs_states(
            &choice.target,
            target_id,
            &state,
            visited,
            node_map,
            results,
        );
    }

    visited.remove(current_id);
}
