# NVE — Narrative Validation Engine

> Feed it any piece of literature. It builds a graph. It finds the bugs.

NVE is a two-engine validation system for branching and linear narratives. A **Rust graph engine** catches structural impossibilities with mathematical certainty — dead ends, unreachable nodes, infinite loops, locked conditions. A **Hindsight AI layer** reads the actual story and catches semantic errors that have no mathematical representation — a character alive after their own death, knowledge a protagonist couldn't have, world rules silently broken.

The web interface accepts anything: paste a novel excerpt, upload a screenplay, drop in a game script. Claude (via Groq) extracts the narrative structure automatically.

---

## Architecture

```
Browser (React + Vite)
        │
        │  POST /api/ingest
        │  POST /api/validate/structural
        │  POST /api/validate/semantic
        ▼
  Express Server  ──────►  Groq API (llama-3.3-70b)
        │                  narrative structure extraction
        │
        ├──  Structural Validator  (TypeScript)
        │    5 graph algorithms, no external dependencies
        │
        └──  Semantic Validator  ────►  Hindsight Docker
             retain/reflect per path    LLM story reasoning
```

The three stages are sequential and gated. Structural must pass before semantic runs. The UI enforces this — the Hindsight button is disabled until structural is clean.

---

## Modules

| Folder | Language | Role |
|---|---|---|
| `server/` | TypeScript + Express | API server, ingestion, structural & semantic validation |
| `dashboard/` | React + Vite + Cytoscape.js | Interactive graph visualization |
| `core-engine/` | Rust + petgraph | Standalone CLI validator (offline/pipeline use) |
| `ingestion/` | Rust | Standalone CLI ingestion parser (pipeline use) |
| `semantic-ai/` | TypeScript | Standalone CLI Hindsight validator (pipeline use) |
| `contracts/` | JSON | Shared data schemas + mock data for dev |
| `demo/` | JSON | Pre-encoded narrative with planted bugs |
| `orchestrator/` | Bash | Chains the CLI pipeline end-to-end |

The `server/` module is what powers the web interface. The Rust CLI modules and `semantic-ai/` are for the offline pipeline (`orchestrator/run.sh`).

---

## Prerequisites

- **Node.js** 18+
- **Rust** 1.75+ (only needed for CLI pipeline, not the web interface)
- **Groq API key** — [console.groq.com](https://console.groq.com) — free tier is sufficient
- **Hindsight Docker** — only needed for semantic validation (optional, see below)

---

## Quickstart — Web Interface

**1. Start the server**

```bash
cd server
cp .env.example .env
# Edit .env and add your GROQ_API_KEY
npm install
npm run dev
```

The server starts on `http://localhost:3001`.

**2. Start the dashboard**

```bash
cd dashboard
npm install
npm run dev
```

Dashboard at `http://localhost:5173`. The Vite dev server proxies all `/api` calls to `:3001` automatically — no CORS issues.

**3. Use it**

- Open `http://localhost:5173`
- Click **✦ Load Literature** in the header
- Paste any text or upload a `.txt` / `.md` file
- Click **▶ Parse with AI** — Groq extracts the narrative graph
- Click **▶ Run Structural** — 5 algorithms validate the graph structure
- Click **◈ Run Hindsight** — Hindsight finds semantic continuity errors (requires Docker)

---

## Environment Variables

Create `server/.env` (never commit this file):

```
GROQ_API_KEY=gsk_your_key_here
HINDSIGHT_URL=http://localhost:8888
PORT=3001
```

| Variable | Required | Default | Description |
|---|---|---|---|
| `GROQ_API_KEY` | Yes | — | Groq API key for narrative ingestion |
| `HINDSIGHT_URL` | No | `http://localhost:8888` | Hindsight Docker endpoint |
| `PORT` | No | `3001` | Express server port |

---

## Hindsight Docker (Semantic Validation)

Semantic validation is optional. If Hindsight is unreachable the app still works — structural validation and the graph run fine, and a warning is shown instead of crashing.

To enable it:

```bash
export ANTHROPIC_API_KEY=sk-your-anthropic-key

docker run --rm -it --pull always \
  -p 8888:8888 -p 9999:9999 \
  -e HINDSIGHT_API_LLM_PROVIDER=anthropic \
  -e HINDSIGHT_API_LLM_API_KEY=$ANTHROPIC_API_KEY \
  -v $HOME/.hindsight-docker:/home/hindsight/.pg0 \
  ghcr.io/vectorize-io/hindsight:latest
```

Confirm it's running: `curl http://localhost:8888/health`

---

## API Reference

### `POST /api/ingest`

Sends raw text to Groq and returns the extracted narrative graph.

**Request:**
```json
{
  "text": "Chapter 1. Anna stood at the crossroads...",
  "title": "The Last Road"
}
```

**Response:**
```json
{
  "normalized_graph": { "title": "...", "start_node": "node_1", "nodes": [...] },
  "text_dictionary": { "title": "...", "world_rules": [...], "nodes": {...} }
}
```

---

### `POST /api/validate/structural`

Runs 5 graph algorithms on a normalized graph.

**Request:**
```json
{
  "normalized_graph": { ... }
}
```

**Response:**
```json
{
  "narrative_title": "...",
  "validated_at": "2025-01-01T12:00:00Z",
  "structural_faults": [...],
  "valid_endings": [...],
  "valid_paths": { "metadata": {...}, "valid_paths": [...] }
}
```

**Fault types detected:**

| Type | Severity | Description |
|---|---|---|
| `DEAD_END` | error | Node has no choices and isn't an ending — reader is permanently stuck |
| `UNREACHABLE` | warning | No path from start reaches this node — content no reader ever sees |
| `INFINITE_LOOP` | error | Cycle with no exit and no ending — reader loops forever |
| `LOCKED_CONDITION` | error | Conditional edge that can never be satisfied — choice is permanently hidden |

---

### `POST /api/validate/semantic`

Runs Hindsight retain/reflect loop on all valid paths.

**Request:**
```json
{
  "text_dictionary": { ... },
  "valid_paths": { ... }
}
```

**Response:**
```json
{
  "narrative_title": "...",
  "validated_at": "2025-01-01T12:00:00Z",
  "semantic_faults": [
    {
      "fault_id": "sem_001",
      "type": "CHARACTER_CONTINUITY",
      "severity": "warning",
      "node_id": "node_9",
      "path_id": "path_2",
      "message": "...",
      "affected_nodes": ["node_3", "node_9"],
      "hindsight_confidence": 0.97
    }
  ]
}
```

**Fault types detected:**

| Type | Description |
|---|---|
| `CHARACTER_CONTINUITY` | Character appears alive after being established as dead on this path |
| `KNOWLEDGE_CONTINUITY` | Character references information they couldn't have based on prior scenes |
| `ITEM_CONTINUITY` | Character uses an object never obtained on this path |
| `WORLD_RULE_VIOLATION` | Event contradicts the story's established rules (supernatural in realist setting, etc.) |
| `EMOTIONAL_CONTINUITY` | Emotional state directly contradicts an immediate prior traumatic event |

---

## Data Contracts

All modules share four JSON schemas defined in `/contracts`. The mock files are the authoritative reference for development — every module is built against them.

```
contracts/
├── mock_normalized_graph.json   ← graph structure, no prose
├── mock_text_dictionary.json    ← prose and world rules, no graph structure
├── mock_valid_paths.json        ← valid end-to-end paths with state snapshots
└── mock_fault_payload.json      ← structural + semantic faults merged
```

The mock data encodes a 15-node version of *Journey Under the Sea* with four deliberately planted bugs — one dead end, one unreachable cluster, one character continuity error, and one world rule violation. These are the demo moment.

---

## Demo Narrative

`demo/journey_under_the_sea.json` is a hand-encoded Cold War underwater thriller with 15 nodes. Load it from the dashboard using the **Use Demo Narrative** button, or feed it through the CLI pipeline.

**Planted bugs:**
1. **DEAD_END** — `node_4`: reader chooses "Go deeper" and is permanently trapped with no exit
2. **UNREACHABLE** — `node_7`, `node_8`: an abandoned Soviet submarine cluster that nothing in the main graph points to
3. **CHARACTER_CONTINUITY** — `node_9` on `path_2`: Captain Volkov greets the protagonist warmly, but he died in an explosion at `node_3` on this exact path
4. **WORLD_RULE_VIOLATION** — `node_14` on `path_3`, `path_4`: a psychic voice speaks directly into the protagonist's mind, in a story whose world rules say no supernatural elements

---

## Offline Pipeline (CLI)

The `orchestrator/run.sh` script chains all four CLI modules end-to-end without the web server.

**Prerequisites:** Rust binaries must be compiled first.

```bash
# Build Rust modules
cd core-engine && cargo build --release && cd ..
cd ingestion && cargo build --release && cd ..

# Install semantic-ai deps
cd semantic-ai && npm install && cd ..

# Run the full pipeline
bash orchestrator/run.sh
```

The script:
1. Ingests `demo/journey_under_the_sea.json` → writes `contracts/normalized_graph.json` + `contracts/text_dictionary.json`
2. Runs structural validation → writes `contracts/structural_faults.json` + `contracts/valid_paths.json`
3. Runs Hindsight semantic validation (only if structural passes) → writes `contracts/semantic_faults.json`

---

## Dashboard Features

| Feature | Description |
|---|---|
| Literature input | Paste text, upload file (.txt .md .fountain .fdx), or load demo |
| 2D graph | Cytoscape.js force-directed graph with curved edges |
| 3D graph | three.js / 3d-force-graph with custom geometries per node type |
| Node colors | Blue = default, green = ending, red = dead end, amber = unreachable, violet = semantic error |
| Validation sweep | Animated sweep line during structural validation |
| Hindsight ink spread | Organic violet ink-spread animation when semantic phase activates |
| Error sidebar | Faults slide in with 60ms stagger, Jump links pan graph to the node |
| Node detail panel | Prose, state changes, incoming/outgoing edges, reachability info |
| Simulate Playthrough | Animated dot travels the first valid path, highlighting each node |
| Phase strip | Three-phase progress indicator at the bottom of the screen |

---

## Stack

| Layer | Technology |
|---|---|
| LLM ingestion | Groq API — `llama-3.3-70b-versatile` |
| Semantic analysis | Hindsight (vectorize.io) — retain/reflect memory API |
| Graph algorithms | TypeScript (server) + Rust + petgraph (CLI) |
| API server | Express 4 + TypeScript |
| Dashboard | React 19 + Vite 6 + Tailwind 4 |
| 2D graph | Cytoscape.js |
| 3D graph | three.js + 3d-force-graph |
| Fonts | Playfair Display (display) + JetBrains Mono (code) |

---

## Project Structure

```
/
├── server/                 Web API server (start here for the web interface)
│   ├── src/
│   │   ├── index.ts        Express routes
│   │   ├── ingest.ts       Groq LLM ingestion
│   │   ├── structural.ts   5 graph validation algorithms
│   │   ├── semantic.ts     Hindsight retain/reflect loop
│   │   └── types.ts        Shared TypeScript types
│   └── .env.example
│
├── dashboard/              React web interface
│   └── src/
│       ├── App.tsx         Root state and API orchestration
│       ├── components/
│       │   ├── Header.tsx
│       │   ├── GraphCanvas2D.tsx
│       │   ├── GraphCanvas3D.tsx
│       │   ├── Sidebar.tsx
│       │   ├── PhaseStrip.tsx
│       │   └── LiteratureInput.tsx
│       └── lib/
│           ├── api.ts      Fetch client for the server
│           └── types.ts    TypeScript types mirroring contracts
│
├── contracts/              Shared data schemas + mock files
├── core-engine/            Rust CLI structural validator
├── ingestion/              Rust CLI narrative parser
├── semantic-ai/            TypeScript CLI Hindsight validator
├── demo/                   Pre-encoded demo narrative
└── orchestrator/run.sh     End-to-end pipeline script
```
