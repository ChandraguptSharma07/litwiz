// ──────────────────────────────────────────────────────────────
//  Ingestion Module — Splits a narrative JSON into two contracts
//
//  Takes a single authored JSON file containing both structural
//  and textual data, and produces two output files:
//
//    1. normalized_graph.json — Structure only (IDs, edges, state)
//       → consumed by the Core Engine for validation
//
//    2. text_dictionary.json  — Text only (prose, character states)
//       → consumed by the Dashboard for display
//
//  Usage:
//    cargo run -- <input_file.json>
//
//  Output directory: contracts/
// ──────────────────────────────────────────────────────────────

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::env;
use std::fs;
use std::path::Path;

// ─── Input Types ──────────────────────────────────────────────
// Deserialized from the authored narrative JSON file.

/// A reader choice that creates a directed edge to another node.
///
/// Used in both the input and output schemas — choices pass through
/// the ingestion module unchanged.
#[derive(Debug, Deserialize, Serialize)]
struct Choice {
    /// Unique identifier for this choice.
    id: String,
    /// Human-readable label shown to the reader.
    text: String,
    /// The ID of the node this choice leads to.
    target: String,
    /// Optional condition expression gating this edge (e.g. `"has_key == true"`).
    condition: Option<String>,
}

/// A narrative node as authored in the input JSON file.
///
/// Contains both structural data (edges, state mutations) and
/// textual data (prose, character states) that will be split
/// during ingestion.
#[derive(Debug, Deserialize)]
struct InputNode {
    /// Unique node identifier.
    id: String,
    /// The narrative prose displayed to the reader at this node.
    prose: String,
    /// Whether this node is a valid story ending.
    is_ending: bool,
    /// State mutations applied when this node is visited.
    #[serde(default)]
    set_state: HashMap<String, serde_json::Value>,
    /// Descriptions of character states at this point in the story.
    #[serde(default)]
    character_states: Vec<String>,
    /// Facts established by this node's narrative.
    #[serde(default)]
    established_facts: Vec<String>,
    /// Outgoing choices (edges) from this node.
    #[serde(default)]
    choices: Vec<Choice>,
}

/// Top-level structure of the authored narrative JSON input file.
///
/// Contains metadata (title, version), world rules, the start node,
/// and all narrative nodes with their full content.
#[derive(Debug, Deserialize)]
struct InputJson {
    /// Human-readable title of the narrative.
    title: String,
    /// Schema version string (e.g. `"1.0"`).
    version: String,
    /// Global narrative rules that apply across all nodes.
    #[serde(default)]
    world_rules: Vec<String>,
    /// The ID of the node where the story begins.
    start_node: String,
    /// All narrative nodes in the graph.
    nodes: Vec<InputNode>,
}

// ─── Output Types: Normalized Graph ───────────────────────────
// Structure-only representation consumed by the Core Engine.

/// A node in the normalized graph — contains only structural data.
///
/// All textual content (prose, character states, established facts)
/// is stripped out and placed in the [`TextDictionary`] instead.
#[derive(Debug, Serialize)]
struct GraphNode {
    /// Unique node identifier.
    id: String,
    /// Whether this node is a valid story ending.
    is_ending: bool,
    /// State mutations applied when this node is visited.
    set_state: HashMap<String, serde_json::Value>,
    /// Outgoing choices (edges) from this node.
    choices: Vec<Choice>,
}

/// The normalized graph output written to `contracts/normalized_graph.json`.
///
/// Contains only the structural skeleton of the narrative:
/// node IDs, edge connections, conditions, and state mutations.
/// No prose or textual content — that lives in the text dictionary.
#[derive(Debug, Serialize)]
struct NormalizedGraph {
    /// Title of the narrative.
    title: String,
    /// Schema version string.
    version: String,
    /// ID of the starting node.
    start_node: String,
    /// All nodes with structural data only.
    nodes: Vec<GraphNode>,
}

// ─── Output Types: Text Dictionary ────────────────────────────
// Text-only representation consumed by the Dashboard.

/// A node's textual content in the text dictionary.
///
/// Contains the narrative prose, character state descriptions,
/// and established facts — everything needed for display but
/// irrelevant to structural validation.
#[derive(Debug, Serialize)]
struct TextNode {
    /// The narrative prose shown to the reader.
    prose: String,
    /// Character state descriptions at this story beat.
    character_states: Vec<String>,
    /// Facts established by this scene.
    established_facts: Vec<String>,
}

/// The text dictionary output written to `contracts/text_dictionary.json`.
///
/// Maps each node ID to its textual content. Used by the dashboard
/// to display prose, character states, and facts when a node is
/// selected in the graph visualization.
#[derive(Debug, Serialize)]
struct TextDictionary {
    /// Title of the narrative.
    title: String,
    /// Global narrative world rules.
    world_rules: Vec<String>,
    /// Maps node ID → textual content for that node.
    nodes: HashMap<String, TextNode>,
}

/// Entry point for the ingestion module.
///
/// Reads an authored narrative JSON file, splits each node into
/// structural data (for the Core Engine) and textual data (for the
/// Dashboard), and writes two output files to the `contracts/` directory:
///
/// 1. `normalized_graph.json` — Structure only (IDs, edges, state)
/// 2. `text_dictionary.json`  — Text only (prose, character states)
///
/// # Arguments
/// Takes a single CLI argument: the path to the input JSON file.
///
/// # Exit Codes
/// - `0` — Ingestion completed successfully.
/// - `1` — Usage error or processing failure.
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = env::args().collect();
    if args.len() < 2 {
        eprintln!("Usage: {} <input_file.json>", args[0]);
        std::process::exit(1);
    }

    let input_path = &args[1];
    let input_data = fs::read_to_string(input_path)?;
    let input: InputJson = serde_json::from_str(&input_data)?;

    let mut graph_nodes = Vec::new();
    let mut text_nodes = HashMap::new();

    for node in input.nodes {
        graph_nodes.push(GraphNode {
            id: node.id.clone(),
            is_ending: node.is_ending,
            set_state: node.set_state,
            choices: node.choices,
        });

        text_nodes.insert(
            node.id,
            TextNode {
                prose: node.prose,
                character_states: node.character_states,
                established_facts: node.established_facts,
            },
        );
    }

    let normalized_graph = NormalizedGraph {
        title: input.title.clone(),
        version: input.version,
        start_node: input.start_node,
        nodes: graph_nodes,
    };

    let text_dictionary = TextDictionary {
        title: input.title,
        world_rules: input.world_rules,
        nodes: text_nodes,
    };

    let contracts_dir = Path::new("contracts");
    if !contracts_dir.exists() {
        fs::create_dir_all(contracts_dir)?;
    }

    let graph_json = serde_json::to_string_pretty(&normalized_graph)?;
    fs::write(contracts_dir.join("normalized_graph.json"), graph_json)?;

    let text_dict_json = serde_json::to_string_pretty(&text_dictionary)?;
    fs::write(contracts_dir.join("text_dictionary.json"), text_dict_json)?;

    println!("Ingestion complete. Output written to contracts/ directory.");
    Ok(())
}
