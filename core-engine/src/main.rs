// ──────────────────────────────────────────────────────────────
//  main.rs — CLI entry point for the NVE Core Engine
//
//  Usage:
//    nve-validate <path-to-normalized_graph.json>
//
//  Outputs:
//    - structural_faults.json (in same directory as input)
//    - valid_paths.json       (in same directory as input)
//
//  Exit codes:
//    0 = no structural faults found (clean)
//    1 = structural faults detected
//    2 = usage error / parse failure
// ──────────────────────────────────────────────────────────────

use std::collections::HashSet;
use std::env;
use std::path::Path;
use std::process;

use nve_validate::parser;
use nve_validate::types::*;
use nve_validate::validator;

/// CLI entry point for the NVE Core Engine.
///
/// Parses a `normalized_graph.json` file, runs all five structural
/// validation algorithms, writes output files, and optionally
/// auto-deploys results to the dashboard if the input is from `demo/`.
///
/// # Exit Codes
/// - `0` — No structural faults detected (clean).
/// - `1` — Structural faults were found.
/// - `2` — Usage error or JSON parse failure.
fn main() {
    let args: Vec<String> = env::args().collect();

    if args.len() < 2 {
        eprintln!("Usage: nve-validate <path-to-normalized_graph.json>");
        process::exit(2);
    }

    let input_path = &args[1];
    let output_dir = Path::new(input_path)
        .parent()
        .unwrap_or_else(|| Path::new("."));

    // ── Banner ─────────────────────────────────────────────
    println!();
    println!("╔══════════════════════════════════════════════════╗");
    println!("║  NVE Core Engine — Structural Validator          ║");
    println!("╚══════════════════════════════════════════════════╝");
    println!();

    // ── Step 1: Parse ──────────────────────────────────────
    println!("Loading: {}", input_path);
    let normalized = match parser::parse_graph(input_path) {
        Ok(g) => g,
        Err(e) => {
            eprintln!("  ✗ Failed to parse: {}", e);
            process::exit(2);
        }
    };

    let graph_data = parser::build_petgraph(&normalized);
    let total_edges: usize = normalized.nodes.iter().map(|n| n.choices.len()).sum();

    println!(
        "  → {} nodes, {} edges loaded",
        normalized.nodes.len(),
        total_edges
    );
    println!("  → Title: \"{}\"", normalized.title);
    println!("  → Start node: {}", normalized.start_node);
    println!();
    println!("Running validation...");
    println!();

    // ── Step 2: Run all 5 algorithms ───────────────────────
    let mut all_faults: Vec<StructuralFault> = Vec::new();

    // Algorithm 1: Dead End Detection
    let dead_ends = validator::detect_dead_ends(&graph_data);
    print_algo_result("Dead End Detection", 1, dead_ends.len());
    for fault in &dead_ends {
        println!("         └─ {} ({})", fault.node_id, fault.fault_type);
    }
    all_faults.extend(dead_ends);

    // Algorithm 2: Unreachable Node Detection
    let unreachable = validator::detect_unreachable(&graph_data, &normalized.start_node);
    print_algo_result("Unreachable Nodes", 2, unreachable.len());
    for fault in &unreachable {
        println!("         └─ {} ({})", fault.node_id, fault.fault_type);
    }
    all_faults.extend(unreachable);

    // Algorithm 3: Infinite Loop Detection
    let loops = validator::detect_infinite_loops(&graph_data);
    print_algo_result("Infinite Loop Detection", 3, loops.len());
    for fault in &loops {
        println!(
            "         └─ {} ({})",
            fault.affected_nodes.join(" → "),
            fault.fault_type
        );
    }
    all_faults.extend(loops);

    // Algorithm 4: Locked Condition Detection
    let locked = validator::detect_locked_conditions(&normalized, &graph_data);
    print_algo_result("Locked Conditions", 4, locked.len());
    for fault in &locked {
        println!("         └─ {} ({})", fault.node_id, fault.fault_type);
    }
    all_faults.extend(locked);

    // Assign sequential fault IDs across all algorithms
    for (i, fault) in all_faults.iter_mut().enumerate() {
        fault.fault_id = format!("sf_{:03}", i + 1);
    }

    // Algorithm 5: Valid Path Generation
    let valid_paths = validator::generate_valid_paths(&normalized, &graph_data);
    print_algo_result_ok("Valid Path Generation", 5, valid_paths.len(), "path(s)");
    for path in &valid_paths {
        println!(
            "         └─ {} → {} ({} nodes)",
            path.path_id,
            path.ending_node,
            path.node_sequence.len()
        );
    }

    println!();
    println!("═══════════════════════════════════════════════════");

    // ── Collect valid endings (deduplicated) ───────────────
    let ending_ids: Vec<String> = valid_paths
        .iter()
        .map(|p| p.ending_node.clone())
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();

    let mut valid_endings: Vec<ValidEnding> = ending_ids
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
            ValidEnding {
                node_id: node_id.clone(),
                prose_preview: prose,
            }
        })
        .collect();
    valid_endings.sort_by(|a, b| a.node_id.cmp(&b.node_id));

    let fault_count = all_faults.len();
    println!(
        "RESULTS: {} structural fault(s), {} valid path(s), {} valid ending(s)",
        fault_count,
        valid_paths.len(),
        valid_endings.len()
    );
    println!("═══════════════════════════════════════════════════");
    println!();

    // ── Step 3: Write output files ────────────────────────
    let validated_at = chrono::Utc::now().to_rfc3339();

    let structural_output = FaultPayload {
        narrative_title: normalized.title.clone(),
        validated_at,
        structural_faults: all_faults,
        semantic_faults: vec![],
        valid_endings,
    };

    let valid_paths_output = ValidPathsOutput {
        metadata: PathMetadata {
            total_nodes: normalized.nodes.len(),
            total_edges: total_edges,
            valid_path_count: valid_paths.len(),
            structural_fault_count: fault_count,
        },
        valid_paths,
    };

    let faults_path = output_dir.join("structural_faults.json");
    let paths_path = output_dir.join("valid_paths.json");

    match serde_json::to_string_pretty(&structural_output) {
        Ok(json) => {
            if let Err(e) = std::fs::write(&faults_path, json) {
                eprintln!("  ✗ Failed to write {}: {}", faults_path.display(), e);
                process::exit(2);
            }
        }
        Err(e) => {
            eprintln!("  ✗ Failed to serialize structural faults: {}", e);
            process::exit(2);
        }
    }

    match serde_json::to_string_pretty(&valid_paths_output) {
        Ok(json) => {
            if let Err(e) = std::fs::write(&paths_path, json) {
                eprintln!("  ✗ Failed to write {}: {}", paths_path.display(), e);
                process::exit(2);
            }
        }
        Err(e) => {
            eprintln!("  ✗ Failed to serialize valid paths: {}", e);
            process::exit(2);
        }
    }

    println!("Output written to:");
    println!("  → {}", faults_path.display());
    println!("  → {}", paths_path.display());
    println!();

    // ── Step 4: Auto-deploy to dashboard ──────────────────
    // Only auto-deploy if the input file is inside the project's demo/ directory.
    let input_canonical = Path::new(input_path).canonicalize().ok();
    let is_from_demo = input_canonical
        .as_ref()
        .and_then(|p| p.parent())
        .map(|parent| {
            parent
                .file_name()
                .map_or(false, |name| name == "demo")
        })
        .unwrap_or(false);

    let dashboard_data = if is_from_demo {
        input_canonical.as_ref().and_then(|p| {
            // Walk up to find the project root (contains 'dashboard' dir)
            let mut dir = p.parent()?.to_path_buf();
            for _ in 0..5 {
                if dir.join("dashboard").join("src").join("data").is_dir() {
                    return Some(dir.join("dashboard").join("src").join("data"));
                }
                dir = dir.parent()?.to_path_buf();
            }
            None
        })
    } else {
        None
    };

    if let Some(dash_dir) = dashboard_data {
        // Copy the graph
        let _ = std::fs::copy(input_path, dash_dir.join("mock_normalized_graph.json"));

        // Copy faults
        let faults_json = serde_json::to_string_pretty(&structural_output).unwrap();
        let _ = std::fs::write(dash_dir.join("mock_fault_payload.json"), &faults_json);

        // Copy paths
        let paths_json = serde_json::to_string_pretty(&valid_paths_output).unwrap();
        let _ = std::fs::write(dash_dir.join("mock_valid_paths.json"), &paths_json);

        // Generate text dictionary natively
        let mut dict_nodes = serde_json::Map::new();
        for node in &normalized.nodes {
            let mut entry = serde_json::Map::new();
            entry.insert("prose".to_string(), serde_json::Value::String(node.prose.clone()));

            // character_states and established_facts are optional in the Node struct,
            // so we read them from the raw JSON source
            let raw: serde_json::Value = serde_json::from_str(
                &std::fs::read_to_string(input_path).unwrap_or_default()
            ).unwrap_or_default();

            if let Some(raw_nodes) = raw.get("nodes").and_then(|n| n.as_array()) {
                if let Some(raw_node) = raw_nodes.iter().find(|rn| {
                    rn.get("id").and_then(|v| v.as_str()) == Some(&node.id)
                }) {
                    if let Some(cs) = raw_node.get("character_states") {
                        entry.insert("character_states".to_string(), cs.clone());
                    }
                    if let Some(ef) = raw_node.get("established_facts") {
                        entry.insert("established_facts".to_string(), ef.clone());
                    }
                }
            }

            dict_nodes.insert(node.id.clone(), serde_json::Value::Object(entry));
        }

        let mut dict = serde_json::Map::new();
        dict.insert("title".to_string(), serde_json::Value::String(normalized.title.clone()));

        // Read world_rules from raw JSON
        let raw_full: serde_json::Value = serde_json::from_str(
            &std::fs::read_to_string(input_path).unwrap_or_default()
        ).unwrap_or_default();
        if let Some(wr) = raw_full.get("world_rules") {
            dict.insert("world_rules".to_string(), wr.clone());
        }
        dict.insert("nodes".to_string(), serde_json::Value::Object(dict_nodes));

        let dict_json = serde_json::to_string_pretty(&serde_json::Value::Object(dict)).unwrap();
        let _ = std::fs::write(dash_dir.join("mock_text_dictionary.json"), &dict_json);

        println!("Dashboard auto-deployed to:");
        println!("  → {}/", dash_dir.display());
        println!();
    }

    if fault_count > 0 {
        println!(
            "Exit code: 1 ({} structural fault(s) detected)",
            fault_count
        );
        println!();
        process::exit(1);
    } else {
        println!("Exit code: 0 (clean — no structural faults)");
        println!();
        process::exit(0);
    }
}

/// Print a validation algorithm result line showing fault count.
///
/// Shows a green checkmark (`✓`) for zero faults, or a blue square (`■`)
/// with the fault count otherwise.
///
/// # Arguments
/// * `name` — Algorithm display name (e.g. `"Dead End Detection"`).
/// * `num` — Algorithm number (1–5).
/// * `count` — Number of faults detected.
fn print_algo_result(name: &str, num: usize, count: usize) {
    if count == 0 {
        println!("  [{}/5] {:<28}✓ no faults", num, name);
    } else {
        println!(
            "  [{}/5] {:<28}■ {} fault(s) found",
            num, name, count
        );
    }
}

/// Print a validation algorithm result line for non-fault outputs.
///
/// Always shows a green checkmark with a count and custom unit label
/// (e.g. `"✓ 8 path(s)"`).
///
/// # Arguments
/// * `name` — Algorithm display name.
/// * `num` — Algorithm number (1–5).
/// * `count` — Number of items found.
/// * `unit` — Label for the items (e.g. `"path(s)"`).
fn print_algo_result_ok(name: &str, num: usize, count: usize, unit: &str) {
    println!("  [{}/5] {:<28}✓ {} {}", num, name, count, unit);
}
