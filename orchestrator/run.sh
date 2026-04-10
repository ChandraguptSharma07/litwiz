#!/bin/bash
# orchestrator/run.sh
# Chains the full NVE pipeline end-to-end.
# Run this from the repo root on demo day.

set -e

echo "=== NVE Pipeline ==="
echo ""

# Step 1: Ingest the narrative
echo "[1/3] Ingesting narrative..."
./ingestion/target/release/nve-ingest demo/journey_under_the_sea.json
echo "      -> contracts/normalized_graph.json"
echo "      -> contracts/text_dictionary.json"
echo ""

# Step 2: Structural validation
echo "[2/3] Running structural validation (Rust engine)..."
./core-engine/target/release/nve-validate contracts/normalized_graph.json
STRUCTURAL_EXIT=$?
echo "      -> contracts/structural_faults.json"
echo "      -> contracts/valid_paths.json"
echo ""

# Step 3: Semantic validation — only if structure is clean
if [ $STRUCTURAL_EXIT -eq 0 ]; then
  echo "[3/3] Running semantic validation (Hindsight)..."
  npx ts-node semantic-ai/src/index.ts
  echo "      -> contracts/semantic_faults.json"
else
  echo "[3/3] Skipping semantic validation — structural faults must be resolved first."
  echo "      (This is by design. Fix the structural errors, then re-run.)"
fi

echo ""
echo "=== Pipeline complete. Open the dashboard to review results. ==="
