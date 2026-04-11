// ──────────────────────────────────────────────────────────────
//  hindsight.ts — Hindsight HTTP API client wrapper
//
//  Provides a typed client for the Hindsight Docker container's
//  REST API. The client is designed for graceful degradation —
//  if Hindsight is unreachable, callers get `null`/`false` back,
//  never a thrown exception.
//
//  API surface:
//    retain()     — Store a fact in a named memory bank
//    reflect()    — Ask the LLM a question against a bank
//    deleteBank() — Clean up a per-path bank after analysis
//
//  The availability check (`/health`) is performed once and
//  cached for the lifetime of the process.
// ──────────────────────────────────────────────────────────────

import axios, { AxiosInstance } from 'axios';

/**
 * Base URL for the Hindsight container, overridden by the
 * `HINDSIGHT_URL` environment variable.
 */
const HINDSIGHT_BASE_URL = process.env.HINDSIGHT_URL ?? 'http://localhost:8888';

/**
 * Response shape from a `reflect()` call.
 * Contains the LLM's answer and any recalled memory snippets
 * that were surfaced as supporting evidence.
 */
export interface ReflectResult {
    /** The LLM's generated answer (may be raw text or JSON string). */
    answer: string;
    /** Raw recall snippets Hindsight surfaced before answering. */
    recalled: string[];
}

// ═══════════════════════════════════════════════════════════════
//  HindsightClient — typed wrapper for the Hindsight HTTP API
// ═══════════════════════════════════════════════════════════════

/**
 * Typed HTTP client for the Hindsight memory-augmented LLM API.
 *
 * Designed for fault tolerance — all methods handle HTTP errors
 * internally and return safe fallback values. The caller never
 * needs to wrap calls in try/catch.
 *
 * Usage:
 * ```ts
 * const client = new HindsightClient();
 * await client.retain('bank-1', 'Alice enters the cave.');
 * const result = await client.reflect('bank-1', 'Did Alice leave the cave?');
 * ```
 */
export class HindsightClient {
    /** Axios instance pre-configured with base URL and timeouts. */
    private readonly http: AxiosInstance;

    /**
     * Cached availability flag.
     * `null` = untested, `true` = reachable, `false` = unreachable.
     */
    private available: boolean | null = null;

    /**
     * Create a new `HindsightClient` instance.
     *
     * # Arguments
     * * `baseUrl` — Override the default base URL (from `HINDSIGHT_URL` env var).
     */
    constructor(baseUrl: string = HINDSIGHT_BASE_URL) {
        this.http = axios.create({
            baseURL: baseUrl,
            timeout: 60_000, // LLM round-trips can take a while
            headers: { 'Content-Type': 'application/json' },
        });
    }

    /**
     * Check whether the Hindsight container is reachable.
     *
     * Pings `/health` once and caches the result for the lifetime
     * of this process. Subsequent calls return the cached value.
     *
     * # Returns
     * `true` if Hindsight responded to the health check; `false` otherwise.
     */
    async isAvailable(): Promise<boolean> {
        if (this.available !== null) return this.available;
        try {
            await this.http.get('/health');
            this.available = true;
            console.log('[hindsight] ✓ Connected at', HINDSIGHT_BASE_URL);
        } catch {
            this.available = false;
            console.warn(
                '[hindsight] ✗ Unreachable at',
                HINDSIGHT_BASE_URL,
                '— semantic analysis will be skipped.'
            );
        }
        return this.available;
    }

    /**
     * Store a fact in a named Hindsight memory bank.
     *
     * The retained text becomes part of the bank's long-term memory
     * and will be surfaced during subsequent `reflect()` calls.
     *
     * # Arguments
     * * `bankId` — Unique identifier for the memory bank (one per path).
     * * `text` — The fact, scene prose, or world rule to retain.
     *
     * # Returns
     * `true` on success, `false` if Hindsight is down or the request failed.
     */
    async retain(bankId: string, text: string): Promise<boolean> {
        if (!(await this.isAvailable())) return false;
        try {
            await this.http.post('/api/retain', { bank_id: bankId, text });
            return true;
        } catch (err) {
            console.warn(`[hindsight] retain() failed for bank "${bankId}":`, (err as Error).message);
            return false;
        }
    }

    /**
     * Ask Hindsight a question against a named memory bank.
     *
     * Hindsight retrieves relevant retained facts from the bank,
     * then uses an LLM to reason about the query. Used to detect
     * narrative continuity errors by asking about contradictions
     * in the retained scenes.
     *
     * # Arguments
     * * `bankId` — The memory bank to query against.
     * * `question` — The structured prompt asking for fault detection.
     *
     * # Returns
     * A `ReflectResult` with the answer and recalled snippets,
     * or `null` if Hindsight is down or the request failed.
     */
    async reflect(bankId: string, question: string): Promise<ReflectResult | null> {
        if (!(await this.isAvailable())) return null;
        try {
            const res = await this.http.post('/api/reflect', {
                bank_id: bankId,
                query: question,
            });
            return {
                answer: res.data?.answer ?? res.data?.response ?? String(res.data),
                recalled: res.data?.recalled ?? [],
            };
        } catch (err) {
            console.warn(`[hindsight] reflect() failed for bank "${bankId}":`, (err as Error).message);
            return null;
        }
    }

    /**
     * Delete a Hindsight memory bank after analysis is complete.
     *
     * Cleanup is non-critical — leftover banks just waste a little
     * memory on the Hindsight container. Failures are silently
     * logged and ignored.
     *
     * # Arguments
     * * `bankId` — The memory bank to delete.
     */
    async deleteBank(bankId: string): Promise<void> {
        if (!(await this.isAvailable())) return;
        try {
            await this.http.delete(`/api/bank/${bankId}`);
        } catch {
            // Non-critical — leftover banks just waste a little memory
        }
    }
}

/**
 * Default singleton `HindsightClient` instance.
 * Uses the `HINDSIGHT_URL` environment variable or defaults to `localhost:8888`.
 */
export const hindsight = new HindsightClient();
