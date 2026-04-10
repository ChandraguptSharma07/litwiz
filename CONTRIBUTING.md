# LitWiz — Narrative Validation Engine (NVE)

## What Is This Project?

**LitWiz NVE** is a tool that reads a piece of literature (a branching story, a choose-your-own-adventure book, a visual novel script) and automatically finds **bugs** in it — plot holes, dead ends, unreachable scenes, impossible conditions, and narrative contradictions.

Think of it as a **linter for stories**. Just like ESLint finds bugs in your JavaScript code, NVE finds bugs in your narrative.

---

## The Problem We're Solving

Imagine writing a 50-chapter branching story where the hero can pick up a sword in Chapter 3 **or** skip it. Then in Chapter 12, the hero uses that sword to fight a dragon. A human playtester might never notice the bug — because they always happened to pick up the sword. But a reader who skipped Chapter 3 hits a **plot hole**: the hero swings a sword they never picked up.

With 50 nodes and 3 choices each, there are potentially **thousands** of reading paths. No human can test them all. **NVE does it in milliseconds.**

---

## How It Works — The Pipeline

The system is a **4-stage pipeline**. Data flows left to right:

```
┌──────────┐    ┌─────────────┐    ┌──────────────┐    ┌────────────┐
│ INGESTION│───▶│ CORE ENGINE │───▶│  SEMANTIC AI  │───▶│ DASHBOARD  │
│  (Rust)  │    │   (Rust)    │    │  (TypeScript) │    │  (React)   │
└──────────┘    └─────────────┘    └──────────────┘    └────────────┘
     ▲                                                       ▲
     │              ┌──────────┐                             │
     └──────────────│  SERVER  │─────────────────────────────┘
                    │ (Node.js)│
                    └──────────┘
```

### Stage 1: Ingestion (`ingestion/`)
**Language:** Rust  
**What it does:** Takes raw story files (`.json` or `.html` Twine exports) and converts them into two standardized contract files that the rest of the pipeline understands.

**Input:** A story file (e.g., `demo/death_note.json`)  
**Output:**
- `contracts/normalized_graph.json` — The structure (nodes + edges)
- `contracts/text_dictionary.json` — The prose text for each node

### Stage 2: Core Engine (`core-engine/`)
**Language:** Rust  
**What it does:** Reads the normalized graph and runs **5 structural validation algorithms** to find bugs:

| Algorithm | What It Finds |
|---|---|
| Dead-End Detection | Nodes with no choices that aren't marked as endings (reader gets stuck) |
| Reachability Analysis | Nodes that exist but can never be reached from the start (wasted content) |
| Cycle Detection | Infinite loops where the reader goes in circles forever |
| Condition Gating Audit | Choices that require a state (e.g., `has_sword == true`) but no path to that choice ever sets that state |
| Path Enumeration | Every possible reading path from start to every ending |

**Input:** `contracts/normalized_graph.json`  
**Output:**
- `contracts/structural_faults.json` — Every bug found, with type, severity, and affected nodes
- `contracts/valid_paths.json` — Every valid reading path through the story

### Stage 3: Semantic AI (`semantic-ai/`)
**Language:** TypeScript  
**What it does:** Uses Claude AI (Anthropic) to find **story-level** bugs that math can't catch. For example: "The character is described as dead in Chapter 5, but speaks again in Chapter 9."

This stage is optional and requires an `ANTHROPIC_API_KEY`.

**Input:** The normalized graph + text dictionary  
**Output:** Semantic faults added to the fault payload

### Stage 4: Dashboard (`dashboard/`)
**Language:** React + TypeScript + D3.js  
**What it does:** Visual frontend that renders the entire story as an interactive **Obsidian-style graph**. Each node is a scene, each edge is a choice. Bugs are highlighted with different shapes and colors.

**Runs on:** `http://localhost:5173`

---

## The Server (`server/`)

**Language:** Node.js + Express + TypeScript  
**What it does:** API server that connects the dashboard to the backend engines. The dashboard sends requests to the server, which runs ingestion and validation.

**Runs on:** `http://localhost:3001`

### API Endpoints

| Endpoint | Method | What It Does |
|---|---|---|
| `/api/ingest` | POST | Takes raw text, uses AI to extract a narrative graph |
| `/api/validate/structural` | POST | Runs the 5 structural algorithms on a graph |
| `/api/validate/semantic` | POST | Runs Hindsight (semantic AI) on a graph |
| `/api/health` | GET | Returns `{ status: "ok" }` |

---

## Project Structure

```
litwiz/
├── ingestion/              # 🦀 Rust — parses raw story files into contracts
│   ├── Cargo.toml
│   └── src/
│       └── main.rs         # Entry point: reads .json or .html, outputs contracts
│
├── core-engine/            # 🦀 Rust — structural validation (the math brain)
│   ├── Cargo.toml
│   └── src/
│       ├── main.rs         # CLI entry point
│       ├── lib.rs          # Library exports
│       ├── types.rs        # Data structures (NormalizedGraph, Fault, etc.)
│       ├── parser.rs       # JSON parsing logic
│       └── validator.rs    # The 5 validation algorithms
│
├── server/                 # 🟢 Node.js — API server
│   └── src/
│       ├── index.ts        # Express server setup + routes
│       ├── ingest.ts       # AI-powered text → graph conversion
│       ├── structural.ts   # Calls core-engine for structural validation
│       ├── semantic.ts     # Calls Hindsight for semantic validation
│       └── types.ts        # TypeScript type definitions
│
├── dashboard/              # ⚛️ React — visual frontend
│   └── src/
│       ├── App.tsx         # Main app: state management, data flow
│       ├── index.css       # Global styles + CSS variables
│       ├── components/
│       │   ├── Header.tsx        # Top bar with action buttons
│       │   ├── Sidebar.tsx       # Error list + path browser
│       │   ├── GraphCanvas2D.tsx # D3 force-directed graph (the main visual)
│       │   └── LiteratureInput.tsx # Text input modal
│       ├── lib/
│       │   └── types.ts    # Shared TypeScript types
│       └── data/           # Mock data for "Load Demo" button
│
├── semantic-ai/            # 🤖 Hindsight — Claude-powered semantic analysis
│   └── src/
│       ├── index.ts        # Entry point
│       ├── hindsight.ts    # Claude API integration
│       ├── validate.ts     # Semantic validation logic
│       └── types.ts        # Type definitions
│
├── contracts/              # 📄 JSON contracts — the shared data format
│   ├── normalized_graph.json     # Output from ingestion
│   ├── text_dictionary.json      # Output from ingestion
│   ├── structural_faults.json    # Output from core-engine
│   ├── valid_paths.json          # Output from core-engine
│   └── semantic_faults.json      # Output from semantic-ai
│
├── demo/                   # 📖 Example stories for testing
│   ├── death_note.json           # 47-node Death Note saga
│   ├── neon_shadows_heist.json   # 52-node cyberpunk heist
│   └── journey_under_the_sea.json # Small starter story
│
├── orchestrator/           # 🔧 Shell scripts for running the pipeline
├── start.sh                # One command to start everything
└── .env.example            # Environment variables template
```

---

## The Contract System

All modules communicate through **JSON contract files** in the `contracts/` folder. No module talks to another directly — they just read/write JSON. This means:

- You can swap out the Rust core-engine for a Python one, and nothing else changes
- You can test each module independently
- You can inspect exactly what data flows between stages

### Contract Files

#### `normalized_graph.json` — The Structure
```json
{
  "title": "Death Note",
  "start_node": "node_1",
  "world_rules": ["The Death Note kills anyone whose name is written in it"],
  "nodes": [
    {
      "id": "node_1",
      "is_ending": false,
      "set_state": { "has_death_note": true },
      "choices": [
        { "id": "c1a", "text": "Use the notebook", "target": "node_2", "condition": null },
        { "id": "c1b", "text": "Destroy it", "target": "node_3", "condition": null }
      ]
    }
  ]
}
```

#### `text_dictionary.json` — The Prose
```json
{
  "nodes": {
    "node_1": {
      "prose": "Light Yagami finds a black notebook...",
      "character_states": ["Light is a normal student"],
      "established_facts": ["Death Note fell from the sky"]
    }
  }
}
```

#### `structural_faults.json` — The Bugs
```json
{
  "structural_faults": [
    {
      "fault_id": "sf_001",
      "type": "DEAD_END",
      "severity": "error",
      "node_id": "node_27",
      "message": "Node has no outgoing choices and is not marked as an ending.",
      "affected_nodes": ["node_27"]
    }
  ]
}
```

---

## The Graph Visualization

The dashboard renders an **interactive force-directed graph** using D3.js. Each node type has a unique shape and color:

| Shape | Color | Meaning |
|---|---|---|
| ◆ Diamond | Electric Blue `#4fc3f7` | Start node — where the story begins |
| ● Circle | Periwinkle `#7c8cf8` | Normal scene — regular story node |
| ■ Square | Warm Gold `#ffd54f` | Ending — valid conclusion to the story |
| ▲ Triangle | Hot Pink `#ff6b9d` | Dead end — reader gets stuck here |
| ✚ Cross | Gray-Lavender `#8e8ea0` | Unreachable — no path leads here |
| ★ Star | Vivid Violet `#c77dff` | Semantic fault — AI found a contradiction |

### Interactions
- **Hover** a node → dims all unrelated nodes, highlights connections
- **Click** a node → selects it, shows details in sidebar, camera pans to it
- **Drag** a node → repositions it, physics re-adjusts
- **Scroll** → zoom in/out
- **Click + drag background** → pan the view

---

## How To Run

### Prerequisites
- **Rust** (for ingestion + core-engine): `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- **Node.js 18+** (for server + dashboard): Install from [nodejs.org](https://nodejs.org)

### First-Time Setup

```bash
# 1. Build the Rust modules
cd ingestion && cargo build && cd ..
cd core-engine && cargo build && cd ..

# 2. Install Node dependencies
cd server && npm install && cd ..
cd dashboard && npm install && cd ..

# 3. Create .env file for the server
cp server/.env.example server/.env
# (Add your ANTHROPIC_API_KEY if you want semantic validation)
```

### Running the Full Stack

```bash
# One command starts both server and dashboard:
./start.sh

# Dashboard: http://localhost:5173
# API Server: http://localhost:3001
```

### Running the Pipeline Manually (CLI)

```bash
# Step 1: Ingest a story
./ingestion/target/debug/nve-ingest demo/death_note.json

# Step 2: Validate the structure
./core-engine/target/debug/nve-validate contracts/normalized_graph.json

# Step 3: Check the results
cat contracts/structural_faults.json
```

---

## How To Add A New Story

Create a JSON file in `demo/` following this structure:

```json
{
  "title": "My Story Title",
  "version": "1.0",
  "world_rules": ["Rule 1", "Rule 2"],
  "start_node": "node_1",
  "nodes": [
    {
      "id": "node_1",
      "prose": "The story text the reader sees...",
      "is_ending": false,
      "set_state": {},
      "character_states": ["hero is alive"],
      "established_facts": ["location = forest"],
      "choices": [
        {
          "id": "c1a",
          "text": "Go left",
          "target": "node_2",
          "condition": null
        },
        {
          "id": "c1b",
          "text": "Go right",
          "target": "node_3",
          "condition": "has_sword == true"
        }
      ]
    }
  ]
}
```

### Key Rules
- Every node needs a unique `id`
- Every choice's `target` must point to an existing node `id`
- Set `"is_ending": true` on nodes that are valid story conclusions
- Use `set_state` to set variables (e.g., `{ "has_sword": true }`)
- Use `condition` on choices to gate them behind state (e.g., `"has_sword == true"`)
- Nodes with no choices and `is_ending: false` will be flagged as **dead ends**
- Nodes with no incoming edges will be flagged as **unreachable**

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | Server port (default: `3001`) |
| `ANTHROPIC_API_KEY` | Only for semantic AI | Claude API key for Hindsight |

---

## Tech Stack Summary

| Module | Language | Framework | Purpose |
|---|---|---|---|
| `ingestion/` | Rust | serde, scraper | Parse raw stories into contracts |
| `core-engine/` | Rust | serde | Structural validation algorithms |
| `server/` | TypeScript | Express, Node.js | API server connecting frontend to backend |
| `dashboard/` | TypeScript | React, Vite, D3.js | Interactive graph visualization |
| `semantic-ai/` | TypeScript | Anthropic SDK | AI-powered story contradiction detection |

---

## Current Demo Stories

| Story | Nodes | Paths | Faults | File |
|---|---|---|---|---|
| Death Note: Complete Saga | 47 | 4,547 | 3 (unreachable ORACLE nodes) | `demo/death_note.json` |
| Neon Shadows: Heist of Arcadia Tower | 52 | 623 | 7 (dead ends, unreachable, locked) | `demo/neon_shadows_heist.json` |
| Journey Under the Sea | 10 | ~15 | varies | `demo/journey_under_the_sea.json` |
