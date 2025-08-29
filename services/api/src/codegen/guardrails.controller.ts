import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GuardrailsService, ValidationResult } from './guardrails.service';

class ValidateProjectDto {
  projectId: string;
  includeGeneratedCode?: boolean;
}

@ApiTags('guardrails')
@Controller('guardrails')
@UseGuards(JwtAuthGuard)
export class GuardrailsController {
  constructor(private readonly guardrailsService: GuardrailsService) {}

  @Post('validate')
  @ApiOperation({ summary: 'Validate project against guardrails' })
  @ApiResponse({ status: 200, description: 'Validation results' })
  async validateProject(@Body() validateDto: ValidateProjectDto): Promise<ValidationResult> {
    return this.guardrailsService.validateProjectForExport(validateDto.projectId);
  }

  @Get('checks')
  @ApiOperation({ summary: 'Get available guardrail checks' })
  @ApiResponse({ status: 200, description: 'List of available guardrail checks' })
  getAvailableChecks() {
    return {
      checks: this.guardrailsService.getAvailableChecks(),
      summary: {
        total: this.guardrailsService.getAvailableChecks().length,
        critical: this.guardrailsService.getAvailableChecks().filter(c => c.severity === 'critical').length,
        warning: this.guardrailsService.getAvailableChecks().filter(c => c.severity === 'warning').length,
        info: this.guardrailsService.getAvailableChecks().filter(c => c.severity === 'info').length,
      }
    };
  }

  @Get('status/:projectId')
  @ApiOperation({ summary: 'Get guardrails status for project' })
  @ApiResponse({ status: 200, description: 'Guardrails status summary' })
  async getProjectStatus(@Param('projectId') projectId: string) {
    const validation = await this.guardrailsService.validateProjectForExport(projectId);

    return {
      projectId,
      canExport: validation.passed,
      score: validation.score,
      criticalIssues: validation.errors.length,
      warnings: validation.warnings.length,
      details: validation,
      recommendations: this.generateRecommendations(validation),
    };
  }

  private generateRecommendations(validation: ValidationResult): string[] {
    const recommendations: string[] = [];

    if (validation.errors.length > 0) {
      recommendations.push('Fix all critical errors before exporting');
    }

    if (validation.warnings.length > 0) {
      recommendations.push('Address warnings to improve code quality');
    }

    if (validation.score < 70) {
      recommendations.push('Consider reviewing authentication and error handling configurations');
    }

    if (validation.score < 50) {
      recommendations.push('Major security and reliability issues detected - review all configurations');
    }

    if (validation.score >= 90) {
      recommendations.push('Excellent! Code meets high quality standards');
    }

    return recommendations;
  }
}
