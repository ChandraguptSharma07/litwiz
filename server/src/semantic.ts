// Semantic validation via Hindsight.
// Adapted from semantic-ai/src/validate.ts — same logic, called as a library
// function from the Express route rather than as a CLI process.

import axios from 'axios'
import type { TextDictionary, ValidPathsOutput, SemanticFault, SemanticResult } from './types'

const HINDSIGHT_BASE = process.env.HINDSIGHT_URL ?? 'http://localhost:8888'

type FaultType =
  | 'CHARACTER_CONTINUITY'
  | 'KNOWLEDGE_CONTINUITY'
  | 'ITEM_CONTINUITY'
  | 'WORLD_RULE_VIOLATION'
  | 'EMOTIONAL_CONTINUITY'

const KNOWN_TYPES = new Set<FaultType>([
  'CHARACTER_CONTINUITY',
  'KNOWLEDGE_CONTINUITY',
  'ITEM_CONTINUITY',
  'WORLD_RULE_VIOLATION',
  'EMOTIONAL_CONTINUITY',
])

// ── Hindsight availability check ──────────────────────────────

let _available: boolean | null = null

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

async function retain(bankId: string, text: string): Promise<void> {
  await axios.post(`${HINDSIGHT_BASE}/api/retain`, { bank_id: bankId, text }, { timeout: 15_000 })
}

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

async function deleteBank(bankId: string): Promise<void> {
  try {
    await axios.delete(`${HINDSIGHT_BASE}/api/bank/${bankId}`, { timeout: 5000 })
  } catch {
    // non-critical
  }
}

// ── Response parser ───────────────────────────────────────────

interface RawFinding {
  node_id?: string
  type?: string
  description?: string
  confidence?: number | string
}

let counter = 0
function nextId(): string {
  return `sem_${String(++counter).padStart(3, '0')}`
}

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

// ── Main export ───────────────────────────────────────────────

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
