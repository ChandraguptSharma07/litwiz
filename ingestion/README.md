# /ingestion — Narrative Parser

**Owner:** Dev 1  
**Stack:** Rust

Takes a raw narrative file (our NVE JSON format, Twine export, or Ink JSON) and normalizes
it into the two contracts downstream modules depend on.

## Outputs

- `contracts/normalized_graph.json` — pure graph structure, no prose
- `contracts/text_dictionary.json` — pure prose, no graph structure

Run `cargo build --release` then:

```
./target/release/nve-ingest ../demo/journey_under_the_sea.json
```

## Dev workflow

Until ingestion is done, everyone else builds against `contracts/mock_normalized_graph.json`
and `contracts/mock_text_dictionary.json`. Don't block on this module.
