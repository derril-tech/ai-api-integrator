import { Injectable, BadRequestException } from '@nestjs/common';

export interface OpenApiSpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  servers?: Array<{
    url: string;
    description?: string;
  }>;
  paths: Record<string, PathItem>;
  components?: {
    schemas?: Record<string, Schema>;
    securitySchemes?: Record<string, SecurityScheme>;
    parameters?: Record<string, Parameter>;
    responses?: Record<string, Response>;
  };
  security?: Array<Record<string, string[]>>;
}

export interface PathItem {
  [method: string]: Operation;
}

export interface Operation {
  operationId?: string;
  summary?: string;
  description?: string;
  parameters?: Parameter[];
  requestBody?: RequestBody;
  responses: Record<string, Response>;
  security?: Array<Record<string, string[]>>;
  tags?: string[];
  deprecated?: boolean;
}

export interface Parameter {
  name: string;
  in: 'query' | 'header' | 'path' | 'cookie';
  description?: string;
  required?: boolean;
  schema?: Schema;
  example?: any;
  deprecated?: boolean;
}

export interface RequestBody {
  description?: string;
  content: Record<string, MediaType>;
  required?: boolean;
}

export interface Response {
  description: string;
  content?: Record<string, MediaType>;
  headers?: Record<string, Header>;
}

export interface MediaType {
  schema?: Schema;
  example?: any;
  examples?: Record<string, Example>;
}

export interface Schema {
  type?: string;
  format?: string;
  title?: string;
  description?: string;
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  enum?: any[];
  allOf?: Schema[];
  oneOf?: Schema[];
  anyOf?: Schema[];
  not?: Schema;
  $ref?: string;
  nullable?: boolean;
  readOnly?: boolean;
  writeOnly?: boolean;
  deprecated?: boolean;
  default?: any;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  additionalProperties?: boolean | Schema;
}

export interface SecurityScheme {
  type: 'apiKey' | 'http' | 'oauth2' | 'openIdConnect';
  description?: string;
  name?: string;
  in?: 'query' | 'header' | 'cookie';
  scheme?: string;
  bearerFormat?: string;
  flows?: OAuthFlows;
}

export interface OAuthFlows {
  implicit?: OAuthFlow;
  password?: OAuthFlow;
  clientCredentials?: OAuthFlow;
  authorizationCode?: OAuthFlow;
}

export interface OAuthFlow {
  authorizationUrl?: string;
  tokenUrl?: string;
  refreshUrl?: string;
  scopes: Record<string, string>;
}

export interface Header {
  description?: string;
  schema?: Schema;
}

export interface Example {
  summary?: string;
  description?: string;
  value?: any;
  externalValue?: string;
}

export interface ParsedEndpoint {
  path: string;
  method: string;
  operationId?: string;
  summary?: string;
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
  reference?: string; // For $ref resolution
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

@Injectable()
export class OpenApiParserService {
  private schemaRefs = new Map<string, ParsedSchema>();

  /**
   * Parse OpenAPI specification from JSON string
   */
  async parseSpec(specContent: string): Promise<ParsedSpec> {
    try {
      const spec: OpenApiSpec = JSON.parse(specContent);

      // Validate OpenAPI version
      if (!spec.openapi || !spec.openapi.startsWith('3.')) {
        throw new BadRequestException('Only OpenAPI 3.0 and 3.1 specifications are supported');
      }

      // Clear previous refs
      this.schemaRefs.clear();

      // Parse components first (for $ref resolution)
      const models = this.parseModels(spec);
      const securitySchemes = this.parseSecuritySchemes(spec);

      // Parse endpoints
      const endpoints = this.parseEndpoints(spec);

      return {
        title: spec.info.title,
        version: spec.info.version,
        description: spec.info.description,
        servers: spec.servers || [],
        endpoints,
        models,
        securitySchemes,
        globalSecurity: this.parseGlobalSecurity(spec.security || []),
        tags: this.parseTags(spec),
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to parse OpenAPI specification: ${error.message}`);
    }
  }

  private parseEndpoints(spec: OpenApiSpec): ParsedEndpoint[] {
    const endpoints: ParsedEndpoint[] = [];

    for (const [path, pathItem] of Object.entries(spec.paths)) {
      for (const [method, operation] of Object.entries(pathItem)) {
        if (method === '$ref') continue; // Skip $ref entries

        const endpoint = this.parseOperation(path, method, operation);
        endpoints.push(endpoint);
      }
    }

    return endpoints;
  }

  private parseOperation(path: string, method: string, operation: Operation): ParsedEndpoint {
    return {
      path,
      method: method.toUpperCase(),
      operationId: operation.operationId,
      summary: operation.summary,
      description: operation.description,
      parameters: this.parseParameters(operation.parameters || []),
      requestBody: operation.requestBody ? this.parseRequestBody(operation.requestBody) : undefined,
      responses: this.parseResponses(operation.responses),
      security: this.parseSecurity(operation.security || []),
      tags: operation.tags || [],
      deprecated: operation.deprecated || false,
    };
  }

  private parseParameters(parameters: Parameter[]): ParsedParameter[] {
    return parameters.map(param => ({
      name: param.name,
      location: param.in,
      description: param.description,
      required: param.required || false,
      schema: this.parseSchema(param.schema),
      example: param.example,
      deprecated: param.deprecated || false,
    }));
  }

  private parseRequestBody(requestBody: RequestBody): ParsedRequestBody {
    const content: Record<string, ParsedMediaType> = {};

    for (const [mediaType, mediaTypeObj] of Object.entries(requestBody.content)) {
      content[mediaType] = {
        schema: mediaTypeObj.schema ? this.parseSchema(mediaTypeObj.schema) : undefined,
        example: mediaTypeObj.example,
        examples: mediaTypeObj.examples ? this.parseExamples(mediaTypeObj.examples) : undefined,
      };
    }

    return {
      description: requestBody.description,
      content,
      required: requestBody.required || false,
    };
  }

  private parseResponses(responses: Record<string, Response>): ParsedResponse[] {
    const parsedResponses: ParsedResponse[] = [];

    for (const [statusCode, response] of Object.entries(responses)) {
      const content: Record<string, ParsedMediaType> = {};
      const headers: Record<string, ParsedHeader> = {};

      if (response.content) {
        for (const [mediaType, mediaTypeObj] of Object.entries(response.content)) {
          content[mediaType] = {
            schema: mediaTypeObj.schema ? this.parseSchema(mediaTypeObj.schema) : undefined,
            example: mediaTypeObj.example,
            examples: mediaTypeObj.examples ? this.parseExamples(mediaTypeObj.examples) : undefined,
          };
        }
      }

      if (response.headers) {
        for (const [headerName, header] of Object.entries(response.headers)) {
          headers[headerName] = {
            description: header.description,
            schema: header.schema ? this.parseSchema(header.schema) : undefined,
          };
        }
      }

      parsedResponses.push({
        statusCode,
        description: response.description,
        content: Object.keys(content).length > 0 ? content : undefined,
        headers: Object.keys(headers).length > 0 ? headers : undefined,
      });
    }

    return parsedResponses;
  }

  private parseSchema(schema?: Schema): ParsedSchema {
    if (!schema) {
      return {
        type: 'object',
        required: [],
        nullable: false,
        readOnly: false,
        writeOnly: false,
        deprecated: false,
      };
    }

    // Handle $ref
    if (schema.$ref) {
      const refName = schema.$ref.split('/').pop()!;
      if (this.schemaRefs.has(refName)) {
        return this.schemaRefs.get(refName)!;
      }

      // Return a placeholder that will be resolved later
      return {
        type: 'object',
        reference: refName,
        required: [],
        nullable: false,
        readOnly: false,
        writeOnly: false,
        deprecated: false,
      };
    }

    const parsed: ParsedSchema = {
      type: schema.type || 'object',
      format: schema.format,
      title: schema.title,
      description: schema.description,
      required: schema.required || [],
      nullable: schema.nullable || false,
      readOnly: schema.readOnly || false,
      writeOnly: schema.writeOnly || false,
      deprecated: schema.deprecated || false,
      default: schema.default,
      minimum: schema.minimum,
      maximum: schema.maximum,
      minLength: schema.minLength,
      maxLength: schema.maxLength,
      pattern: schema.pattern,
    };

    // Parse properties
    if (schema.properties) {
      parsed.properties = {};
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        parsed.properties[propName] = this.parseSchema(propSchema);
      }
    }

    // Parse items for arrays
    if (schema.items) {
      parsed.items = this.parseSchema(schema.items);
    }

    // Handle enum
    if (schema.enum) {
      parsed.enum = schema.enum;
    }

    // Handle additional properties
    if (schema.additionalProperties !== undefined) {
      if (typeof schema.additionalProperties === 'boolean') {
        parsed.additionalProperties = schema.additionalProperties;
      } else {
        parsed.additionalProperties = this.parseSchema(schema.additionalProperties);
      }
    }

    return parsed;
  }

  private parseExamples(examples: Record<string, Example>): Record<string, ParsedExample> {
    const parsed: Record<string, ParsedExample> = {};

    for (const [name, example] of Object.entries(examples)) {
      parsed[name] = {
        summary: example.summary,
        description: example.description,
        value: example.value,
        externalValue: example.externalValue,
      };
    }

    return parsed;
  }

  private parseModels(spec: OpenApiSpec): ParsedModel[] {
    const models: ParsedModel[] = [];

    if (spec.components?.schemas) {
      for (const [name, schema] of Object.entries(spec.components.schemas)) {
        const parsedSchema = this.parseSchema(schema);
        this.schemaRefs.set(name, parsedSchema); // Store for $ref resolution

        models.push({
          name,
          schema: parsedSchema,
          description: schema.description,
        });
      }
    }

    return models;
  }

  private parseSecuritySchemes(spec: OpenApiSpec): ParsedSecurityScheme[] {
    const schemes: ParsedSecurityScheme[] = [];

    if (spec.components?.securitySchemes) {
      for (const [name, scheme] of Object.entries(spec.components.securitySchemes)) {
        schemes.push({
          name,
          type: scheme.type,
          description: scheme.description,
          location: scheme.in,
          scheme: scheme.scheme,
          bearerFormat: scheme.bearerFormat,
          flows: scheme.flows ? this.parseOAuthFlows(scheme.flows) : undefined,
        });
      }
    }

    return schemes;
  }

  private parseOAuthFlows(flows: OAuthFlows): ParsedOAuthFlows {
    return {
      implicit: flows.implicit ? this.parseOAuthFlow(flows.implicit) : undefined,
      password: flows.password ? this.parseOAuthFlow(flows.password) : undefined,
      clientCredentials: flows.clientCredentials ? this.parseOAuthFlow(flows.clientCredentials) : undefined,
      authorizationCode: flows.authorizationCode ? this.parseOAuthFlow(flows.authorizationCode) : undefined,
    };
  }

  private parseOAuthFlow(flow: OAuthFlow): ParsedOAuthFlow {
    return {
      authorizationUrl: flow.authorizationUrl,
      tokenUrl: flow.tokenUrl,
      refreshUrl: flow.refreshUrl,
      scopes: flow.scopes,
    };
  }

  private parseGlobalSecurity(security: Array<Record<string, string[]>>): string[] {
    const globalSchemes: string[] = [];

    for (const secReq of security) {
      for (const scheme of Object.keys(secReq)) {
        if (!globalSchemes.includes(scheme)) {
          globalSchemes.push(scheme);
        }
      }
    }

    return globalSchemes;
  }

  private parseSecurity(security: Array<Record<string, string[]>>): string[] {
    const schemes: string[] = [];

    for (const secReq of security) {
      for (const scheme of Object.keys(secReq)) {
        if (!schemes.includes(scheme)) {
          schemes.push(scheme);
        }
      }
    }

    return schemes;
  }

  private parseTags(spec: OpenApiSpec): Array<{ name: string; description?: string }> {
    // This would typically come from the spec's tags field
    // For now, we'll return an empty array as this is less critical
    return [];
  }

  /**
   * Extract pagination patterns from endpoints
   */
  extractPaginationPatterns(endpoints: ParsedEndpoint[]): {
    hasPagination: boolean;
    patterns: string[];
    commonParams: string[];
  } {
    const paginationParams = new Set<string>();
    const patterns = new Set<string>();

    for (const endpoint of endpoints) {
      // Check query parameters for pagination indicators
      for (const param of endpoint.parameters) {
        if (param.location === 'query') {
          const name = param.name.toLowerCase();
          if (['page', 'limit', 'offset', 'size', 'per_page', 'cursor', 'after', 'before'].includes(name)) {
            paginationParams.add(param.name);
          }
        }
      }

      // Check response schemas for pagination structures
      for (const response of endpoint.responses) {
        if (response.content) {
          for (const mediaType of Object.values(response.content)) {
            if (mediaType.schema) {
              this.checkSchemaForPagination(mediaType.schema, patterns);
            }
          }
        }
      }
    }

    return {
      hasPagination: paginationParams.size > 0 || patterns.size > 0,
      patterns: Array.from(patterns),
      commonParams: Array.from(paginationParams),
    };
  }

  private checkSchemaForPagination(schema: ParsedSchema, patterns: Set<string>): void {
    if (!schema.properties) return;

    // Check for common pagination response structures
    const props = Object.keys(schema.properties);

    if (props.includes('data') && (props.includes('total') || props.includes('count'))) {
      patterns.add('data_with_count');
    }

    if (props.includes('items') && (props.includes('total') || props.includes('count'))) {
      patterns.add('items_with_count');
    }

    if (props.includes('results') && props.includes('next')) {
      patterns.add('cursor_based');
    }

    if (props.includes('data') && props.includes('links')) {
      patterns.add('hal_links');
    }

    // Recursively check nested schemas
    for (const propSchema of Object.values(schema.properties)) {
      if (propSchema.properties) {
        this.checkSchemaForPagination(propSchema, patterns);
      }
    }
  }

  /**
   * Extract authentication patterns
   */
  extractAuthPatterns(spec: ParsedSpec): {
    authTypes: string[];
    hasBearerAuth: boolean;
    hasApiKeyAuth: boolean;
    hasOAuth: boolean;
    requiresAuth: boolean;
  } {
    const authTypes = new Set<string>();
    let hasBearerAuth = false;
    let hasApiKeyAuth = false;
    let hasOAuth = false;
    let requiresAuth = false;

    // Check security schemes
    for (const scheme of spec.securitySchemes) {
      authTypes.add(scheme.type);

      switch (scheme.type) {
        case 'http':
          if (scheme.scheme === 'bearer') {
            hasBearerAuth = true;
          }
          break;
        case 'apiKey':
          hasApiKeyAuth = true;
          break;
        case 'oauth2':
          hasOAuth = true;
          break;
      }
    }

    // Check if any endpoints require authentication
    for (const endpoint of spec.endpoints) {
      if (endpoint.security.length > 0) {
        requiresAuth = true;
        break;
      }
    }

    // Check global security
    if (spec.globalSecurity.length > 0) {
      requiresAuth = true;
    }

    return {
      authTypes: Array.from(authTypes),
      hasBearerAuth,
      hasApiKeyAuth,
      hasOAuth,
      requiresAuth,
    };
  }

  /**
   * Generate endpoint summary statistics
   */
  generateEndpointStats(endpoints: ParsedEndpoint[]): {
    total: number;
    byMethod: Record<string, number>;
    byTag: Record<string, number>;
    deprecated: number;
    withAuth: number;
    withPagination: number;
  } {
    const byMethod: Record<string, number> = {};
    const byTag: Record<string, number> = {};
    let deprecated = 0;
    let withAuth = 0;
    let withPagination = 0;

    for (const endpoint of endpoints) {
      // Count by method
      byMethod[endpoint.method] = (byMethod[endpoint.method] || 0) + 1;

      // Count by tag
      for (const tag of endpoint.tags) {
        byTag[tag] = (byTag[tag] || 0) + 1;
      }

      // Count deprecated
      if (endpoint.deprecated) {
        deprecated++;
      }

      // Count with auth
      if (endpoint.security.length > 0) {
        withAuth++;
      }

      // Count with pagination (simple heuristic)
      const hasPaginationParam = endpoint.parameters.some(p =>
        ['page', 'limit', 'offset', 'cursor'].includes(p.name.toLowerCase())
      );
      if (hasPaginationParam) {
        withPagination++;
      }
    }

    return {
      total: endpoints.length,
      byMethod,
      byTag,
      deprecated,
      withAuth,
      withPagination,
    };
  }
}
