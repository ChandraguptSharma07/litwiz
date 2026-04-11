/**
 * @module index
 * @description Express server entry point for the NVE (Narrative Validation Engine).
 *
 * Configures and starts the Express HTTP server with three main API routes:
 * - `POST /api/ingest` — LLM-powered narrative structure extraction
 * - `POST /api/validate/structural` — Five-algorithm structural graph validation
 * - `POST /api/validate/semantic` — Hindsight AI-powered semantic continuity analysis
 *
 * The server uses Groq for LLM ingestion (free tier) and optionally connects
 * to a Hindsight Docker container for semantic validation.
 */

import 'dotenv/config'
import express, { type Request, type Response, type NextFunction } from 'express'
import cors from 'cors'
import { ingestLiterature } from './ingest'
import { runStructuralValidation } from './structural'
import { runSemanticValidation } from './semantic'
import type { NormalizedGraph, TextDictionary, ValidPathsOutput } from './types'

/** Express application instance. */
const app = express()

/** Server port — defaults to 3001 if `PORT` env var is not set. */
const PORT = process.env.PORT ?? 3001

/**
 * Allowed CORS origins — localhost for dev, Vercel for production.
 * Override with CORS_ORIGIN env var for custom domains.
 */
app.use(cors({
  origin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',')
    : [
      'http://localhost:5173',
      'http://localhost:4173',
      /\.vercel\.app$/,
    ],
}))
app.use(express.json({ limit: '2mb' }))

// ── POST /api/ingest ──────────────────────────────────────────
//
// Takes raw text, calls Claude to extract narrative structure.
// Returns normalized_graph + text_dictionary.
//
// Body: { text: string, title?: string }

/**
 * Ingestion endpoint — accepts raw literature text and extracts a narrative graph.
 *
 * Validates that the input text is at least 50 characters, then sends it to
 * the Groq LLM (llama-3.3-70b) to extract the narrative structure. Returns
 * both the `normalized_graph` (structural skeleton) and `text_dictionary`
 * (prose and facts per node).
 *
 * @route POST /api/ingest
 * @param req.body.text - Raw literature text to analyze (min 50 chars).
 * @param req.body.title - Optional title for the narrative.
 * @returns {{ normalized_graph: NormalizedGraph, text_dictionary: TextDictionary }}
 */
app.post('/api/ingest', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { text, title } = req.body as { text?: string; title?: string }

    if (!text || typeof text !== 'string' || text.trim().length < 50) {
      res.status(400).json({ error: 'Provide at least 50 characters of text to analyze.' })
      return
    }

    console.log(`[ingest] Received ${text.length} chars, title: "${title ?? 'none'}"`)
    const result = await ingestLiterature(text.trim(), title?.trim())

    console.log(
      `[ingest] Done — ${result.normalized_graph.nodes.length} nodes extracted`
    )
    res.json(result)
  } catch (err) {
    next(err)
  }
})

// ── POST /api/validate/structural ─────────────────────────────
//
// Runs all 5 structural algorithms on a normalized graph.
// Returns structural_faults + valid_paths.
//
// Body: { normalized_graph: NormalizedGraph }

/**
 * Structural validation endpoint — runs five graph algorithms on a normalized graph.
 *
 * Algorithms executed:
 * 1. Dead End Detection — nodes with no choices and not marked as endings
 * 2. Unreachable Node Detection — BFS from start node
 * 3. Infinite Loop Detection — DFS cycle detection for inescapable loops
 * 4. Locked Condition Detection — edges with unsatisfiable conditions
 * 5. Valid Path Generation — all start-to-ending paths with state snapshots
 *
 * @route POST /api/validate/structural
 * @param req.body.normalized_graph - The narrative graph to validate.
 * @returns {StructuralResult} Faults, valid endings, and valid paths.
 */
app.post('/api/validate/structural', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { normalized_graph } = req.body as { normalized_graph?: NormalizedGraph }

    if (!normalized_graph?.nodes || !normalized_graph?.start_node) {
      res.status(400).json({ error: 'Provide a valid normalized_graph object.' })
      return
    }

    console.log(`[structural] Validating "${normalized_graph.title}" — ${normalized_graph.nodes.length} nodes`)
    const result = runStructuralValidation(normalized_graph)

    console.log(
      `[structural] Done — ${result.structural_faults.length} faults, ${result.valid_paths.valid_paths.length} valid paths`
    )
    res.json(result)
  } catch (err) {
    next(err)
  }
})

// ── POST /api/validate/semantic ───────────────────────────────
//
// Runs Hindsight semantic validation on all valid paths.
// Returns semantic_faults.
//
// Body: { text_dictionary: TextDictionary, valid_paths: ValidPathsOutput }

/**
 * Semantic validation endpoint — runs Hindsight AI analysis on all valid paths.
 *
 * For each valid path:
 * 1. Creates a fresh Hindsight memory bank
 * 2. Retains world rules into the bank
 * 3. Retains each node's prose and facts in sequence
 * 4. Calls reflect() to detect narrative continuity errors
 * 5. Cleans up the memory bank
 *
 * Returns gracefully with empty faults if Hindsight is unreachable.
 *
 * @route POST /api/validate/semantic
 * @param req.body.text_dictionary - The text dictionary with prose and facts.
 * @param req.body.valid_paths - The valid paths to analyze.
 * @returns {SemanticResult} Semantic faults with confidence scores.
 */
app.post('/api/validate/semantic', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { text_dictionary, valid_paths } = req.body as {
      text_dictionary?: TextDictionary
      valid_paths?: ValidPathsOutput
    }

    if (!text_dictionary || !valid_paths) {
      res.status(400).json({ error: 'Provide text_dictionary and valid_paths.' })
      return
    }

    console.log(
      `[semantic] Validating "${text_dictionary.title}" — ${valid_paths.valid_paths.length} paths`
    )
    const result = await runSemanticValidation(text_dictionary, valid_paths)

    console.log(`[semantic] Done — ${result.semantic_faults.length} faults`)
    res.json(result)
  } catch (err) {
    next(err)
  }
})

// ── Health check ──────────────────────────────────────────────

/**
 * Health check endpoint — returns server status and port.
 * Used by monitoring tools and the dashboard to verify the server is running.
 *
 * @route GET /api/health
 * @returns {{ status: "ok", port: number | string }}
 */
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', port: PORT })
})

// ── Error handler ─────────────────────────────────────────────

/**
 * Global error handler middleware.
 * Catches all unhandled errors from route handlers, logs them,
 * and returns a structured JSON error response with a 500 status code.
 */
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[server error]', err.message)
  res.status(500).json({ error: err.message })
})

/**
 * Start the Express server and print a banner with available routes.
 */
app.listen(PORT, () => {
  console.log()
  console.log('╔══════════════════════════════════════════════╗')
  console.log('║  NVE Server                                  ║')
  console.log(`║  http://localhost:${PORT}                    ║`)
  console.log('║                                              ║')
  console.log('║  POST /api/ingest                            ║')
  console.log('║  POST /api/validate/structural               ║')
  console.log('║  POST /api/validate/semantic                 ║')
  console.log('╚══════════════════════════════════════════════╝')
  console.log()
})
