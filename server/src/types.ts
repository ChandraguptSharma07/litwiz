// Shared types for the NVE server.
// These mirror the /contracts schemas exactly.

export interface Choice {
  id: string
  text: string
  target: string
  condition: string | null
}

export interface GraphNode {
  id: string
  is_ending: boolean
  set_state: Record<string, boolean | string>
  choices: Choice[]
}

export interface NormalizedGraph {
  title: string
  version: string
  start_node: string
  nodes: GraphNode[]
}

export interface TextDictionaryNode {
  prose: string
  character_states: string[]
  established_facts: string[]
}

export interface TextDictionary {
  title: string
  world_rules: string[]
  nodes: Record<string, TextDictionaryNode>
}

export interface StateSnapshot {
  node_id: string
  state: Record<string, boolean | string>
}

export interface ValidPath {
  path_id: string
  node_sequence: string[]
  state_at_each_node: StateSnapshot[]
  ending_node: string
  is_valid: boolean
}

export interface ValidPathsOutput {
  metadata: {
    total_nodes: number
    total_edges: number
    valid_path_count: number
    structural_fault_count: number
  }
  valid_paths: ValidPath[]
}

export interface StructuralFault {
  fault_id: string
  type: string
  severity: 'error' | 'warning'
  node_id: string
  message: string
  affected_nodes: string[]
  affected_paths: string[]
}

export interface SemanticFault {
  fault_id: string
  type: string
  severity: 'error' | 'warning'
  node_id: string
  path_id: string
  message: string
  affected_nodes: string[]
  hindsight_confidence: number
}

export interface ValidEnding {
  node_id: string
  prose_preview: string
}

export interface StructuralResult {
  narrative_title: string
  validated_at: string
  structural_faults: StructuralFault[]
  valid_endings: ValidEnding[]
  valid_paths: ValidPathsOutput
}

export interface SemanticResult {
  narrative_title: string
  validated_at: string
  semantic_faults: SemanticFault[]
}

// What the /api/ingest endpoint returns
export interface IngestResult {
  normalized_graph: NormalizedGraph
  text_dictionary: TextDictionary
}
