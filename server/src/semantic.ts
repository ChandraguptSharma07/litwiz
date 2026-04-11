// ──────────────────────────────────────────────────────────────
//  semantic.ts — Semantic validation via Hindsight
//
//  Adapted from semantic-ai/src/validate.ts — same logic, called
//  as a library function from the Express route rather than as a
//  CLI process.
//
//  For each valid path from structural validation:
//    1. Create a fresh Hindsight memory bank
//    2. Retain world rules into it
//    3. Retain each node's prose + facts in sequence
//    4. reflect() with a structured prompt asking for 5 fault types
//    5. Parse the JSON response into SemanticFault objects
//    6. Clean up the bank
//
//  One bank per path — never one bank for the whole narrative.
//  This prevents memory bleed between paths.
// ──────────────────────────────────────────────────────────────

import axios from 'axios'
import type { TextDictionary, ValidPathsOutput, SemanticFault, SemanticResult } from './types'

/** Base URL for the Hindsight Docker container's HTTP API. */
const HINDSIGHT_BASE = process.env.HINDSIGHT_URL ?? 'http://localhost:8888'

/** Union type of the five recognized semantic fault categories. */
type FaultType =
  | 'CHARACTER_CONTINUITY'
  | 'KNOWLEDGE_CONTINUITY'
  | 'ITEM_CONTINUITY'
  | 'WORLD_RULE_VIOLATION'
  | 'EMOTIONAL_CONTINUITY'

/** Set of recognized fault type strings for validation during parsing. */
const KNOWN_TYPES = new Set<FaultType>([
  'CHARACTER_CONTINUITY',
  'KNOWLEDGE_CONTINUITY',
  'ITEM_CONTINUITY',
  'WORLD_RULE_VIOLATION',
  'EMOTIONAL_CONTINUITY',
])

// ═══════════════════════════════════════════════════════════════
//  Hindsight HTTP Client Helpers
// ═══════════════════════════════════════════════════════════════

/**
 * Cached availability flag. `null` means untested, `true`/`false`
 * means the health check has been performed and cached for this run.
 */
let _available: boolean | null = null

/**
 * Check whether the Hindsight Docker container is reachable.
 *
 * Pings `/health` once and caches the result for the lifetime
 * of this server process. Subsequent calls return the cached value.
 *
 * # Returns
 * `true` if Hindsight responded to the health check; `false` otherwise.
 */
async function isHindsightUp(): Promise<boolean> {
  if (_available !== null) return _available
  try {
    await axios.get(`${HINDSIGHT_BASE}/health`, { timeout: 5000 })
    _available = true
    console.log('[semantic] Hindsight is up at', HINDSIGHT_BASE)
  } catch {
    _available = false
    console.warn('[semantic] Hindsight unreachable at', HINDSIGHT_BASE, '— semantic analysis disabled')
  }
  return _available
}

/**
 * Store a fact in a named Hindsight memory bank.
 *
 * The retained text becomes part of the bank's long-term memory and
 * will be surfaced during subsequent `reflect()` calls against the same bank.
 *
 * # Arguments
 * * `bankId` — Unique identifier for the memory bank (one per path).
 * * `text` — The fact, scene prose, or world rule to retain.
 */
async function retain(bankId: string, text: string): Promise<void> {
  await axios.post(`${HINDSIGHT_BASE}/api/retain`, { bank_id: bankId, text }, { timeout: 15_000 })
}

/**
 * Ask Hindsight a question against a named memory bank.
 *
 * Hindsight retrieves relevant retained facts from the bank, then
 * uses an LLM to reason about the query. Used to detect narrative
 * continuity errors by asking about contradictions in the retained scenes.
 *
 * # Arguments
 * * `bankId` — The memory bank to query against.
 * * `question` — The structured prompt asking for fault detection.
 *
 * # Returns
 * The LLM's answer string, or `null` if the request failed.
 */
async function reflect(bankId: string, question: string): Promise<string | null> {
  try {
    const res = await axios.post(
      `${HINDSIGHT_BASE}/api/reflect`,
      { bank_id: bankId, query: question },
      { timeout: 60_000 },
    )
    return res.data?.answer ?? res.data?.response ?? String(res.data)
  } catch (err) {
    console.warn('[semantic] reflect() failed:', (err as Error).message)
    return null
  }
}

/**
 * Delete a Hindsight memory bank after analysis is complete.
 *
 * Cleanup is non-critical — leftover banks just waste a little memory
 * on the Hindsight container. Failures are silently ignored.
 *
 * # Arguments
 * * `bankId` — The memory bank to delete.
 */
async function deleteBank(bankId: string): Promise<void> {
  try {
    await axios.delete(`${HINDSIGHT_BASE}/api/bank/${bankId}`, { timeout: 5000 })
  } catch {
    // non-critical
  }
}

// ═══════════════════════════════════════════════════════════════
//  Response Parser — LLM JSON → SemanticFault[]
// ═══════════════════════════════════════════════════════════════

/** Shape of a single finding from the LLM's freeform JSON response. */
interface RawFinding {
  node_id?: string
  type?: string
  description?: string
  confidence?: number | string
}

/** Global fault ID counter — reset at the start of each validation run. */
let counter = 0

/**
 * Generate the next sequential semantic fault ID (e.g. `"sem_001"`).
 *
 * # Returns
 * A zero-padded fault ID string.
 */
function nextId(): string {
  return `sem_${String(++counter).padStart(3, '0')}`
}

/**
 * Parse the LLM's freeform response into typed `SemanticFault` objects.
 *
 * Handles common LLM quirks: markdown code fences, preamble text before
 * the JSON array, unknown fault types, and malformed JSON. Only faults
 * with a recognized type from {@link KNOWN_TYPES} are included.
 *
 * Severity is determined by confidence: ≥ 0.85 → `"error"`, else `"warning"`.
 *
 * # Arguments
 * * `raw` — The raw string response from Hindsight's reflect() call.
 * * `pathId` — The path ID this analysis was performed on.
 *
 * # Returns
 * Array of parsed and validated `SemanticFault` objects.
 */
function parseFaults(raw: string, pathId: string): SemanticFault[] {
  let cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const start = cleaned.indexOf('[')
  const end = cleaned.lastIndexOf(']')
  if (start === -1 || end === -1) return []

  let findings: RawFinding[]
  try {
    findings = JSON.parse(cleaned.slice(start, end + 1))
  } catch {
    return []
  }

  if (!Array.isArray(findings)) return []

  const faults: SemanticFault[] = []
  for (const f of findings) {
    const rawType = String(f.type ?? '').toUpperCase().replace(/\s+/g, '_') as FaultType
    if (!KNOWN_TYPES.has(rawType)) continue

    const confidence = Math.min(1, Math.max(0, parseFloat(String(f.confidence ?? '0.8'))))
    const nodeId = String(f.node_id ?? 'unknown')

    faults.push({
      fault_id: nextId(),
      type: rawType,
      severity: confidence >= 0.85 ? 'error' : 'warning',
      node_id: nodeId,
      path_id: pathId,
      message: String(f.description ?? ''),
      affected_nodes: [nodeId],
      hindsight_confidence: confidence,
    })
  }
  return faults
}

/**
 * De-duplicate faults that appear on multiple paths for the same node
 * and fault type — keeps the highest-confidence instance.
 *
 * Key format: `"TYPE::node_id"` (e.g. `"CHARACTER_CONTINUITY::node_9"`).
 *
 * # Arguments
 * * `faults` — Array of all faults across all paths.
 *
 * # Returns
 * De-duplicated array with only the highest-confidence fault per key.
 */
function deduplicate(faults: SemanticFault[]): SemanticFault[] {
  const best = new Map<string, SemanticFault>()
  for (const f of faults) {
    const key = `${f.type}::${f.node_id}`
    const existing = best.get(key)
    if (!existing || f.hindsight_confidence > existing.hindsight_confidence) {
      best.set(key, f)
    }
  }
  return Array.from(best.values())
}

/**
 * The reflect prompt sent to Hindsight — instructs the LLM to analyze
 * retained story scenes for the five recognized continuity error types
 * and respond with a structured JSON array.
 */
const REFLECT_PROMPT = `Analyze the story scenes stored in this memory bank for narrative continuity errors.

Check for these five types only:
1. CHARACTER_CONTINUITY — a character appears alive or acts after being established as dead on this path
2. KNOWLEDGE_CONTINUITY — a character references facts, codes, or names they couldn't know from prior scenes on this path
3. ITEM_CONTINUITY — a character uses an item that was never obtained on this path
4. WORLD_RULE_VIOLATION — any event violates the stated world rules (supernatural in a realistic setting, anachronism, etc.)
5. EMOTIONAL_CONTINUITY — a character's mood or reaction directly contradicts immediate prior trauma

Respond ONLY with a valid JSON array. If no errors: [].

Each object must be:
{
  "node_id": "node_X",
  "type": "one of the five types above",
  "description": "One sentence: the contradiction and the prior scene that established the conflicting fact.",
  "confidence": 0.0 to 1.0
}

Be conservative. Only flag clear contradictions with direct evidence from the retained facts.`

// ═══════════════════════════════════════════════════════════════
//  PUBLIC API — runSemanticValidation
// ═══════════════════════════════════════════════════════════════

/**
 * Run Hindsight semantic validation on all valid narrative paths.
 *
 * For each path in `validPaths`:
 * 1. Creates a fresh Hindsight memory bank (one per path to prevent bleed)
 * 2. Retains all world rules into the bank
 * 3. Retains each node's prose, established facts, and character states in sequence
 * 4. Calls `reflect()` with the structured prompt to detect continuity errors
 * 5. Parses the JSON response into typed `SemanticFault` objects
 * 6. Deletes the memory bank
 *
 * After processing all paths, de-duplicates faults across paths (keeping
 * the highest-confidence instance per type+node combination).
 *
 * Returns gracefully with empty faults if Hindsight is unreachable.
 *
 * # Arguments
 * * `textDict` — The text dictionary with prose, facts, and world rules.
 * * `validPaths` — The valid paths output from structural validation.
 *
 * # Returns
 * A `SemanticResult` containing the narrative title, timestamp, and all faults.
 */
export async function runSemanticValidation(
  textDict: TextDictionary,
  validPaths: ValidPathsOutput,
): Promise<SemanticResult> {
  counter = 0 // reset fault ID counter per run

  const available = await isHindsightUp()
  if (!available) {
    return {
      narrative_title: textDict.title,
      validated_at: new Date().toISOString(),
      semantic_faults: [],
    }
  }

  const prefix = textDict.title.replace(/\s+/g, '-').toLowerCase().slice(0, 40)
  const allFaults: SemanticFault[] = []

  for (const path of validPaths.valid_paths) {
    const bankId = `${prefix}-${path.path_id}-${Date.now()}`
    console.log(`[semantic] Analyzing ${path.path_id} (${path.node_sequence.length} nodes)`)

    // Retain world rules
    for (const rule of textDict.world_rules) {
      await retain(bankId, `WORLD RULE: ${rule}`)
    }

    // Retain scene prose and facts in order
    for (const nodeId of path.node_sequence) {
      const node = textDict.nodes[nodeId]
      if (!node) continue

      await retain(bankId, `SCENE ${nodeId}: ${node.prose}`)

      for (const fact of node.established_facts) {
        await retain(bankId, `ESTABLISHED after ${nodeId}: ${fact}`)
      }
      for (const cs of node.character_states) {
        await retain(bankId, `CHARACTER STATE after ${nodeId}: ${cs}`)
      }
    }

    const answer = await reflect(bankId, REFLECT_PROMPT)
    if (answer) {
      const faults = parseFaults(answer, path.path_id)
      console.log(`[semantic] ${path.path_id}: ${faults.length} fault(s)`)
      allFaults.push(...faults)
    }

    await deleteBank(bankId)
  }

  const deduped = deduplicate(allFaults)
  console.log(`[semantic] Total after dedup: ${deduped.length}`)

  return {
    narrative_title: textDict.title,
    validated_at: new Date().toISOString(),
    semantic_faults: deduped,
  }
}
