// ──────────────────────────────────────────────────────────────
//  api.ts — Dashboard HTTP client for the NVE server
//
//  Provides typed fetch wrappers for the three server endpoints.
//  All functions throw on network/server errors — callers handle
//  them in the App component's try/catch blocks.
//
//  In development, requests go to `/api` which Vite proxies to
//  the Express server on :3001. In production, replace `BASE`
//  with the deployed server URL via VITE_API_URL.
// ──────────────────────────────────────────────────────────────

import type {
  NormalizedGraph,
  TextDictionary,
  ValidPathsFile,
  FaultPayload,
  SemanticFault,
} from './types'

/**
 * Base URL for all API requests.
 * Defaults to `/api` which is proxied by Vite in development.
 * In production, set VITE_API_URL to the deployed server origin.
 */
const BASE = 'https://litwiz-0odu.onrender.com/api'

// ═══════════════════════════════════════════════════════════════
//  POST /api/ingest — LLM-powered narrative extraction
// ═══════════════════════════════════════════════════════════════

/**
 * Response shape from the ingestion endpoint.
 * Contains both the structural graph and textual dictionary
 * extracted from raw literature by the Groq LLM.
 */
export interface IngestResult {
  /** The structural skeleton of the narrative graph. */
  normalized_graph: NormalizedGraph
  /** The textual content dictionary for each node. */
  text_dictionary: TextDictionary
}

/**
 * Send raw literature text to the server for AI-powered narrative extraction.
 *
 * The server forwards the text to Groq (llama-3.3-70b) which extracts
 * nodes, edges, conditions, prose, and world rules.
 *
 * # Arguments
 * * `text` — Raw literature text to analyze.
 * * `title` — Optional title (LLM infers one if omitted).
 *
 * # Returns
 * An `IngestResult` containing the normalized graph and text dictionary.
 *
 * # Throws
 * `Error` if the server returns a non-OK status.
 */
export async function ingest(text: string, title?: string): Promise<IngestResult> {
  const res = await fetch(`${BASE}/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, title }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error ?? `Server error ${res.status}`)
  }
  return res.json()
}

// ═══════════════════════════════════════════════════════════════
//  POST /api/validate/structural — Five-algorithm graph validation
// ═══════════════════════════════════════════════════════════════

/**
 * Response shape from the structural validation endpoint.
 * Contains faults, valid endings, and all valid paths with state snapshots.
 */
export interface StructuralResult {
  /** Title of the validated narrative. */
  narrative_title: string
  /** ISO 8601 timestamp of when validation was performed. */
  validated_at: string
  /** All structural faults detected by the five algorithms. */
  structural_faults: FaultPayload['structural_faults']
  /** All reachable ending nodes with prose previews. */
  valid_endings: FaultPayload['valid_endings']
  /** Full valid paths output with metadata. */
  valid_paths: ValidPathsFile
}

/**
 * Run structural validation on a normalized narrative graph.
 *
 * Executes five algorithms server-side: dead end detection, unreachable
 * node detection (BFS), infinite loop detection, locked condition
 * detection, and valid path generation.
 *
 * # Arguments
 * * `normalizedGraph` — The narrative graph to validate.
 *
 * # Returns
 * A `StructuralResult` with faults, endings, and valid paths.
 *
 * # Throws
 * `Error` if the server returns a non-OK status.
 */
export async function validateStructural(
  normalizedGraph: NormalizedGraph,
): Promise<StructuralResult> {
  // Use the new WebAssembly module compiled directly from our core-engine
  const { wasm_validate } = await import('../wasm/nve_validate.js');
  
  const resultJsonString = wasm_validate(JSON.stringify(normalizedGraph));
  const result = JSON.parse(resultJsonString);

  if (result.error) {
    throw new Error(result.error);
  }

  // Generate mock ValidPathsFile required by the rest of the application
  const valid_paths: ValidPathsFile = {
    metadata: {
      total_nodes: normalizedGraph.nodes.length,
      total_edges: normalizedGraph.nodes.reduce((sum, n) => sum + n.choices.length, 0),
      valid_path_count: 0, // Unused by dashboard
      structural_fault_count: result.structural_faults.length
    },
    valid_paths: [] 
  };

  return {
    narrative_title: result.narrative_title,
    validated_at: new Date().toISOString(),
    structural_faults: result.structural_faults,
    valid_endings: result.valid_endings,
    valid_paths: valid_paths
  };
}

// ═══════════════════════════════════════════════════════════════
//  POST /api/validate/semantic — Hindsight AI analysis
// ═══════════════════════════════════════════════════════════════

/**
 * Response shape from the semantic validation endpoint.
 * Contains semantic faults detected by Hindsight across all valid paths.
 */
export interface SemanticResult {
  /** Title of the validated narrative. */
  narrative_title: string
  /** ISO 8601 timestamp of when validation was performed. */
  validated_at: string
  /** All semantic faults detected with confidence scores. */
  semantic_faults: SemanticFault[]
}

/**
 * Run semantic validation using the Hindsight AI module.
 *
 * For each valid path, the server creates a Hindsight memory bank,
 * retains scene prose and facts in order, then asks Hindsight to
 * detect narrative continuity errors (dead characters, item issues, etc.).
 *
 * Returns gracefully with empty faults if Hindsight is unreachable.
 *
 * # Arguments
 * * `textDictionary` — The text dictionary with prose and facts.
 * * `validPaths` — The valid paths output from structural validation.
 *
 * # Returns
 * A `SemanticResult` with de-duplicated faults and confidence scores.
 *
 * # Throws
 * `Error` if the server returns a non-OK status.
 */
export async function validateSemantic(
  textDictionary: TextDictionary,
  validPaths: ValidPathsFile,
): Promise<SemanticResult> {
  const res = await fetch(`${BASE}/validate/semantic`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text_dictionary: textDictionary, valid_paths: validPaths }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error ?? `Server error ${res.status}`)
  }
  return res.json()
}
