# /semantic-ai — Hindsight Integration

**Owner:** Dev 3  
**Stack:** TypeScript + Hindsight JS SDK

Reads `valid_paths.json` and `text_dictionary.json`, then uses Hindsight's retain/reflect
loop to find narrative errors that have no mathematical representation.

## Prerequisites

Spin up Hindsight Docker before writing any code:

```bash
export ANTHROPIC_API_KEY=sk-xxx

docker run --rm -it --pull always \
  -p 8888:8888 -p 9999:9999 \
  -e HINDSIGHT_API_LLM_PROVIDER=anthropic \
  -e HINDSIGHT_API_LLM_API_KEY=$ANTHROPIC_API_KEY \
  -v $HOME/.hindsight-docker:/home/hindsight/.pg0 \
  ghcr.io/vectorize-io/hindsight:latest
```

Confirm it responds at `http://localhost:8888` before proceeding.

## Output

- `contracts/semantic_faults.json`

## Dev workflow

Start immediately against the mock files. One Hindsight memory bank per path —
not per narrative — to prevent cross-path memory contamination.

```
npx ts-node src/index.ts
```
