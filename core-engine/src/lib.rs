//! # NVE Core Engine
//!
//! The Narrative Validation Engine (NVE) Core Engine is a Rust library that performs
//! structural validation on branching narrative graphs. It detects five categories
//! of structural faults and generates all valid end-to-end paths through the story.
//!
//! ## Architecture
//!
//! The engine is composed of three modules:
//!
//! - **[`parser`]** — Reads a `normalized_graph.json` file, deserializes it into
//!   typed Rust structs, and builds a directed graph (via `petgraph`) with O(1)
//!   node lookup for the validators.
//!
//! - **[`types`]** — All data structures: input types (deserialized from JSON),
//!   internal types (petgraph edge weights), and output types (serialized to
//!   `structural_faults.json` and `valid_paths.json`).
//!
//! - **[`validator`]** — The five structural validation algorithms:
//!   1. Dead End Detection
//!   2. Unreachable Node Detection (BFS)
//!   3. Infinite Loop Detection (Tarjan SCC)
//!   4. Locked Condition Detection (DFS + state simulation)
//!   5. Valid Path Generation (DFS + state tracking)
//!
//! ## Usage
//!
//! ```bash
//! nve-validate <path-to-normalized_graph.json>
//! ```
//!
//! When the input file is inside the project's `demo/` directory, the engine
//! automatically deploys the results to `dashboard/src/data/` for live preview.

pub mod parser;
pub mod types;
pub mod validator;
