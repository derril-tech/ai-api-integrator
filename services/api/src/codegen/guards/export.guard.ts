import { Injectable, CanActivate, ExecutionContext, BadRequestException } from '@nestjs/common';
import { GuardrailsService } from '../guardrails.service';

@Injectable()
export class ExportGuard implements CanActivate {
  constructor(private readonly guardrailsService: GuardrailsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const { projectId } = request.body;

    if (!projectId) {
      throw new BadRequestException('Project ID is required for export validation');
    }

    // Validate project against guardrails
    const validation = await this.guardrailsService.validateProjectForExport(projectId);

    if (!validation.passed) {
      const errorMessage = `Export blocked due to guardrail violations:\n${validation.errors.map(e => `• ${e}`).join('\n')}`;
      throw new BadRequestException({
        message: 'Export blocked by guardrails',
        validation,
        details: errorMessage,
        recommendations: this.generateRecommendations(validation),
      });
    }

    // Store validation results in request for potential use in controller
    request.guardrailsValidation = validation;

    return true;
  }

  private generateRecommendations(validation: any): string[] {
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
