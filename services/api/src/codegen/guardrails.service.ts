import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project } from '../projects/entities/project.entity';
import { CodegenService } from './codegen.service';
import { SBOMService } from './sbom.service';

export interface ValidationResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
  score: number; // 0-100
}

export interface GuardrailCheck {
  name: string;
  description: string;
  severity: 'critical' | 'warning' | 'info';
  validator: (project: Project, generatedCode?: any) => Promise<ValidationResult>;
}

@Injectable()
export class GuardrailsService {
  private readonly checks: GuardrailCheck[] = [];

  constructor(
    @InjectRepository(Project)
    private projectRepository: Repository<Project>,
    private codegenService: CodegenService,
    private sbomService: SBOMService,
  ) {
    this.initializeChecks();
  }

  private initializeChecks() {
    this.checks = [
      {
        name: 'authentication_configured',
        description: 'Authentication mechanism must be properly configured',
        severity: 'critical',
        validator: this.validateAuthentication.bind(this),
      },
      {
        name: 'error_handling_implemented',
        description: 'Error handling and mapping must be implemented',
        severity: 'critical',
        validator: this.validateErrorHandling.bind(this),
      },
      {
        name: 'retry_mechanism_configured',
        description: 'Retry mechanism must be configured for resilience',
        severity: 'warning',
        validator: this.validateRetryMechanism.bind(this),
      },
      {
        name: 'rate_limiting_protection',
        description: 'Rate limiting protection should be implemented',
        severity: 'warning',
        validator: this.validateRateLimiting.bind(this),
      },
      {
        name: 'logging_comprehensive',
        description: 'Comprehensive logging should be implemented',
        severity: 'info',
        validator: this.validateLogging.bind(this),
      },
      {
        name: 'security_headers_present',
        description: 'Security headers should be configured',
        severity: 'warning',
        validator: this.validateSecurityHeaders.bind(this),
      },
      {
        name: 'input_validation_robust',
        description: 'Input validation should be robust',
        severity: 'warning',
        validator: this.validateInputValidation.bind(this),
      },
      {
        name: 'license_compliance',
        description: 'All dependencies must have compatible licenses',
        severity: 'warning',
        validator: this.validateLicenseCompliance.bind(this),
      },
      {
        name: 'cve_security',
        description: 'No critical CVEs should be present in dependencies',
        severity: 'critical',
        validator: this.validateCVESecurity.bind(this),
      },
      {
        name: 'sbom_generated',
        description: 'SBOM should be generated for all components',
        severity: 'info',
        validator: this.validateSBOMGeneration.bind(this),
      },
    ];
  }

  async validateProjectForExport(projectId: string): Promise<ValidationResult> {
    const project = await this.projectRepository.findOne({
      where: { id: projectId },
    });

    if (!project) {
      return {
        passed: false,
        errors: [`Project with ID ${projectId} not found`],
        warnings: [],
        score: 0,
      };
    }

    // Generate the code to validate
    let generatedCode: any = {};
    try {
      const nestjsCode = await this.codegenService.generateNestJSServerAdapter(projectId);
      const typescriptCode = await this.codegenService.generateTypeScriptSDK(projectId);
      generatedCode = { nestjs: nestjsCode, typescript: typescriptCode };
    } catch (error) {
      return {
        passed: false,
        errors: [`Failed to generate code for validation: ${error.message}`],
        warnings: [],
        score: 0,
      };
    }

    // Run all validation checks
    const allErrors: string[] = [];
    const allWarnings: string[] = [];
    let totalScore = 0;

    for (const check of this.checks) {
      const result = await check.validator(project, generatedCode);

      if (!result.passed) {
        if (check.severity === 'critical') {
          allErrors.push(`${check.name}: ${result.errors.join(', ')}`);
        } else {
          allWarnings.push(`${check.name}: ${result.errors.join(', ')}`);
        }
      }

      allWarnings.push(...result.warnings);
      totalScore += result.score;
    }

    const averageScore = Math.round(totalScore / this.checks.length);
    const passed = allErrors.length === 0;

    return {
      passed,
      errors: allErrors,
      warnings: allWarnings,
      score: averageScore,
    };
  }

  private async validateAuthentication(project: Project, generatedCode?: any): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if JWT configuration is present
    if (!process.env.JWT_SECRET) {
      errors.push('JWT_SECRET environment variable not configured');
    }

    // Check if authentication guards are present in generated code
    if (generatedCode?.nestjs?.guards) {
      const hasAuthGuard = generatedCode.nestjs.guards.some((content: string) =>
        content.includes('AuthGuard') || content.includes('JwtAuthGuard')
      );

      if (!hasAuthGuard) {
        errors.push('Authentication guard not found in generated server code');
      }
    }

    // Check if authentication middleware is present
    if (generatedCode?.nestjs?.middlewares) {
      const hasAuthMiddleware = generatedCode.nestjs.middlewares.some((content: string) =>
        content.includes('auth') || content.includes('Auth')
      );

      if (!hasAuthMiddleware) {
        warnings.push('Authentication middleware not found, consider adding JWT validation');
      }
    }

    return {
      passed: errors.length === 0,
      errors,
      warnings,
      score: errors.length === 0 ? 100 : 0,
    };
  }

  private async validateErrorHandling(project: Project, generatedCode?: any): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if exception filters are present
    if (generatedCode?.nestjs?.filters) {
      const hasExceptionFilter = generatedCode.nestjs.filters.some((content: string) =>
        content.includes('HttpExceptionFilter') || content.includes('ExceptionFilter')
      );

      if (!hasExceptionFilter) {
        errors.push('Global exception filter not found in generated server code');
      }
    }

    // Check if error handling middleware is present
    if (generatedCode?.nestjs?.middlewares) {
      const hasErrorMiddleware = generatedCode.nestjs.middlewares.some((content: string) =>
        content.includes('error') || content.includes('Error')
      );

      if (!hasErrorMiddleware) {
        warnings.push('Error handling middleware not found');
      }
    }

    // Check SDK error classes
    if (generatedCode?.typescript?.services) {
      const hasErrorClasses = generatedCode.typescript.services.some((content: string) =>
        content.includes('ApiError') || content.includes('ValidationError')
      );

      if (!hasErrorClasses) {
        errors.push('Error classes not found in generated SDK');
      }
    }

    return {
      passed: errors.length === 0,
      errors,
      warnings,
      score: errors.length === 0 ? (warnings.length === 0 ? 100 : 75) : 0,
    };
  }

  private async validateRetryMechanism(project: Project, generatedCode?: any): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if retry logic is present in SDK
    if (generatedCode?.typescript?.services) {
      const hasRetryLogic = generatedCode.typescript.services.some((content: string) =>
        content.includes('retry') || content.includes('Retry')
      );

      if (!hasRetryLogic) {
        warnings.push('Retry mechanism not found in generated SDK');
      }
    }

    // Check if axios interceptors with retry are present
    if (generatedCode?.typescript?.services) {
      const hasAxiosRetry = generatedCode.typescript.services.some((content: string) =>
        content.includes('interceptors') && content.includes('retry')
      );

      if (!hasAxiosRetry) {
        warnings.push('Axios retry interceptor not found in SDK');
      }
    }

    return {
      passed: true, // This is a warning-level check
      errors,
      warnings,
      score: warnings.length === 0 ? 100 : 50,
    };
  }

  private async validateRateLimiting(project: Project, generatedCode?: any): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if rate limiting middleware is present in server
    if (generatedCode?.nestjs?.middlewares) {
      const hasRateLimit = generatedCode.nestjs.middlewares.some((content: string) =>
        content.includes('rate') || content.includes('Rate')
      );

      if (!hasRateLimit) {
        warnings.push('Rate limiting middleware not found in server');
      }
    }

    // Check if rate limiter is present in SDK
    if (generatedCode?.typescript?.services) {
      const hasSdkRateLimit = generatedCode.typescript.services.some((content: string) =>
        content.includes('RateLimiter') || content.includes('rateLimit')
      );

      if (!hasSdkRateLimit) {
        warnings.push('Rate limiter not found in SDK');
      }
    }

    return {
      passed: true, // This is a warning-level check
      errors,
      warnings,
      score: warnings.length === 0 ? 100 : 50,
    };
  }

  private async validateLogging(project: Project, generatedCode?: any): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if logging interceptor is present in server
    if (generatedCode?.nestjs?.interceptors) {
      const hasLoggingInterceptor = generatedCode.nestjs.interceptors.some((content: string) =>
        content.includes('LoggingInterceptor') || content.includes('logging')
      );

      if (!hasLoggingInterceptor) {
        warnings.push('Logging interceptor not found in server');
      }
    }

    // Check if Logger service is present in server
    if (generatedCode?.nestjs?.services) {
      const hasLoggerService = generatedCode.nestjs.services.some((content: string) =>
        content.includes('LoggerService') || content.includes('Logger')
      );

      if (!hasLoggerService) {
        warnings.push('Logger service not found in server');
      }
    }

    return {
      passed: true, // This is an info-level check
      errors,
      warnings,
      score: warnings.length === 0 ? 100 : 75,
    };
  }

  private async validateSecurityHeaders(project: Project, generatedCode?: any): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if CORS middleware is present
    if (generatedCode?.nestjs?.middlewares) {
      const hasCors = generatedCode.nestjs.middlewares.some((content: string) =>
        content.includes('cors') || content.includes('CORS')
      );

      if (!hasCors) {
        warnings.push('CORS middleware not found');
      }
    }

    // Check if security headers are set
    if (generatedCode?.nestjs?.middlewares) {
      const hasSecurityHeaders = generatedCode.nestjs.middlewares.some((content: string) =>
        content.includes('X-') || content.includes('security')
      );

      if (!hasSecurityHeaders) {
        warnings.push('Security headers not configured');
      }
    }

    return {
      passed: true, // This is a warning-level check
      errors,
      warnings,
      score: warnings.length === 0 ? 100 : 50,
    };
  }

  private async validateInputValidation(project: Project, generatedCode?: any): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if DTOs are present with validation
    if (generatedCode?.nestjs?.dtos) {
      const hasValidation = generatedCode.nestjs.dtos.some((content: string) =>
        content.includes('@Is') || content.includes('class-validator')
      );

      if (!hasValidation) {
        warnings.push('Input validation not found in DTOs');
      }
    }

    // Check if validation pipe is configured
    if (generatedCode?.nestjs?.modules) {
      const hasValidationPipe = generatedCode.nestjs.modules.some((content: string) =>
        content.includes('ValidationPipe')
      );

      if (!hasValidationPipe) {
        warnings.push('ValidationPipe not configured in main module');
      }
    }

    return {
      passed: true, // This is a warning-level check
      errors,
      warnings,
      score: warnings.length === 0 ? 100 : 50,
    };
  }

  private async validateLicenseCompliance(project: Project, generatedCode?: any): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Extract components from generated code
      const components = this.extractComponentsFromCode(generatedCode);

      if (components.length === 0) {
        warnings.push('No components found to validate licenses');
        return { passed: true, errors, warnings, score: 75 };
      }

      // Scan licenses
      const licenseResults = await this.sbomService.scanLicenses(components);

      // Check for non-compliant licenses
      const nonCompliant = licenseResults.filter(r => !r.compliance.isCompatible);

      if (nonCompliant.length > 0) {
        warnings.push(`${nonCompliant.length} components have license compliance issues`);
        nonCompliant.forEach(result => {
          warnings.push(`${result.component}: ${result.compliance.issues.join(', ')}`);
        });
      }

      // Check for missing license information
      const missingLicenses = licenseResults.filter(r =>
        !r.licenses || r.licenses.length === 0 || r.licenses[0].license === 'unknown'
      );

      if (missingLicenses.length > 0) {
        warnings.push(`${missingLicenses.length} components have missing license information`);
      }

      return {
        passed: true, // License issues are warnings, not blockers
        errors,
        warnings,
        score: nonCompliant.length === 0 ? 100 : Math.max(50, 100 - (nonCompliant.length * 10)),
      };
    } catch (error) {
      warnings.push(`License compliance check failed: ${error.message}`);
      return { passed: true, errors, warnings, score: 50 };
    }
  }

  private async validateCVESecurity(project: Project, generatedCode?: any): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Extract components from generated code
      const components = this.extractComponentsFromCode(generatedCode);

      if (components.length === 0) {
        warnings.push('No components found to scan for CVEs');
        return { passed: true, errors, warnings, score: 75 };
      }

      // Scan for CVEs
      const cves = await this.sbomService.scanCVEs(components);

      // Categorize CVEs by severity
      const criticalCVEs = cves.filter(cve => cve.severity === 'critical');
      const highCVEs = cves.filter(cve => cve.severity === 'high');

      if (criticalCVEs.length > 0) {
        errors.push(`${criticalCVEs.length} critical CVEs found - blocking export`);
        criticalCVEs.forEach(cve => {
          errors.push(`${cve.id}: ${cve.description}`);
        });
      }

      if (highCVEs.length > 0) {
        warnings.push(`${highCVEs.length} high-severity CVEs found`);
        highCVEs.forEach(cve => {
          warnings.push(`${cve.id}: ${cve.description}`);
        });
      }

      const score = criticalCVEs.length > 0 ? 0 :
                   highCVEs.length > 0 ? 50 :
                   cves.length > 0 ? 75 : 100;

      return {
        passed: criticalCVEs.length === 0,
        errors,
        warnings,
        score,
      };
    } catch (error) {
      warnings.push(`CVE security check failed: ${error.message}`);
      return { passed: true, errors, warnings, score: 50 };
    }
  }

  private async validateSBOMGeneration(project: Project, generatedCode?: any): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Extract components from generated code
      const components = this.extractComponentsFromCode(generatedCode);

      if (components.length === 0) {
        warnings.push('No components found for SBOM generation');
        return { passed: true, errors, warnings, score: 75 };
      }

      // Generate SBOM
      const sbom = await this.sbomService.generateSBOM(project, components);

      // Validate SBOM completeness
      const missingLicenses = sbom.packages.filter(pkg =>
        !pkg.licenses || pkg.licenses.length === 0
      );

      if (missingLicenses.length > 0) {
        warnings.push(`${missingLicenses.length} packages in SBOM missing license information`);
      }

      // Check for unknown components
      const unknownComponents = sbom.packages.filter(pkg =>
        pkg.licenses?.some(license => license.license === 'unknown')
      );

      if (unknownComponents.length > 0) {
        warnings.push(`${unknownComponents.length} unknown components in SBOM`);
      }

      return {
        passed: true, // SBOM issues are informational
        errors,
        warnings,
        score: warnings.length === 0 ? 100 : 75,
      };
    } catch (error) {
      warnings.push(`SBOM generation check failed: ${error.message}`);
      return { passed: true, errors, warnings, score: 50 };
    }
  }

  private extractComponentsFromCode(generatedCode?: any): string[] {
    const components: string[] = [];

    if (!generatedCode) return components;

    // Extract from NestJS server
    if (generatedCode.nestjs) {
      // Common NestJS dependencies
      components.push('@nestjs/common', '@nestjs/core', '@nestjs/platform-express');

      if (generatedCode.nestjs.services?.some((content: string) => content.includes('TypeOrm'))) {
        components.push('typeorm', '@nestjs/typeorm');
      }

      if (generatedCode.nestjs.services?.some((content: string) => content.includes('JwtService'))) {
        components.push('@nestjs/jwt', 'passport', 'passport-jwt');
      }

      if (generatedCode.nestjs.dtos?.some((content: string) => content.includes('class-validator'))) {
        components.push('class-validator', 'class-transformer');
      }
    }

    // Extract from TypeScript SDK
    if (generatedCode.typescript) {
      components.push('typescript', 'axios');

      if (generatedCode.typescript.services?.some((content: string) => content.includes('jest'))) {
        components.push('jest', '@types/jest', 'ts-jest');
      }
    }

    // Always include core dependencies
    components.push('axios', 'typescript');

    return [...new Set(components)]; // Remove duplicates
  }

  getAvailableChecks(): GuardrailCheck[] {
    return this.checks.map(check => ({
      name: check.name,
      description: check.description,
      severity: check.severity,
      validator: null, // Don't expose the validator function
    }));
  }
}
