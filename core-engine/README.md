# /core-engine — Structural Validator

**Owner:** Dev 2  
**Stack:** Rust + petgraph

Reads `normalized_graph.json` and runs five graph algorithms to find structural faults
and enumerate all valid end-to-end paths.

## Algorithms

1. Dead End Detection — nodes with out_degree 0 that aren't endings
2. Unreachable Node Detection — BFS from start_node, flag anything not visited
3. Infinite Loop Detection — cycles with no exit edge
4. Locked Condition Detection — conditional edges that can never be satisfied
5. Valid Path Generation — DFS collecting all paths that reach an is_ending node

## Outputs

- `contracts/structural_faults.json`
- `contracts/valid_paths.json`
- Exit code 0 if clean, exit code 1 if faults found (orchestrator uses this)

## Dev workflow

Start immediately against `contracts/mock_normalized_graph.json`. Do not wait for ingestion.

```
cargo run -- ../contracts/mock_normalized_graph.json
```
