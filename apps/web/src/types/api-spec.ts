// API Specification Types
export interface ParsedSpec {
  title: string;
  version: string;
  description?: string;
  servers: Array<{
    url: string;
    description?: string;
  }>;
  endpoints: ParsedEndpoint[];
  models: ParsedModel[];
  securitySchemes: ParsedSecurityScheme[];
  globalSecurity: string[];
  tags: Array<{
    name: string;
    description?: string;
  }>;
}

export interface ParsedEndpoint {
  method: string;
  path: string;
  name: string;
  description?: string;
  parameters: ParsedParameter[];
  requestBody?: ParsedRequestBody;
  responses: ParsedResponse[];
  security: string[];
  tags: string[];
  deprecated: boolean;
}

export interface ParsedParameter {
  name: string;
  location: 'query' | 'header' | 'path' | 'cookie';
  description?: string;
  required: boolean;
  schema: ParsedSchema;
  example?: any;
  deprecated: boolean;
}

export interface ParsedRequestBody {
  description?: string;
  content: Record<string, ParsedMediaType>;
  required: boolean;
}

export interface ParsedResponse {
  statusCode: string;
  description: string;
  content?: Record<string, ParsedMediaType>;
  headers?: Record<string, ParsedHeader>;
}

export interface ParsedMediaType {
  schema?: ParsedSchema;
  example?: any;
  examples?: Record<string, ParsedExample>;
}

export interface ParsedHeader {
  description?: string;
  schema?: ParsedSchema;
}

export interface ParsedExample {
  summary?: string;
  description?: string;
  value?: any;
  externalValue?: string;
}

export interface ParsedSchema {
  type: string;
  format?: string;
  title?: string;
  description?: string;
  properties?: Record<string, ParsedSchema>;
  required: string[];
  items?: ParsedSchema;
  enum?: any[];
  nullable: boolean;
  readOnly: boolean;
  writeOnly: boolean;
  deprecated: boolean;
  default?: any;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  additionalProperties?: boolean | ParsedSchema;
  reference?: string;
}

export interface ParsedModel {
  name: string;
  schema: ParsedSchema;
  description?: string;
  examples?: any[];
}

export interface ParsedSecurityScheme {
  name: string;
  type: 'apiKey' | 'http' | 'oauth2' | 'openIdConnect';
  description?: string;
  location?: 'query' | 'header' | 'cookie';
  scheme?: string;
  bearerFormat?: string;
  flows?: ParsedOAuthFlows;
}

export interface ParsedOAuthFlows {
  implicit?: ParsedOAuthFlow;
  password?: ParsedOAuthFlow;
  clientCredentials?: ParsedOAuthFlow;
  authorizationCode?: ParsedOAuthFlow;
}

export interface ParsedOAuthFlow {
  authorizationUrl?: string;
  tokenUrl?: string;
  refreshUrl?: string;
  scopes: Record<string, string>;
}

// RAG Inference Types
export interface InferenceResult {
  field: string;
  inferredValue: any;
  confidence: number; // 0-1
  provenance: Provenance[];
  alternatives?: InferenceAlternative[];
  reasoning: string;
  evidence: string[];
  category: 'auth' | 'pagination' | 'rate_limit' | 'error_handling' | 'data_format' | 'other';
}

export interface Provenance {
  source: 'pattern_analysis' | 'similar_apis' | 'documentation' | 'community_knowledge' | 'statistical';
  confidence: number;
  description: string;
  examples?: string[];
}

export interface InferenceAlternative {
  value: any;
  confidence: number;
  reasoning: string;
  useCases: string[];
}

// API Response Types
export interface RAGAnalysisResponse {
  inferences: InferenceResult[];
  confidence: number;
  coverage: number;
  recommendations: string[];
  patterns: {
    detected: APIPattern[];
    confidence: number;
  };
}

export interface APIPattern {
  name: string;
  category: string;
  confidence: number;
  description: string;
  examples: string[];
  implications: string[];
}

// UI State Types
export interface SpecViewerState {
  selectedEndpoint?: ParsedEndpoint;
  showInferredOnly: boolean;
  activeTab: 'endpoints' | 'models' | 'inferences' | 'auth';
  filters: {
    method?: string;
    tag?: string;
    hasInference?: boolean;
  };
}

export interface ModelExplorerState {
  selectedModel?: ParsedModel;
  editingModel?: string;
  showInferredOnly: boolean;
  viewMode: 'grid' | 'list' | 'tree';
  filters: {
    type?: string;
    hasInference?: boolean;
    requiredOnly?: boolean;
  };
}

// Utility Types
export type SpecFormat = 'openapi' | 'postman' | 'graphql';
export type InferenceAction = 'accept' | 'reject' | 'override';
export type ConfidenceLevel = 'low' | 'medium' | 'high' | 'critical';

// API Client Types
export interface SpecUploadRequest {
  file: File;
  format: SpecFormat;
  projectId?: string;
}

export interface SpecAnalysisRequest {
  spec: any;
  format: SpecFormat;
  context?: {
    domain?: string;
    industry?: string;
    similarAPIs?: string[];
    documentation?: string[];
  };
}

export interface InferenceActionRequest {
  inference: InferenceResult;
  action: InferenceAction;
  value?: any;
  feedback?: string;
}

// Error Types
export interface SpecParseError {
  message: string;
  line?: number;
  column?: number;
  path?: string;
  suggestions?: string[];
}

export interface InferenceError {
  message: string;
  inference?: InferenceResult;
  suggestions?: string[];
}

// Configuration Types
export interface SpecViewerConfig {
  showConfidenceBadges: boolean;
  autoAcceptHighConfidence: boolean;
  enableBulkActions: boolean;
  maxInferenceDisplay: number;
  theme: 'light' | 'dark' | 'auto';
}

export interface ModelExplorerConfig {
  showPropertyTypes: boolean;
  showRequiredIndicators: boolean;
  enableInlineEditing: boolean;
  maxPropertiesPerPage: number;
  defaultViewMode: 'grid' | 'list' | 'tree';
}

// Export everything as a namespace for easy importing
export namespace APISpec {
  export type Spec = ParsedSpec;
  export type Endpoint = ParsedEndpoint;
  export type Model = ParsedModel;
  export type Schema = ParsedSchema;
  export type Inference = InferenceResult;
  export type Pattern = APIPattern;
}
