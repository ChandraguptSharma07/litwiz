# /contracts — Shared Data Contracts

This folder is the single most important folder in the repo during development.

All four modules (ingestion, core-engine, semantic-ai, dashboard) are built against the
mock files in this folder. The idea is that each dev can work in parallel without waiting
for another module to be finished — you just point at the mock that represents what the
real output will look like.

When integration day comes, the only thing that changes is the source of the data.
The schemas stay identical.

## Files

| File | Produced by | Consumed by |
|---|---|---|
| `mock_normalized_graph.json` | ingestion | core-engine |
| `mock_text_dictionary.json` | ingestion | semantic-ai |
| `mock_valid_paths.json` | core-engine | semantic-ai |
| `mock_fault_payload.json` | core-engine + semantic-ai | dashboard |

## Planted Bugs in the Mock Narrative

The mock data encodes a 15-node version of "Journey Under the Sea" with four deliberate bugs:

1. **DEAD_END** — `node_4` is reachable from the start but has no choices and is not
   marked as an ending. A reader who makes that choice is permanently stuck.

2. **UNREACHABLE** — `node_7` and `node_8` form an isolated cluster. They're internally
   connected to each other but nothing in the main graph has an edge pointing to `node_7`.
   No reader ever reaches them.

3. **CHARACTER_CONTINUITY** — `node_9` has Captain Volkov greeting the protagonist
   warmly. But on `path_2`, Volkov dies in an explosion at `node_3`. The graph is
   structurally fine — the path is valid. Only Hindsight catches this.

4. **WORLD_RULE_VIOLATION** — `node_14` describes the protagonist receiving a psychic
   warning from the deep. The world rules establish this is a realistic 1962 Cold War
   thriller with no supernatural elements.

These four bugs are the demo moment. Do not fix them.
