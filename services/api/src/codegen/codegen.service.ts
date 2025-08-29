import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project } from '../projects/entities/project.entity';
import { TemplateProcessor, TemplateVariables } from './utils/template-processor.util';
import { PerformanceService } from './performance.service';
import { AsyncAPIParserService, ParsedAsyncAPISpec } from './asyncapi-parser.service';
import { WebhookValidatorService } from './webhook-validator.service';
import { OAuthProvisioningService } from './oauth-provisioning.service';
import { VaultSecretsService } from './vault-secrets.service';
import { AdvancedPaginationService } from './advanced-pagination.service';
import { AdvancedAuthService } from './advanced-auth.service';
import { LargeSpecOptimizerService } from './large-spec-optimizer.service';

export interface NestJSServerTemplate {
  controllers: string[];
  services: string[];
  modules: string[];
  dtos: string[];
  interceptors: string[];
  middlewares: string[];
  guards: string[];
  filters: string[];
}

@Injectable()
export class CodegenService implements OnModuleInit {
  private readonly logger = new Logger(CodegenService.name);

  constructor(
    @InjectRepository(Project)
    private projectRepository: Repository<Project>,
    private performanceService: PerformanceService,
    private asyncAPIParserService: AsyncAPIParserService,
    private webhookValidatorService: WebhookValidatorService,
    private oauthProvisioningService: OAuthProvisioningService,
    private vaultSecretsService: VaultSecretsService,
    private advancedPaginationService: AdvancedPaginationService,
    private advancedAuthService: AdvancedAuthService,
    private largeSpecOptimizerService: LargeSpecOptimizerService,
  ) {}

  async onModuleInit() {
    // Initialize Vault service (with error handling)
    try {
      await this.vaultSecretsService.initialize();
    } catch (error) {
      // Log error but don't fail initialization
      console.warn('Failed to initialize Vault service:', error.message);
    }
  }

  async generateNestJSServerAdapter(
    projectId: string,
    progressCallback?: (progress: number, stage: string) => void
  ): Promise<NestJSServerTemplate> {
    return this.performanceService.benchmarkOperation(
      'codegen',
      async () => {
        const project = await this.projectRepository.findOne({
          where: { id: projectId },
        });

        if (!project) {
          throw new Error(`Project with ID ${projectId} not found`);
        }

        const variables = TemplateProcessor.getEntityVariables(project.name, project.name);

        const templates = [
          { templatePath: 'nestjs/main.controller.template', outputPath: 'controllers/{{entityName}}.controller.ts', variables },
          { templatePath: 'nestjs/main.service.template', outputPath: 'services/{{entityName}}.service.ts', variables },
          { templatePath: 'nestjs/app.module.template', outputPath: 'app.module.ts', variables },
          { templatePath: 'nestjs/base.dto.template', outputPath: 'dtos/create-{{entityName}}.dto.ts', variables },
          { templatePath: 'nestjs/logging.interceptor.template', outputPath: 'interceptors/logging.interceptor.ts', variables },
          { templatePath: 'nestjs/tracing.interceptor.template', outputPath: 'interceptors/tracing.interceptor.ts', variables },
          { templatePath: 'nestjs/cors.middleware.template', outputPath: 'middlewares/cors.middleware.ts', variables },
          { templatePath: 'nestjs/rate-limit.middleware.template', outputPath: 'middlewares/rate-limit.middleware.ts', variables },
          { templatePath: 'nestjs/auth.guard.template', outputPath: 'guards/auth.guard.ts', variables },
          { templatePath: 'nestjs/http-exception.filter.template', outputPath: 'filters/http-exception.filter.ts', variables },
          { templatePath: 'nestjs/logger.service.template', outputPath: 'services/logger.service.ts', variables },
        ];

        const generatedFiles = TemplateProcessor.generateFiles(templates);

        // Group files by type
        const result: NestJSServerTemplate = {
          controllers: [],
          services: [],
          modules: [],
          dtos: [],
          interceptors: [],
          middlewares: [],
          guards: [],
          filters: [],
        };

        generatedFiles.forEach(file => {
          const content = file.content;

          if (file.path.includes('/controllers/')) {
            result.controllers.push(content);
          } else if (file.path.includes('/services/')) {
            result.services.push(content);
          } else if (file.path.includes('app.module.ts')) {
            result.modules.push(content);
          } else if (file.path.includes('/dtos/')) {
            result.dtos.push(content);
          } else if (file.path.includes('/interceptors/')) {
            result.interceptors.push(content);
          } else if (file.path.includes('/middlewares/')) {
            result.middlewares.push(content);
          } else if (file.path.includes('/guards/')) {
            result.guards.push(content);
          } else if (file.path.includes('/filters/')) {
            result.filters.push(content);
          }
        });

        return result;
      },
      { projectId, operation: 'nestjs_server_generation' }
    );
  }

  async generateTypeScriptSDK(projectId: string): Promise<NestJSServerTemplate> {
    return this.performanceService.benchmarkOperation(
      'codegen',
      async () => {
        const project = await this.projectRepository.findOne({
          where: { id: projectId },
        });

        if (!project) {
          throw new Error(`Project with ID ${projectId} not found`);
        }

        const variables = TemplateProcessor.getEntityVariables(project.name, project.name);

        const templates = [
          { templatePath: 'typescript/client.template', outputPath: 'src/client.ts', variables },
          { templatePath: 'typescript/types.template', outputPath: 'src/types.ts', variables },
          { templatePath: 'typescript/pagination.template', outputPath: 'src/pagination.ts', variables },
          { templatePath: 'typescript/retry.template', outputPath: 'src/retry.ts', variables },
          { templatePath: 'typescript/index.template', outputPath: 'src/index.ts', variables },
          { templatePath: 'typescript/package.template', outputPath: 'package.json', variables },
          { templatePath: 'typescript/readme.template', outputPath: 'README.md', variables },
        ];

        const generatedFiles = TemplateProcessor.generateFiles(templates);

        // Group files by type for SDK
        const result: NestJSServerTemplate = {
          controllers: [],
          services: [],
          modules: [],
          dtos: [],
          interceptors: [],
          middlewares: [],
          guards: [],
          filters: [],
        };

        generatedFiles.forEach(file => {
          const content = file.content;

          if (file.path.includes('client.ts')) {
            result.services.push(content); // Main client goes in services
          } else if (file.path.includes('types.ts')) {
            result.dtos.push(content); // Types go in dtos
          } else if (file.path.includes('pagination.ts')) {
            result.services.push(content);
          } else if (file.path.includes('retry.ts')) {
            result.services.push(content);
          } else if (file.path.includes('index.ts')) {
            result.modules.push(content); // Entry point goes in modules
          } else if (file.path.includes('package.json')) {
            result.controllers.push(content); // Package config goes in controllers (for now)
          } else if (file.path.includes('README.md')) {
            result.interceptors.push(content); // README goes in interceptors (for now)
          }
        });

        return result;
      },
      { projectId, operation: 'typescript_sdk_generation' }
    );
  }

  async generatePythonSDK(projectId: string): Promise<NestJSServerTemplate> {
    return this.performanceService.benchmarkOperation(
      'codegen',
      async () => {
        const project = await this.projectRepository.findOne({
          where: { id: projectId },
        });

        if (!project) {
          throw new Error(`Project with ID ${projectId} not found`);
        }

        const variables = TemplateProcessor.getEntityVariables(project.name, project.name);

        const templates = [
          { templatePath: 'python/client.template', outputPath: '{{entityName | lower}}_python/client.py', variables },
          { templatePath: 'python/config.template', outputPath: '{{entityName | lower}}_python/config.py', variables },
          { templatePath: 'python/exceptions.template', outputPath: '{{entityName | lower}}_python/exceptions.py', variables },
          { templatePath: 'python/models.template', outputPath: '{{entityName | lower}}_python/models.py', variables },
          { templatePath: 'python/pagination.template', outputPath: '{{entityName | lower}}_python/pagination.py', variables },
          { templatePath: 'python/retry.template', outputPath: '{{entityName | lower}}_python/retry.py', variables },
          { templatePath: 'python/index.template', outputPath: '{{entityName | lower}}_python/__init__.py', variables },
          { templatePath: 'python/setup.template', outputPath: 'setup.py', variables },
          { templatePath: 'python/readme.template', outputPath: 'README.md', variables },
        ];

        const generatedFiles = TemplateProcessor.generateFiles(templates);

        // Group files by type for Python SDK
        const result: NestJSServerTemplate = {
          controllers: [],
          services: [],
          modules: [],
          dtos: [],
          interceptors: [],
          middlewares: [],
          guards: [],
          filters: [],
        };

        generatedFiles.forEach(file => {
          const content = file.content;

          if (file.path.includes('client.py')) {
            result.services.push(content);
          } else if (file.path.includes('models.py')) {
            result.dtos.push(content);
          } else if (file.path.includes('config.py') || file.path.includes('exceptions.py') ||
                     file.path.includes('pagination.py') || file.path.includes('retry.py')) {
            result.services.push(content);
          } else if (file.path.includes('__init__.py')) {
            result.modules.push(content);
          } else if (file.path.includes('setup.py')) {
            result.controllers.push(content);
          } else if (file.path.includes('README.md')) {
            result.interceptors.push(content);
          }
        });

        return result;
      },
      { projectId, operation: 'python_sdk_generation' }
    );
  }

  async generateGoSDK(projectId: string): Promise<NestJSServerTemplate> {
    return this.performanceService.benchmarkOperation(
      'codegen',
      async () => {
        const project = await this.projectRepository.findOne({
          where: { id: projectId },
        });

        if (!project) {
          throw new Error(`Project with ID ${projectId} not found`);
        }

        const variables = TemplateProcessor.getEntityVariables(project.name, project.name);

        const templates = [
          { templatePath: 'go/client.template', outputPath: '{{entityName | lower}}.go', variables },
          { templatePath: 'go/models.template', outputPath: 'models.go', variables },
          { templatePath: 'go/go.template', outputPath: 'go.mod', variables },
          { templatePath: 'go/readme.template', outputPath: 'README.md', variables },
        ];

        const generatedFiles = TemplateProcessor.generateFiles(templates);

        // Group files by type for Go SDK
        const result: NestJSServerTemplate = {
          controllers: [],
          services: [],
          modules: [],
          dtos: [],
          interceptors: [],
          middlewares: [],
          guards: [],
          filters: [],
        };

        generatedFiles.forEach(file => {
          const content = file.content;

          if (file.path.includes('{{entityName | lower}}.go')) {
            result.services.push(content); // Main client
          } else if (file.path.includes('models.go')) {
            result.dtos.push(content);
          } else if (file.path.includes('go.mod')) {
            result.modules.push(content);
          } else if (file.path.includes('README.md')) {
            result.interceptors.push(content);
          }
        });

        return result;
      },
      { projectId, operation: 'go_sdk_generation' }
    );
  }

  async parseAndGenerateAsyncAPIStreamingClient(
    projectId: string,
    asyncAPISpec: string,
    language: 'typescript' | 'python' | 'go' = 'typescript'
  ): Promise<NestJSServerTemplate> {
    return this.performanceService.benchmarkOperation(
      'asyncapi_codegen',
      async () => {
        const project = await this.projectRepository.findOne({
          where: { id: projectId },
        });

        if (!project) {
          throw new Error(`Project with ID ${projectId} not found`);
        }

        // Parse AsyncAPI specification
        const parsedSpec = await this.asyncAPIParserService.parseSpec(asyncAPISpec);

        // Generate streaming client code
        const streamingCode = this.asyncAPIParserService.generateStreamingClient(parsedSpec, language);

        const variables = TemplateProcessor.getEntityVariables(project.name, project.name);

        // Create template based on language
        const templates = [
          {
            templatePath: `asyncapi/${language}-client.template`,
            outputPath: this.getStreamingClientOutputPath(language, project.name),
            variables: {
              ...variables,
              streamingCode,
              parsedSpec,
            }
          }
        ];

        const generatedFiles = TemplateProcessor.generateFiles(templates);

        // Group files by type
        const result: NestJSServerTemplate = {
          controllers: [],
          services: [streamingCode],
          modules: [],
          dtos: [],
          interceptors: [],
          middlewares: [],
          guards: [],
          filters: [],
        };

        generatedFiles.forEach(file => {
          const content = file.content;
          result.services.push(content);
        });

        return result;
      },
      { projectId, operation: 'asyncapi_streaming_generation' }
    );
  }

  async generateWebhookHandlers(
    projectId: string,
    webhookProviders: Array<{
      provider: string;
      secret: string;
      events: string[];
    }>,
    language: 'typescript' | 'python' | 'go' = 'typescript'
  ): Promise<NestJSServerTemplate> {
    return this.performanceService.benchmarkOperation(
      'webhook_codegen',
      async () => {
        const project = await this.projectRepository.findOne({
          where: { id: projectId },
        });

        if (!project) {
          throw new Error(`Project with ID ${projectId} not found`);
        }

        const variables = TemplateProcessor.getEntityVariables(project.name, project.name);

        // Generate webhook handlers for each provider
        const handlers = webhookProviders.map(provider => {
          const config = this.webhookValidatorService.createProviderConfig(provider.provider, provider.secret);
          return {
            provider: provider.provider,
            config,
            events: provider.events,
          };
        });

        const templates = [
          {
            templatePath: `webhook/${language}-handler.template`,
            outputPath: this.getWebhookHandlerOutputPath(language, project.name),
            variables: {
              ...variables,
              handlers,
              projectName: project.name,
            }
          }
        ];

        const generatedFiles = TemplateProcessor.generateFiles(templates);

        // Group files by type
        const result: NestJSServerTemplate = {
          controllers: [],
          services: [],
          modules: [],
          dtos: [],
          interceptors: [],
          middlewares: [],
          guards: [],
          filters: [],
        };

        generatedFiles.forEach(file => {
          const content = file.content;

          if (language === 'typescript') {
            if (file.path.includes('middleware') || file.path.includes('handler')) {
              result.middlewares.push(content);
            } else {
              result.services.push(content);
            }
          } else if (language === 'python') {
            if (file.path.includes('handler')) {
              result.services.push(content);
            } else {
              result.controllers.push(content);
            }
          } else if (language === 'go') {
            if (file.path.includes('handler')) {
              result.services.push(content);
            } else {
              result.controllers.push(content);
            }
          }
        });

        return result;
      },
      { projectId, operation: 'webhook_handler_generation' }
    );
  }

  async generateOAuthHelpers(
    projectId: string,
    oauthProviders: Array<{
      provider: string;
      clientId: string;
      clientSecret: string;
      scopes?: string[];
      redirectUri?: string;
    }>,
    language: 'typescript' | 'python' | 'go' = 'typescript'
  ): Promise<NestJSServerTemplate> {
    return this.performanceService.benchmarkOperation(
      'oauth_codegen',
      async () => {
        const project = await this.projectRepository.findOne({
          where: { id: projectId },
        });

        if (!project) {
          throw new Error(`Project with ID ${projectId} not found`);
        }

        const variables = TemplateProcessor.getEntityVariables(project.name, project.name);

        // Provision OAuth apps
        const provisionedApps = [];
        for (const provider of oauthProviders) {
          const app = await this.oauthProvisioningService.provisionOAuthApp(projectId, {
            provider: provider.provider,
            clientId: provider.clientId,
            clientSecret: provider.clientSecret,
            redirectUri: provider.redirectUri,
            scopes: provider.scopes || [],
          });
          provisionedApps.push(app);
        }

        const templates = [
          {
            templatePath: `oauth/${language}-oauth-helper.template`,
            outputPath: this.getOAuthHelperOutputPath(language, project.name),
            variables: {
              ...variables,
              oauthProviders: provisionedApps,
              projectName: project.name,
              supportedProviders: this.oauthProvisioningService.getSupportedProviders(),
            }
          }
        ];

        const generatedFiles = TemplateProcessor.generateFiles(templates);

        // Group files by type
        const result: NestJSServerTemplate = {
          controllers: [],
          services: [],
          modules: [],
          dtos: [],
          interceptors: [],
          middlewares: [],
          guards: [],
          filters: [],
        };

        generatedFiles.forEach(file => {
          const content = file.content;

          if (language === 'typescript') {
            if (file.path.includes('helper') || file.path.includes('provisioning')) {
              result.services.push(content);
            } else {
              result.controllers.push(content);
            }
          } else if (language === 'python') {
            if (file.path.includes('helper')) {
              result.services.push(content);
            } else {
              result.controllers.push(content);
            }
          } else if (language === 'go') {
            if (file.path.includes('helper')) {
              result.services.push(content);
            } else {
              result.controllers.push(content);
            }
          }
        });

        return result;
      },
      { projectId, operation: 'oauth_helper_generation' }
    );
  }

  async storeProjectSecrets(
    projectId: string,
    secrets: {
      oauth?: Array<{
        provider: string;
        clientId: string;
        clientSecret: string;
        redirectUri?: string;
      }>;
      apiKeys?: Array<{
        name: string;
        key: string;
        metadata?: Record<string, any>;
      }>;
      databases?: Array<{
        name: string;
        credentials: {
          username: string;
          password: string;
          host: string;
          port?: number;
          database?: string;
        };
      }>;
      webhooks?: Array<{
        id: string;
        secret: string;
      }>;
    }
  ): Promise<void> {
    // Store OAuth secrets
    if (secrets.oauth) {
      for (const oauth of secrets.oauth) {
        await this.vaultSecretsService.storeOAuthSecrets(
          projectId,
          oauth.provider,
          {
            clientId: oauth.clientId,
            clientSecret: oauth.clientSecret,
            redirectUri: oauth.redirectUri,
          }
        );
      }
    }

    // Store API keys
    if (secrets.apiKeys) {
      for (const apiKey of secrets.apiKeys) {
        await this.vaultSecretsService.storeAPIKey(
          projectId,
          apiKey.name,
          apiKey.key,
          apiKey.metadata
        );
      }
    }

    // Store database credentials
    if (secrets.databases) {
      for (const db of secrets.databases) {
        await this.vaultSecretsService.storeDatabaseCredentials(
          projectId,
          db.name,
          db.credentials
        );
      }
    }

    // Store webhook secrets
    if (secrets.webhooks) {
      for (const webhook of secrets.webhooks) {
        await this.vaultSecretsService.storeWebhookSecret(
          projectId,
          webhook.id,
          webhook.secret
        );
      }
    }
  }

  async getProjectSecrets(projectId: string): Promise<{
    oauth: any[];
    apiKeys: string[];
    databases: string[];
    webhooks: string[];
  }> {
    return await this.vaultSecretsService.listProjectSecrets(projectId);
  }

  private getStreamingClientOutputPath(language: string, projectName: string): string {
    const sanitizedName = projectName.toLowerCase().replace(/[^a-z0-9]/g, '');
    switch (language) {
      case 'typescript':
        return `src/streaming-client.ts`;
      case 'python':
        return `${sanitizedName}_streaming/client.py`;
      case 'go':
        return `streaming_client.go`;
      default:
        return `streaming-client.${language}`;
    }
  }

  private getWebhookHandlerOutputPath(language: string, projectName: string): string {
    const sanitizedName = projectName.toLowerCase().replace(/[^a-z0-9]/g, '');
    switch (language) {
      case 'typescript':
        return `src/webhook-handler.ts`;
      case 'python':
        return `${sanitizedName}_webhooks/handler.py`;
      case 'go':
        return `webhook_handler.go`;
      default:
        return `webhook-handler.${language}`;
    }
  }

  private getOAuthHelperOutputPath(language: string, projectName: string): string {
    const sanitizedName = projectName.toLowerCase().replace(/[^a-z0-9]/g, '');
    switch (language) {
      case 'typescript':
        return `src/oauth-helper.ts`;
      case 'python':
        return `${sanitizedName}_oauth/helper.py`;
      case 'go':
        return `oauth_helper.go`;
      default:
        return `oauth-helper.${language}`;
    }
  }

  /**
   * Enhanced SDK generation with optimizations for large specs
   */
  async generateOptimizedSDK(
    spec: any,
    language: string,
    projectName: string,
    progressCallback?: (progress: number, stage: string) => void
  ): Promise<{ [filename: string]: string }> {
    progressCallback?.(5, 'Analyzing spec complexity');
    
    // Analyze spec metrics
    const metrics = this.largeSpecOptimizerService.analyzeSpec(spec);
    const strategy = this.largeSpecOptimizerService.determineOptimizationStrategy(metrics);
    
    this.logger.log(`Processing ${language} SDK for spec with ${metrics.endpointCount} endpoints (${metrics.complexity})`);
    
    progressCallback?.(10, 'Detecting patterns');
    
    // Detect advanced patterns
    const paginationPatterns = this.advancedPaginationService.detectPaginationPattern(spec);
    const authPatterns = this.advancedAuthService.detectAuthPatterns(spec);
    
    progressCallback?.(20, 'Optimizing spec processing');
    
    // Process spec with optimizations if needed
    let processedSpec = spec;
    if (metrics.complexity === 'large' || metrics.complexity === 'xlarge') {
      processedSpec = await this.largeSpecOptimizerService.processLargeSpec(
        spec,
        strategy,
        (progress, stage) => {
          const adjustedProgress = 20 + (progress * 0.5); // 20-70% for spec processing
          progressCallback?.(adjustedProgress, stage);
        }
      );
    }
    
    progressCallback?.(70, 'Generating SDK code');
    
    // Generate enhanced SDK with advanced patterns
    const sdkFiles = await this.generateEnhancedSDK(
      processedSpec,
      language,
      projectName,
      paginationPatterns,
      authPatterns,
      metrics
    );
    
    progressCallback?.(95, 'Finalizing SDK');
    
    // Add performance optimizations for large SDKs
    if (metrics.complexity === 'large' || metrics.complexity === 'xlarge') {
      this.addPerformanceOptimizations(sdkFiles, language, metrics);
    }
    
    progressCallback?.(100, 'SDK generation complete');
    
    return sdkFiles;
  }

  /**
   * Generate enhanced SDK with advanced patterns
   */
  private async generateEnhancedSDK(
    spec: any,
    language: string,
    projectName: string,
    paginationPatterns: any[],
    authPatterns: any[],
    metrics: any
  ): Promise<{ [filename: string]: string }> {
    const files: { [filename: string]: string } = {};
    
    // Generate base SDK
    const baseSDK = await this.generateSDK(spec, language, projectName);
    Object.assign(files, baseSDK);
    
    // Add advanced pagination helpers
    if (paginationPatterns.length > 0) {
      const paginationHelper = this.advancedPaginationService.generatePaginationHelper(paginationPatterns);
      files[this.getPaginationHelperPath(language)] = paginationHelper;
    }
    
    // Add advanced auth helpers
    if (authPatterns.length > 0) {
      const authHelper = this.advancedAuthService.generateAuthHelper(authPatterns);
      files[this.getAuthHelperPath(language)] = authHelper;
    }
    
    // Add performance helpers for large specs
    if (metrics.complexity === 'large' || metrics.complexity === 'xlarge') {
      files[this.getPerformanceHelperPath(language)] = this.generatePerformanceHelper(language, metrics);
    }
    
    return files;
  }

  /**
   * Add performance optimizations to SDK files
   */
  private addPerformanceOptimizations(
    files: { [filename: string]: string },
    language: string,
    metrics: any
  ): void {
    // Add lazy loading for large SDKs
    if (language === 'typescript') {
      this.addTypeScriptOptimizations(files, metrics);
    } else if (language === 'python') {
      this.addPythonOptimizations(files, metrics);
    } else if (language === 'go') {
      this.addGoOptimizations(files, metrics);
    }
  }

  private addTypeScriptOptimizations(files: { [filename: string]: string }, metrics: any): void {
    // Add lazy loading and tree shaking optimizations
    const optimizations = `
// Performance optimizations for large API (${metrics.endpointCount} endpoints)

// Lazy loading utility
export const lazyLoad = <T>(factory: () => Promise<T>): (() => Promise<T>) => {
  let cached: T | undefined;
  return async () => {
    if (!cached) {
      cached = await factory();
    }
    return cached;
  };
};

// Chunked request processing
export class ChunkedProcessor<T> {
  constructor(private chunkSize: number = 50) {}
  
  async processInChunks<R>(
    items: T[],
    processor: (chunk: T[]) => Promise<R[]>
  ): Promise<R[]> {
    const results: R[] = [];
    
    for (let i = 0; i < items.length; i += this.chunkSize) {
      const chunk = items.slice(i, i + this.chunkSize);
      const chunkResults = await processor(chunk);
      results.push(...chunkResults);
    }
    
    return results;
  }
}

// Memory-efficient response streaming
export class ResponseStreamer {
  static async *streamResponse<T>(
    response: Response,
    parser: (chunk: string) => T[]
  ): AsyncGenerator<T, void, unknown> {
    const reader = response.body?.getReader();
    if (!reader) return;
    
    const decoder = new TextDecoder();
    let buffer = '';
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.trim()) {
            const items = parser(line);
            for (const item of items) {
              yield item;
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}`;

    files['src/performance-utils.ts'] = optimizations;
  }

  private addPythonOptimizations(files: { [filename: string]: string }, metrics: any): void {
    const optimizations = `
"""
Performance optimizations for large API (${metrics.endpointCount} endpoints)
"""

import asyncio
from typing import AsyncGenerator, Callable, List, TypeVar, Generic
from functools import lru_cache
import json

T = TypeVar('T')
R = TypeVar('R')

class LazyLoader(Generic[T]):
    """Lazy loading utility for expensive operations"""
    
    def __init__(self, factory: Callable[[], T]):
        self._factory = factory
        self._cached = None
        self._loaded = False
    
    def get(self) -> T:
        if not self._loaded:
            self._cached = self._factory()
            self._loaded = True
        return self._cached

class ChunkedProcessor(Generic[T, R]):
    """Process large datasets in chunks to manage memory"""
    
    def __init__(self, chunk_size: int = 50):
        self.chunk_size = chunk_size
    
    async def process_in_chunks(
        self, 
        items: List[T], 
        processor: Callable[[List[T]], List[R]]
    ) -> List[R]:
        results = []
        
        for i in range(0, len(items), self.chunk_size):
            chunk = items[i:i + self.chunk_size]
            chunk_results = await processor(chunk)
            results.extend(chunk_results)
        
        return results

class ResponseStreamer:
    """Memory-efficient response streaming"""
    
    @staticmethod
    async def stream_response(
        response, 
        parser: Callable[[str], List[T]]
    ) -> AsyncGenerator[T, None]:
        buffer = ""
        
        async for chunk in response.aiter_content(chunk_size=8192):
            buffer += chunk.decode('utf-8')
            lines = buffer.split('\\n')
            buffer = lines.pop()
            
            for line in lines:
                if line.strip():
                    items = parser(line)
                    for item in items:
                        yield item

# Caching decorators for expensive operations
@lru_cache(maxsize=1000)
def cached_operation(key: str, operation: Callable):
    """Cache expensive operations with LRU eviction"""
    return operation()`;

    files['performance_utils.py'] = optimizations;
  }

  private addGoOptimizations(files: { [filename: string]: string }, metrics: any): void {
    const optimizations = `
// Performance optimizations for large API (${metrics.endpointCount} endpoints)
package main

import (
    "context"
    "sync"
    "time"
)

// LazyLoader provides lazy initialization for expensive operations
type LazyLoader[T any] struct {
    factory func() T
    value   T
    once    sync.Once
}

func NewLazyLoader[T any](factory func() T) *LazyLoader[T] {
    return &LazyLoader[T]{factory: factory}
}

func (l *LazyLoader[T]) Get() T {
    l.once.Do(func() {
        l.value = l.factory()
    })
    return l.value
}

// ChunkedProcessor handles large datasets in chunks
type ChunkedProcessor[T any, R any] struct {
    ChunkSize int
}

func NewChunkedProcessor[T any, R any](chunkSize int) *ChunkedProcessor[T, R] {
    return &ChunkedProcessor[T, R]{ChunkSize: chunkSize}
}

func (cp *ChunkedProcessor[T, R]) ProcessInChunks(
    ctx context.Context,
    items []T,
    processor func([]T) ([]R, error),
) ([]R, error) {
    var results []R
    
    for i := 0; i < len(items); i += cp.ChunkSize {
        end := i + cp.ChunkSize
        if end > len(items) {
            end = len(items)
        }
        
        chunk := items[i:end]
        chunkResults, err := processor(chunk)
        if err != nil {
            return nil, err
        }
        
        results = append(results, chunkResults...)
        
        // Check for context cancellation
        select {
        case <-ctx.Done():
            return results, ctx.Err()
        default:
        }
    }
    
    return results, nil
}

// ResponseStreamer provides memory-efficient response streaming
type ResponseStreamer[T any] struct {
    parser func([]byte) ([]T, error)
}

func NewResponseStreamer[T any](parser func([]byte) ([]T, error)) *ResponseStreamer[T] {
    return &ResponseStreamer[T]{parser: parser}
}

func (rs *ResponseStreamer[T]) Stream(
    ctx context.Context,
    reader io.Reader,
) (<-chan T, <-chan error) {
    itemCh := make(chan T, 100)
    errCh := make(chan error, 1)
    
    go func() {
        defer close(itemCh)
        defer close(errCh)
        
        scanner := bufio.NewScanner(reader)
        for scanner.Scan() {
            items, err := rs.parser(scanner.Bytes())
            if err != nil {
                errCh <- err
                return
            }
            
            for _, item := range items {
                select {
                case itemCh <- item:
                case <-ctx.Done():
                    errCh <- ctx.Err()
                    return
                }
            }
        }
        
        if err := scanner.Err(); err != nil {
            errCh <- err
        }
    }()
    
    return itemCh, errCh
}`;

    files['performance_utils.go'] = optimizations;
  }

  private generatePerformanceHelper(language: string, metrics: any): string {
    switch (language) {
      case 'typescript':
        return `
// Performance helper for ${metrics.endpointCount} endpoints
export class PerformanceHelper {
  static readonly BATCH_SIZE = ${Math.min(50, Math.ceil(metrics.endpointCount / 20))};
  static readonly CACHE_TTL = 300000; // 5 minutes
  
  private static cache = new Map<string, { data: any; expires: number }>();
  
  static getCached<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) {
      return cached.data;
    }
    this.cache.delete(key);
    return null;
  }
  
  static setCached<T>(key: string, data: T): void {
    this.cache.set(key, {
      data,
      expires: Date.now() + this.CACHE_TTL
    });
  }
}`;

      case 'python':
        return `
# Performance helper for ${metrics.endpointCount} endpoints
import time
from typing import Dict, Any, Optional

class PerformanceHelper:
    BATCH_SIZE = ${Math.min(50, Math.ceil(metrics.endpointCount / 20))}
    CACHE_TTL = 300  # 5 minutes
    
    _cache: Dict[str, Dict[str, Any]] = {}
    
    @classmethod
    def get_cached(cls, key: str) -> Optional[Any]:
        cached = cls._cache.get(key)
        if cached and cached['expires'] > time.time():
            return cached['data']
        cls._cache.pop(key, None)
        return None
    
    @classmethod
    def set_cached(cls, key: str, data: Any) -> None:
        cls._cache[key] = {
            'data': data,
            'expires': time.time() + cls.CACHE_TTL
        }`;

      case 'go':
        return `
// Performance helper for ${metrics.endpointCount} endpoints
package main

import (
    "sync"
    "time"
)

const (
    BatchSize = ${Math.min(50, Math.ceil(metrics.endpointCount / 20))}
    CacheTTL  = 5 * time.Minute
)

type CacheEntry struct {
    Data    interface{}
    Expires time.Time
}

type PerformanceHelper struct {
    cache sync.Map
}

func (ph *PerformanceHelper) GetCached(key string) interface{} {
    if entry, ok := ph.cache.Load(key); ok {
        if cacheEntry := entry.(*CacheEntry); cacheEntry.Expires.After(time.Now()) {
            return cacheEntry.Data
        }
        ph.cache.Delete(key)
    }
    return nil
}

func (ph *PerformanceHelper) SetCached(key string, data interface{}) {
    ph.cache.Store(key, &CacheEntry{
        Data:    data,
        Expires: time.Now().Add(CacheTTL),
    })
}`;

      default:
        return `// Performance helper for ${metrics.endpointCount} endpoints`;
    }
  }

  private getPaginationHelperPath(language: string): string {
    switch (language) {
      case 'typescript':
        return 'src/pagination-helper.ts';
      case 'python':
        return 'pagination_helper.py';
      case 'go':
        return 'pagination_helper.go';
      default:
        return `pagination-helper.${language}`;
    }
  }

  private getAuthHelperPath(language: string): string {
    switch (language) {
      case 'typescript':
        return 'src/auth-helper.ts';
      case 'python':
        return 'auth_helper.py';
      case 'go':
        return 'auth_helper.go';
      default:
        return `auth-helper.${language}`;
    }
  }

  private getPerformanceHelperPath(language: string): string {
    switch (language) {
      case 'typescript':
        return 'src/performance-helper.ts';
      case 'python':
        return 'performance_helper.py';
      case 'go':
        return 'performance_helper.go';
      default:
        return `performance-helper.${language}`;
    }
  }
}
