// ──────────────────────────────────────────────────────────────
//  types.ts — Semantic AI validation contract types
//
//  Defines the input/output contracts for the Hindsight semantic
//  validation module. These types are the semantic-ai equivalent
//  of core-engine's types.rs — they define the data shapes that
//  flow between the orchestrator, Hindsight client, and caller.
//
//  Contract schemas:
//    Input:   TextDictionary, ValidPathsOutput
//    Output:  SemanticResult, SemanticFault
//    Config:  HindsightConfig
//    API:     HindsightRetainRequest, HindsightReflectRequest, etc.
// ──────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════
//  INPUT CONTRACTS — from ingestion + core-engine
// ═══════════════════════════════════════════════════════════════

/**
 * Textual content for a single narrative node.
 * Contains the prose and extracted facts that Hindsight will
 * retain into its memory bank for continuity analysis.
 */
export interface TextNode {
    /** The narrative prose displayed to the reader at this node. */
    prose: string
    /** Character states at this point (e.g. "Alice is wounded"). */
    character_states: string[]
    /** Facts established by this scene (e.g. "The door code is 4521"). */
    established_facts: string[]
}

/**
 * The text dictionary contract — maps node IDs to textual content.
 * This is one of the two inputs to semantic validation (the other
 * being valid paths from structural validation).
 */
export interface TextDictionary {
    /** Title of the narrative. */
    title: string
    /** Global world rules (e.g. "This is a realistic setting with no magic"). */
    world_rules: string[]
    /** Maps node ID → textual content for that node. */
    nodes: Record<string, TextNode>
}

/**
 * A snapshot of accumulated narrative state at a specific node.
 */
export interface StateSnapshot {
    /** The node ID where this snapshot was taken. */
    node_id: string
    /** The accumulated state at this point in the path. */
    state: Record<string, boolean | string>
}

/**
 * A single valid end-to-end path through the narrative graph.
 * Each path is analyzed independently by Hindsight to detect
 * continuity errors along that specific reading experience.
 */
export interface ValidPath {
    /** Sequential path identifier (e.g. `"path_1"`). */
    path_id: string
    /** Ordered list of node IDs visited along this path. */
    node_sequence: string[]
    /** State snapshot at each node (parallel to `node_sequence`). */
    state_at_each_node: StateSnapshot[]
    /** The ID of the ending node where this path terminates. */
    ending_node: string
    /** Always `true` for paths in the output. */
    is_valid: boolean
}

/**
 * The valid paths output from structural validation.
 * Contains metadata about the graph and all valid paths.
 */
export interface ValidPathsOutput {
    /** Summary statistics about the graph and validation. */
    metadata: {
        total_nodes: number
        total_edges: number
        valid_path_count: number
        structural_fault_count: number
    }
    /** All valid end-to-end paths discovered by the core engine. */
    valid_paths: ValidPath[]
}

// ═══════════════════════════════════════════════════════════════
//  OUTPUT CONTRACTS — semantic faults
// ═══════════════════════════════════════════════════════════════

/**
 * Union type of the five recognized semantic fault categories.
 *
 * - `CHARACTER_CONTINUITY` — Dead/absent character appears active
 * - `KNOWLEDGE_CONTINUITY` — Character knows impossible facts
 * - `ITEM_CONTINUITY` — Character uses unobtained items
 * - `WORLD_RULE_VIOLATION` — Event contradicts world rules
 * - `EMOTIONAL_CONTINUITY` — Mood contradicts prior trauma
 */
export type SemanticFaultType =
    | 'CHARACTER_CONTINUITY'
    | 'KNOWLEDGE_CONTINUITY'
    | 'ITEM_CONTINUITY'
    | 'WORLD_RULE_VIOLATION'
    | 'EMOTIONAL_CONTINUITY'

/**
 * A single semantic fault detected by Hindsight AI.
 * Represents a narrative continuity error with confidence scoring.
 */
export interface SemanticFault {
    /** Sequential fault identifier (e.g. `"sem_001"`). */
    fault_id: string
    /** The category of continuity error detected. */
    type: SemanticFaultType
    /** Severity based on confidence: ≥ 0.85 → `"error"`, else `"warning"`. */
    severity: 'error' | 'warning'
    /** The primary node where the fault was detected. */
    node_id: string
    /** The path ID on which this fault was observed. */
    path_id: string
    /** Human-readable description of the contradiction. */
    message: string
    /** All node IDs involved in the fault. */
    affected_nodes: string[]
    /** Hindsight's confidence score (0.0 – 1.0). */
    hindsight_confidence: number
}

/**
 * The complete semantic validation result — returned by the
 * `runSemanticValidation` function and written to `semantic_faults.json`.
 */
export interface SemanticResult {
    /** Title of the validated narrative. */
    narrative_title: string
    /** ISO 8601 timestamp of when validation was performed. */
    validated_at: string
    /** All de-duplicated semantic faults across all paths. */
    semantic_faults: SemanticFault[]
}

// ═══════════════════════════════════════════════════════════════
//  HINDSIGHT API CONTRACTS
// ═══════════════════════════════════════════════════════════════

/**
 * Configuration for connecting to the Hindsight Docker container.
 */
export interface HindsightConfig {
    /** Base URL of the Hindsight HTTP API (e.g. `"http://localhost:8888"`). */
    baseUrl: string
    /** API key for authentication (from ANTHROPIC_API_KEY env var). */
    apiKey: string
}

/**
 * Request body for the `POST /api/retain` Hindsight endpoint.
 * Stores a fact in a named memory bank for later reflection.
 */
export interface HindsightRetainRequest {
    /** Unique identifier for the memory bank. */
    bank_id: string
    /** The fact, scene prose, or world rule to retain. */
    text: string
}

/**
 * Request body for the `POST /api/reflect` Hindsight endpoint.
 * Asks the LLM a question against a named memory bank.
 */
export interface HindsightReflectRequest {
    /** The memory bank to query against. */
    bank_id: string
    /** The structured prompt asking for fault detection. */
    query: string
}

/**
 * Response from the `POST /api/reflect` Hindsight endpoint.
 */
export interface HindsightReflectResponse {
    /** The LLM's answer (may be raw text or JSON string). */
    answer: string
}

// ═══════════════════════════════════════════════════════════════
//  BACKWARDS COMPATIBILITY ALIASES
// ═══════════════════════════════════════════════════════════════

/**
 * Alias for `ValidPathsOutput` — used by `validate.ts` and `index.ts`.
 * @see ValidPathsOutput
 */
export type ValidPathsContract = ValidPathsOutput

/**
 * Alias for `SemanticResult` — used by `index.ts` for the output payload.
 * @see SemanticResult
 */
export type SemanticFaultPayload = SemanticResult

/**
 * Shape of a single finding from the LLM's freeform JSON response.
 * Used by `parseReflectResponse` in `validate.ts` to type raw LLM output
 * before converting to typed `SemanticFault` objects.
 */
export interface ReflectFinding {
    /** Node ID where the fault was detected. */
    node_id?: string
    /** Raw fault type string from the LLM. */
    type?: string
    /** Human-readable description of the contradiction. */
    description?: string
    /** Confidence score (0.0 – 1.0). */
    confidence?: number | string
}
