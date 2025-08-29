import { Controller, Post, Get, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CodegenService, NestJSServerTemplate } from './codegen.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

class GenerateServerDto {
  projectId: string;
  template?: string;
  customizations?: Record<string, any>;
}

@ApiTags('codegen')
@Controller('codegen')
@UseGuards(JwtAuthGuard)
export class CodegenController {
  constructor(private readonly codegenService: CodegenService) {}

  @Post('server/nestjs')
  @ApiOperation({ summary: 'Generate NestJS server adapter' })
  @ApiResponse({ status: 200, description: 'NestJS server adapter generated successfully' })
  async generateNestJSServer(@Body() generateDto: GenerateServerDto): Promise<NestJSServerTemplate> {
    return this.codegenService.generateNestJSServerAdapter(generateDto.projectId);
  }

  @Post('sdk/typescript')
  @ApiOperation({ summary: 'Generate TypeScript SDK' })
  @ApiResponse({ status: 200, description: 'TypeScript SDK generated successfully' })
  async generateTypeScriptSDK(@Body() generateDto: GenerateServerDto): Promise<NestJSServerTemplate> {
    return this.codegenService.generateTypeScriptSDK(generateDto.projectId);
  }

  @Get('templates')
  @ApiOperation({ summary: 'Get available codegen templates' })
  @ApiResponse({ status: 200, description: 'List of available templates' })
  getTemplates() {
    return {
      server: {
        nestjs: {
          name: 'NestJS Server Adapter',
          description: 'Generate NestJS server with logging, tracing, and error mapping',
          features: [
            'Structured logging',
            'Distributed tracing',
            'Global error handling',
            'CORS support',
            'Rate limiting',
            'Authentication guards',
            'Request validation',
            'OpenAPI/Swagger documentation'
          ]
        }
      },
      sdk: {
        typescript: {
          name: 'TypeScript SDK',
          description: 'Generate typed TypeScript client with retries, pagination, and error handling',
          features: [
            'Full TypeScript support',
            'Automatic retries with exponential backoff',
            'Pagination helpers (offset & cursor)',
            'Comprehensive error taxonomy',
            'Circuit breaker pattern',
            'Rate limiting',
            'Batch operations',
            'Request/response logging',
            'Environment-based configuration'
          ]
        }
      }
    };
  }

  @Get('server/nestjs/preview/:projectId')
  @ApiOperation({ summary: 'Preview NestJS server adapter structure' })
  @ApiResponse({ status: 200, description: 'Preview of generated files' })
  async previewNestJSServer(@Param('projectId') projectId: string) {
    const template = await this.codegenService.generateNestJSServerAdapter(projectId);

    return {
      fileCount: Object.values(template).reduce((acc, files) => acc + files.length, 0),
      structure: {
        controllers: template.controllers.length,
        services: template.services.length,
        modules: template.modules.length,
        dtos: template.dtos.length,
        interceptors: template.interceptors.length,
        middlewares: template.middlewares.length,
        guards: template.guards.length,
        filters: template.filters.length,
      },
      files: Object.keys(template).reduce((acc, category) => {
        acc[category] = template[category].map((_, index) => `${category}/${index + 1}.ts`);
        return acc;
      }, {} as Record<string, string[]>)
    };
  }
}
