/**
 * @module ingest
 * @description Narrative ingestion via Groq's LLM.
 *
 * Takes raw literature text and sends it to Groq (llama-3.3-70b) with a structured
 * prompt that extracts the narrative graph. Returns both the structural skeleton
 * (`normalized_graph`) and the textual content (`text_dictionary`).
 *
 * This is the "AI brain" of the web interface — it turns free-form prose into
 * a directed graph that can be validated.
 */

import Groq from 'groq-sdk'
import type { IngestResult } from './types'

/**
 * Groq SDK client instance, authenticated via the `GROQ_API_KEY` environment variable.
 * Groq provides fast inference for open-source LLMs on their LPU hardware.
 */
const client = new Groq({
  apiKey: process.env.GROQ_API_KEY,
})

/**
 * The Groq model used for narrative extraction.
 * llama-3.3-70b is fast and handles structured JSON extraction well.
 * The free tier gives ~6000 tokens/min — plenty for demo-day throughput.
 */
const MODEL = 'llama-3.3-70b-versatile'

/**
 * Maximum input character count sent to the LLM.
 * 12k chars ≈ 3k tokens — stays well within Groq's context window
 * and keeps response latency under ~5s on the free tier.
 */
const MAX_INPUT_CHARS = 12_000

/**
 * System prompt that instructs the LLM how to extract narrative structure.
 * Defines the exact JSON schema for both `normalized_graph` and `text_dictionary`,
 * and explains how to handle linear vs. branching narratives.
 */
const SYSTEM_PROMPT = `You are a narrative structure analyst. Your job is to parse a piece of literature and extract its structure as a directed graph that can be validated for continuity errors.

OUTPUT FORMAT: You must respond with ONLY a valid JSON object — no markdown fences, no explanation, just raw JSON.

WHAT TO EXTRACT:
- Nodes: major scenes, plot points, or decision moments. Aim for 12-25 nodes.
- For LINEAR narratives (novels, screenplays): each scene is a node, ending of the scene has one choice pointing to the next. The protagonist's actions at each scene are the "choices".
- For BRANCHING narratives (CYOA books, game scripts, visual novels): extract each branch as a separate node with multiple outgoing choices.
- Mark any scene where the story concludes (death, resolution, "the end") as is_ending: true
- set_state: extract key state changes per node — character deaths, item acquisitions, knowledge gained. Use boolean or short string values only.
- world_rules: infer from the text — genre, setting, time period, physical constraints (e.g. "Set in 1920s Paris", "No supernatural elements", "Characters age in real time").

SCHEMA (fill every field, no nulls except choice conditions):
{
  "normalized_graph": {
    "title": "string — the work's title or a derived title",
    "version": "1.0",
    "start_node": "node_1",
    "nodes": [
      {
        "id": "node_1",
        "is_ending": false,
        "set_state": {},
        "choices": [
          { "id": "c1a", "text": "short action description", "target": "node_2", "condition": null }
        ]
      }
    ]
  },
  "text_dictionary": {
    "title": "string — same as above",
    "world_rules": ["rule 1", "rule 2"],
    "nodes": {
      "node_1": {
        "prose": "The actual text from this scene, or a close paraphrase if the scene is long. Keep under 300 words.",
        "character_states": ["character X is alive and present", "character Y is unaware of Z"],
        "established_facts": ["fact established in this scene that could matter later"]
      }
    }
  }
}`

/**
 * Send raw literature text to Groq's LLM and extract the narrative structure.
 *
 * The function truncates input to {@link MAX_INPUT_CHARS}, sends it to
 * llama-3.3-70b with a structured extraction prompt, and parses the JSON
 * response into typed `normalized_graph` and `text_dictionary` objects.
 *
 * Handles common LLM quirks: markdown code fences, preamble text before JSON,
 * and missing fields.
 *
 * @param text - The raw literature text to analyze (novel excerpt, screenplay, etc.).
 * @param title - Optional title for the narrative. If omitted, the LLM infers one.
 * @returns A promise resolving to an {@link IngestResult} containing the extracted
 *          `normalized_graph` and `text_dictionary`.
 * @throws {Error} If the LLM response is not valid JSON or is missing required fields.
 */
export async function ingestLiterature(
  text: string,
  title?: string,
): Promise<IngestResult> {
  const truncated = text.slice(0, MAX_INPUT_CHARS)
  const wasLong = text.length > MAX_INPUT_CHARS

  const userMessage = `${title ? `Title: "${title}"\n\n` : ''}${wasLong ? `[Note: text was truncated to the first ${MAX_INPUT_CHARS} characters for analysis]\n\n` : ''}TEXT TO ANALYZE:\n\n${truncated}`

  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 8192,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
  })

  const raw = response.choices[0]?.message?.content ?? ''

  // Strip any accidental markdown fences
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')

  let parsed: { normalized_graph: IngestResult['normalized_graph']; text_dictionary: IngestResult['text_dictionary'] }

  try {
    parsed = JSON.parse(cleaned)
  } catch {
    // Try to extract JSON if the model added any preamble
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start === -1 || end === -1) {
      throw new Error(`Model did not return valid JSON. Response started with: ${raw.slice(0, 200)}`)
    }
    parsed = JSON.parse(cleaned.slice(start, end + 1))
  }

  if (!parsed.normalized_graph || !parsed.text_dictionary) {
    throw new Error('Response missing normalized_graph or text_dictionary fields')
  }

  return {
    normalized_graph: parsed.normalized_graph,
    text_dictionary: parsed.text_dictionary,
  }
}
