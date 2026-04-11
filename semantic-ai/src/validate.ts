// ──────────────────────────────────────────────────────────────
//  validate.ts — Core semantic analysis loop
//
//  For each valid path from /core-engine:
//    1. Create a fresh Hindsight memory bank
//    2. Retain world rules into it
//    3. Retain each node's prose + facts in sequence
//    4. reflect() with a structured prompt asking for 5 fault types
//    5. Parse the JSON response into SemanticFault objects
//    6. Clean up the bank
//
//  One bank per path — never one bank for the whole narrative.
//  This prevents memory bleed between paths (e.g. path_1 knowing
//  that Volkov died on path_2).
// ──────────────────────────────────────────────────────────────

import { hindsight } from './hindsight';
import {
    TextDictionary,
    ValidPathsContract,
    SemanticFault,
    SemanticFaultType,
    ReflectFinding,
} from './types';

// ═══════════════════════════════════════════════════════════════
//  Fault Type Mapping
// ═══════════════════════════════════════════════════════════════

/**
 * Maps raw string fault types from the LLM to our typed enum values.
 * Any type not in this map is silently discarded during parsing.
 */
const FAULT_TYPE_MAP: Record<string, SemanticFaultType> = {
    CHARACTER_CONTINUITY: 'CHARACTER_CONTINUITY',
    KNOWLEDGE_CONTINUITY: 'KNOWLEDGE_CONTINUITY',
    ITEM_CONTINUITY: 'ITEM_CONTINUITY',
    WORLD_RULE_VIOLATION: 'WORLD_RULE_VIOLATION',
    EMOTIONAL_CONTINUITY: 'EMOTIONAL_CONTINUITY',
};

/** Global fault ID counter — reset at the start of each validation run. */
let faultCounter = 0;

/**
 * Generate the next sequential semantic fault ID (e.g. `"sem_001"`).
 *
 * # Returns
 * A zero-padded fault ID string.
 */
function nextFaultId(): string {
    return `sem_${String(++faultCounter).padStart(3, '0')}`;
}

// ═══════════════════════════════════════════════════════════════
//  Response Parser — LLM JSON → SemanticFault[]
// ═══════════════════════════════════════════════════════════════

/**
 * Parse the LLM's freeform response into typed `SemanticFault` objects.
 *
 * Handles common LLM quirks:
 * - Markdown code fences (`\`\`\`json ... \`\`\``)
 * - Preamble text before the JSON array
 * - Unknown fault types (silently discarded)
 * - Malformed JSON (returns empty array)
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
function parseReflectResponse(raw: string, pathId: string): SemanticFault[] {
    let cleaned = raw.trim();

    // Strip markdown code fences if present
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

    // Try to extract the first JSON array from the response
    const arrayStart = cleaned.indexOf('[');
    const arrayEnd = cleaned.lastIndexOf(']');
    if (arrayStart === -1 || arrayEnd === -1) {
        console.warn(`[validate] Path ${pathId}: no JSON array found in reflect() response`);
        return [];
    }

    let findings: ReflectFinding[];
    try {
        findings = JSON.parse(cleaned.slice(arrayStart, arrayEnd + 1));
    } catch (err) {
        console.warn(`[validate] Path ${pathId}: JSON parse failed —`, (err as Error).message);
        console.warn('[validate] Raw response was:', raw.slice(0, 300));
        return [];
    }

    if (!Array.isArray(findings)) return [];

    const faults: SemanticFault[] = [];

    for (const finding of findings) {
        const rawType = String(finding.type ?? '').toUpperCase().replace(/\s+/g, '_');
        const faultType = FAULT_TYPE_MAP[rawType];

        if (!faultType) {
            console.warn(`[validate] Unknown fault type "${rawType}" — skipping`);
            continue;
        }

        const nodeId = String(finding.node_id ?? 'unknown');
        const confidence = parseFloat(String(finding.confidence ?? '0.8'));

        faults.push({
            fault_id: nextFaultId(),
            type: faultType,
            // Anything with confidence >= 0.85 is an error, lower = warning
            severity: confidence >= 0.85 ? 'error' : 'warning',
            node_id: nodeId,
            path_id: pathId,
            message: String(finding.description ?? ''),
            affected_nodes: [nodeId],
            hindsight_confidence: Math.min(1, Math.max(0, confidence)),
        });
    }

    return faults;
}

// ═══════════════════════════════════════════════════════════════
//  De-duplication
// ═══════════════════════════════════════════════════════════════

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
function deduplicateFaults(faults: SemanticFault[]): SemanticFault[] {
    const seen = new Map<string, SemanticFault>();

    for (const fault of faults) {
        const key = `${fault.type}::${fault.node_id}`;
        const existing = seen.get(key);
        if (!existing || fault.hindsight_confidence > existing.hindsight_confidence) {
            seen.set(key, fault);
        }
    }

    return Array.from(seen.values());
}

// ═══════════════════════════════════════════════════════════════
//  Reflect Prompt
// ═══════════════════════════════════════════════════════════════

/**
 * Build the reflect prompt sent to Hindsight.
 *
 * Instructs the LLM to analyze retained story scenes for the five
 * recognized continuity error types and respond with a structured
 * JSON array. Emphasizes conservatism — only flag clear contradictions
 * with direct evidence from retained facts.
 *
 * # Returns
 * The formatted prompt string.
 */
function buildReflectPrompt(): string {
    return `
Analyze the story scenes retained in this memory bank for narrative errors.
You must check specifically for these five error types:

1. CHARACTER_CONTINUITY — A character appears or speaks as alive when they were previously
   established as dead or absent on this exact story path.
2. KNOWLEDGE_CONTINUITY — A character references information (a code, a location, a name)
   that they could not possibly know based on scenes earlier in this path.
3. ITEM_CONTINUITY — A character uses or references an object that was never obtained on
   this exact path.
4. WORLD_RULE_VIOLATION — Any event contradicts the stated world rules (e.g. supernatural
   events in a grounded realistic setting, anachronistic technology, etc.).
5. EMOTIONAL_CONTINUITY — A character's emotional state directly contradicts their
   immediate prior experience (e.g. calm and cheerful immediately after witnessing a death).

For each error you detect, output a JSON object. Respond ONLY with a valid JSON array.
If no errors are found, respond with an empty array: []

Each object must have this exact shape:
{
  "node_id": "node_X",
  "type": "CHARACTER_CONTINUITY | KNOWLEDGE_CONTINUITY | ITEM_CONTINUITY | WORLD_RULE_VIOLATION | EMOTIONAL_CONTINUITY",
  "description": "One specific sentence naming the contradiction and citing the prior scene that established the conflicting fact.",
  "confidence": 0.0 to 1.0
}

Be conservative — only flag clear, specific contradictions with strong evidence from the retained facts.
`.trim();
}

// ═══════════════════════════════════════════════════════════════
//  PUBLIC API — validateNarrative
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
 * Returns an empty array if Hindsight is unreachable.
 *
 * # Arguments
 * * `textDict` — The text dictionary with prose, facts, and world rules.
 * * `validPaths` — The valid paths output from structural validation.
 *
 * # Returns
 * Array of de-duplicated `SemanticFault` objects.
 */
export async function validateNarrative(
    textDict: TextDictionary,
    validPaths: ValidPathsContract
): Promise<SemanticFault[]> {
    const available = await hindsight.isAvailable();
    if (!available) {
        console.warn('[validate] Hindsight unavailable — returning empty semantic fault list');
        return [];
    }

    const narrativeBankPrefix = textDict.title.replace(/\s+/g, '-').toLowerCase();
    const allFaults: SemanticFault[] = [];

    for (const path of validPaths.valid_paths) {
        const bankId = `${narrativeBankPrefix}-${path.path_id}`;
        console.log(`\n[validate] Analyzing ${path.path_id} (${path.node_sequence.length} nodes)…`);

        // 1. Retain world rules into this path's bank
        for (const rule of textDict.world_rules) {
            await hindsight.retain(bankId, `WORLD RULE: ${rule}`);
        }

        // 2. Retain each node's prose + facts in sequence
        for (const nodeId of path.node_sequence) {
            const nodeData = textDict.nodes[nodeId];
            if (!nodeData) {
                console.warn(`[validate] No text data for ${nodeId} — skipping`);
                continue;
            }

            await hindsight.retain(bankId, `SCENE ${nodeId}: ${nodeData.prose}`);

            for (const fact of nodeData.established_facts) {
                await hindsight.retain(bankId, `ESTABLISHED after ${nodeId}: ${fact}`);
            }

            for (const state of nodeData.character_states) {
                await hindsight.retain(bankId, `CHARACTER STATE after ${nodeId}: ${state}`);
            }
        }

        // 3. Reflect
        const result = await hindsight.reflect(bankId, buildReflectPrompt());

        if (result) {
            console.log(`[validate] ${path.path_id}: reflect() returned ${result.answer.length} chars`);
            const faults = parseReflectResponse(result.answer, path.path_id);
            console.log(`[validate] ${path.path_id}: parsed ${faults.length} fault(s)`);
            allFaults.push(...faults);
        } else {
            console.warn(`[validate] ${path.path_id}: reflect() returned null — skipping`);
        }

        // 4. Clean up — don't let banks accumulate across runs
        await hindsight.deleteBank(bankId);
    }

    const deduped = deduplicateFaults(allFaults);
    console.log(`\n[validate] Total faults before dedup: ${allFaults.length}, after: ${deduped.length}`);
    return deduped;
}
