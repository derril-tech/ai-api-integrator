import { Injectable } from '@nestjs/common';
import { IsString, IsObject, IsOptional, IsEnum, IsArray, ValidateNested, IsNumber, Min, Max } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export enum SpecFormat {
  OPENAPI = 'openapi',
  POSTMAN = 'postman',
  GRAPHQL = 'graphql',
  ASYNCAPI = 'asyncapi',
  MARKDOWN = 'markdown',
}

export class CreateApiSpecDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(SpecFormat)
  format: SpecFormat;

  @IsObject()
  originalSpec: Record<string, any>;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class UpdateApiSpecDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  originalSpec?: Record<string, any>;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsEnum(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC' = 'DESC';

  @IsOptional()
  @IsString()
  search?: string;
}

export class FlowNodeDto {
  @IsString()
  id: string;

  @IsEnum(['http', 'transform', 'delay', 'branch', 'loop', 'call', 'webhook', 'schedule'])
  type: string;

  @IsObject()
  config: Record<string, any>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  next?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => RetryPolicyDto)
  retryPolicy?: RetryPolicyDto;
}

export class RetryPolicyDto {
  @IsNumber()
  @Min(1)
  @Max(10)
  maxAttempts: number;

  @IsNumber()
  @Min(100)
  backoffMs: number;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  jitter?: boolean;
}

export class FlowDefinitionDto {
  @IsString()
  id: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FlowNodeDto)
  nodes: FlowNodeDto[];

  @IsString()
  entry: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ScheduleDto)
  schedule?: ScheduleDto;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class ScheduleDto {
  @IsOptional()
  @IsString()
  cron?: string;

  @IsOptional()
  @IsNumber()
  @Min(1000)
  interval?: number;
}

export class FlowRunOptionsDto {
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  temporalEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(1000)
  @Max(3600000) // Max 1 hour
  timeoutMs?: number;

  @IsOptional()
  @IsObject()
  variables?: Record<string, any>;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  sandbox?: boolean;

  @IsOptional()
  @IsString()
  workflowId?: string;

  @IsOptional()
  @IsString()
  taskQueue?: string;
}

export class ShareCreateDto {
  @IsOptional()
  @IsNumber()
  @Min(300) // 5 minutes minimum
  @Max(2592000) // 30 days maximum
  ttlSeconds?: number;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  allowDownload?: boolean = true;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  allowCopy?: boolean = true;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  allowPrint?: boolean = true;

  @IsOptional()
  @IsString()
  watermark?: string;
}

@Injectable()
export class ApiSpecValidator {
  /**
   * Validate OpenAPI specification
   */
  validateOpenApiSpec(spec: any): { isValid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Check required OpenAPI fields
      if (!spec.openapi && !spec.swagger) {
        errors.push('Missing OpenAPI/Swagger version field');
      }

      if (!spec.info) {
        errors.push('Missing info object');
      } else {
        if (!spec.info.title) {
          errors.push('Missing info.title');
        }
        if (!spec.info.version) {
          errors.push('Missing info.version');
        }
      }

      if (!spec.paths) {
        errors.push('Missing paths object');
      } else {
        // Validate paths
        const pathCount = Object.keys(spec.paths).length;
        if (pathCount === 0) {
          warnings.push('No paths defined');
        } else if (pathCount > 1000) {
          warnings.push('Large number of paths (>1000) may impact performance');
        }

        // Validate individual paths
        for (const [path, pathItem] of Object.entries(spec.paths)) {
          if (!path.startsWith('/')) {
            errors.push(`Path '${path}' should start with '/'`);
          }

          if (pathItem && typeof pathItem === 'object') {
            const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'];
            const definedMethods = methods.filter(method => pathItem[method]);
            
            if (definedMethods.length === 0) {
              warnings.push(`Path '${path}' has no HTTP methods defined`);
            }

            // Validate operations
            for (const method of definedMethods) {
              const operation = pathItem[method];
              if (!operation.operationId) {
                warnings.push(`Operation ${method.toUpperCase()} ${path} missing operationId`);
              }
              if (!operation.summary && !operation.description) {
                warnings.push(`Operation ${method.toUpperCase()} ${path} missing summary/description`);
              }
            }
          }
        }
      }

      // Validate components/definitions
      if (spec.components?.schemas || spec.definitions) {
        const schemas = spec.components?.schemas || spec.definitions;
        const schemaCount = Object.keys(schemas).length;
        
        if (schemaCount > 500) {
          warnings.push('Large number of schemas (>500) may impact performance');
        }
      }

      // Check for security definitions
      if (!spec.security && !spec.securityDefinitions && !spec.components?.securitySchemes) {
        warnings.push('No security schemes defined');
      }

    } catch (error) {
      errors.push(`Validation error: ${error.message}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate Postman collection
   */
  validatePostmanCollection(collection: any): { isValid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      if (!collection.info) {
        errors.push('Missing collection info');
      } else {
        if (!collection.info.name) {
          errors.push('Missing collection name');
        }
      }

      if (!collection.item) {
        errors.push('Missing collection items');
      } else if (!Array.isArray(collection.item)) {
        errors.push('Collection items must be an array');
      } else if (collection.item.length === 0) {
        warnings.push('Collection has no items');
      }

      // Validate collection format version
      if (collection.info?.schema && !collection.info.schema.includes('postman')) {
        warnings.push('Unknown collection schema format');
      }

    } catch (error) {
      errors.push(`Validation error: ${error.message}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate GraphQL schema
   */
  validateGraphQLSchema(schema: string): { isValid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Basic GraphQL schema validation
      if (!schema.includes('type Query') && !schema.includes('type Mutation') && !schema.includes('type Subscription')) {
        warnings.push('No root types (Query, Mutation, Subscription) found');
      }

      // Check for common GraphQL keywords
      const hasTypes = schema.includes('type ');
      const hasInterfaces = schema.includes('interface ');
      const hasEnums = schema.includes('enum ');

      if (!hasTypes && !hasInterfaces && !hasEnums) {
        errors.push('No GraphQL type definitions found');
      }

    } catch (error) {
      errors.push(`Validation error: ${error.message}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate flow definition
   */
  validateFlowDefinition(flow: FlowDefinitionDto): { isValid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Check if entry node exists
      const entryNode = flow.nodes.find(node => node.id === flow.entry);
      if (!entryNode) {
        errors.push(`Entry node '${flow.entry}' not found in nodes`);
      }

      // Validate node references
      const nodeIds = new Set(flow.nodes.map(node => node.id));
      
      for (const node of flow.nodes) {
        // Check for duplicate node IDs
        const duplicates = flow.nodes.filter(n => n.id === node.id);
        if (duplicates.length > 1) {
          errors.push(`Duplicate node ID: ${node.id}`);
        }

        // Validate next node references
        if (node.next) {
          for (const nextId of node.next) {
            if (!nodeIds.has(nextId)) {
              errors.push(`Node '${node.id}' references non-existent node '${nextId}'`);
            }
          }
        }

        // Validate node-specific configurations
        switch (node.type) {
          case 'http':
            if (!node.config.url) {
              errors.push(`HTTP node '${node.id}' missing URL`);
            }
            if (!node.config.method) {
              warnings.push(`HTTP node '${node.id}' missing method, defaulting to GET`);
            }
            break;

          case 'branch':
            if (!node.config.condition) {
              errors.push(`Branch node '${node.id}' missing condition`);
            }
            if (!node.config.trueNodeId || !node.config.falseNodeId) {
              errors.push(`Branch node '${node.id}' missing true/false node references`);
            }
            break;

          case 'delay':
            if (!node.config.duration || node.config.duration <= 0) {
              errors.push(`Delay node '${node.id}' missing or invalid duration`);
            }
            break;

          case 'transform':
            if (!node.config.script) {
              errors.push(`Transform node '${node.id}' missing script`);
            }
            break;
        }
      }

      // Check for unreachable nodes
      const reachableNodes = this.findReachableNodes(flow.nodes, flow.entry);
      const unreachableNodes = flow.nodes.filter(node => !reachableNodes.has(node.id));
      
      if (unreachableNodes.length > 0) {
        warnings.push(`Unreachable nodes: ${unreachableNodes.map(n => n.id).join(', ')}`);
      }

      // Check for cycles (potential infinite loops)
      if (this.hasCycles(flow.nodes, flow.entry)) {
        warnings.push('Flow contains cycles - ensure proper exit conditions');
      }

    } catch (error) {
      errors.push(`Validation error: ${error.message}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private findReachableNodes(nodes: FlowNodeDto[], entryId: string): Set<string> {
    const reachable = new Set<string>();
    const visited = new Set<string>();
    const nodeMap = new Map(nodes.map(node => [node.id, node]));

    const visit = (nodeId: string) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      reachable.add(nodeId);

      const node = nodeMap.get(nodeId);
      if (node?.next) {
        for (const nextId of node.next) {
          visit(nextId);
        }
      }
    };

    visit(entryId);
    return reachable;
  }

  private hasCycles(nodes: FlowNodeDto[], entryId: string): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const nodeMap = new Map(nodes.map(node => [node.id, node]));

    const hasCycleDFS = (nodeId: string): boolean => {
      if (recursionStack.has(nodeId)) return true;
      if (visited.has(nodeId)) return false;

      visited.add(nodeId);
      recursionStack.add(nodeId);

      const node = nodeMap.get(nodeId);
      if (node?.next) {
        for (const nextId of node.next) {
          if (hasCycleDFS(nextId)) return true;
        }
      }

      recursionStack.delete(nodeId);
      return false;
    };

    return hasCycleDFS(entryId);
  }
}
