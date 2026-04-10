#!/bin/bash
# Step 1: Ingest
./ingestion/target/release/nve-ingest demo/journey_under_the_sea.json
# Step 2: Core engine
if [ $? -ne 0 ]; then
  echo "Ingestion failed."
  exit 1
fi
./core-engine/target/release/nve-validate contracts/normalized_graph.json
# Step 3: Semantic AI (only if no structural faults)
if [ $? -eq 0 ]; then
  npx ts-node semantic-ai/src/index.ts
fi
echo "Pipeline complete. Open dashboard."