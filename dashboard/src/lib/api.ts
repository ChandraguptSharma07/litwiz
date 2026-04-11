// API client for the NVE server (running on :3001, proxied via Vite dev server).
// All functions throw on network/server errors — callers handle them.

import type {
  NormalizedGraph,
  TextDictionary,
  ValidPathsFile,
  FaultPayload,
  SemanticFault,
} from './types'

const BASE = '/api'

// ── POST /api/ingest ──────────────────────────────────────────

export interface IngestResult {
  normalized_graph: NormalizedGraph
  text_dictionary: TextDictionary
}

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

// ── POST /api/validate/structural ─────────────────────────────

export interface StructuralResult {
  narrative_title: string
  validated_at: string
  structural_faults: FaultPayload['structural_faults']
  valid_endings: FaultPayload['valid_endings']
  valid_paths: ValidPathsFile
}

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

// ── POST /api/validate/semantic ───────────────────────────────

export interface SemanticResult {
  narrative_title: string
  validated_at: string
  semantic_faults: SemanticFault[]
}

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
