import { Controller, Post, Body, Get, Query, Param, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RAGInferenceService, RAGAnalysisRequest, GapAnalysis } from './rag-inference.service';

class AnalyzeSpecDto {
  spec: any;
  format: 'openapi' | 'postman' | 'graphql';
  context?: {
    domain?: string;
    industry?: string;
    similarAPIs?: string[];
    documentation?: string[];
  };
  existingKnowledge?: any[];
}

class GapAnalysisDto {
  spec: any;
  format: 'openapi' | 'postman' | 'graphql';
}

@ApiTags('rag-inference')
@Controller('rag-inference')
export class RAGInferenceController {
  constructor(private readonly ragService: RAGInferenceService) {}

  @Post('analyze')
  @ApiOperation({ summary: 'Analyze API specification and generate intelligent inferences' })
  @ApiResponse({ status: 200, description: 'Analysis completed successfully' })
  async analyzeSpec(@Body() dto: AnalyzeSpecDto): Promise<{
    success: boolean;
    analysis: any;
    summary: {
      totalInferences: number;
      confidence: number;
      coverage: number;
      categories: Record<string, number>;
      recommendations: string[];
    };
  }> {
    try {
      const analysis = await this.ragService.analyzeSpec(dto as RAGAnalysisRequest);

      // Generate summary statistics
      const categories: Record<string, number> = {};
      for (const inference of analysis.inferences) {
        categories[inference.category] = (categories[inference.category] || 0) + 1;
      }

      const summary = {
        totalInferences: analysis.inferences.length,
        confidence: Math.round(analysis.confidence * 100) / 100,
        coverage: Math.round(analysis.coverage * 100) / 100,
        categories,
        recommendations: analysis.recommendations,
      };

      return {
        success: true,
        analysis,
        summary,
      };
    } catch (error) {
      throw new BadRequestException({
        success: false,
        error: error.message,
      });
    }
  }

  @Post('gap-analysis')
  @ApiOperation({ summary: 'Perform comprehensive gap analysis on API specification' })
  @ApiResponse({ status: 200, description: 'Gap analysis completed' })
  async performGapAnalysis(@Body() dto: GapAnalysisDto): Promise<{
    success: boolean;
    gaps: GapAnalysis[];
    summary: {
      totalFields: number;
      presentFields: number;
      inferredFields: number;
      missingFields: number;
      criticalGaps: number;
      recommendations: string[];
    };
  }> {
    try {
      const gaps = await this.ragService.performGapAnalysis(dto.spec, dto.format);

      // Generate summary
      const presentFields = gaps.filter(g => g.status === 'present').length;
      const inferredFields = gaps.filter(g => g.status === 'inferred').length;
      const missingFields = gaps.filter(g => g.status === 'missing').length;
      const criticalGaps = gaps.filter(g => g.status === 'missing' && this.isCriticalField(g.field)).length;

      const recommendations = gaps.flatMap(gap => gap.recommendations || []);

      const summary = {
        totalFields: gaps.length,
        presentFields,
        inferredFields,
        missingFields,
        criticalGaps,
        recommendations: [...new Set(recommendations)], // Remove duplicates
      };

      return {
        success: true,
        gaps,
        summary,
      };
    } catch (error) {
      throw new BadRequestException({
        success: false,
        error: error.message,
      });
    }
  }

  @Get('patterns')
  @ApiOperation({ summary: 'Get available inference patterns and their configurations' })
  @ApiResponse({ status: 200, description: 'Patterns retrieved successfully' })
  getInferencePatterns(): {
    success: boolean;
    patterns: {
      category: string;
      patterns: Array<{
        name: string;
        confidence: number;
        description: string;
        examples: string[];
        implications: string[];
      }>;
    }[];
  } {
    // This would expose the internal pattern database
    // For now, return a structured overview
    const patterns = [
      {
        category: 'auth',
        patterns: [
          {
            name: 'bearer_token',
            confidence: 0.9,
            description: 'Bearer token authentication',
            examples: ['Authorization: Bearer {token}'],
            implications: ['Token refresh needed', 'Secure storage required'],
          },
          {
            name: 'api_key_header',
            confidence: 0.8,
            description: 'API key in header',
            examples: ['X-API-Key: {key}'],
            implications: ['Key rotation', 'Header naming conventions'],
          },
        ],
      },
      {
        category: 'pagination',
        patterns: [
          {
            name: 'offset_limit',
            confidence: 0.9,
            description: 'Offset-based pagination',
            examples: ['?offset=0&limit=20'],
            implications: ['Performance degrades with large offsets'],
          },
          {
            name: 'cursor_based',
            confidence: 0.85,
            description: 'Cursor-based pagination',
            examples: ['?after=cursor123'],
            implications: ['Stable ordering required'],
          },
        ],
      },
      {
        category: 'rate_limit',
        patterns: [
          {
            name: 'token_bucket',
            confidence: 0.8,
            description: 'Token bucket rate limiting',
            examples: ['X-RateLimit-Remaining header'],
            implications: ['Handles burst traffic'],
          },
        ],
      },
      {
        category: 'error_handling',
        patterns: [
          {
            name: 'structured_errors',
            confidence: 0.8,
            description: 'Structured error responses',
            examples: ['{"error": "code", "message": "description"}'],
            implications: ['Better error handling', 'Consistent format'],
          },
        ],
      },
    ];

    return {
      success: true,
      patterns,
    };
  }

  @Get('inferences/:category')
  @ApiOperation({ summary: 'Get inferences for a specific category' })
  @ApiResponse({ status: 200, description: 'Category inferences retrieved' })
  async getCategoryInferences(@Param('category') category: string): Promise<{
    success: boolean;
    category: string;
    inferences: any[];
    bestPractices: string[];
  }> {
    try {
      // Generate sample inferences for the category
      const inferences = await this.generateSampleInferences(category);

      const bestPractices = this.getCategoryBestPractices(category);

      return {
        success: true,
        category,
        inferences,
        bestPractices,
      };
    } catch (error) {
      throw new BadRequestException({
        success: false,
        error: error.message,
      });
    }
  }

  @Post('validate-inference')
  @ApiOperation({ summary: 'Validate and refine an inference based on additional context' })
  @ApiResponse({ status: 200, description: 'Inference validated and refined' })
  async validateInference(@Body() body: {
    inference: any;
    additionalContext: any;
    userFeedback?: 'accept' | 'reject' | 'modify';
    modifications?: any;
  }): Promise<{
    success: boolean;
    refinedInference: any;
    confidence: number;
    reasoning: string;
  }> {
    try {
      // In a real implementation, this would use the additional context
      // to refine the inference using machine learning or rule-based systems

      let refinedInference = { ...body.inference };
      let confidence = body.inference.confidence || 0.5;
      let reasoning = 'Inference validated with additional context';

      // Adjust confidence based on user feedback
      if (body.userFeedback === 'accept') {
        confidence = Math.min(0.95, confidence + 0.1);
        reasoning = 'User accepted inference - confidence increased';
      } else if (body.userFeedback === 'reject') {
        confidence = Math.max(0.1, confidence - 0.2);
        reasoning = 'User rejected inference - confidence decreased';
      } else if (body.userFeedback === 'modify' && body.modifications) {
        refinedInference = { ...refinedInference, ...body.modifications };
        confidence = Math.min(0.9, confidence + 0.05);
        reasoning = 'Inference modified based on user feedback';
      }

      // Incorporate additional context
      if (body.additionalContext) {
        refinedInference.context = body.additionalContext;
        reasoning += ' - Additional context incorporated';
      }

      return {
        success: true,
        refinedInference,
        confidence,
        reasoning,
      };
    } catch (error) {
      throw new BadRequestException({
        success: false,
        error: error.message,
      });
    }
  }

  @Get('confidence-thresholds')
  @ApiOperation({ summary: 'Get confidence thresholds and their meanings' })
  @ApiResponse({ status: 200, description: 'Confidence thresholds retrieved' })
  getConfidenceThresholds(): {
    success: boolean;
    thresholds: {
      range: string;
      meaning: string;
      action: string;
      autoApply: boolean;
    }[];
  } {
    const thresholds = [
      {
        range: '0.9 - 1.0',
        meaning: 'Very High Confidence',
        action: 'Auto-apply to generated code',
        autoApply: true,
      },
      {
        range: '0.7 - 0.89',
        meaning: 'High Confidence',
        action: 'Suggest to user with strong recommendation',
        autoApply: false,
      },
      {
        range: '0.5 - 0.69',
        meaning: 'Medium Confidence',
        action: 'Present as option with alternatives',
        autoApply: false,
      },
      {
        range: '0.3 - 0.49',
        meaning: 'Low Confidence',
        action: 'Show as suggestion only',
        autoApply: false,
      },
      {
        range: '0.0 - 0.29',
        meaning: 'Very Low Confidence',
        action: 'Do not suggest',
        autoApply: false,
      },
    ];

    return {
      success: true,
      thresholds,
    };
  }

  @Get('domain-knowledge')
  @ApiOperation({ summary: 'Get domain-specific knowledge and patterns' })
  @ApiResponse({ status: 200, description: 'Domain knowledge retrieved' })
  getDomainKnowledge(): {
    success: boolean;
    domains: {
      name: string;
      auth: string[];
      pagination: string[];
      rateLimit: string[];
      errorFormat: string;
      description: string;
    }[];
  } {
    const domains = [
      {
        name: 'payment',
        auth: ['bearer_token', 'api_key_header'],
        pagination: ['cursor_based', 'offset_limit'],
        rateLimit: ['token_bucket'],
        errorFormat: 'structured_errors',
        description: 'Payment and financial APIs',
      },
      {
        name: 'crud',
        auth: ['bearer_token', 'basic_auth'],
        pagination: ['offset_limit', 'page_based'],
        rateLimit: ['fixed_window'],
        errorFormat: 'http_status_errors',
        description: 'Standard CRUD operations',
      },
      {
        name: 'graphql',
        auth: ['bearer_token', 'api_key_header'],
        pagination: ['cursor_based'],
        rateLimit: ['token_bucket'],
        errorFormat: 'structured_errors',
        description: 'GraphQL APIs',
      },
      {
        name: 'social',
        auth: ['oauth2', 'bearer_token'],
        pagination: ['cursor_based', 'offset_limit'],
        rateLimit: ['token_bucket'],
        errorFormat: 'structured_errors',
        description: 'Social media and community APIs',
      },
      {
        name: 'data',
        auth: ['api_key_header', 'bearer_token'],
        pagination: ['cursor_based', 'offset_limit'],
        rateLimit: ['fixed_window'],
        errorFormat: 'structured_errors',
        description: 'Data analytics and reporting APIs',
      },
    ];

    return {
      success: true,
      domains,
    };
  }

  @Post('batch-analyze')
  @ApiOperation({ summary: 'Analyze multiple API specifications in batch' })
  @ApiResponse({ status: 200, description: 'Batch analysis completed' })
  async batchAnalyze(@Body() body: {
    specs: Array<{
      id: string;
      spec: any;
      format: 'openapi' | 'postman' | 'graphql';
      context?: any;
    }>;
  }): Promise<{
    success: boolean;
    results: Array<{
      id: string;
      analysis: any;
      success: boolean;
      error?: string;
    }>;
    summary: {
      total: number;
      successful: number;
      failed: number;
      averageConfidence: number;
    };
  }> {
    try {
      const results = [];
      let totalConfidence = 0;
      let successful = 0;

      for (const specItem of body.specs) {
        try {
          const analysis = await this.ragService.analyzeSpec({
            spec: specItem.spec,
            format: specItem.format,
            context: specItem.context,
          } as RAGAnalysisRequest);

          results.push({
            id: specItem.id,
            analysis,
            success: true,
          });

          totalConfidence += analysis.confidence;
          successful++;
        } catch (error) {
          results.push({
            id: specItem.id,
            analysis: null,
            success: false,
            error: error.message,
          });
        }
      }

      const summary = {
        total: body.specs.length,
        successful,
        failed: body.specs.length - successful,
        averageConfidence: successful > 0 ? totalConfidence / successful : 0,
      };

      return {
        success: true,
        results,
        summary,
      };
    } catch (error) {
      throw new BadRequestException({
        success: false,
        error: error.message,
      });
    }
  }

  private async generateSampleInferences(category: string): Promise<any[]> {
    // Generate sample inferences for demonstration
    const samples: Record<string, any[]> = {
      auth: [
        {
          field: 'security',
          inferredValue: { type: 'bearer_token', scheme: 'bearer' },
          confidence: 0.85,
          reasoning: 'Common pattern for modern APIs',
        },
      ],
      pagination: [
        {
          field: 'pagination',
          inferredValue: { type: 'offset_limit' },
          confidence: 0.8,
          reasoning: 'Simple and widely supported',
        },
      ],
      rate_limit: [
        {
          field: 'rate_limiting',
          inferredValue: { type: 'token_bucket' },
          confidence: 0.75,
          reasoning: 'Good balance of simplicity and effectiveness',
        },
      ],
      error_handling: [
        {
          field: 'error_handling',
          inferredValue: { type: 'structured_errors' },
          confidence: 0.9,
          reasoning: 'Standard practice for good developer experience',
        },
      ],
    };

    return samples[category] || [];
  }

  private getCategoryBestPractices(category: string): string[] {
    const bestPractices: Record<string, string[]> = {
      auth: [
        'Use HTTPS for all authenticated endpoints',
        'Implement proper token expiration',
        'Use secure token storage mechanisms',
        'Implement proper logout/revocation',
      ],
      pagination: [
        'Always provide consistent pagination parameters',
        'Include total count when possible',
        'Use cursor-based pagination for large datasets',
        'Document pagination limits and behavior',
      ],
      rate_limit: [
        'Provide clear rate limit headers',
        'Implement graceful degradation',
        'Use appropriate rate limiting algorithms',
        'Document rate limiting policies',
      ],
      error_handling: [
        'Use appropriate HTTP status codes',
        'Provide detailed error messages',
        'Include error codes for programmatic handling',
        'Maintain consistent error response format',
      ],
    };

    return bestPractices[category] || [];
  }

  private isCriticalField(field: string): boolean {
    const criticalFields = ['authentication', 'error_handling'];
    return criticalFields.includes(field);
  }
}
