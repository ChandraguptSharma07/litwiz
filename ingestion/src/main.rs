use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::env;
use std::fs;
use std::path::Path;

#[derive(Debug, Deserialize, Serialize)]
struct Choice {
    id: String,
    text: String,
    target: String,
    condition: Option<String>,
}

#[derive(Debug, Deserialize)]
struct InputNode {
    id: String,
    prose: String,
    is_ending: bool,
    #[serde(default)]
    set_state: HashMap<String, serde_json::Value>,
    #[serde(default)]
    character_states: Vec<String>,
    #[serde(default)]
    established_facts: Vec<String>,
    #[serde(default)]
    choices: Vec<Choice>,
}

#[derive(Debug, Deserialize)]
struct InputJson {
    title: String,
    version: String,
    #[serde(default)]
    world_rules: Vec<String>,
    start_node: String,
    nodes: Vec<InputNode>,
}

// Normalized Graph Structs
#[derive(Debug, Serialize)]
struct GraphNode {
    id: String,
    is_ending: bool,
    set_state: HashMap<String, serde_json::Value>,
    choices: Vec<Choice>,
}

#[derive(Debug, Serialize)]
struct NormalizedGraph {
    title: String,
    version: String,
    start_node: String,
    nodes: Vec<GraphNode>,
}

// Text Dictionary Structs
#[derive(Debug, Serialize)]
struct TextNode {
    prose: String,
    character_states: Vec<String>,
    established_facts: Vec<String>,
}

#[derive(Debug, Serialize)]
struct TextDictionary {
    title: String,
    world_rules: Vec<String>,
    nodes: HashMap<String, TextNode>,
}

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
