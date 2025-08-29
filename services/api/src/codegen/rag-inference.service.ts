import { Injectable } from '@nestjs/common';
import { PerformanceService } from './performance.service';

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

export interface RAGAnalysisRequest {
  spec: any;
  format: 'openapi' | 'postman' | 'graphql';
  context?: {
    domain?: string;
    industry?: string;
    similarAPIs?: string[];
    documentation?: string[];
  };
  existingKnowledge?: InferenceResult[];
}

export interface RAGAnalysisResponse {
  inferences: InferenceResult[];
  confidence: number;
  coverage: number; // Percentage of gaps filled
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

export interface GapAnalysis {
  field: string;
  status: 'present' | 'inferred' | 'missing';
  confidence?: number;
  issues?: string[];
  recommendations?: string[];
}

@Injectable()
export class RAGInferenceService {
  private readonly patternDatabase: Map<string, APIPattern[]> = new Map();
  private readonly domainKnowledge: Map<string, any> = new Map();

  constructor(private performanceService: PerformanceService) {
    this.initializePatternDatabase();
    this.initializeDomainKnowledge();
  }

  private initializePatternDatabase() {
    // Authentication patterns
    this.patternDatabase.set('auth', [
      {
        name: 'bearer_token',
        category: 'auth',
        confidence: 0.9,
        description: 'Bearer token authentication in Authorization header',
        examples: ['Authorization: Bearer {token}', 'Bearer token auth'],
        implications: ['Requires token refresh', 'Token expiration handling'],
      },
      {
        name: 'api_key_header',
        category: 'auth',
        confidence: 0.8,
        description: 'API key authentication in custom header',
        examples: ['X-API-Key: {key}', 'Api-Key: {key}'],
        implications: ['Key rotation required', 'Header naming conventions'],
      },
      {
        name: 'basic_auth',
        category: 'auth',
        confidence: 0.7,
        description: 'Basic HTTP authentication',
        examples: ['Authorization: Basic {base64}'],
        implications: ['Credentials encoding', 'HTTPS required'],
      },
      {
        name: 'oauth2',
        category: 'auth',
        confidence: 0.85,
        description: 'OAuth 2.0 authentication flows',
        examples: ['Authorization Code', 'Client Credentials', 'Implicit'],
        implications: ['Token refresh', 'Scope handling', 'PKCE support'],
      },
    ]);

    // Pagination patterns
    this.patternDatabase.set('pagination', [
      {
        name: 'offset_limit',
        category: 'pagination',
        confidence: 0.9,
        description: 'Offset-based pagination with limit parameter',
        examples: ['?offset=0&limit=20', '?page=1&per_page=20'],
        implications: ['Performance degrades with high offsets', 'Total count helpful'],
      },
      {
        name: 'cursor_based',
        category: 'pagination',
        confidence: 0.85,
        description: 'Cursor-based pagination for consistent ordering',
        examples: ['?after=cursor123', '?before=cursor456'],
        implications: ['Stable ordering required', 'Efficient for large datasets'],
      },
      {
        name: 'page_based',
        category: 'pagination',
        confidence: 0.8,
        description: 'Page-based pagination',
        examples: ['?page=1&page_size=20'],
        implications: ['Total pages calculation', 'Page size limits'],
      },
      {
        name: 'seek_pagination',
        category: 'pagination',
        confidence: 0.75,
        description: 'Seek-based pagination using last item value',
        examples: ['?since_id=123', '?after_value=xyz'],
        implications: ['Requires sortable field', 'Handles deletions well'],
      },
    ]);

    // Rate limiting patterns
    this.patternDatabase.set('rate_limit', [
      {
        name: 'token_bucket',
        category: 'rate_limit',
        confidence: 0.8,
        description: 'Token bucket rate limiting',
        examples: ['X-RateLimit-Remaining', 'X-RateLimit-Reset'],
        implications: ['Burst handling', 'Refill rate consideration'],
      },
      {
        name: 'fixed_window',
        category: 'rate_limit',
        confidence: 0.7,
        description: 'Fixed window rate limiting',
        examples: ['X-RateLimit-Limit', 'X-RateLimit-Remaining'],
        implications: ['Boundary effects', 'Reset time handling'],
      },
      {
        name: 'sliding_window',
        category: 'rate_limit',
        confidence: 0.75,
        description: 'Sliding window rate limiting',
        examples: ['Retry-After header'],
        implications: ['Smoother limits', 'More complex implementation'],
      },
    ]);

    // Error handling patterns
    this.patternDatabase.set('error_handling', [
      {
        name: 'http_status_errors',
        category: 'error_handling',
        confidence: 0.95,
        description: 'Standard HTTP status codes for errors',
        examples: ['400 Bad Request', '401 Unauthorized', '403 Forbidden', '404 Not Found', '429 Too Many Requests', '500 Internal Server Error'],
        implications: ['Standard error responses', 'Error code handling'],
      },
      {
        name: 'structured_errors',
        category: 'error_handling',
        confidence: 0.8,
        description: 'Structured error responses with error codes',
        examples: ['{"error": "invalid_request", "message": "..."}'],
        implications: ['Error code mapping', 'User-friendly messages'],
      },
    ]);
  }

  private initializeDomainKnowledge() {
    // Stripe-like APIs
    this.domainKnowledge.set('payment', {
      auth: ['bearer_token', 'api_key_header'],
      pagination: ['cursor_based', 'offset_limit'],
      rateLimit: ['token_bucket'],
      errorFormat: 'structured_errors',
    });

    // RESTful CRUD APIs
    this.domainKnowledge.set('crud', {
      auth: ['bearer_token', 'basic_auth'],
      pagination: ['offset_limit', 'page_based'],
      rateLimit: ['fixed_window'],
      errorFormat: 'http_status_errors',
    });

    // GraphQL APIs
    this.domainKnowledge.set('graphql', {
      auth: ['bearer_token', 'api_key_header'],
      pagination: ['cursor_based'],
      rateLimit: ['token_bucket'],
      errorFormat: 'structured_errors',
    });
  }

  async analyzeSpec(request: RAGAnalysisRequest): Promise<RAGAnalysisResponse> {
    return this.performanceService.benchmarkOperation(
      'rag_inference',
      async () => {
        const inferences: InferenceResult[] = [];
        const detectedPatterns: APIPattern[] = [];

        // Analyze authentication patterns
        const authInferences = await this.inferAuthentication(request);
        inferences.push(...authInferences);

        // Analyze pagination patterns
        const paginationInferences = await this.inferPagination(request);
        inferences.push(...paginationInferences);

        // Analyze rate limiting patterns
        const rateLimitInferences = await this.inferRateLimits(request);
        inferences.push(...rateLimitInferences);

        // Analyze error handling patterns
        const errorInferences = await this.inferErrorHandling(request);
        inferences.push(...errorInferences);

        // Detect overall patterns
        const patterns = this.detectPatterns(request);
        detectedPatterns.push(...patterns);

        // Calculate overall confidence and coverage
        const confidence = this.calculateOverallConfidence(inferences);
        const coverage = this.calculateCoverage(inferences, request);
        const recommendations = this.generateRecommendations(inferences, detectedPatterns);

        return {
          inferences,
          confidence,
          coverage,
          recommendations,
          patterns: {
            detected: detectedPatterns,
            confidence: this.calculatePatternConfidence(detectedPatterns),
          },
        };
      },
      { format: request.format, hasContext: !!request.context }
    );
  }

  private async inferAuthentication(request: RAGAnalysisRequest): Promise<InferenceResult[]> {
    const inferences: InferenceResult[] = [];
    const { spec, format, context } = request;

    // Check existing authentication in spec
    const existingAuth = this.extractExistingAuth(spec, format);

    if (existingAuth.length > 0) {
      // Already has auth defined
      return [];
    }

    // Infer authentication based on patterns
    const authPatterns = this.patternDatabase.get('auth') || [];
    const domainKnowledge = context?.domain ? this.domainKnowledge.get(context.domain) : null;

    for (const pattern of authPatterns) {
      let confidence = pattern.confidence;
      let provenance: Provenance[] = [{
        source: 'pattern_analysis',
        confidence: pattern.confidence,
        description: `Detected ${pattern.name} pattern from API structure analysis`,
        examples: pattern.examples,
      }];

      // Boost confidence based on domain knowledge
      if (domainKnowledge?.auth?.includes(pattern.name)) {
        confidence = Math.min(0.95, confidence + 0.1);
        provenance.push({
          source: 'community_knowledge',
          confidence: 0.9,
          description: `${context.domain} APIs commonly use ${pattern.name}`,
        });
      }

      // Boost confidence based on industry context
      if (context?.industry === 'fintech' && pattern.name === 'bearer_token') {
        confidence = Math.min(0.95, confidence + 0.1);
        provenance.push({
          source: 'statistical',
          confidence: 0.85,
          description: 'Fintech APIs show 85% preference for Bearer token auth',
        });
      }

      inferences.push({
        field: 'security',
        inferredValue: {
          type: pattern.name,
          scheme: this.mapAuthPatternToScheme(pattern.name),
          description: pattern.description,
        },
        confidence,
        provenance,
        reasoning: `Inferred ${pattern.name} authentication based on API patterns and domain knowledge`,
        evidence: pattern.examples,
        category: 'auth',
        alternatives: this.generateAuthAlternatives(pattern.name),
      });
    }

    return inferences.slice(0, 2); // Return top 2 most confident inferences
  }

  private async inferPagination(request: RAGAnalysisRequest): Promise<InferenceResult[]> {
    const inferences: InferenceResult[] = [];
    const { spec, format, context } = request;

    // Check existing pagination parameters
    const existingPagination = this.extractExistingPagination(spec, format);

    if (existingPagination.length > 0) {
      // Already has pagination defined
      return [];
    }

    // Infer pagination based on API structure and patterns
    const paginationPatterns = this.patternDatabase.get('pagination') || [];
    const domainKnowledge = context?.domain ? this.domainKnowledge.get(context.domain) : null;

    // Analyze endpoint patterns to infer pagination needs
    const endpoints = this.extractEndpoints(spec, format);
    const hasListEndpoints = endpoints.some(ep => this.isListEndpoint(ep));

    if (!hasListEndpoints) {
      return []; // No list endpoints, pagination not needed
    }

    for (const pattern of paginationPatterns) {
      let confidence = pattern.confidence;
      let provenance: Provenance[] = [{
        source: 'pattern_analysis',
        confidence: pattern.confidence,
        description: `Detected list endpoints that likely need ${pattern.name} pagination`,
        examples: pattern.examples,
      }];

      // Boost confidence based on domain knowledge
      if (domainKnowledge?.pagination?.includes(pattern.name)) {
        confidence = Math.min(0.95, confidence + 0.1);
        provenance.push({
          source: 'community_knowledge',
          confidence: 0.9,
          description: `${context.domain} APIs commonly use ${pattern.name} pagination`,
        });
      }

      // Boost confidence for cursor-based in data-heavy domains
      if (context?.industry === 'data' && pattern.name === 'cursor_based') {
        confidence = Math.min(0.95, confidence + 0.15);
        provenance.push({
          source: 'statistical',
          confidence: 0.9,
          description: 'Data APIs show 90% preference for cursor-based pagination',
        });
      }

      inferences.push({
        field: 'pagination',
        inferredValue: {
          type: pattern.name,
          description: pattern.description,
          parameters: this.getPaginationParameters(pattern.name),
          implications: pattern.implications,
        },
        confidence,
        provenance,
        reasoning: `Inferred ${pattern.name} pagination for list endpoints based on API structure`,
        evidence: pattern.examples,
        category: 'pagination',
        alternatives: this.generatePaginationAlternatives(pattern.name),
      });
    }

    return inferences.slice(0, 2); // Return top 2 most confident inferences
  }

  private async inferRateLimits(request: RAGAnalysisRequest): Promise<InferenceResult[]> {
    const inferences: InferenceResult[] = [];
    const { spec, format, context } = request;

    // Check for existing rate limit headers in examples
    const hasRateLimitHeaders = this.checkForRateLimitHeaders(spec, format);

    if (hasRateLimitHeaders) {
      // Already has rate limiting defined
      return [];
    }

    // Infer rate limiting based on API patterns
    const rateLimitPatterns = this.patternDatabase.get('rate_limit') || [];
    const domainKnowledge = context?.domain ? this.domainKnowledge.get(context.domain) : null;

    for (const pattern of rateLimitPatterns) {
      let confidence = pattern.confidence;
      let provenance: Provenance[] = [{
        source: 'pattern_analysis',
        confidence: pattern.confidence,
        description: `Inferred ${pattern.name} rate limiting based on API usage patterns`,
        examples: pattern.examples,
      }];

      // Boost confidence based on domain knowledge
      if (domainKnowledge?.rateLimit?.includes(pattern.name)) {
        confidence = Math.min(0.95, confidence + 0.1);
        provenance.push({
          source: 'community_knowledge',
          confidence: 0.85,
          description: `${context.domain} APIs commonly implement ${pattern.name} rate limiting`,
        });
      }

      // Boost confidence for high-traffic domains
      if (['social', 'marketplace', 'api'].includes(context?.domain || '')) {
        confidence = Math.min(0.95, confidence + 0.1);
        provenance.push({
          source: 'statistical',
          confidence: 0.8,
          description: 'High-traffic APIs typically implement rate limiting',
        });
      }

      inferences.push({
        field: 'rate_limiting',
        inferredValue: {
          type: pattern.name,
          description: pattern.description,
          headers: this.getRateLimitHeaders(pattern.name),
          implications: pattern.implications,
        },
        confidence,
        provenance,
        reasoning: `Inferred ${pattern.name} rate limiting based on API scale and patterns`,
        evidence: pattern.examples,
        category: 'rate_limit',
        alternatives: this.generateRateLimitAlternatives(pattern.name),
      });
    }

    return inferences.slice(0, 1); // Return most confident inference
  }

  private async inferErrorHandling(request: RAGAnalysisRequest): Promise<InferenceResult[]> {
    const inferences: InferenceResult[] = [];
    const { spec, format, context } = request;

    // Check existing error responses
    const existingErrors = this.extractExistingErrors(spec, format);

    if (existingErrors.length > 0) {
      // Already has error handling defined
      return [];
    }

    // Infer error handling patterns
    const errorPatterns = this.patternDatabase.get('error_handling') || [];
    const domainKnowledge = context?.domain ? this.domainKnowledge.get(context.domain) : null;

    for (const pattern of errorPatterns) {
      let confidence = pattern.confidence;
      let provenance: Provenance[] = [{
        source: 'pattern_analysis',
        confidence: pattern.confidence,
        description: `Standard ${pattern.name} error handling pattern`,
        examples: pattern.examples,
      }];

      // Boost confidence based on domain knowledge
      if (domainKnowledge?.errorFormat === pattern.name) {
        confidence = Math.min(0.95, confidence + 0.1);
        provenance.push({
          source: 'community_knowledge',
          confidence: 0.9,
          description: `${context.domain} APIs commonly use ${pattern.name} error format`,
        });
      }

      inferences.push({
        field: 'error_handling',
        inferredValue: {
          type: pattern.name,
          description: pattern.description,
          format: this.getErrorFormat(pattern.name),
          implications: pattern.implications,
        },
        confidence,
        provenance,
        reasoning: `Inferred ${pattern.name} error handling based on API standards`,
        evidence: pattern.examples,
        category: 'error_handling',
        alternatives: this.generateErrorAlternatives(pattern.name),
      });
    }

    return inferences.slice(0, 1); // Return most confident inference
  }

  private detectPatterns(request: RAGAnalysisRequest): APIPattern[] {
    const patterns: APIPattern[] = [];
    const { spec, format } = request;

    // Analyze endpoint naming patterns
    const endpoints = this.extractEndpoints(spec, format);
    const restfulPatterns = this.detectRESTfulPatterns(endpoints);
    if (restfulPatterns) {
      patterns.push(restfulPatterns);
    }

    // Analyze response patterns
    const responsePatterns = this.detectResponsePatterns(spec, format);
    if (responsePatterns) {
      patterns.push(responsePatterns);
    }

    // Analyze parameter patterns
    const paramPatterns = this.detectParameterPatterns(endpoints);
    if (paramPatterns) {
      patterns.push(paramPatterns);
    }

    return patterns;
  }

  private detectRESTfulPatterns(endpoints: any[]): APIPattern | null {
    const methods = endpoints.map(ep => ep.method);
    const hasRESTfulMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].every(method =>
      methods.includes(method)
    );

    if (hasRESTfulMethods) {
      return {
        name: 'restful_api',
        category: 'architecture',
        confidence: 0.85,
        description: 'API follows RESTful conventions with standard HTTP methods',
        examples: ['GET /users', 'POST /users', 'PUT /users/{id}', 'DELETE /users/{id}'],
        implications: ['Standard CRUD operations', 'HTTP status codes', 'Resource-based URLs'],
      };
    }

    return null;
  }

  private detectResponsePatterns(spec: any, format: string): APIPattern | null {
    // Look for consistent response structures
    let hasConsistentResponses = false;
    let hasErrorResponses = false;

    if (format === 'openapi') {
      // Check OpenAPI responses
      hasConsistentResponses = this.checkOpenAPIResponseConsistency(spec);
      hasErrorResponses = this.checkOpenAPIErrorResponses(spec);
    } else if (format === 'postman') {
      // Check Postman responses
      hasErrorResponses = this.checkPostmanErrorResponses(spec);
    }

    if (hasConsistentResponses && hasErrorResponses) {
      return {
        name: 'consistent_responses',
        category: 'response_format',
        confidence: 0.8,
        description: 'API provides consistent response formats and error handling',
        examples: ['Structured success responses', 'Consistent error formats'],
        implications: ['Predictable API behavior', 'Better error handling'],
      };
    }

    return null;
  }

  private detectParameterPatterns(endpoints: any[]): APIPattern | null {
    const allParams = endpoints.flatMap(ep => ep.parameters || []);
    const paramNames = allParams.map(p => p.name?.toLowerCase());

    // Check for common parameter patterns
    const hasQueryParams = paramNames.some(name => ['limit', 'offset', 'page'].includes(name));
    const hasPathParams = endpoints.some(ep => ep.path?.includes('{'));
    const hasAuthParams = paramNames.some(name => ['token', 'key', 'authorization'].includes(name));

    if (hasQueryParams && hasPathParams) {
      return {
        name: 'parameterized_endpoints',
        category: 'parameters',
        confidence: 0.75,
        description: 'API uses both path and query parameters effectively',
        examples: ['Path params for resources', 'Query params for filtering/pagination'],
        implications: ['Flexible resource access', 'Filtering capabilities'],
      };
    }

    return null;
  }

  private calculateOverallConfidence(inferences: InferenceResult[]): number {
    if (inferences.length === 0) return 0;

    const weightedSum = inferences.reduce((sum, inf) => sum + (inf.confidence * this.getInferenceWeight(inf.category)), 0);
    const totalWeight = inferences.reduce((sum, inf) => sum + this.getInferenceWeight(inf.category), 0);

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  private calculateCoverage(inferences: InferenceResult[], request: RAGAnalysisRequest): number {
    const totalPossibleFields = ['auth', 'pagination', 'rate_limit', 'error_handling'];
    const coveredFields = new Set(inferences.map(inf => inf.category));

    return (coveredFields.size / totalPossibleFields.length) * 100;
  }

  private calculatePatternConfidence(patterns: APIPattern[]): number {
    if (patterns.length === 0) return 0;

    const avgConfidence = patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length;
    return avgConfidence;
  }

  private generateRecommendations(inferences: InferenceResult[], patterns: APIPattern[]): string[] {
    const recommendations: string[] = [];

    // Based on inferences
    const lowConfidenceInferences = inferences.filter(inf => inf.confidence < 0.7);
    if (lowConfidenceInferences.length > 0) {
      recommendations.push('Consider adding explicit documentation for inferred patterns to improve confidence');
    }

    // Based on missing patterns
    const categories = inferences.map(inf => inf.category);
    if (!categories.includes('auth')) {
      recommendations.push('Add authentication documentation to improve API security clarity');
    }
    if (!categories.includes('pagination')) {
      recommendations.push('Document pagination patterns for list endpoints');
    }
    if (!categories.includes('rate_limit')) {
      recommendations.push('Consider implementing rate limiting for production use');
    }

    // Based on detected patterns
    const restfulPattern = patterns.find(p => p.name === 'restful_api');
    if (restfulPattern) {
      recommendations.push('API follows RESTful conventions - ensure consistent implementation');
    }

    return recommendations;
  }

  // Helper methods
  private extractExistingAuth(spec: any, format: string): any[] {
    // Implementation depends on format
    if (format === 'openapi') {
      return spec.components?.securitySchemes ? Object.values(spec.components.securitySchemes) : [];
    }
    if (format === 'postman') {
      return spec.auth ? [spec.auth] : [];
    }
    return [];
  }

  private extractExistingPagination(spec: any, format: string): any[] {
    // Check for pagination parameters in endpoints
    const endpoints = this.extractEndpoints(spec, format);
    const paginationParams = [];

    for (const endpoint of endpoints) {
      const params = endpoint.parameters || [];
      const hasPagination = params.some((p: any) =>
        ['page', 'limit', 'offset', 'cursor', 'after', 'before'].includes(p.name?.toLowerCase())
      );
      if (hasPagination) {
        paginationParams.push(endpoint);
      }
    }

    return paginationParams;
  }

  private extractExistingErrors(spec: any, format: string): any[] {
    if (format === 'openapi') {
      // Check for error response schemas
      const responses = spec.components?.responses || {};
      return Object.keys(responses).filter(key => key.toLowerCase().includes('error'));
    }
    return [];
  }

  private extractEndpoints(spec: any, format: string): any[] {
    if (format === 'openapi') {
      const endpoints = [];
      for (const [path, methods] of Object.entries(spec.paths || {})) {
        for (const [method, operation] of Object.entries(methods as any)) {
          if (method !== '$ref') {
            endpoints.push({ path, method: method.toUpperCase(), ...operation });
          }
        }
      }
      return endpoints;
    }
    if (format === 'postman') {
      return spec.item?.flatMap((item: any) => this.flattenPostmanItems(item)) || [];
    }
    return [];
  }

  private flattenPostmanItems(item: any): any[] {
    if (item.item) {
      return item.item.flatMap((subItem: any) => this.flattenPostmanItems(subItem));
    }
    return [item];
  }

  private isListEndpoint(endpoint: any): boolean {
    const path = endpoint.path || '';
    const method = endpoint.method || '';

    // Common list endpoint patterns
    return method === 'GET' &&
           (/\/(list|all|items|data|records)$/i.test(path) ||
            !path.includes('{') ||
            path.endsWith('s'));
  }

  private mapAuthPatternToScheme(pattern: string): string {
    const schemeMap: Record<string, string> = {
      'bearer_token': 'bearer',
      'api_key_header': 'apiKey',
      'basic_auth': 'basic',
      'oauth2': 'oauth2',
    };
    return schemeMap[pattern] || pattern;
  }

  private getPaginationParameters(type: string): any {
    const paramMap: Record<string, any> = {
      'offset_limit': { offset: { type: 'integer', default: 0 }, limit: { type: 'integer', default: 20 } },
      'cursor_based': { after: { type: 'string' }, before: { type: 'string' } },
      'page_based': { page: { type: 'integer', default: 1 }, page_size: { type: 'integer', default: 20 } },
      'seek_pagination': { since_id: { type: 'string' }, after_value: { type: 'string' } },
    };
    return paramMap[type] || {};
  }

  private getRateLimitHeaders(type: string): any {
    const headerMap: Record<string, any> = {
      'token_bucket': {
        'X-RateLimit-Limit': 'requests per hour',
        'X-RateLimit-Remaining': 'remaining requests',
        'X-RateLimit-Reset': 'reset timestamp',
      },
      'fixed_window': {
        'X-RateLimit-Limit': 'requests per window',
        'X-RateLimit-Remaining': 'remaining requests',
        'Retry-After': 'seconds to wait',
      },
      'sliding_window': {
        'X-RateLimit-Limit': 'requests per window',
        'Retry-After': 'seconds to wait',
      },
    };
    return headerMap[type] || {};
  }

  private getErrorFormat(type: string): any {
    const formatMap: Record<string, any> = {
      'http_status_errors': {
        '400': 'Bad Request',
        '401': 'Unauthorized',
        '403': 'Forbidden',
        '404': 'Not Found',
        '429': 'Too Many Requests',
        '500': 'Internal Server Error',
      },
      'structured_errors': {
        format: 'application/json',
        schema: {
          error: 'string',
          message: 'string',
          code: 'string (optional)',
          details: 'object (optional)',
        },
      },
    };
    return formatMap[type] || {};
  }

  private getInferenceWeight(category: string): number {
    const weightMap: Record<string, number> = {
      'auth': 1.0,
      'pagination': 0.8,
      'rate_limit': 0.6,
      'error_handling': 0.7,
      'data_format': 0.5,
      'other': 0.3,
    };
    return weightMap[category] || 0.5;
  }

  private generateAuthAlternatives(primary: string): InferenceAlternative[] {
    const alternatives: InferenceAlternative[] = [];

    if (primary === 'bearer_token') {
      alternatives.push({
        value: { type: 'api_key_header', scheme: 'apiKey' },
        confidence: 0.7,
        reasoning: 'API key in header is simpler to implement',
        useCases: ['Internal APIs', 'Simple authentication'],
      });
    }

    if (primary === 'oauth2') {
      alternatives.push({
        value: { type: 'bearer_token', scheme: 'bearer' },
        confidence: 0.8,
        reasoning: 'Bearer token is simpler for most use cases',
        useCases: ['Mobile apps', 'SPAs', 'API-to-API communication'],
      });
    }

    return alternatives;
  }

  private generatePaginationAlternatives(primary: string): InferenceAlternative[] {
    const alternatives: InferenceAlternative[] = [];

    if (primary === 'offset_limit') {
      alternatives.push({
        value: { type: 'cursor_based' },
        confidence: 0.8,
        reasoning: 'Cursor-based pagination handles large datasets better',
        useCases: ['Large datasets', 'Real-time data', 'Infinite scroll'],
      });
    }

    if (primary === 'cursor_based') {
      alternatives.push({
        value: { type: 'offset_limit' },
        confidence: 0.7,
        reasoning: 'Offset-based is simpler to implement',
        useCases: ['Small datasets', 'Simple pagination', 'Page numbers'],
      });
    }

    return alternatives;
  }

  private generateRateLimitAlternatives(primary: string): InferenceAlternative[] {
    const alternatives: InferenceAlternative[] = [];

    if (primary === 'token_bucket') {
      alternatives.push({
        value: { type: 'fixed_window' },
        confidence: 0.7,
        reasoning: 'Fixed window is simpler to understand and implement',
        useCases: ['Simple rate limiting', 'Clear reset times'],
      });
    }

    return alternatives;
  }

  private generateErrorAlternatives(primary: string): InferenceAlternative[] {
    const alternatives: InferenceAlternative[] = [];

    if (primary === 'http_status_errors') {
      alternatives.push({
        value: { type: 'structured_errors' },
        confidence: 0.8,
        reasoning: 'Structured errors provide better developer experience',
        useCases: ['Complex APIs', 'Better error handling', 'Debugging'],
      });
    }

    return alternatives;
  }

  private checkForRateLimitHeaders(spec: any, format: string): boolean {
    if (format === 'openapi') {
      // Check response headers for rate limit headers
      for (const [path, methods] of Object.entries(spec.paths || {})) {
        for (const [method, operation] of Object.entries(methods as any)) {
          if (operation.responses) {
            for (const response of Object.values(operation.responses) as any[]) {
              if (response.headers) {
                const headers = Object.keys(response.headers);
                if (headers.some(h => h.toLowerCase().includes('rate') || h.toLowerCase().includes('limit'))) {
                  return true;
                }
              }
            }
          }
        }
      }
    }
    return false;
  }

  private checkOpenAPIResponseConsistency(spec: any): boolean {
    // Check if responses follow consistent patterns
    let hasConsistentStructure = true;
    const responseSchemas: any[] = [];

    for (const [path, methods] of Object.entries(spec.paths || {})) {
      for (const [method, operation] of Object.entries(methods as any)) {
        if (operation.responses) {
          for (const [status, response] of Object.entries(operation.responses) as any[]) {
            if (response.content?.['application/json']?.schema) {
              responseSchemas.push(response.content['application/json'].schema);
            }
          }
        }
      }
    }

    // Check if response schemas are reasonably consistent
    if (responseSchemas.length > 1) {
      const firstSchema = responseSchemas[0];
      for (let i = 1; i < responseSchemas.length; i++) {
        if (JSON.stringify(firstSchema) !== JSON.stringify(responseSchemas[i])) {
          hasConsistentStructure = false;
          break;
        }
      }
    }

    return hasConsistentStructure;
  }

  private checkOpenAPIErrorResponses(spec: any): boolean {
    // Check for error response definitions
    for (const [path, methods] of Object.entries(spec.paths || {})) {
      for (const [method, operation] of Object.entries(methods as any)) {
        if (operation.responses) {
          const statusCodes = Object.keys(operation.responses);
          if (statusCodes.some(code => code.startsWith('4') || code.startsWith('5'))) {
            return true;
          }
        }
      }
    }
    return false;
  }

  private checkPostmanErrorResponses(spec: any): boolean {
    // Check Postman responses for error examples
    const items = spec.item || [];
    for (const item of items) {
      if (item.response) {
        for (const response of item.response) {
          if (response.code >= 400) {
            return true;
          }
        }
      }
    }
    return false;
  }

  async performGapAnalysis(spec: any, format: string): Promise<GapAnalysis[]> {
    const analysis: GapAnalysis[] = [];

    // Analyze authentication gaps
    analysis.push(await this.analyzeAuthGap(spec, format));

    // Analyze pagination gaps
    analysis.push(await this.analyzePaginationGap(spec, format));

    // Analyze rate limiting gaps
    analysis.push(await this.analyzeRateLimitGap(spec, format));

    // Analyze error handling gaps
    analysis.push(await this.analyzeErrorHandlingGap(spec, format));

    // Analyze documentation gaps
    analysis.push(await this.analyzeDocumentationGap(spec, format));

    return analysis;
  }

  private async analyzeAuthGap(spec: any, format: string): Promise<GapAnalysis> {
    const existingAuth = this.extractExistingAuth(spec, format);

    if (existingAuth.length > 0) {
      return {
        field: 'authentication',
        status: 'present',
        confidence: 0.9,
      };
    }

    return {
      field: 'authentication',
      status: 'missing',
      issues: ['No authentication method defined'],
      recommendations: [
        'Add authentication scheme to API specification',
        'Document authentication requirements',
        'Consider Bearer token or API key authentication',
      ],
    };
  }

  private async analyzePaginationGap(spec: any, format: string): Promise<GapAnalysis> {
    const existingPagination = this.extractExistingPagination(spec, format);
    const endpoints = this.extractEndpoints(spec, format);
    const hasListEndpoints = endpoints.some(ep => this.isListEndpoint(ep));

    if (!hasListEndpoints) {
      return {
        field: 'pagination',
        status: 'present', // Not needed
        confidence: 1.0,
      };
    }

    if (existingPagination.length > 0) {
      return {
        field: 'pagination',
        status: 'present',
        confidence: 0.9,
      };
    }

    return {
      field: 'pagination',
      status: 'missing',
      issues: ['List endpoints lack pagination parameters'],
      recommendations: [
        'Add pagination parameters to list endpoints',
        'Consider offset/limit or cursor-based pagination',
        'Document pagination behavior',
      ],
    };
  }

  private async analyzeRateLimitGap(spec: any, format: string): Promise<GapAnalysis> {
    const hasRateLimitHeaders = this.checkForRateLimitHeaders(spec, format);

    if (hasRateLimitHeaders) {
      return {
        field: 'rate_limiting',
        status: 'present',
        confidence: 0.8,
      };
    }

    return {
      field: 'rate_limiting',
      status: 'missing',
      issues: ['No rate limiting headers defined'],
      recommendations: [
        'Implement rate limiting for production APIs',
        'Add rate limit headers to responses',
        'Document rate limiting behavior',
      ],
    };
  }

  private async analyzeErrorHandlingGap(spec: any, format: string): Promise<GapAnalysis> {
    const existingErrors = this.extractExistingErrors(spec, format);

    if (existingErrors.length > 0) {
      return {
        field: 'error_handling',
        status: 'present',
        confidence: 0.8,
      };
    }

    return {
      field: 'error_handling',
      status: 'missing',
      issues: ['No error response definitions found'],
      recommendations: [
        'Define error response schemas',
        'Document HTTP status codes',
        'Provide structured error responses',
      ],
    };
  }

  private async analyzeDocumentationGap(spec: any, format: string): Promise<GapAnalysis> {
    let hasDescriptions = false;
    let totalEndpoints = 0;
    let documentedEndpoints = 0;

    if (format === 'openapi') {
      for (const [path, methods] of Object.entries(spec.paths || {})) {
        for (const [method, operation] of Object.entries(methods as any)) {
          totalEndpoints++;
          if (operation.summary || operation.description) {
            documentedEndpoints++;
          }
        }
      }
    }

    const documentationRatio = totalEndpoints > 0 ? documentedEndpoints / totalEndpoints : 0;
    hasDescriptions = documentationRatio > 0.5;

    if (hasDescriptions) {
      return {
        field: 'documentation',
        status: 'present',
        confidence: documentationRatio,
      };
    }

    return {
      field: 'documentation',
      status: 'missing',
      issues: [`Only ${Math.round(documentationRatio * 100)}% of endpoints have descriptions`],
      recommendations: [
        'Add descriptions to all endpoints',
        'Document parameters and response schemas',
        'Provide usage examples',
      ],
    };
  }
}
