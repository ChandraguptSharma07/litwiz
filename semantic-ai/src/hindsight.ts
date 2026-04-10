// ============================================================
// Hindsight Client Wrapper
//
// Wraps the Hindsight HTTP API with:
//  - typed retain() / reflect() / deleteBank() calls
//  - graceful fallback — if Hindsight is unreachable the
//    caller gets null back, never a thrown exception
// ============================================================

import axios, { AxiosInstance } from 'axios';

const HINDSIGHT_BASE_URL = process.env.HINDSIGHT_URL ?? 'http://localhost:8888';

export interface ReflectResult {
    answer: string;
    /** Raw recall snippets Hindsight surfaced before answering */
    recalled: string[];
}

export class HindsightClient {
    private readonly http: AxiosInstance;
    private available: boolean | null = null; // null = untested

    constructor(baseUrl: string = HINDSIGHT_BASE_URL) {
        this.http = axios.create({
            baseURL: baseUrl,
            timeout: 60_000, // LLM round-trips can take a while
            headers: { 'Content-Type': 'application/json' },
        });
    }

    /** Ping Hindsight once and cache the result for the lifetime of this run. */
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
     * Store a fact in a named memory bank.
     * Returns true on success, false if Hindsight is down.
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
     * Returns the answer string, or null if Hindsight is down / errors.
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
     * Delete a memory bank — used to clean up per-path banks after analysis.
     * Failure here is non-fatal; we log and move on.
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

export const hindsight = new HindsightClient();
