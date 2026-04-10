// ============================================================
// index.ts — NVE Semantic AI Entry Point
//
// Usage:
//   npx ts-node src/index.ts
//   npx ts-node src/index.ts --text-dict ../contracts/mock_text_dictionary.json
//                            --valid-paths ../contracts/mock_valid_paths.json
//                            --output ../contracts/semantic_faults.json
// ============================================================

import fs from 'fs';
import path from 'path';
import { validateNarrative } from './validate';
import { TextDictionary, ValidPathsContract, SemanticFaultPayload } from './types';

// ---- Argument parsing (minimal, no external lib needed) ----

function getArg(flag: string, fallback: string): string {
    const idx = process.argv.indexOf(flag);
    return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

const TEXT_DICT_PATH = getArg(
    '--text-dict',
    path.resolve(__dirname, '../../contracts/mock_text_dictionary.json')
);
const VALID_PATHS_PATH = getArg(
    '--valid-paths',
    path.resolve(__dirname, '../../contracts/mock_valid_paths.json')
);
const OUTPUT_PATH = getArg(
    '--output',
    path.resolve(__dirname, '../../contracts/semantic_faults.json')
);

// ---- Main --------------------------------------------------

async function main(): Promise<void> {
    console.log('╔══════════════════════════════════════════╗');
    console.log('║  NVE Semantic AI — Hindsight Validator   ║');
    console.log('╚══════════════════════════════════════════╝\n');

    // Load inputs
    if (!fs.existsSync(TEXT_DICT_PATH)) {
        console.error(`[error] text_dictionary not found: ${TEXT_DICT_PATH}`);
        process.exit(1);
    }
    if (!fs.existsSync(VALID_PATHS_PATH)) {
        console.error(`[error] valid_paths not found: ${VALID_PATHS_PATH}`);
        process.exit(1);
    }

    const textDict: TextDictionary = JSON.parse(fs.readFileSync(TEXT_DICT_PATH, 'utf-8'));
    const validPaths: ValidPathsContract = JSON.parse(fs.readFileSync(VALID_PATHS_PATH, 'utf-8'));

    console.log(`[main] Narrative   : "${textDict.title}"`);
    console.log(`[main] World rules : ${textDict.world_rules.length}`);
    console.log(`[main] Paths       : ${validPaths.valid_paths.length}`);
    console.log(`[main] Nodes in dict: ${Object.keys(textDict.nodes).length}\n`);

    // Run semantic validation
    const faults = await validateNarrative(textDict, validPaths);

    // Build output payload
    const payload: SemanticFaultPayload = {
        narrative_title: textDict.title,
        validated_at: new Date().toISOString(),
        semantic_faults: faults,
    };

    // Write output
    const outputDir = path.dirname(OUTPUT_PATH);
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2), 'utf-8');

    // Summary
    console.log('\n══════════════════════════════════════════');
    console.log(`  Semantic faults found : ${faults.length}`);
    if (faults.length > 0) {
        for (const f of faults) {
            const conf = (f.hindsight_confidence * 100).toFixed(0);
            console.log(`  [${f.severity.toUpperCase()}] ${f.type} @ ${f.node_id} (${conf}% confidence)`);
            console.log(`         ${f.message}`);
        }
    } else {
        console.log('  No semantic faults detected.');
    }
    console.log(`\n  Output written to: ${OUTPUT_PATH}`);
    console.log('══════════════════════════════════════════\n');

    // Exit 0 always — semantic errors are warnings for the orchestrator,
    // not hard blockers. The orchestrator uses core-engine exit code to gate.
    process.exit(0);
}

main().catch((err) => {
    console.error('[fatal]', err);
    process.exit(1);
});
