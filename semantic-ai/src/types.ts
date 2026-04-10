// ============================================================
// Contract Types — NVE Semantic AI
// These match the shapes defined in /contracts exactly.
// ============================================================

// ---- Inputs ------------------------------------------------

export interface TextDictionaryNode {
    prose: string;
    character_states: string[];
    established_facts: string[];
}

export interface TextDictionary {
    title: string;
    world_rules: string[];
    nodes: Record<string, TextDictionaryNode>;
}

export interface StateSnapshot {
    node_id: string;
    state: Record<string, boolean | string | number>;
}

export interface ValidPath {
    path_id: string;
    node_sequence: string[];
    state_at_each_node: StateSnapshot[];
    ending_node: string;
    is_valid: boolean;
}

export interface ValidPathsContract {
    metadata: {
        total_nodes: number;
        total_edges: number;
        valid_path_count: number;
        structural_fault_count: number;
    };
    valid_paths: ValidPath[];
}

// ---- Output ------------------------------------------------

export type SemanticFaultType =
    | 'CHARACTER_CONTINUITY'
    | 'KNOWLEDGE_CONTINUITY'
    | 'ITEM_CONTINUITY'
    | 'WORLD_RULE_VIOLATION'
    | 'EMOTIONAL_CONTINUITY';

export type FaultSeverity = 'error' | 'warning';

export interface SemanticFault {
    fault_id: string;
    type: SemanticFaultType;
    severity: FaultSeverity;
    node_id: string;
    path_id: string;
    message: string;
    affected_nodes: string[];
    hindsight_confidence: number;
}

export interface SemanticFaultPayload {
    narrative_title: string;
    validated_at: string;
    semantic_faults: SemanticFault[];
}

// ---- Hindsight reflect() parsed response -------------------

export interface ReflectFinding {
    node_id: string;
    type: string;
    description: string;
    confidence?: number;
}
