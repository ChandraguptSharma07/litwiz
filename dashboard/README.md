# /dashboard — Visualization Layer

**Owner:** Dev 4  
**Stack:** React (Vite) + Cytoscape.js + 3d-force-graph + Tailwind

The thing judges actually see. Reads all four mock contract files and renders:
- An interactive 2D/3D graph of the narrative structure
- A sidebar showing structural and semantic faults with jump links
- Per-node detail panels with prose, state changes, and path info
- A phase strip tracking the validation pipeline status

## Install

```bash
npm create vite@latest . -- --template react-ts
npm install cytoscape 3d-force-graph three @types/three
npm install tailwindcss @tailwindcss/vite
npm run dev
```

## Dev workflow

Start immediately against the mock files in `/contracts`. The dashboard never runs
any validation logic — it only renders what the engine modules produce.
