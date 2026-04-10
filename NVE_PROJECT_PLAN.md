# Narrative Validation Engine (NVE)
### Complete Project Bible — Hackathon Edition
> Single source of truth. Every team member reads this before writing a single line of code.

---

## The Pitch (30 seconds)

> "Writing branching narratives for games like Life is Strange creates a chaotic web of state variables. Writers accidentally ship dead-ends, contradictory dialogue, and unreachable endings — bugs that survive playtesting because they're invisible to the human eye. NVE is a two-brain validation engine: a Rust graph engine catches structural impossibilities with mathematical certainty, and Hindsight AI reads the actual story and catches semantic errors that have no mathematical representation. Together they validate both the architecture and the meaning of your narrative."

---

## The Two-Brain Architecture

```
Raw Narrative File (Twine / Ink / JSON)
            ↓
     [ /ingestion ]
     Normalizes messy input into strict internal format
            ↓
     Outputs two contracts:
     ┌──────────────────┐    ┌─────────────────────┐
     │  normalized_     │    │   text_dictionary   │
     │  graph.json      │    │   .json             │
     └──────────────────┘    └─────────────────────┘
            ↓                          ↓
   [ /core-engine ]          [ /semantic-ai ]
   Rust + petgraph            Hindsight API
   Pure graph math            LLM story reasoning
   BFS / DFS / State          retain/recall/reflect
            ↓                          ↓
   structural_faults.json    semantic_faults.json
   valid_paths.json                    ↓
            └──────────────┬───────────┘
                           ↓
                    [ /dashboard ]
                  React + 3d-force-graph
                  The thing judges see
```

**The critical rule:** Hindsight only runs AFTER Rust gives the graph a clean structural bill of health. If structural faults exist, semantic analysis is blocked. This is enforced in the UI — the Hindsight button is disabled until structural passes.

---

## Monorepo Structure

```
/nve
├── contracts/                  ← THE MOST IMPORTANT FOLDER
│   ├── mock_normalized_graph.json
│   ├── mock_text_dictionary.json
│   ├── mock_valid_paths.json
│   └── mock_fault_payload.json
│
├── ingestion/                  ← Dev 1
│   ├── src/
│   ├── Cargo.toml
│   └── README.md
│
├── core-engine/                ← Dev 2
│   ├── src/
│   │   ├── lib.rs
│   │   ├── types.rs
│   │   ├── parser.rs
│   │   └── validator.rs
│   ├── Cargo.toml
│   └── README.md
│
├── semantic-ai/                ← Dev 3
│   ├── src/
│   │   ├── ingest.ts
│   │   ├── validate.ts
│   │   └── index.ts
│   ├── package.json
│   └── README.md
│
├── dashboard/                  ← Dev 4
│   ├── src/
│   │   ├── components/
│   │   ├── lib/
│   │   └── App.tsx
│   ├── package.json
│   └── README.md
│
├── orchestrator/               ← Dev 1 also owns this
│   └── run.sh                  ← chains all 4 modules end-to-end
│
└── demo/
    └── journey_under_the_sea.json   ← the demo narrative (Dev 1 encodes this)
```

---

## FIRST 30 MINUTES — THE ONLY RULE

**No one writes production code until these 4 files exist in /contracts and are committed.**

Everyone builds against these mock files. The final integration is just swapping mocks for real output.

---

## Contract 1: `mock_normalized_graph.json`
Output of /ingestion. Input to /core-engine.

```json
{
  "title": "Journey Under the Sea",
  "version": "1.0",
  "start_node": "node_1",
  "nodes": [
    {
      "id": "node_1",
      "is_ending": false,
      "set_state": {},
      "choices": [
        { "id": "choice_1a", "text": "Dive into the cave", "target": "node_2", "condition": null },
        { "id": "choice_1b", "text": "Surface for air", "target": "node_3", "condition": null }
      ]
    },
    {
      "id": "node_2",
      "is_ending": false,
      "set_state": { "has_torch": true },
      "choices": [
        { "id": "choice_2a", "text": "Go deeper", "target": "node_5", "condition": null },
        { "id": "choice_2b", "text": "Use torch", "target": "node_6", "condition": "has_torch == true" }
      ]
    },
    {
      "id": "node_4",
      "is_ending": false,
      "set_state": {},
      "choices": []
    },
    {
      "id": "node_9",
      "is_ending": false,
      "set_state": {},
      "choices": [
        { "id": "choice_9a", "text": "Escape", "target": "node_10", "condition": null }
      ]
    },
    {
      "id": "node_10",
      "is_ending": true,
      "set_state": {},
      "choices": []
    }
  ]
}
```

**Rules:**
- Every node has an `id`, `is_ending` bool, `set_state` map, and `choices` array
- Every choice has `id`, `text`, `target` node id, and optional `condition` string
- Isolated/unreachable nodes ARE included — the engine finds them, not the ingestion layer
- `set_state` values are always strings or booleans, never nested objects

---

## Contract 2: `mock_text_dictionary.json`
Output of /ingestion. Input to /semantic-ai.

```json
{
  "title": "Journey Under the Sea",
  "world_rules": [
    "This is a realistic underwater thriller. No magic or supernatural elements.",
    "The story is set in 1962 during the Cold War."
  ],
  "nodes": {
    "node_1": {
      "prose": "You stand at the mouth of the underwater cave. Your oxygen tank reads 45 minutes. The darkness ahead is absolute.",
      "character_states": ["protagonist is alone", "protagonist has oxygen tank"],
      "established_facts": ["oxygen = 45 minutes remaining", "location = cave entrance"]
    },
    "node_2": {
      "prose": "Inside the cave you find an old Soviet research station, abandoned since the 1950s. A torch still hangs on the wall.",
      "character_states": ["protagonist has torch"],
      "established_facts": ["location = Soviet station", "torch = obtained", "station = abandoned since 1950s"]
    },
    "node_4": {
      "prose": "The current pulls you into a deeper chamber. You find a air pocket and rest, but there is no way forward.",
      "character_states": [],
      "established_facts": []
    },
    "node_9": {
      "prose": "Captain Volkov greets you warmly and offers you tea. You accept, grateful for the human contact.",
      "character_states": ["protagonist met Volkov"],
      "established_facts": ["Volkov = alive and friendly"]
    }
  }
}
```

**Rules:**
- `world_rules` are global constraints retained into Hindsight at the start
- Each node has `prose` (the full scene text), `character_states` (facts for Hindsight to retain), and `established_facts`
- This file is purely text — no graph structure, no edge data

---

## Contract 3: `mock_valid_paths.json`
Output of /core-engine. Input to /semantic-ai.

```json
{
  "metadata": {
    "total_nodes": 12,
    "total_edges": 18,
    "valid_path_count": 4,
    "structural_fault_count": 2
  },
  "valid_paths": [
    {
      "path_id": "path_1",
      "node_sequence": ["node_1", "node_2", "node_5", "node_10"],
      "state_at_each_node": [
        { "node_id": "node_1", "state": {} },
        { "node_id": "node_2", "state": { "has_torch": true } },
        { "node_id": "node_5", "state": { "has_torch": true, "found_ruins": true } },
        { "node_id": "node_10", "state": { "has_torch": true, "found_ruins": true } }
      ],
      "ending_node": "node_10",
      "is_valid": true
    },
    {
      "path_id": "path_2",
      "node_sequence": ["node_1", "node_3", "node_9", "node_10"],
      "state_at_each_node": [
        { "node_id": "node_1", "state": {} },
        { "node_id": "node_3", "state": { "met_volkov": false } },
        { "node_id": "node_9", "state": { "met_volkov": false } },
        { "node_id": "node_10", "state": {} }
      ],
      "ending_node": "node_10",
      "is_valid": true
    }
  ]
}
```

**Rules:**
- Only structurally valid end-to-end paths are included (dead-ends excluded)
- Each node in the path carries the full state snapshot at that point
- This is what Hindsight iterates over — one `reflect()` call per path

---

## Contract 4: `mock_fault_payload.json`
Output of both /core-engine and /semantic-ai. Input to /dashboard.

```json
{
  "narrative_title": "Journey Under the Sea",
  "validated_at": "2025-01-01T12:00:00Z",
  "structural_faults": [
    {
      "fault_id": "sf_001",
      "type": "DEAD_END",
      "severity": "error",
      "node_id": "node_4",
      "message": "Node has no outgoing choices and is not marked as an ending",
      "affected_nodes": ["node_4"],
      "affected_paths": []
    },
    {
      "fault_id": "sf_002",
      "type": "UNREACHABLE",
      "severity": "warning",
      "node_id": "node_7",
      "message": "No path from start_node leads to this node",
      "affected_nodes": ["node_7"],
      "affected_paths": []
    },
    {
      "fault_id": "sf_003",
      "type": "INFINITE_LOOP",
      "severity": "error",
      "node_id": "node_8",
      "message": "Cycle detected: node_8 → node_11 → node_8 with no exit",
      "affected_nodes": ["node_8", "node_11"],
      "affected_paths": []
    },
    {
      "fault_id": "sf_004",
      "type": "LOCKED_CONDITION",
      "severity": "error",
      "node_id": "node_6",
      "message": "Edge requires has_torch == true, but no path to this node sets has_torch",
      "affected_nodes": ["node_6"],
      "affected_paths": []
    }
  ],
  "semantic_faults": [
    {
      "fault_id": "sem_001",
      "type": "CHARACTER_CONTINUITY",
      "severity": "warning",
      "node_id": "node_9",
      "path_id": "path_2",
      "message": "Captain Volkov is greeted as alive, but node_3 on this path established Volkov died in the explosion",
      "affected_nodes": ["node_3", "node_9"],
      "hindsight_confidence": 0.94
    },
    {
      "fault_id": "sem_002",
      "type": "KNOWLEDGE_CONTINUITY",
      "severity": "warning",
      "node_id": "node_5",
      "path_id": "path_1",
      "message": "Protagonist references the station's access code, but no prior node on path_1 reveals the code",
      "affected_nodes": ["node_5"],
      "hindsight_confidence": 0.87
    },
    {
      "fault_id": "sem_003",
      "type": "WORLD_RULE_VIOLATION",
      "severity": "warning",
      "node_id": "node_12",
      "path_id": "path_3",
      "message": "Scene references a telepathic warning, violating world rule: no supernatural elements",
      "affected_nodes": ["node_12"],
      "hindsight_confidence": 0.91
    }
  ],
  "valid_endings": [
    { "node_id": "node_10", "prose_preview": "You escape to the surface, gasping..." },
    { "node_id": "node_15", "prose_preview": "The ruins become your permanent home..." }
  ]
}
```

**Rules:**
- `structural_faults` and `semantic_faults` are always separate arrays — never merged
- Every fault has `fault_id`, `type`, `severity`, `node_id`, `message`
- Semantic faults additionally have `path_id` and `hindsight_confidence` (0.0–1.0)
- Dashboard renders these — it never runs any validation logic itself

---

## Team Division

---

### DEV 1 — The Data Wrangler `/ingestion`
**Stack:** Rust  
**Owns:** Input parsing, data normalization, demo narrative, orchestrator script

**Responsibilities:**

1. Write a Rust binary that reads a raw Twine/Ink/JSON file and outputs `normalized_graph.json` + `text_dictionary.json` matching the contracts above

2. Support at minimum one input format: the simple NVE JSON format (the schema we define). Twine support is a stretch goal.

3. **Encode the demo narrative.** Take "Journey Under the Sea" (1979 CYOA book) and manually encode 15–20 nodes into the NVE JSON format. Plant these specific bugs:
   - 1 dead-end node (reachable but no choices, not an ending)
   - 1 unreachable node cluster (internally connected, no incoming edges from main graph)
   - 1 semantic continuity error (character alive after death)
   - 1 world-rule violation (if adding world_rules)
   
   These 4 bugs are your demo moment — commit them intentionally.

4. **Write `orchestrator/run.sh`** — a shell script that chains the full pipeline:
   ```bash
   #!/bin/bash
   # Step 1: Ingest
   ./ingestion/target/release/nve-ingest demo/journey_under_the_sea.json
   # Step 2: Core engine
   ./core-engine/target/release/nve-validate contracts/normalized_graph.json
   # Step 3: Semantic AI (only if no structural faults)
   if [ $? -eq 0 ]; then
     npx ts-node semantic-ai/src/index.ts
   fi
   echo "Pipeline complete. Open dashboard."
   ```

5. Write the 4 mock contract JSON files in `/contracts` **within the first 30 minutes**

**Deliverable checklist:**
- [ ] `/contracts` folder with all 4 mock files committed
- [ ] Ingestion binary reads NVE JSON format
- [ ] Outputs normalized_graph.json matching contract
- [ ] Outputs text_dictionary.json matching contract  
- [ ] demo/journey_under_the_sea.json with 15+ nodes and 4 planted bugs
- [ ] orchestrator/run.sh chains full pipeline

---

### DEV 2 — The Mathematician `/core-engine`
**Stack:** Rust + petgraph  
**Owns:** All structural validation algorithms

**Key dependency in Cargo.toml:**
```toml
[dependencies]
petgraph = "0.6"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

**Responsibilities:**

Implement these 5 algorithms. Each outputs to `structural_faults` array and contributes to `valid_paths` array.

**Algorithm 1 — Dead End Detection**
```
For each node N:
  if out_degree(N) == 0 AND N.is_ending == false:
    FAULT: DEAD_END on N
```

**Algorithm 2 — Unreachable Node Detection**
```
Run BFS from start_node using petgraph::visit::Bfs
For each node N not visited:
  FAULT: UNREACHABLE on N
```

**Algorithm 3 — Infinite Loop Detection**
```
Run petgraph::algo::is_cyclic_directed
For each detected cycle:
  Verify no exit edge exists from cycle
  FAULT: INFINITE_LOOP on all nodes in cycle
```

**Algorithm 4 — Locked Condition Detection**
```
For each edge E with condition C:
  Trace all paths from start_node to E's source
  For each path P:
    Simulate state accumulation along P
    Check if condition C is satisfiable
  If NO path satisfies C:
    FAULT: LOCKED_CONDITION on E's target
```

**Algorithm 5 — Valid Path Generation**
```
DFS from start_node
Collect all paths that reach a node where is_ending == true
For each path, record state snapshot at each node
Output: valid_paths array
```

**Output:** Binary writes two files:
- `contracts/structural_faults.json` (partial fault_payload, structural section only)
- `contracts/valid_paths.json`
- Exit code 0 if zero structural faults, exit code 1 if faults found (orchestrator uses this)

**Dev 2 starts immediately using:** `contracts/mock_normalized_graph.json` as hardcoded input. Does NOT wait for Dev 1 to finish ingestion.

**Deliverable checklist:**
- [ ] All 5 algorithms implemented
- [ ] Reads normalized_graph.json
- [ ] Writes structural_faults.json matching contract schema
- [ ] Writes valid_paths.json matching contract schema
- [ ] Exit code reflects fault presence
- [ ] Tested against mock data with known planted bugs

---

### DEV 3 — The AI Integrator `/semantic-ai`
**Stack:** TypeScript + Hindsight JS SDK  
**Owns:** All Hindsight integration, semantic validation

**First task (before any code):** Spin up Hindsight Docker:
```bash
export ANTHROPIC_API_KEY=sk-xxx
docker run --rm -it --pull always \
  -p 8888:8888 -p 9999:9999 \
  -e HINDSIGHT_API_LLM_PROVIDER=anthropic \
  -e HINDSIGHT_API_LLM_API_KEY=$ANTHROPIC_API_KEY \
  -v $HOME/.hindsight-docker:/home/hindsight/.pg0 \
  ghcr.io/vectorize-io/hindsight:latest
```

Confirm it's running at `http://localhost:8888` before writing a line of code.

**Also install the Hindsight Claude Code skill** (works directly with Claude Code):
```bash
npx skills add https://github.com/vectorize-io/hindsight --skill hindsight-docs
```

**The semantic validation workflow:**

```typescript
import { HindsightClient } from '@vectorize-io/hindsight-client';

const client = new HindsightClient({ baseUrl: 'http://localhost:8888' });

async function validateNarrative(
  textDict: TextDictionary,
  validPaths: ValidPathsContract
): Promise<SemanticFault[]> {
  
  const bankId = textDict.title.replace(/\s/g, '-').toLowerCase();
  
  // Step 1: Retain world rules as global facts
  for (const rule of textDict.world_rules) {
    await client.retain(bankId, `World rule: ${rule}`);
  }

  // Step 2: For each valid path, retain node prose in sequence
  // then reflect to find contradictions on that path
  const allFaults: SemanticFault[] = [];
  
  for (const path of validPaths.valid_paths) {
    // Fresh bank per path to avoid cross-path contamination
    const pathBankId = `${bankId}-${path.path_id}`;
    
    // Retain world rules into path bank too
    for (const rule of textDict.world_rules) {
      await client.retain(pathBankId, `World rule: ${rule}`);
    }
    
    // Retain each node's facts in sequence
    for (const nodeId of path.node_sequence) {
      const nodeText = textDict.nodes[nodeId];
      if (!nodeText) continue;
      
      await client.retain(pathBankId, `Scene ${nodeId}: ${nodeText.prose}`);
      
      for (const fact of nodeText.established_facts) {
        await client.retain(pathBankId, `After scene ${nodeId}: ${fact}`);
      }
    }
    
    // Reflect to find contradictions
    const result = await client.reflect(
      pathBankId,
      `Analyze the sequence of events in this story path for narrative errors.
       Check specifically for:
       1. CHARACTER CONTINUITY: A character appearing alive after being established as dead
       2. KNOWLEDGE CONTINUITY: A character referencing knowledge they couldn't have on this path
       3. ITEM CONTINUITY: An item being used before it was obtained on this path
       4. WORLD RULE VIOLATIONS: Any event that contradicts the established world rules
       5. EMOTIONAL CONTINUITY: Emotional states that contradict immediately prior traumatic events
       
       For each error found, state: the node ID where it occurs, the type of error, and a specific description.
       Format your response as a JSON array.`
    );
    
    // Parse reflect response and map to fault schema
    const faults = parseReflectResponse(result, path.path_id);
    allFaults.push(...faults);
  }
  
  return deduplicateFaults(allFaults);
}
```

**Important implementation notes:**
- One Hindsight memory bank per path, not per narrative — prevents cross-path memory contamination
- Parse the `reflect()` response carefully — it returns natural language, not JSON. Prompt it to respond in JSON format.
- Add `hindsight_confidence` by asking Hindsight to rate its confidence in each finding (0.0–1.0)
- Graceful fallback: if Hindsight is unreachable, return empty array with a console warning. Never crash.

**Output:** Writes `contracts/semantic_faults.json`

**Dev 3 starts immediately using:** `contracts/mock_valid_paths.json` and `contracts/mock_text_dictionary.json` with a hardcoded mock. Does NOT wait for Dev 1 or Dev 2.

**Deliverable checklist:**
- [ ] Hindsight Docker running and confirmed
- [ ] Hindsight docs skill installed
- [ ] retain() loop for world rules + node prose
- [ ] reflect() call per valid path
- [ ] Response parser extracts fault objects
- [ ] Writes semantic_faults.json matching contract schema
- [ ] Graceful fallback if Hindsight is down
- [ ] Tested against mock paths

---

### DEV 4 — The Visualizer `/dashboard`
**Stack:** React (Vite) + Cytoscape.js + 3d-force-graph + Tailwind  
**Owns:** The entire UI — the thing judges actually see and interact with

**Install:**
```bash
npm create vite@latest dashboard -- --template react-ts
cd dashboard
npm install cytoscape 3d-force-graph three @types/three
npm install tailwindcss @tailwindcss/vite
```

**Fonts (add to index.html):**
```html
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;1,400&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

**Color tokens (add to tailwind.config or CSS vars):**
```css
:root {
  --bg-base:        #09090b;
  --bg-panel:       #111113;
  --border:         #1f1f23;
  --node-default:   #3b82f6;
  --node-valid:     #22c55e;
  --node-dead-end:  #ef4444;
  --node-orphan:    #f59e0b;
  --node-semantic:  #a855f7;
  --node-selected:  #ffffff;
  --font-display:   'Playfair Display', serif;
  --font-mono:      'JetBrains Mono', monospace;
}
```

**Layout (three zones):**

```
┌─────────────────────────────────────────────────────────┐
│  HEADER  48px                                            │
├──────────────────────────────────┬──────────────────────┤
│                                  │                      │
│   GRAPH CANVAS   70%             │  SIDEBAR   30%       │
│   (Cytoscape 2D or Three.js 3D)  │  [Errors|Detail]     │
│                                  │                      │
├──────────────────────────────────┤                      │
│   PHASE STRIP    36px            │                      │
└──────────────────────────────────┴──────────────────────┘
```

**Header contents:**
- Left: SVG logo (3-node directed graph icon) + "NVE" in Playfair Display italic + "Narrative Validation Engine" in JetBrains Mono 11px opacity-40
- Center: Narrative title + `42 nodes · 67 edges` pill badge
- Right: `[Load Narrative]` ghost button + `[▶ Run Structural]` blue button + `[◈ Run Hindsight]` violet button (disabled until structural passes) + `[ 2D | 3D ]` pill toggle

**Graph canvas — node visual rules:**
- Default: circle r=28, fill `--node-default`
- Start node: r=34, small `▶` marker above
- Ending node: `♛` crown icon above
- Dead-end: pulsing red glow CSS animation, `--node-dead-end` border
- Unreachable: dashed amber border, `stroke-dasharray`, desaturated fill
- Semantic error: slowly rotating violet `conic-gradient` ring around node
- Selected: white outer ring, all unconnected edges dim to opacity-5

**Graph canvas — edge visual rules:**
- Curved SVG quadratic bezier paths (not straight lines)
- Default: 1.5px, `#ffffff18`
- Hover: tooltip shows choice text, brightens to `#ffffff60`
- Active playthrough: `#ffffffcc`, 2.5px, animated traveling dot

**Phase strip (bottom of graph):**
```
[ ⬡ PHASE 1: STRUCTURAL · Rust Engine · ✓ 3 errors found ]  →  [ ◈ PHASE 2: SEMANTIC · Hindsight · Waiting... ]
```
- The `→` arrow animates (slides right) when transitioning between phases
- Phase 1 pill: blue → green on completion
- Phase 2 pill: grey → violet when active

**Sidebar — Errors tab:**
```
▼  STRUCTURAL ERRORS  (Rust)           2 ●
   [●] DEAD_END     node_4
       "No choices, not marked ending"   [Jump →]
   [●] UNREACHABLE  node_7
       "No path from start leads here"   [Jump →]

▼  SEMANTIC WARNINGS  (Hindsight)      1 ◈
   [◈] CHARACTER    node_9
       "Volkov greeted as alive but..."  [Jump →]

▼  VALID ENDINGS                       2 ✓
   [✓] node_10  "You escape to surface..."
   [✓] node_15  "The ruins become your..."
```

- Errors slide in one-by-one during validation with 60ms stagger
- `[Jump →]` pans graph and selects node
- Clicking any error row flashes the affected node

**Sidebar — Node Detail tab (on node click):**
```
NODE  node_9                      [◈ SEMANTIC ERROR]

SCENE TEXT
"Captain Volkov greets you warmly..."

STATE CHANGES
  met_volkov  →  true

INCOMING PATHS     2
  node_3  →  "Take the tunnel"
  node_7  →  "Follow Volkov"

OUTGOING CHOICES   1
  →  "Accept the tea"  →  node_10

REACHABLE?         ✓ Yes
VALID ENDING?      ✗ No
HINDSIGHT FLAGS    1 warning
```

**Animations (implement in this priority order):**

1. **Validation sweep** — on `Run Structural` click: thin bright line sweeps left→right over 1.8s. As it passes each node, node flashes white then settles into error color.

2. **Hindsight activation** — on Phase 2 start: affected nodes get violet inner glow that expands outward over 2s, like ink spreading in water. Intentionally slower and more organic than the Rust sweep.

3. **Error stagger** — errors slide into sidebar one-by-one, 60ms apart.

4. **Simulate Playthrough** — glowing dot travels along edges from start to ending over 3s. Each visited node briefly fills white. Speed toggle: `×1 / ×2 / ×3`.

5. **Node click dimming** — unconnected edges fade to opacity-5 over 200ms.

**3D Mode (3d-force-graph):**

Toggle between 2D (Cytoscape) and 3D (three.js) with the `[ 2D | 3D ]` pill. Same data, same colors, different renderer.

3D-specific:
- Custom geometries per node type:
  - Default → `SphereGeometry`
  - Dead-end → `OctahedronGeometry`
  - Unreachable → `TetrahedronGeometry`
  - Ending → `IcosahedronGeometry`
  - Semantic error → `SphereGeometry` + slow `rotation.y` spin
- `PointLight` on each error node casting colored glow
- Camera dolly-zoom in on load over 2.5s
- Camera lerps to face selected node on click
- `graph.cooldownTicks(100)` to freeze physics after layout
- Orbit controls enabled (rotate, zoom, pan)
- **Stretch goal:** "Path Tunnel" — camera flies through graph following active path using `CatmullRomCurve3`

**Dev 4 starts immediately using:** All 4 mock files from `/contracts`. Does NOT wait for any other dev.

**Deliverable checklist:**
- [ ] Header with all buttons and 2D/3D toggle
- [ ] 2D Cytoscape graph rendering from mock data
- [ ] All node color states working
- [ ] Edge curves and hover tooltips
- [ ] Validation sweep animation
- [ ] Hindsight activation animation (ink spread)
- [ ] Error sidebar with stagger animation + Jump links
- [ ] Node detail tab on click
- [ ] Phase strip with transition
- [ ] 3D mode with custom geometries
- [ ] Simulate Playthrough animation
- [ ] File upload (JSON load)

---

## Timeline — 12 Hours

```
00:00 – 00:30   ALL FOUR  →  Write contracts, commit mock JSONs. No code until done.
00:30 – 01:00   ALL FOUR  →  Scaffold projects, install dependencies, verify builds

01:00 – 05:00   PARALLEL WORK
  Dev 1  →  Ingestion parser + demo narrative JSON
  Dev 2  →  Core engine algorithms (against mock graph)
  Dev 3  →  Hindsight Docker up + retain/reflect loop (against mock paths)
  Dev 4  →  Dashboard layout + 2D graph rendering (against mock faults)

05:00 – 07:00   PARALLEL WORK (continued)
  Dev 1  →  Orchestrator script + Journey Under the Sea encoding
  Dev 2  →  Locked condition algorithm (hardest one — give it time)
  Dev 3  →  Response parsing + semantic_faults.json output
  Dev 4  →  Error sidebar + node detail panel

07:00 – 09:00   INTEGRATION
  Dev 1 + Dev 2  →  Connect ingestion → core-engine, test with real narrative
  Dev 2 + Dev 3  →  Connect core-engine → semantic-ai, test valid_paths flow
  Dev 3 + Dev 4  →  Connect semantic-ai → dashboard, test fault rendering

09:00 – 10:30   DEV 4 SOLO  →  3D mode + animations
                OTHERS     →  Bug fixes from integration, polish output JSON

10:30 – 11:30   FULL PIPELINE RUN
  Everyone watches orchestrator run end-to-end on demo narrative
  Fix anything broken. Verify all 4 planted bugs are caught.

11:30 – 12:00   DEMO REHEARSAL
  One person drives, others watch. Time the demo. Should be under 4 minutes.
```

---

## Improvements Over the Original Plan

**1. Added an Orchestrator Script**
The document describes 4 isolated modules but doesn't say how they chain together on demo day. `orchestrator/run.sh` solves this. One command runs the full pipeline. Dev 1 owns it.

**2. Rust CLI instead of WASM (for now)**
Compiling Rust to WASM adds build complexity (wasm-pack, vite-plugin-wasm configuration) that can cost you 1–2 hours if something goes wrong. For the hackathon, Rust compiles to a CLI binary that writes JSON files. The dashboard reads those files. WASM is listed as a post-hackathon upgrade — mention it in the pitch as "the next step."

**3. One Hindsight Bank Per Path, Not Per Narrative**
If you use one bank for the whole narrative, Hindsight's memory from path A bleeds into path B analysis. Contradictions get missed or wrongly attributed. Separate banks per path keeps the analysis clean. Slightly more API calls but more accurate results.

**4. `hindsight_confidence` Field**
Hindsight's reflect() returns LLM-generated text, which is probabilistic. Adding a confidence score (ask Hindsight to rate its own certainty) lets the UI visually distinguish high-confidence semantic errors from lower-confidence warnings. Judges will notice this nuance.

**5. The Planted Bugs Strategy**
Don't rely on finding real bugs in the source material under time pressure. Encode the narrative faithfully, then deliberately plant 4 specific bugs you know the engine will catch. Practice the demo moment: "We fed a 1979 published book into our engine. These are errors that shipped to readers."

**6. Graceful Degradation**
If Hindsight is down during the demo, the app still works — structural validation runs, the graph renders beautifully, and a banner says "Semantic analysis unavailable." Never let a Docker issue kill the demo. This is Dev 3's responsibility to implement.

---

## Demo Script (4 minutes)

**0:00 — The Problem** (30 seconds)
> "Narrative designers working on games like Life is Strange manage hundreds of branching scenes. One wrong state variable and a character who died in Act 1 shows up alive in Act 3. These bugs survive playtesting because humans can't hold an entire narrative graph in their head."

**0:30 — Load the Narrative** (20 seconds)
Upload `journey_under_the_sea.json`. Graph renders. Say:
> "This is a real 1979 Choose Your Own Adventure book, encoded as a narrative graph. 20 nodes, 31 edges."

**0:50 — Run Structural Validation** (60 seconds)
Click `▶ Run Structural`. Watch the sweep animation. Let it finish. 
> "The Rust engine runs BFS and DFS across the entire graph in milliseconds. Two nodes are unreachable — no reader ever saw these endings. One node is a dead-end trap. One path has a permanently locked condition — an item required that was never obtainable."

Point at each flagged node as you name it.

**1:50 — Run Hindsight** (60 seconds)
Click `◈ Run Hindsight`. Watch the ink-spread animation on the violet nodes.
> "Now Hindsight reads the actual story. It retains facts from each scene in sequence — and here, on path 2, it catches something no graph algorithm could find: the protagonist greets Captain Volkov warmly in scene 9. But on this exact path, Volkov died in an explosion in scene 3. The graph is structurally valid. The story is not."

**2:50 — Simulate Playthrough** (30 seconds)
Click `Simulate Playthrough`. Watch the dot travel the graph.
> "We can also simulate any valid playthrough — watching exactly which scenes a reader experiences on a given path."

**3:20 — 3D View** (20 seconds)
Toggle to 3D. Let the graph rotate.
> "The same validation data, rendered as a 3D force-directed graph. Dead-end nodes — octahedra — drift to the periphery. Ending nodes cluster at the center. The geometry itself communicates structure."

**3:40 — The Stack** (20 seconds)
> "Rust for the graph math. Hindsight for the story intelligence. React for the interface. The two engines never overlap — we use math where math is sufficient, and AI only where math breaks down."

---

## Post-Hackathon Upgrades (mention in pitch)

- Compile Rust core-engine to WASM — run entirely in the browser, no CLI
- Twine and Ink file format support in ingestion
- AI-suggested fixes alongside errors (Hindsight generates a correction)
- Export validated narrative back to source format
- VS Code extension — validate on save

---

## Key Links

- Hindsight docs: https://hindsight.vectorize.io
- Hindsight GitHub: https://github.com/vectorize-io/hindsight
- petgraph docs: https://docs.rs/petgraph
- 3d-force-graph: https://github.com/vasturiano/3d-force-graph
- Cytoscape.js: https://js.cytoscape.org

---

*Last updated: Hackathon Day. If anything in this doc conflicts with what you're building, update the doc first, then tell the team.*
