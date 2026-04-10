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
        .map(|node_id| ValidEnding {
            node_id: node_id.clone(),
            prose_preview: format!("[Ending at {}]", node_id),
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

// ── Pretty-print helpers ──────────────────────────────────────

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

fn print_algo_result_ok(name: &str, num: usize, count: usize, unit: &str) {
    println!("  [{}/5] {:<28}✓ {} {}", num, name, count, unit);
}
