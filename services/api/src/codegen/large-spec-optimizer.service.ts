import { Injectable, Logger } from '@nestjs/common';
import { PerformanceService } from './performance.service';

export interface SpecMetrics {
  endpointCount: number;
  modelCount: number;
  totalSize: number;
  complexity: 'small' | 'medium' | 'large' | 'xlarge';
  estimatedProcessingTime: number;
}

export interface OptimizationStrategy {
  chunking: boolean;
  streaming: boolean;
  caching: boolean;
  parallelization: boolean;
  compression: boolean;
  indexing: boolean;
}

export interface ProcessingChunk {
  id: string;
  type: 'endpoints' | 'models' | 'schemas';
  data: any[];
  size: number;
  priority: number;
}

@Injectable()
export class LargeSpecOptimizerService {
  private readonly logger = new Logger(LargeSpecOptimizerService.name);
  private readonly CHUNK_SIZE = 100; // Process 100 endpoints at a time
  private readonly LARGE_SPEC_THRESHOLD = 500; // Consider large if > 500 endpoints
  private readonly XLARGE_SPEC_THRESHOLD = 1000; // Consider XL if > 1000 endpoints

  constructor(private readonly performanceService: PerformanceService) {}

  /**
   * Analyze spec size and complexity
   */
  analyzeSpec(spec: any): SpecMetrics {
    const endpointCount = this.countEndpoints(spec);
    const modelCount = this.countModels(spec);
    const totalSize = this.calculateSpecSize(spec);
    
    const complexity = this.determineComplexity(endpointCount, modelCount, totalSize);
    const estimatedProcessingTime = this.estimateProcessingTime(endpointCount, modelCount, complexity);

    return {
      endpointCount,
      modelCount,
      totalSize,
      complexity,
      estimatedProcessingTime
    };
  }

  /**
   * Determine optimal processing strategy
   */
  determineOptimizationStrategy(metrics: SpecMetrics): OptimizationStrategy {
    const { endpointCount, complexity } = metrics;

    return {
      chunking: endpointCount > this.LARGE_SPEC_THRESHOLD,
      streaming: complexity === 'xlarge',
      caching: endpointCount > 200,
      parallelization: endpointCount > this.LARGE_SPEC_THRESHOLD,
      compression: complexity === 'large' || complexity === 'xlarge',
      indexing: endpointCount > this.LARGE_SPEC_THRESHOLD
    };
  }

  /**
   * Process large spec with optimizations
   */
  async processLargeSpec(
    spec: any,
    strategy: OptimizationStrategy,
    progressCallback?: (progress: number, stage: string) => void
  ): Promise<any> {
    const startTime = Date.now();
    
    try {
      // Create processing index for fast lookups
      if (strategy.indexing) {
        await this.createSpecIndex(spec);
        progressCallback?.(10, 'Creating index');
      }

      // Compress spec data if needed
      if (strategy.compression) {
        spec = await this.compressSpecData(spec);
        progressCallback?.(20, 'Compressing data');
      }

      // Process in chunks if needed
      if (strategy.chunking) {
        return await this.processInChunks(spec, strategy, progressCallback);
      }

      // Process with streaming if needed
      if (strategy.streaming) {
        return await this.processWithStreaming(spec, progressCallback);
      }

      // Standard processing for smaller specs
      return await this.processStandard(spec, progressCallback);

    } finally {
      const processingTime = Date.now() - startTime;
      this.logger.log(`Large spec processing completed in ${processingTime}ms`);
      
      // Record performance metrics
      this.performanceService.recordMetric('large_spec_processing', {
        endpointCount: this.countEndpoints(spec),
        processingTime,
        strategy: Object.entries(strategy).filter(([, enabled]) => enabled).map(([key]) => key)
      });
    }
  }

  /**
   * Process spec in chunks for memory efficiency
   */
  private async processInChunks(
    spec: any,
    strategy: OptimizationStrategy,
    progressCallback?: (progress: number, stage: string) => void
  ): Promise<any> {
    const chunks = this.createProcessingChunks(spec);
    const results: any[] = [];
    
    const totalChunks = chunks.length;
    let processedChunks = 0;

    // Process chunks in parallel if strategy allows
    if (strategy.parallelization) {
      const concurrency = Math.min(4, Math.ceil(totalChunks / 4)); // Max 4 parallel chunks
      const chunkBatches = this.batchArray(chunks, concurrency);
      
      for (const batch of chunkBatches) {
        const batchPromises = batch.map(chunk => this.processChunk(chunk));
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
        
        processedChunks += batch.length;
        const progress = 30 + (processedChunks / totalChunks) * 60; // 30-90% for chunk processing
        progressCallback?.(progress, `Processing chunks (${processedChunks}/${totalChunks})`);
      }
    } else {
      // Sequential processing
      for (const chunk of chunks) {
        const chunkResult = await this.processChunk(chunk);
        results.push(chunkResult);
        
        processedChunks++;
        const progress = 30 + (processedChunks / totalChunks) * 60;
        progressCallback?.(progress, `Processing chunks (${processedChunks}/${totalChunks})`);
      }
    }

    // Merge results
    progressCallback?.(95, 'Merging results');
    return this.mergeChunkResults(results, spec);
  }

  /**
   * Process spec with streaming for memory efficiency
   */
  private async processWithStreaming(
    spec: any,
    progressCallback?: (progress: number, stage: string) => void
  ): Promise<any> {
    const stream = this.createSpecStream(spec);
    const results: any[] = [];
    let processed = 0;
    const total = this.countEndpoints(spec);

    progressCallback?.(30, 'Starting streaming processing');

    for await (const item of stream) {
      const processedItem = await this.processStreamItem(item);
      results.push(processedItem);
      
      processed++;
      const progress = 30 + (processed / total) * 60;
      progressCallback?.(progress, `Streaming processing (${processed}/${total})`);
    }

    progressCallback?.(95, 'Finalizing stream results');
    return this.finalizeStreamResults(results, spec);
  }

  /**
   * Standard processing for smaller specs
   */
  private async processStandard(
    spec: any,
    progressCallback?: (progress: number, stage: string) => void
  ): Promise<any> {
    progressCallback?.(30, 'Processing endpoints');
    const endpoints = await this.processEndpoints(spec.paths || {});
    
    progressCallback?.(60, 'Processing models');
    const models = await this.processModels(spec.components?.schemas || {});
    
    progressCallback?.(90, 'Finalizing');
    return this.finalizeResults(endpoints, models, spec);
  }

  /**
   * Create processing chunks from spec
   */
  private createProcessingChunks(spec: any): ProcessingChunk[] {
    const chunks: ProcessingChunk[] = [];
    
    // Chunk endpoints
    const endpoints = this.extractEndpoints(spec);
    const endpointChunks = this.chunkArray(endpoints, this.CHUNK_SIZE);
    
    endpointChunks.forEach((chunk, index) => {
      chunks.push({
        id: `endpoints-${index}`,
        type: 'endpoints',
        data: chunk,
        size: chunk.length,
        priority: 1 // High priority for endpoints
      });
    });

    // Chunk models
    const models = this.extractModels(spec);
    const modelChunks = this.chunkArray(models, this.CHUNK_SIZE);
    
    modelChunks.forEach((chunk, index) => {
      chunks.push({
        id: `models-${index}`,
        type: 'models',
        data: chunk,
        size: chunk.length,
        priority: 2 // Lower priority for models
      });
    });

    // Sort by priority and size
    return chunks.sort((a, b) => a.priority - b.priority || b.size - a.size);
  }

  /**
   * Process a single chunk
   */
  private async processChunk(chunk: ProcessingChunk): Promise<any> {
    const startTime = Date.now();
    
    try {
      switch (chunk.type) {
        case 'endpoints':
          return await this.processEndpointChunk(chunk.data);
        case 'models':
          return await this.processModelChunk(chunk.data);
        default:
          throw new Error(`Unknown chunk type: ${chunk.type}`);
      }
    } finally {
      const processingTime = Date.now() - startTime;
      this.logger.debug(`Processed chunk ${chunk.id} (${chunk.size} items) in ${processingTime}ms`);
    }
  }

  /**
   * Create spec index for fast lookups
   */
  private async createSpecIndex(spec: any): Promise<void> {
    // Create indexes for common lookups
    const endpointIndex = new Map();
    const modelIndex = new Map();
    const tagIndex = new Map();

    // Index endpoints by path and method
    const paths = spec.paths || {};
    for (const [path, methods] of Object.entries(paths)) {
      for (const [method, endpoint] of Object.entries(methods as any)) {
        const key = `${method.toUpperCase()} ${path}`;
        endpointIndex.set(key, endpoint);
        
        // Index by tags
        const tags = (endpoint as any).tags || [];
        for (const tag of tags) {
          if (!tagIndex.has(tag)) {
            tagIndex.set(tag, []);
          }
          tagIndex.get(tag).push({ path, method, endpoint });
        }
      }
    }

    // Index models by name
    const schemas = spec.components?.schemas || {};
    for (const [name, schema] of Object.entries(schemas)) {
      modelIndex.set(name, schema);
    }

    // Store indexes for later use (in a real implementation, use Redis or similar)
    (spec as any)._indexes = {
      endpoints: endpointIndex,
      models: modelIndex,
      tags: tagIndex
    };
  }

  /**
   * Compress spec data to reduce memory usage
   */
  private async compressSpecData(spec: any): Promise<any> {
    // Remove unnecessary fields
    const compressed = { ...spec };
    
    // Remove examples if they're large
    this.removeExcessiveExamples(compressed);
    
    // Compress descriptions
    this.compressDescriptions(compressed);
    
    // Deduplicate schemas
    this.deduplicateSchemas(compressed);
    
    return compressed;
  }

  /**
   * Create streaming iterator for spec processing
   */
  private async* createSpecStream(spec: any): AsyncGenerator<any, void, unknown> {
    // Stream endpoints
    const paths = spec.paths || {};
    for (const [path, methods] of Object.entries(paths)) {
      for (const [method, endpoint] of Object.entries(methods as any)) {
        yield {
          type: 'endpoint',
          path,
          method,
          data: endpoint
        };
      }
    }

    // Stream models
    const schemas = spec.components?.schemas || {};
    for (const [name, schema] of Object.entries(schemas)) {
      yield {
        type: 'model',
        name,
        data: schema
      };
    }
  }

  /**
   * Process a single stream item
   */
  private async processStreamItem(item: any): Promise<any> {
    switch (item.type) {
      case 'endpoint':
        return this.processEndpoint(item.path, item.method, item.data);
      case 'model':
        return this.processModel(item.name, item.data);
      default:
        return item;
    }
  }

  // Helper methods
  private countEndpoints(spec: any): number {
    const paths = spec.paths || {};
    let count = 0;
    
    for (const methods of Object.values(paths)) {
      count += Object.keys(methods as any).length;
    }
    
    return count;
  }

  private countModels(spec: any): number {
    return Object.keys(spec.components?.schemas || {}).length;
  }

  private calculateSpecSize(spec: any): number {
    return JSON.stringify(spec).length;
  }

  private determineComplexity(endpointCount: number, modelCount: number, totalSize: number): SpecMetrics['complexity'] {
    if (endpointCount > this.XLARGE_SPEC_THRESHOLD || totalSize > 10 * 1024 * 1024) {
      return 'xlarge';
    } else if (endpointCount > this.LARGE_SPEC_THRESHOLD || totalSize > 5 * 1024 * 1024) {
      return 'large';
    } else if (endpointCount > 100 || totalSize > 1024 * 1024) {
      return 'medium';
    } else {
      return 'small';
    }
  }

  private estimateProcessingTime(endpointCount: number, modelCount: number, complexity: string): number {
    // Base time per endpoint (ms)
    const baseTimePerEndpoint = complexity === 'xlarge' ? 50 : complexity === 'large' ? 30 : 20;
    const baseTimePerModel = 10;
    
    return (endpointCount * baseTimePerEndpoint) + (modelCount * baseTimePerModel);
  }

  private extractEndpoints(spec: any): any[] {
    const endpoints: any[] = [];
    const paths = spec.paths || {};
    
    for (const [path, methods] of Object.entries(paths)) {
      for (const [method, endpoint] of Object.entries(methods as any)) {
        endpoints.push({ path, method, ...endpoint });
      }
    }
    
    return endpoints;
  }

  private extractModels(spec: any): any[] {
    const models: any[] = [];
    const schemas = spec.components?.schemas || {};
    
    for (const [name, schema] of Object.entries(schemas)) {
      models.push({ name, ...schema });
    }
    
    return models;
  }

  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  private batchArray<T>(array: T[], batchSize: number): T[][] {
    return this.chunkArray(array, batchSize);
  }

  private async processEndpointChunk(endpoints: any[]): Promise<any> {
    return endpoints.map(endpoint => this.processEndpoint(endpoint.path, endpoint.method, endpoint));
  }

  private async processModelChunk(models: any[]): Promise<any> {
    return models.map(model => this.processModel(model.name, model));
  }

  private processEndpoint(path: string, method: string, endpoint: any): any {
    // Process individual endpoint
    return {
      path,
      method: method.toUpperCase(),
      summary: endpoint.summary,
      description: endpoint.description,
      parameters: endpoint.parameters || [],
      responses: endpoint.responses || {},
      tags: endpoint.tags || []
    };
  }

  private processModel(name: string, model: any): any {
    // Process individual model
    return {
      name,
      type: model.type || 'object',
      properties: model.properties || {},
      required: model.required || []
    };
  }

  private async processEndpoints(paths: any): Promise<any[]> {
    const endpoints: any[] = [];
    
    for (const [path, methods] of Object.entries(paths)) {
      for (const [method, endpoint] of Object.entries(methods as any)) {
        endpoints.push(this.processEndpoint(path, method, endpoint));
      }
    }
    
    return endpoints;
  }

  private async processModels(schemas: any): Promise<any[]> {
    const models: any[] = [];
    
    for (const [name, schema] of Object.entries(schemas)) {
      models.push(this.processModel(name, schema));
    }
    
    return models;
  }

  private mergeChunkResults(results: any[], originalSpec: any): any {
    const merged = {
      ...originalSpec,
      endpoints: [],
      models: []
    };

    for (const result of results) {
      if (Array.isArray(result)) {
        if (result.length > 0 && result[0].path) {
          merged.endpoints.push(...result);
        } else if (result.length > 0 && result[0].name) {
          merged.models.push(...result);
        }
      }
    }

    return merged;
  }

  private finalizeStreamResults(results: any[], originalSpec: any): any {
    return this.mergeChunkResults([results], originalSpec);
  }

  private finalizeResults(endpoints: any[], models: any[], originalSpec: any): any {
    return {
      ...originalSpec,
      endpoints,
      models
    };
  }

  private removeExcessiveExamples(spec: any): void {
    // Remove examples that are too large (> 1KB)
    const removeExamples = (obj: any) => {
      if (typeof obj !== 'object' || obj === null) return;
      
      for (const [key, value] of Object.entries(obj)) {
        if (key === 'example' || key === 'examples') {
          const size = JSON.stringify(value).length;
          if (size > 1024) {
            delete obj[key];
          }
        } else if (typeof value === 'object') {
          removeExamples(value);
        }
      }
    };

    removeExamples(spec);
  }

  private compressDescriptions(spec: any): void {
    // Truncate very long descriptions
    const compressDescriptions = (obj: any) => {
      if (typeof obj !== 'object' || obj === null) return;
      
      for (const [key, value] of Object.entries(obj)) {
        if (key === 'description' && typeof value === 'string' && value.length > 500) {
          obj[key] = value.substring(0, 497) + '...';
        } else if (typeof value === 'object') {
          compressDescriptions(value);
        }
      }
    };

    compressDescriptions(spec);
  }

  private deduplicateSchemas(spec: any): void {
    // Find and deduplicate identical schemas
    const schemas = spec.components?.schemas || {};
    const schemaHashes = new Map<string, string>();
    const duplicates = new Set<string>();

    // Create hashes for each schema
    for (const [name, schema] of Object.entries(schemas)) {
      const hash = this.hashObject(schema);
      if (schemaHashes.has(hash)) {
        duplicates.add(name);
      } else {
        schemaHashes.set(hash, name);
      }
    }

    // Remove duplicates (keep first occurrence)
    for (const duplicate of duplicates) {
      delete schemas[duplicate];
    }
  }

  private hashObject(obj: any): string {
    // Simple hash function for object comparison
    return JSON.stringify(obj, Object.keys(obj).sort());
  }
}
