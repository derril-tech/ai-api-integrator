import { Controller, Post, Body, Get, Param, Res, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
import { RepoExporterService, ExportOptions } from './repo-exporter.service';
import { ExportGuard } from './guards/export.guard';

class ExportRepositoryDto {
  projectId: string;
  options?: ExportOptions;
}

@ApiTags('repo-export')
@Controller('repo-export')
export class RepoExporterController {
  constructor(private readonly repoExporterService: RepoExporterService) {}

  @Post('export')
  @UseGuards(ExportGuard)
  @ApiOperation({ summary: 'Export complete repository' })
  @ApiResponse({
    status: 200,
    description: 'Repository exported successfully',
    content: {
      'application/zip': {
        schema: { type: 'string', format: 'binary' }
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Export blocked by guardrails' })
  async exportRepository(
    @Body() exportDto: ExportRepositoryDto,
    @Res() res: Response
  ): Promise<void> {
    try {
      const zipBuffer = await this.repoExporterService.exportRepository(
        exportDto.projectId,
        exportDto.options
      );

      res.set({
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="repository-export.zip"`,
        'Content-Length': zipBuffer.length,
      });

      res.status(HttpStatus.OK).send(zipBuffer);
    } catch (error) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'Export failed',
        message: error.message,
      });
    }
  }

  @Get('preview/:projectId')
  @ApiOperation({ summary: 'Preview repository export structure' })
  @ApiResponse({ status: 200, description: 'Repository structure preview' })
  async previewExport(@Param('projectId') projectId: string) {
    // This would return the structure without generating the actual files
    return {
      projectId,
      structure: {
        sdk: ['typescript'],
        server: ['nestjs'],
        flows: true,
        tests: true,
        ops: true,
        helm: true,
        docs: true,
        config: true,
      },
      estimatedSize: '~2-5MB',
      fileCount: '~50-100 files',
    };
  }

  @Get('templates')
  @ApiOperation({ summary: 'Get available export templates' })
  @ApiResponse({ status: 200, description: 'Available export templates' })
  getExportTemplates() {
    return {
      languages: {
        typescript: {
          name: 'TypeScript',
          description: 'TypeScript SDK with full type safety',
          features: ['TypeScript types', 'IntelliSense support', 'Compile-time safety']
        },
        python: {
          name: 'Python',
          description: 'Python SDK with type hints',
          features: ['Type hints', 'Async/await support', 'pip package']
        },
        go: {
          name: 'Go',
          description: 'Go SDK with generated clients',
          features: ['Go modules', 'Context support', 'Standard library only']
        }
      },
      frameworks: {
        nestjs: {
          name: 'NestJS',
          description: 'NestJS server adapter with full features',
          features: ['Dependency injection', 'Decorators', 'Swagger docs']
        },
        fastapi: {
          name: 'FastAPI',
          description: 'FastAPI server with async support',
          features: ['Async endpoints', 'Auto docs', 'Type validation']
        }
      },
      optional: {
        tests: {
          name: 'Test Suites',
          description: 'Generated integration and unit tests',
          features: ['Mock servers', 'Contract tests', 'CI/CD ready']
        },
        ops: {
          name: 'Operations',
          description: 'Docker, monitoring, and deployment configs',
          features: ['Docker Compose', 'Prometheus metrics', 'Grafana dashboards']
        },
        helm: {
          name: 'Helm Charts',
          description: 'Kubernetes deployment charts',
          features: ['Production ready', 'Configurable values', 'RBAC support']
        },
        docs: {
          name: 'Documentation',
          description: 'README, API reference, and guides',
          features: ['Usage examples', 'API reference', 'Deployment guides']
        }
      }
    };
  }
}
