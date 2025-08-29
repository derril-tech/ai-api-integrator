import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { OpenApiParserService, ParsedSpec } from './openapi-parser.service';

class ParseOpenApiDto {
  specContent: string;
}

@ApiTags('openapi-parser')
@Controller('openapi-parser')
export class OpenApiParserController {
  constructor(private readonly parserService: OpenApiParserService) {}

  @Post('parse')
  @ApiOperation({ summary: 'Parse OpenAPI specification and extract endpoints and models' })
  @ApiResponse({ status: 200, description: 'OpenAPI spec parsed successfully' })
  async parseSpec(@Body() dto: ParseOpenApiDto): Promise<{
    success: boolean;
    data: ParsedSpec;
    stats: any;
    patterns: any;
    auth: any;
  }> {
    try {
      if (!dto.specContent) {
        throw new BadRequestException('Specification content is required');
      }

      const parsedSpec = await this.parserService.parseSpec(dto.specContent);

      // Generate additional analysis
      const stats = this.parserService.generateEndpointStats(parsedSpec.endpoints);
      const patterns = this.parserService.extractPaginationPatterns(parsedSpec.endpoints);
      const auth = this.parserService.extractAuthPatterns(parsedSpec);

      return {
        success: true,
        data: parsedSpec,
        stats,
        patterns,
        auth,
      };
    } catch (error) {
      throw new BadRequestException({
        success: false,
        error: error.message,
      });
    }
  }

  @Post('analyze')
  @ApiOperation({ summary: 'Analyze OpenAPI specification for patterns and recommendations' })
  @ApiResponse({ status: 200, description: 'Analysis completed' })
  async analyzeSpec(@Body() dto: ParseOpenApiDto): Promise<{
    success: boolean;
    analysis: {
      endpoints: {
        total: number;
        byMethod: Record<string, number>;
        byTag: Record<string, number>;
        deprecated: number;
        withAuth: number;
        withPagination: number;
      };
      pagination: {
        hasPagination: boolean;
        patterns: string[];
        commonParams: string[];
      };
      authentication: {
        authTypes: string[];
        hasBearerAuth: boolean;
        hasApiKeyAuth: boolean;
        hasOAuth: boolean;
        requiresAuth: boolean;
      };
      models: {
        total: number;
        complexSchemas: number;
        withEnums: number;
      };
      recommendations: string[];
    };
  }> {
    try {
      if (!dto.specContent) {
        throw new BadRequestException('Specification content is required');
      }

      const parsedSpec = await this.parserService.parseSpec(dto.specContent);

      // Generate comprehensive analysis
      const endpoints = this.parserService.generateEndpointStats(parsedSpec.endpoints);
      const pagination = this.parserService.extractPaginationPatterns(parsedSpec.endpoints);
      const authentication = this.parserService.extractAuthPatterns(parsedSpec);

      // Analyze models
      const models = {
        total: parsedSpec.models.length,
        complexSchemas: parsedSpec.models.filter(m =>
          m.schema.properties && Object.keys(m.schema.properties).length > 10
        ).length,
        withEnums: parsedSpec.models.filter(m => m.schema.enum && m.schema.enum.length > 0).length,
      };

      // Generate recommendations
      const recommendations = this.generateRecommendations(
        endpoints,
        pagination,
        authentication,
        models,
        parsedSpec
      );

      return {
        success: true,
        analysis: {
          endpoints,
          pagination,
          authentication,
          models,
          recommendations,
        },
      };
    } catch (error) {
      throw new BadRequestException({
        success: false,
        error: error.message,
      });
    }
  }

  @Post('extract-endpoints')
  @ApiOperation({ summary: 'Extract endpoint definitions for code generation' })
  @ApiResponse({ status: 200, description: 'Endpoints extracted successfully' })
  async extractEndpoints(@Body() dto: ParseOpenApiDto): Promise<{
    success: boolean;
    endpoints: any[];
    summary: {
      total: number;
      byMethod: Record<string, number>;
      withParams: number;
      withRequestBody: number;
      withResponses: number;
    };
  }> {
    try {
      if (!dto.specContent) {
        throw new BadRequestException('Specification content is required');
      }

      const parsedSpec = await this.parserService.parseSpec(dto.specContent);

      // Extract endpoint information suitable for code generation
      const endpoints = parsedSpec.endpoints.map(endpoint => ({
        path: endpoint.path,
        method: endpoint.method,
        operationId: endpoint.operationId,
        summary: endpoint.summary,
        description: endpoint.description,
        tags: endpoint.tags,
        deprecated: endpoint.deprecated,
        parameters: endpoint.parameters.map(p => ({
          name: p.name,
          location: p.location,
          required: p.required,
          type: p.schema.type,
          description: p.description,
        })),
        requestBody: endpoint.requestBody ? {
          required: endpoint.requestBody.required,
          contentTypes: Object.keys(endpoint.requestBody.content),
          schema: endpoint.requestBody.content['application/json']?.schema,
        } : null,
        responses: endpoint.responses.map(r => ({
          statusCode: r.statusCode,
          description: r.description,
          contentTypes: r.content ? Object.keys(r.content) : [],
          schema: r.content?.['application/json']?.schema,
        })),
        security: endpoint.security,
      }));

      // Generate summary
      const summary = {
        total: endpoints.length,
        byMethod: endpoints.reduce((acc, ep) => {
          acc[ep.method] = (acc[ep.method] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        withParams: endpoints.filter(ep => ep.parameters.length > 0).length,
        withRequestBody: endpoints.filter(ep => ep.requestBody).length,
        withResponses: endpoints.filter(ep => ep.responses.length > 0).length,
      };

      return {
        success: true,
        endpoints,
        summary,
      };
    } catch (error) {
      throw new BadRequestException({
        success: false,
        error: error.message,
      });
    }
  }

  @Post('extract-models')
  @ApiOperation({ summary: 'Extract data models for code generation' })
  @ApiResponse({ status: 200, description: 'Models extracted successfully' })
  async extractModels(@Body() dto: ParseOpenApiDto): Promise<{
    success: boolean;
    models: any[];
    summary: {
      total: number;
      objectSchemas: number;
      arraySchemas: number;
      enumSchemas: number;
      withRequiredFields: number;
    };
  }> {
    try {
      if (!dto.specContent) {
        throw new BadRequestException('Specification content is required');
      }

      const parsedSpec = await this.parserService.parseSpec(dto.specContent);

      // Extract model information suitable for code generation
      const models = parsedSpec.models.map(model => ({
        name: model.name,
        description: model.description,
        type: model.schema.type,
        properties: model.schema.properties ? Object.entries(model.schema.properties).map(([name, prop]) => ({
          name,
          type: prop.type,
          format: prop.format,
          required: model.schema.required?.includes(name) || false,
          nullable: prop.nullable,
          description: prop.description,
          default: prop.default,
          enum: prop.enum,
          items: prop.items,
          minimum: prop.minimum,
          maximum: prop.maximum,
          minLength: prop.minLength,
          maxLength: prop.maxLength,
          pattern: prop.pattern,
        })) : [],
        required: model.schema.required || [],
        enum: model.schema.enum,
        items: model.schema.items,
      }));

      // Generate summary
      const summary = {
        total: models.length,
        objectSchemas: models.filter(m => m.type === 'object').length,
        arraySchemas: models.filter(m => m.type === 'array').length,
        enumSchemas: models.filter(m => m.enum && m.enum.length > 0).length,
        withRequiredFields: models.filter(m => m.required && m.required.length > 0).length,
      };

      return {
        success: true,
        models,
        summary,
      };
    } catch (error) {
      throw new BadRequestException({
        success: false,
        error: error.message,
      });
    }
  }

  @Post('validate')
  @ApiOperation({ summary: 'Validate OpenAPI specification format' })
  @ApiResponse({ status: 200, description: 'Validation completed' })
  async validateSpec(@Body() dto: ParseOpenApiDto): Promise<{
    success: boolean;
    valid: boolean;
    errors: string[];
    warnings: string[];
    version: string;
  }> {
    try {
      if (!dto.specContent) {
        throw new BadRequestException('Specification content is required');
      }

      const errors: string[] = [];
      const warnings: string[] = [];

      // Basic JSON validation
      let spec;
      try {
        spec = JSON.parse(dto.specContent);
      } catch (e) {
        errors.push('Invalid JSON format');
        return {
          success: true,
          valid: false,
          errors,
          warnings,
          version: 'unknown',
        };
      }

      // Check OpenAPI version
      if (!spec.openapi) {
        errors.push('Missing openapi version field');
      } else if (!spec.openapi.startsWith('3.')) {
        errors.push('Only OpenAPI 3.0 and 3.1 are supported');
      }

      // Check required fields
      if (!spec.info) {
        errors.push('Missing info section');
      } else {
        if (!spec.info.title) {
          errors.push('Missing info.title');
        }
        if (!spec.info.version) {
          errors.push('Missing info.version');
        }
      }

      if (!spec.paths || Object.keys(spec.paths).length === 0) {
        errors.push('Missing or empty paths section');
      }

      // Check for common issues
      if (!spec.servers || spec.servers.length === 0) {
        warnings.push('No servers defined - using relative URLs');
      }

      // Check paths for common issues
      if (spec.paths) {
        for (const [path, pathItem] of Object.entries(spec.paths)) {
          if (typeof pathItem !== 'object') {
            errors.push(`Invalid path item at ${path}`);
            continue;
          }

          const methods = Object.keys(pathItem).filter(key =>
            ['get', 'post', 'put', 'delete', 'patch', 'head', 'options', 'trace'].includes(key)
          );

          if (methods.length === 0) {
            warnings.push(`No HTTP methods defined for path ${path}`);
          }
        }
      }

      return {
        success: true,
        valid: errors.length === 0,
        errors,
        warnings,
        version: spec.openapi || 'unknown',
      };
    } catch (error) {
      throw new BadRequestException({
        success: false,
        error: error.message,
      });
    }
  }

  private generateRecommendations(
    endpoints: any,
    pagination: any,
    authentication: any,
    models: any,
    spec: ParsedSpec
  ): string[] {
    const recommendations: string[] = [];

    // Endpoint recommendations
    if (endpoints.total === 0) {
      recommendations.push('No endpoints found in the specification');
    } else {
      if (endpoints.deprecated > 0) {
        recommendations.push(`Remove or update ${endpoints.deprecated} deprecated endpoints`);
      }

      if (endpoints.withAuth === 0 && authentication.requiresAuth) {
        recommendations.push('Consider adding authentication to endpoints for better security');
      }
    }

    // Pagination recommendations
    if (pagination.hasPagination) {
      recommendations.push('Pagination detected - ensure consistent patterns across endpoints');
    } else if (endpoints.total > 10) {
      recommendations.push('Consider adding pagination for endpoints that return collections');
    }

    // Authentication recommendations
    if (!authentication.requiresAuth) {
      recommendations.push('Consider adding authentication for production APIs');
    }

    if (authentication.hasBearerAuth) {
      recommendations.push('Bearer authentication detected - ensure proper token validation');
    }

    if (authentication.hasApiKeyAuth) {
      recommendations.push('API key authentication detected - rotate keys regularly');
    }

    // Model recommendations
    if (models.total === 0) {
      recommendations.push('No reusable schemas found - consider defining common data models');
    } else {
      if (models.complexSchemas > 0) {
        recommendations.push(`${models.complexSchemas} complex schemas found - consider breaking them down`);
      }

      if (models.withEnums === 0) {
        recommendations.push('Consider using enums for constrained values');
      }
    }

    // General recommendations
    if (spec.servers && spec.servers.length === 0) {
      recommendations.push('Add server definitions for better API documentation');
    }

    if (!spec.description || spec.description.length < 10) {
      recommendations.push('Add a comprehensive API description');
    }

    return recommendations;
  }
}
