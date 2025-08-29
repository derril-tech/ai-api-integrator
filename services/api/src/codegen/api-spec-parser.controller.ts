import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ApiSpecParserService, ParsedPostmanCollection, ParsedGraphQLSchema, TextChunk } from './api-spec-parser.service';

class ParsePostmanDto {
  collectionContent: string;
}

class ParseGraphQLDto {
  schemaContent: string;
}

class SplitTextDto {
  content: string;
  source: string;
  options?: {
    chunkSize?: number;
    overlap?: number;
    preserveStructure?: boolean;
  };
}

class ValidateSpecDto {
  content: string;
  format: 'postman' | 'graphql' | 'openapi';
}

@ApiTags('api-spec-parser')
@Controller('api-spec-parser')
export class ApiSpecParserController {
  constructor(private readonly parserService: ApiSpecParserService) {}

  @Post('postman/parse')
  @ApiOperation({ summary: 'Parse Postman collection and extract endpoints' })
  @ApiResponse({ status: 200, description: 'Postman collection parsed successfully' })
  async parsePostman(@Body() dto: ParsePostmanDto): Promise<{
    success: boolean;
    data: ParsedPostmanCollection;
    summary: {
      endpoints: number;
      methods: Record<string, number>;
      withAuth: number;
      withBody: number;
    };
  }> {
    try {
      if (!dto.collectionContent) {
        throw new BadRequestException('Collection content is required');
      }

      const parsedCollection = await this.parserService.parsePostmanCollection(dto.collectionContent);

      // Generate summary
      const methodCounts: Record<string, number> = {};
      let withAuth = 0;
      let withBody = 0;

      for (const endpoint of parsedCollection.endpoints) {
        methodCounts[endpoint.method] = (methodCounts[endpoint.method] || 0) + 1;

        if (endpoint.auth) {
          withAuth++;
        }

        if (endpoint.body) {
          withBody++;
        }
      }

      return {
        success: true,
        data: parsedCollection,
        summary: {
          endpoints: parsedCollection.endpoints.length,
          methods: methodCounts,
          withAuth,
          withBody,
        },
      };
    } catch (error) {
      throw new BadRequestException({
        success: false,
        error: error.message,
      });
    }
  }

  @Post('graphql/parse')
  @ApiOperation({ summary: 'Parse GraphQL schema and extract types/operations' })
  @ApiResponse({ status: 200, description: 'GraphQL schema parsed successfully' })
  async parseGraphQL(@Body() dto: ParseGraphQLDto): Promise<{
    success: boolean;
    data: ParsedGraphQLSchema;
    summary: {
      types: number;
      queries: number;
      mutations: number;
      subscriptions: number;
      enums: number;
      interfaces: number;
    };
  }> {
    try {
      if (!dto.schemaContent) {
        throw new BadRequestException('Schema content is required');
      }

      const parsedSchema = await this.parserService.parseGraphQLSchema(dto.schemaContent);

      // Generate summary
      const enums = parsedSchema.types.filter(t => t.kind === 'ENUM').length;
      const interfaces = parsedSchema.types.filter(t => t.kind === 'INTERFACE').length;

      return {
        success: true,
        data: parsedSchema,
        summary: {
          types: parsedSchema.types.length,
          queries: parsedSchema.queries.length,
          mutations: parsedSchema.mutations.length,
          subscriptions: parsedSchema.subscriptions.length,
          enums,
          interfaces,
        },
      };
    } catch (error) {
      throw new BadRequestException({
        success: false,
        error: error.message,
      });
    }
  }

  @Post('text/split')
  @ApiOperation({ summary: 'Split text content into chunks for processing' })
  @ApiResponse({ status: 200, description: 'Text split successfully' })
  splitText(@Body() dto: SplitTextDto): {
    success: boolean;
    chunks: TextChunk[];
    summary: {
      totalChunks: number;
      totalLength: number;
      averageChunkSize: number;
      types: Record<string, number>;
    };
  } {
    try {
      if (!dto.content) {
        throw new BadRequestException('Content is required');
      }

      const chunks = this.parserService.splitTextIntoChunks(
        dto.content,
        dto.source || 'unknown',
        dto.options
      );

      // Generate summary
      const typeCounts: Record<string, number> = {};
      let totalLength = 0;

      for (const chunk of chunks) {
        typeCounts[chunk.metadata.type] = (typeCounts[chunk.metadata.type] || 0) + 1;
        totalLength += chunk.content.length;
      }

      return {
        success: true,
        chunks,
        summary: {
          totalChunks: chunks.length,
          totalLength,
          averageChunkSize: chunks.length > 0 ? Math.round(totalLength / chunks.length) : 0,
          types: typeCounts,
        },
      };
    } catch (error) {
      throw new BadRequestException({
        success: false,
        error: error.message,
      });
    }
  }

  @Post('validate')
  @ApiOperation({ summary: 'Validate API specification format' })
  @ApiResponse({ status: 200, description: 'Validation completed' })
  validateSpec(@Body() dto: ValidateSpecDto): {
    success: boolean;
    valid: boolean;
    errors: string[];
    warnings: string[];
    format: string;
  } {
    try {
      if (!dto.content) {
        throw new BadRequestException('Content is required');
      }

      const validation = this.parserService.validateSpec(dto.content, dto.format);

      return {
        success: true,
        valid: validation.valid,
        errors: validation.errors,
        warnings: validation.warnings,
        format: dto.format,
      };
    } catch (error) {
      throw new BadRequestException({
        success: false,
        error: error.message,
      });
    }
  }

  @Post('unified')
  @ApiOperation({ summary: 'Convert parsed specification to unified format' })
  @ApiResponse({ status: 200, description: 'Conversion completed' })
  async convertToUnified(@Body() body: { spec: any; type: 'postman' | 'graphql' }): Promise<{
    success: boolean;
    unifiedSpec: any;
    type: string;
  }> {
    try {
      if (!body.spec) {
        throw new BadRequestException('Specification is required');
      }

      const unifiedSpec = this.parserService.convertToUnifiedFormat(body.spec);

      return {
        success: true,
        unifiedSpec,
        type: body.type,
      };
    } catch (error) {
      throw new BadRequestException({
        success: false,
        error: error.message,
      });
    }
  }

  @Post('analyze')
  @ApiOperation({ summary: 'Comprehensive analysis of API specification' })
  @ApiResponse({ status: 200, description: 'Analysis completed' })
  async analyzeSpec(@Body() body: {
    content: string;
    format: 'postman' | 'graphql' | 'openapi';
    includeChunks?: boolean;
  }): Promise<{
    success: boolean;
    analysis: {
      validation: any;
      parsedSpec?: any;
      chunks?: TextChunk[];
      recommendations: string[];
      compatibility: {
        codegenReady: boolean;
        issues: string[];
      };
    };
  }> {
    try {
      if (!body.content) {
        throw new BadRequestException('Content is required');
      }

      const validation = this.parserService.validateSpec(body.content, body.format);
      let parsedSpec: any;
      let chunks: TextChunk[] | undefined;

      // Parse the spec if valid
      if (validation.valid) {
        try {
          switch (body.format) {
            case 'postman':
              parsedSpec = await this.parserService.parsePostmanCollection(body.content);
              break;
            case 'graphql':
              parsedSpec = await this.parserService.parseGraphQLSchema(body.content);
              break;
            case 'openapi':
              // This would delegate to the OpenAPI parser service
              parsedSpec = { message: 'OpenAPI parsing handled by dedicated service' };
              break;
          }
        } catch (parseError) {
          validation.errors.push(`Parse error: ${parseError.message}`);
        }
      }

      // Generate text chunks if requested
      if (body.includeChunks && parsedSpec) {
        const specText = typeof parsedSpec === 'string' ? parsedSpec : JSON.stringify(parsedSpec, null, 2);
        chunks = this.parserService.splitTextIntoChunks(specText, `${body.format}-spec`, {
          chunkSize: 1000,
          overlap: 100,
        });
      }

      // Generate recommendations
      const recommendations = this.generateRecommendations(validation, parsedSpec, body.format);

      // Assess codegen compatibility
      const compatibility = this.assessCodegenCompatibility(parsedSpec, body.format);

      return {
        success: true,
        analysis: {
          validation,
          parsedSpec,
          chunks,
          recommendations,
          compatibility,
        },
      };
    } catch (error) {
      throw new BadRequestException({
        success: false,
        error: error.message,
      });
    }
  }

  private generateRecommendations(validation: any, parsedSpec: any, format: string): string[] {
    const recommendations: string[] = [];

    if (!validation.valid) {
      recommendations.push('Fix validation errors before proceeding with code generation');
    }

    if (validation.warnings.length > 0) {
      recommendations.push('Address validation warnings for better API specification quality');
    }

    if (parsedSpec) {
      switch (format) {
        case 'postman':
          const endpoints = parsedSpec.endpoints || [];
          if (endpoints.length === 0) {
            recommendations.push('Add API endpoints to the collection');
          }
          if (endpoints.filter((ep: any) => ep.auth).length === 0) {
            recommendations.push('Consider adding authentication to endpoints');
          }
          break;

        case 'graphql':
          if (parsedSpec.queries?.length === 0) {
            recommendations.push('Add query operations to the schema');
          }
          if (parsedSpec.types?.length === 0) {
            recommendations.push('Define custom types in the schema');
          }
          break;
      }
    }

    recommendations.push('Ensure consistent naming conventions');
    recommendations.push('Add comprehensive descriptions to all endpoints/types');
    recommendations.push('Validate the specification against real API responses');

    return recommendations;
  }

  private assessCodegenCompatibility(parsedSpec: any, format: string): {
    codegenReady: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    if (!parsedSpec) {
      return { codegenReady: false, issues: ['Unable to parse specification'] };
    }

    switch (format) {
      case 'postman':
        if (!parsedSpec.endpoints || parsedSpec.endpoints.length === 0) {
          issues.push('No endpoints found for code generation');
        }
        break;

      case 'graphql':
        if (!parsedSpec.queries && !parsedSpec.mutations && !parsedSpec.subscriptions) {
          issues.push('No operations found for code generation');
        }
        break;
    }

    return {
      codegenReady: issues.length === 0,
      issues,
    };
  }
}
