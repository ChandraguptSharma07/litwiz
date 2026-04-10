import 'dotenv/config'
import express, { type Request, type Response, type NextFunction } from 'express'
import cors from 'cors'
import { ingestLiterature } from './ingest'
import { runStructuralValidation } from './structural'
import { runSemanticValidation } from './semantic'
import type { NormalizedGraph, TextDictionary, ValidPathsOutput } from './types'

const app = express()
const PORT = process.env.PORT ?? 3001

app.use(cors())
app.use(express.json({ limit: '2mb' }))

// ── POST /api/ingest ──────────────────────────────────────────
//
// Takes raw text, calls Claude to extract narrative structure.
// Returns normalized_graph + text_dictionary.
//
// Body: { text: string, title?: string }

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

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', port: PORT })
})

// ── Error handler ─────────────────────────────────────────────

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[server error]', err.message)
  res.status(500).json({ error: err.message })
})

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
