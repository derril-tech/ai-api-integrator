import { Injectable, BadRequestException } from '@nestjs/common';

export interface PostmanCollection {
  info: {
    name: string;
    description?: string;
    schema: string;
  };
  item: PostmanItem[];
  variable?: PostmanVariable[];
}

export interface PostmanItem {
  name: string;
  request?: PostmanRequest;
  item?: PostmanItem[]; // For folders
  response?: PostmanResponse[];
}

export interface PostmanRequest {
  method: string;
  header?: PostmanHeader[];
  url: PostmanUrl;
  body?: PostmanBody;
  auth?: PostmanAuth;
}

export interface PostmanUrl {
  raw?: string;
  host?: string[];
  path?: string[];
  query?: PostmanQueryParam[];
}

export interface PostmanHeader {
  key: string;
  value: string;
  description?: string;
}

export interface PostmanQueryParam {
  key: string;
  value: string;
  description?: string;
}

export interface PostmanBody {
  mode: 'raw' | 'formdata' | 'urlencoded' | 'file';
  raw?: string;
  formdata?: PostmanFormData[];
  urlencoded?: PostmanUrlEncoded[];
}

export interface PostmanFormData {
  key: string;
  value?: string;
  type?: string;
  description?: string;
}

export interface PostmanUrlEncoded {
  key: string;
  value: string;
  description?: string;
}

export interface PostmanAuth {
  type: 'bearer' | 'basic' | 'apikey' | 'oauth2';
  bearer?: Array<{ key: string; value: string }>;
  basic?: Array<{ key: string; value: string }>;
  apikey?: Array<{ key: string; value: string }>;
}

export interface PostmanResponse {
  name: string;
  status: string;
  code: number;
  body?: string;
  header?: PostmanHeader[];
}

export interface PostmanVariable {
  key: string;
  value: string;
  type?: string;
}

export interface GraphQLSchema {
  kind: 'Document';
  definitions: GraphQLDefinition[];
}

export interface GraphQLDefinition {
  kind: 'SchemaDefinition' | 'ObjectTypeDefinition' | 'InputObjectTypeDefinition' | 'EnumTypeDefinition' | 'InterfaceTypeDefinition' | 'UnionTypeDefinition';
  name?: {
    value: string;
  };
  fields?: GraphQLField[];
  values?: GraphQLEnumValue[];
  types?: Array<{ name: { value: string } }>;
}

export interface GraphQLField {
  name: {
    value: string;
  };
  type: GraphQLType;
  arguments?: GraphQLArgument[];
  description?: {
    value: string;
  };
}

export interface GraphQLArgument {
  name: {
    value: string;
  };
  type: GraphQLType;
  description?: {
    value: string;
  };
}

export interface GraphQLType {
  kind: string;
  name?: {
    value: string;
  };
  type?: GraphQLType; // For NonNullType, ListType
  ofType?: GraphQLType;
}

export interface GraphQLEnumValue {
  name: {
    value: string;
  };
}

export interface TextChunk {
  content: string;
  metadata: {
    source: string;
    type: 'heading' | 'paragraph' | 'code' | 'list' | 'table' | 'link';
    level?: number; // For headings
    language?: string; // For code blocks
    position: number;
    length: number;
  };
}

export interface ParsedPostmanCollection {
  name: string;
  description?: string;
  endpoints: ParsedEndpoint[];
  variables: Record<string, string>;
  auth?: {
    type: string;
    config: Record<string, string>;
  };
}

export interface ParsedGraphQLSchema {
  types: ParsedGraphQLType[];
  queries: ParsedGraphQLOperation[];
  mutations: ParsedGraphQLOperation[];
  subscriptions: ParsedGraphQLOperation[];
}

export interface ParsedGraphQLType {
  name: string;
  kind: 'OBJECT' | 'INPUT_OBJECT' | 'ENUM' | 'INTERFACE' | 'UNION' | 'SCALAR';
  description?: string;
  fields?: ParsedGraphQLField[];
  values?: string[]; // For enums
  possibleTypes?: string[]; // For unions/interfaces
}

export interface ParsedGraphQLField {
  name: string;
  type: string;
  description?: string;
  args?: ParsedGraphQLArgument[];
  isRequired: boolean;
  isList: boolean;
}

export interface ParsedGraphQLArgument {
  name: string;
  type: string;
  description?: string;
  isRequired: boolean;
  defaultValue?: any;
}

export interface ParsedGraphQLOperation {
  name: string;
  type: 'query' | 'mutation' | 'subscription';
  description?: string;
  args?: ParsedGraphQLArgument[];
  returnType: string;
}

export interface ParsedEndpoint {
  method: string;
  path: string;
  name: string;
  description?: string;
  headers: Array<{ key: string; value: string; description?: string }>;
  queryParams: Array<{ key: string; value: string; description?: string }>;
  body?: {
    type: 'json' | 'form-data' | 'urlencoded' | 'raw';
    content?: any;
  };
  responses: Array<{
    name: string;
    status: number;
    body?: any;
    headers: Array<{ key: string; value: string }>;
  }>;
  auth?: {
    type: string;
    config: Record<string, string>;
  };
}

@Injectable()
export class ApiSpecParserService {
  /**
   * Parse Postman collection
   */
  async parsePostmanCollection(collectionContent: string): Promise<ParsedPostmanCollection> {
    try {
      const collection: PostmanCollection = JSON.parse(collectionContent);

      const endpoints = this.extractPostmanEndpoints(collection.item || []);
      const variables = this.extractPostmanVariables(collection.variable || []);
      const auth = this.extractPostmanAuth(collection);

      return {
        name: collection.info.name,
        description: collection.info.description,
        endpoints,
        variables,
        auth,
      };
    } catch (error) {
      throw new BadRequestException(`Failed to parse Postman collection: ${error.message}`);
    }
  }

  private extractPostmanEndpoints(items: PostmanItem[], parentPath: string = ''): ParsedEndpoint[] {
    const endpoints: ParsedEndpoint[] = [];

    for (const item of items) {
      if (item.item) {
        // This is a folder, recursively process items
        const folderPath = parentPath ? `${parentPath}/${item.name}` : item.name;
        endpoints.push(...this.extractPostmanEndpoints(item.item, folderPath));
      } else if (item.request) {
        // This is a request
        const endpoint = this.parsePostmanRequest(item.request, item.name, item.response || []);
        endpoints.push(endpoint);
      }
    }

    return endpoints;
  }

  private parsePostmanRequest(
    request: PostmanRequest,
    name: string,
    responses: PostmanResponse[]
  ): ParsedEndpoint {
    const url = this.buildUrlFromPostmanUrl(request.url);

    return {
      method: request.method,
      path: url.path,
      name,
      headers: request.header?.map(h => ({
        key: h.key,
        value: h.value,
        description: h.description,
      })) || [],
      queryParams: request.url.query?.map(q => ({
        key: q.key,
        value: q.value,
        description: q.description,
      })) || [],
      body: request.body ? this.parsePostmanBody(request.body) : undefined,
      responses: responses.map(r => ({
        name: r.name,
        status: r.code,
        body: r.body ? this.parseResponseBody(r.body) : undefined,
        headers: r.header?.map(h => ({
          key: h.key,
          value: h.value,
        })) || [],
      })),
      auth: request.auth ? this.extractRequestAuth(request.auth) : undefined,
    };
  }

  private buildUrlFromPostmanUrl(url: PostmanUrl): { path: string; full: string } {
    if (url.raw) {
      return { path: url.raw, full: url.raw };
    }

    const host = url.host?.join('.') || '';
    const path = url.path?.join('/') || '';
    const query = url.query?.map(q => `${q.key}=${q.value}`).join('&') || '';

    const fullPath = `/${path}`;
    const fullUrl = query ? `${fullPath}?${query}` : fullPath;

    return { path: fullPath, full: fullUrl };
  }

  private parsePostmanBody(body: PostmanBody): ParsedEndpoint['body'] {
    switch (body.mode) {
      case 'raw':
        return {
          type: 'raw',
          content: body.raw,
        };
      case 'formdata':
        return {
          type: 'form-data',
          content: body.formdata?.reduce((acc, item) => {
            acc[item.key] = item.value;
            return acc;
          }, {} as Record<string, any>),
        };
      case 'urlencoded':
        return {
          type: 'urlencoded',
          content: body.urlencoded?.reduce((acc, item) => {
            acc[item.key] = item.value;
            return acc;
          }, {} as Record<string, any>),
        };
      default:
        return { type: 'raw', content: body.raw };
    }
  }

  private parseResponseBody(body: string): any {
    try {
      return JSON.parse(body);
    } catch {
      return body; // Return as string if not JSON
    }
  }

  private extractPostmanVariables(variables: PostmanVariable[]): Record<string, string> {
    return variables.reduce((acc, variable) => {
      acc[variable.key] = variable.value;
      return acc;
    }, {} as Record<string, string>);
  }

  private extractPostmanAuth(collection: PostmanCollection): ParsedPostmanCollection['auth'] {
    // Check for auth in collection level
    // This is a simplified implementation
    return undefined;
  }

  private extractRequestAuth(auth: PostmanAuth): ParsedEndpoint['auth'] {
    const config: Record<string, string> = {};

    switch (auth.type) {
      case 'bearer':
        auth.bearer?.forEach(item => {
          if (item.key === 'token') {
            config.token = item.value;
          }
        });
        break;
      case 'basic':
        auth.basic?.forEach(item => {
          if (item.key === 'username') {
            config.username = item.value;
          } else if (item.key === 'password') {
            config.password = item.value;
          }
        });
        break;
      case 'apikey':
        auth.apikey?.forEach(item => {
          config[item.key] = item.value;
        });
        break;
    }

    return {
      type: auth.type,
      config,
    };
  }

  /**
   * Parse GraphQL Schema (SDL)
   */
  async parseGraphQLSchema(schemaContent: string): Promise<ParsedGraphQLSchema> {
    try {
      const schema: GraphQLSchema = JSON.parse(schemaContent);

      const types: ParsedGraphQLType[] = [];
      const queries: ParsedGraphQLOperation[] = [];
      const mutations: ParsedGraphQLOperation[] = [];
      const subscriptions: ParsedGraphQLOperation[] = [];

      for (const definition of schema.definitions) {
        switch (definition.kind) {
          case 'ObjectTypeDefinition':
            if (definition.name?.value === 'Query') {
              queries.push(...this.extractGraphQLOperations(definition.fields || [], 'query'));
            } else if (definition.name?.value === 'Mutation') {
              mutations.push(...this.extractGraphQLOperations(definition.fields || [], 'mutation'));
            } else if (definition.name?.value === 'Subscription') {
              subscriptions.push(...this.extractGraphQLOperations(definition.fields || [], 'subscription'));
            } else {
              types.push(this.parseGraphQLType(definition));
            }
            break;
          case 'InputObjectTypeDefinition':
          case 'EnumTypeDefinition':
          case 'InterfaceTypeDefinition':
          case 'UnionTypeDefinition':
            types.push(this.parseGraphQLType(definition));
            break;
        }
      }

      return { types, queries, mutations, subscriptions };
    } catch (error) {
      throw new BadRequestException(`Failed to parse GraphQL schema: ${error.message}`);
    }
  }

  private parseGraphQLType(definition: GraphQLDefinition): ParsedGraphQLType {
    const type: ParsedGraphQLType = {
      name: definition.name?.value || '',
      kind: this.mapGraphQLKind(definition.kind),
      description: this.extractGraphQLDescription(definition),
    };

    if (definition.kind === 'EnumTypeDefinition') {
      type.values = (definition as any).values?.map((v: GraphQLEnumValue) => v.name.value) || [];
    }

    if (definition.fields) {
      type.fields = definition.fields.map(field => this.parseGraphQLField(field));
    }

    return type;
  }

  private parseGraphQLField(field: GraphQLField): ParsedGraphQLField {
    return {
      name: field.name.value,
      type: this.resolveGraphQLType(field.type),
      description: field.description?.value,
      args: field.arguments?.map(arg => this.parseGraphQLArgument(arg)),
      isRequired: this.isGraphQLTypeRequired(field.type),
      isList: this.isGraphQLTypeList(field.type),
    };
  }

  private parseGraphQLArgument(arg: GraphQLArgument): ParsedGraphQLArgument {
    return {
      name: arg.name.value,
      type: this.resolveGraphQLType(arg.type),
      description: arg.description?.value,
      isRequired: this.isGraphQLTypeRequired(arg.type),
      defaultValue: undefined, // Would need to parse default values from schema
    };
  }

  private extractGraphQLOperations(fields: GraphQLField[], type: 'query' | 'mutation' | 'subscription'): ParsedGraphQLOperation[] {
    return fields.map(field => ({
      name: field.name.value,
      type,
      description: field.description?.value,
      args: field.arguments?.map(arg => this.parseGraphQLArgument(arg)),
      returnType: this.resolveGraphQLType(field.type),
    }));
  }

  private resolveGraphQLType(type: GraphQLType): string {
    if (type.name) {
      return type.name.value;
    }

    if (type.kind === 'NonNullType' && type.type) {
      return this.resolveGraphQLType(type.type);
    }

    if (type.kind === 'ListType' && type.type) {
      return `[${this.resolveGraphQLType(type.type)}]`;
    }

    return 'Unknown';
  }

  private isGraphQLTypeRequired(type: GraphQLType): boolean {
    return type.kind === 'NonNullType';
  }

  private isGraphQLTypeList(type: GraphQLType): boolean {
    return type.kind === 'ListType' ||
           (type.kind === 'NonNullType' && type.type && this.isGraphQLTypeList(type.type));
  }

  private mapGraphQLKind(kind: string): ParsedGraphQLType['kind'] {
    switch (kind) {
      case 'ObjectTypeDefinition': return 'OBJECT';
      case 'InputObjectTypeDefinition': return 'INPUT_OBJECT';
      case 'EnumTypeDefinition': return 'ENUM';
      case 'InterfaceTypeDefinition': return 'INTERFACE';
      case 'UnionTypeDefinition': return 'UNION';
      default: return 'SCALAR';
    }
  }

  private extractGraphQLDescription(definition: any): string | undefined {
    return definition.description?.value;
  }

  /**
   * Text splitter for Markdown/HTML content
   */
  splitTextIntoChunks(content: string, source: string, options: {
    chunkSize?: number;
    overlap?: number;
    preserveStructure?: boolean;
  } = {}): TextChunk[] {
    const { chunkSize = 1000, overlap = 200, preserveStructure = true } = options;

    if (!preserveStructure) {
      return this.splitPlainText(content, source, chunkSize, overlap);
    }

    // Try to parse as Markdown first, then fallback to plain text
    if (this.isMarkdown(content)) {
      return this.splitMarkdown(content, source, chunkSize, overlap);
    } else if (this.isHTML(content)) {
      return this.splitHTML(content, source, chunkSize, overlap);
    } else {
      return this.splitPlainText(content, source, chunkSize, overlap);
    }
  }

  private splitPlainText(content: string, source: string, chunkSize: number, overlap: number): TextChunk[] {
    const chunks: TextChunk[] = [];
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    let currentChunk = '';
    let position = 0;

    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length > chunkSize && currentChunk.length > 0) {
        chunks.push({
          content: currentChunk.trim(),
          metadata: {
            source,
            type: 'paragraph',
            position,
            length: currentChunk.length,
          },
        });

        // Keep some overlap
        const words = currentChunk.split(' ');
        const overlapWords = words.slice(-Math.floor(overlap / 10)); // Rough estimate
        currentChunk = overlapWords.join(' ') + ' ' + sentence;
        position += currentChunk.length - overlapWords.join(' ').length;
      } else {
        currentChunk += (currentChunk ? '. ' : '') + sentence;
      }
    }

    if (currentChunk.trim()) {
      chunks.push({
        content: currentChunk.trim(),
        metadata: {
          source,
          type: 'paragraph',
          position,
          length: currentChunk.length,
        },
      });
    }

    return chunks;
  }

  private splitMarkdown(content: string, source: string, chunkSize: number, overlap: number): TextChunk[] {
    const chunks: TextChunk[] = [];
    const lines = content.split('\n');
    let currentChunk = '';
    let position = 0;
    let currentSection = '';

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Check if this is a heading
      if (trimmedLine.startsWith('#')) {
        // Save previous chunk if it exists
        if (currentChunk.trim()) {
          chunks.push({
            content: currentChunk.trim(),
            metadata: {
              source,
              type: 'paragraph',
              position,
              length: currentChunk.length,
            },
          });
        }

        // Start new section
        const level = trimmedLine.match(/^#+/)?.[0].length || 1;
        currentSection = trimmedLine;
        currentChunk = trimmedLine;

        chunks.push({
          content: trimmedLine,
          metadata: {
            source,
            type: 'heading',
            level,
            position,
            length: trimmedLine.length,
          },
        });

        currentChunk = '';
        position += line.length + 1;
        continue;
      }

      // Handle code blocks
      if (trimmedLine.startsWith('```')) {
        const language = trimmedLine.replace('```', '');
        let codeBlock = line + '\n';

        // Collect the full code block
        while (lines.length > 0) {
          const nextLine = lines.shift()!;
          codeBlock += nextLine + '\n';
          if (nextLine.trim() === '```') break;
        }

        if (codeBlock.length > chunkSize) {
          // Split large code blocks
          const codeChunks = this.splitPlainText(codeBlock, source, chunkSize, overlap);
          codeChunks.forEach(chunk => {
            chunks.push({
              ...chunk,
              metadata: {
                ...chunk.metadata,
                type: 'code',
                language: language || 'text',
              },
            });
          });
        } else {
          chunks.push({
            content: codeBlock,
            metadata: {
              source,
              type: 'code',
              language: language || 'text',
              position,
              length: codeBlock.length,
            },
          });
        }

        position += codeBlock.length;
        continue;
      }

      // Regular content
      if (currentChunk.length + line.length > chunkSize && currentChunk.length > 0) {
        chunks.push({
          content: currentChunk.trim(),
          metadata: {
            source,
            type: 'paragraph',
            position,
            length: currentChunk.length,
          },
        });

        // Overlap with previous content
        const words = currentChunk.split(' ');
        const overlapWords = words.slice(-Math.floor(overlap / 10));
        currentChunk = overlapWords.join(' ') + '\n' + line;
        position += line.length + 1 - overlapWords.join(' ').length;
      } else {
        currentChunk += (currentChunk ? '\n' : '') + line;
        position += line.length + 1;
      }
    }

    // Add final chunk
    if (currentChunk.trim()) {
      chunks.push({
        content: currentChunk.trim(),
        metadata: {
          source,
          type: 'paragraph',
          position,
          length: currentChunk.length,
        },
      });
    }

    return chunks;
  }

  private splitHTML(content: string, source: string, chunkSize: number, overlap: number): TextChunk[] {
    // Simple HTML splitting - remove tags and treat as plain text
    const textContent = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    return this.splitPlainText(textContent, source, chunkSize, overlap);
  }

  private isMarkdown(content: string): boolean {
    const markdownPatterns = [
      /^#{1,6}\s/m,  // Headings
      /```[\s\S]*?```/,  // Code blocks
      /\[.*?\]\(.*?\)/,  // Links
      /\*\*.*?\*\*/,  // Bold
      /\*.*?\*/,  // Italic
    ];

    return markdownPatterns.some(pattern => pattern.test(content));
  }

  private isHTML(content: string): boolean {
    return /<[^>]*>/.test(content);
  }

  /**
   * Convert parsed specs to unified format
   */
  convertToUnifiedFormat(spec: ParsedPostmanCollection | ParsedGraphQLSchema): any {
    if ('endpoints' in spec) {
      // Postman collection
      return {
        name: spec.name,
        type: 'rest',
        endpoints: spec.endpoints.map(ep => ({
          method: ep.method,
          path: ep.path,
          name: ep.name,
          description: ep.description,
          parameters: [
            ...ep.headers.map(h => ({ name: h.key, type: 'header', value: h.value })),
            ...ep.queryParams.map(q => ({ name: q.key, type: 'query', value: q.value })),
          ],
          requestBody: ep.body,
          responses: ep.responses,
        })),
        auth: spec.auth,
      };
    } else {
      // GraphQL schema
      return {
        name: 'GraphQL Schema',
        type: 'graphql',
        queries: spec.queries,
        mutations: spec.mutations,
        subscriptions: spec.subscriptions,
        types: spec.types,
      };
    }
  }

  /**
   * Validate specification format
   */
  validateSpec(content: string, format: 'postman' | 'graphql' | 'openapi'): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      switch (format) {
        case 'postman':
          const postmanSpec = JSON.parse(content);
          if (!postmanSpec.info?.name) {
            errors.push('Missing collection name');
          }
          if (!postmanSpec.item || postmanSpec.item.length === 0) {
            warnings.push('Collection has no requests');
          }
          break;

        case 'graphql':
          const graphqlSpec = JSON.parse(content);
          if (!graphqlSpec.definitions || graphqlSpec.definitions.length === 0) {
            errors.push('No GraphQL definitions found');
          }
          break;

        case 'openapi':
          // This would delegate to the OpenAPI parser
          warnings.push('Use OpenAPI parser for detailed validation');
          break;
      }
    } catch (e) {
      errors.push(`Invalid JSON format: ${e.message}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}
