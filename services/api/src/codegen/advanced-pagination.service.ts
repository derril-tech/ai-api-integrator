import { Injectable, Logger } from '@nestjs/common';

export interface CompoundCursor {
  primary: string;
  secondary?: string;
  timestamp?: number;
  direction?: 'asc' | 'desc';
}

export interface PaginationPattern {
  type: 'offset' | 'cursor' | 'compound_cursor' | 'token' | 'timestamp' | 'hybrid';
  parameters: string[];
  responseFields: string[];
  nextPageLogic: string;
  confidence: number;
}

export interface AdvancedPaginationOptions {
  // Standard patterns
  page?: number;
  limit?: number;
  cursor?: string;
  
  // Compound cursor patterns
  compoundCursor?: CompoundCursor;
  
  // Token-based patterns
  pageToken?: string;
  nextToken?: string;
  
  // Timestamp-based patterns
  since?: number;
  until?: number;
  
  // Hybrid patterns
  bookmark?: string;
  continuation?: string;
  
  // Custom parameters
  customParams?: Record<string, any>;
}

@Injectable()
export class AdvancedPaginationService {
  private readonly logger = new Logger(AdvancedPaginationService.name);

  /**
   * Detect pagination pattern from OpenAPI spec
   */
  detectPaginationPattern(endpoint: any): PaginationPattern[] {
    const patterns: PaginationPattern[] = [];
    
    // Analyze query parameters
    const queryParams = this.extractQueryParameters(endpoint);
    const responseSchema = this.extractResponseSchema(endpoint);
    
    // Check for standard offset pagination
    if (this.hasOffsetPattern(queryParams)) {
      patterns.push({
        type: 'offset',
        parameters: ['page', 'limit', 'offset', 'size'],
        responseFields: ['total', 'totalPages', 'currentPage'],
        nextPageLogic: 'page + 1',
        confidence: 0.9
      });
    }
    
    // Check for cursor pagination
    if (this.hasCursorPattern(queryParams, responseSchema)) {
      patterns.push({
        type: 'cursor',
        parameters: ['cursor', 'after', 'before'],
        responseFields: ['nextCursor', 'hasNext', 'endCursor'],
        nextPageLogic: 'response.nextCursor',
        confidence: 0.85
      });
    }
    
    // Check for compound cursor patterns (e.g., Stripe, GitHub)
    if (this.hasCompoundCursorPattern(queryParams, responseSchema)) {
      patterns.push({
        type: 'compound_cursor',
        parameters: ['starting_after', 'ending_before', 'created[gte]', 'created[lte]'],
        responseFields: ['has_more', 'data[].id', 'data[].created'],
        nextPageLogic: 'last_item.id + timestamp',
        confidence: 0.8
      });
    }
    
    // Check for token-based patterns (e.g., Google APIs)
    if (this.hasTokenPattern(queryParams, responseSchema)) {
      patterns.push({
        type: 'token',
        parameters: ['pageToken', 'nextPageToken'],
        responseFields: ['nextPageToken', 'prevPageToken'],
        nextPageLogic: 'response.nextPageToken',
        confidence: 0.85
      });
    }
    
    // Check for timestamp-based patterns
    if (this.hasTimestampPattern(queryParams)) {
      patterns.push({
        type: 'timestamp',
        parameters: ['since', 'until', 'from', 'to'],
        responseFields: ['oldest', 'newest', 'has_more'],
        nextPageLogic: 'response.oldest - 1',
        confidence: 0.7
      });
    }
    
    // Check for hybrid patterns
    if (this.hasHybridPattern(queryParams, responseSchema)) {
      patterns.push({
        type: 'hybrid',
        parameters: ['bookmark', 'continuation', 'scroll_id'],
        responseFields: ['bookmark', 'continuation', 'scroll_id'],
        nextPageLogic: 'response.bookmark || response.continuation',
        confidence: 0.75
      });
    }
    
    return patterns.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Generate pagination helper code for detected patterns
   */
  generatePaginationHelper(patterns: PaginationPattern[]): string {
    const primaryPattern = patterns[0];
    if (!primaryPattern) {
      return this.generateStandardPaginationHelper();
    }

    switch (primaryPattern.type) {
      case 'compound_cursor':
        return this.generateCompoundCursorHelper();
      case 'token':
        return this.generateTokenBasedHelper();
      case 'timestamp':
        return this.generateTimestampBasedHelper();
      case 'hybrid':
        return this.generateHybridHelper();
      default:
        return this.generateStandardPaginationHelper();
    }
  }

  /**
   * Create pagination options for compound cursor patterns
   */
  createCompoundCursorOptions(
    primaryCursor?: string,
    secondaryCursor?: string,
    timestamp?: number,
    direction: 'asc' | 'desc' = 'asc'
  ): AdvancedPaginationOptions {
    return {
      compoundCursor: {
        primary: primaryCursor || '',
        secondary: secondaryCursor,
        timestamp,
        direction
      }
    };
  }

  /**
   * Parse compound cursor from response
   */
  parseCompoundCursor(response: any, pattern: PaginationPattern): CompoundCursor | null {
    try {
      const data = response.data || response.items || response.results;
      if (!Array.isArray(data) || data.length === 0) {
        return null;
      }

      const lastItem = data[data.length - 1];
      
      return {
        primary: lastItem.id || lastItem._id || lastItem.key,
        secondary: lastItem.sort_key || lastItem.secondary_id,
        timestamp: lastItem.created_at || lastItem.timestamp || lastItem.updated_at,
        direction: 'asc'
      };
    } catch (error) {
      this.logger.warn('Failed to parse compound cursor:', error);
      return null;
    }
  }

  /**
   * Handle Stripe-style pagination
   */
  handleStripePagination(response: any, limit: number = 10): AdvancedPaginationOptions | null {
    if (!response.has_more || !response.data?.length) {
      return null;
    }

    const lastItem = response.data[response.data.length - 1];
    return {
      customParams: {
        starting_after: lastItem.id,
        limit
      }
    };
  }

  /**
   * Handle GitHub-style pagination
   */
  handleGitHubPagination(response: any, headers: Record<string, string>): AdvancedPaginationOptions | null {
    const linkHeader = headers.link || headers.Link;
    if (!linkHeader) return null;

    const links = this.parseLinkHeader(linkHeader);
    if (!links.next) return null;

    try {
      const url = new URL(links.next);
      const since = url.searchParams.get('since');
      const page = url.searchParams.get('page');

      return {
        customParams: {
          since: since ? parseInt(since) : undefined,
          page: page ? parseInt(page) : undefined
        }
      };
    } catch (error) {
      this.logger.warn('Failed to parse GitHub pagination:', error);
      return null;
    }
  }

  /**
   * Handle Google APIs pagination
   */
  handleGooglePagination(response: any): AdvancedPaginationOptions | null {
    if (!response.nextPageToken) {
      return null;
    }

    return {
      pageToken: response.nextPageToken
    };
  }

  /**
   * Handle Elasticsearch-style scroll pagination
   */
  handleScrollPagination(response: any): AdvancedPaginationOptions | null {
    if (!response._scroll_id) {
      return null;
    }

    return {
      customParams: {
        scroll_id: response._scroll_id,
        scroll: '1m' // Keep scroll context alive for 1 minute
      }
    };
  }

  private extractQueryParameters(endpoint: any): string[] {
    const parameters = endpoint.parameters || [];
    return parameters
      .filter((param: any) => param.in === 'query')
      .map((param: any) => param.name);
  }

  private extractResponseSchema(endpoint: any): any {
    const responses = endpoint.responses || {};
    const successResponse = responses['200'] || responses['201'];
    return successResponse?.content?.['application/json']?.schema;
  }

  private hasOffsetPattern(queryParams: string[]): boolean {
    const offsetIndicators = ['page', 'offset', 'skip', 'limit', 'size', 'per_page'];
    return offsetIndicators.some(indicator => 
      queryParams.some(param => param.toLowerCase().includes(indicator))
    );
  }

  private hasCursorPattern(queryParams: string[], responseSchema: any): boolean {
    const cursorIndicators = ['cursor', 'after', 'before', 'next_cursor'];
    const hasQueryCursor = cursorIndicators.some(indicator =>
      queryParams.some(param => param.toLowerCase().includes(indicator))
    );
    
    const hasResponseCursor = responseSchema?.properties && 
      Object.keys(responseSchema.properties).some(prop =>
        cursorIndicators.some(indicator => prop.toLowerCase().includes(indicator))
      );

    return hasQueryCursor || hasResponseCursor;
  }

  private hasCompoundCursorPattern(queryParams: string[], responseSchema: any): boolean {
    // Look for patterns like Stripe's starting_after + created timestamp
    const compoundIndicators = [
      'starting_after', 'ending_before', 'created[gte]', 'created[lte]',
      'sort_key', 'range_key', 'partition_key'
    ];
    
    return compoundIndicators.some(indicator =>
      queryParams.some(param => param.includes(indicator))
    );
  }

  private hasTokenPattern(queryParams: string[], responseSchema: any): boolean {
    const tokenIndicators = ['token', 'pageToken', 'nextPageToken', 'page_token'];
    return tokenIndicators.some(indicator =>
      queryParams.some(param => param.toLowerCase().includes(indicator)) ||
      (responseSchema?.properties && 
       Object.keys(responseSchema.properties).some(prop => prop.includes(indicator)))
    );
  }

  private hasTimestampPattern(queryParams: string[]): boolean {
    const timestampIndicators = ['since', 'until', 'from', 'to', 'timestamp', 'date'];
    return timestampIndicators.some(indicator =>
      queryParams.some(param => param.toLowerCase().includes(indicator))
    );
  }

  private hasHybridPattern(queryParams: string[], responseSchema: any): boolean {
    const hybridIndicators = ['bookmark', 'continuation', 'scroll_id', 'search_after'];
    return hybridIndicators.some(indicator =>
      queryParams.some(param => param.toLowerCase().includes(indicator)) ||
      (responseSchema?.properties && 
       Object.keys(responseSchema.properties).some(prop => prop.includes(indicator)))
    );
  }

  private parseLinkHeader(linkHeader: string): Record<string, string> {
    const links: Record<string, string> = {};
    const regex = /<([^>]+)>;\s*rel="([^"]+)"/g;
    let match;

    while ((match = regex.exec(linkHeader)) !== null) {
      const [, url, rel] = match;
      links[rel] = url;
    }

    return links;
  }

  private generateCompoundCursorHelper(): string {
    return `
export class CompoundCursorPagination {
  static createOptions(primaryCursor?: string, timestamp?: number, limit = 10) {
    const params: any = { limit };
    
    if (primaryCursor) {
      params.starting_after = primaryCursor;
    }
    
    if (timestamp) {
      params['created[gte]'] = timestamp;
    }
    
    return params;
  }
  
  static parseResponse(response: any) {
    if (!response.has_more || !response.data?.length) {
      return null;
    }
    
    const lastItem = response.data[response.data.length - 1];
    return {
      primaryCursor: lastItem.id,
      timestamp: lastItem.created,
      hasMore: response.has_more
    };
  }
}`;
  }

  private generateTokenBasedHelper(): string {
    return `
export class TokenBasedPagination {
  static createOptions(pageToken?: string, pageSize = 10) {
    const params: any = { pageSize };
    
    if (pageToken) {
      params.pageToken = pageToken;
    }
    
    return params;
  }
  
  static parseResponse(response: any) {
    return {
      nextPageToken: response.nextPageToken,
      hasMore: !!response.nextPageToken
    };
  }
}`;
  }

  private generateTimestampBasedHelper(): string {
    return `
export class TimestampBasedPagination {
  static createOptions(since?: number, until?: number, limit = 10) {
    const params: any = { limit };
    
    if (since) {
      params.since = since;
    }
    
    if (until) {
      params.until = until;
    }
    
    return params;
  }
  
  static parseResponse(response: any) {
    const items = response.data || response.items || [];
    if (items.length === 0) {
      return null;
    }
    
    const oldestItem = items[items.length - 1];
    return {
      nextSince: oldestItem.timestamp || oldestItem.created_at,
      hasMore: response.has_more || items.length >= response.limit
    };
  }
}`;
  }

  private generateHybridHelper(): string {
    return `
export class HybridPagination {
  static createOptions(bookmark?: string, limit = 10) {
    const params: any = { limit };
    
    if (bookmark) {
      params.bookmark = bookmark;
    }
    
    return params;
  }
  
  static parseResponse(response: any) {
    return {
      bookmark: response.bookmark || response.continuation || response.scroll_id,
      hasMore: !!response.bookmark || !!response.continuation || !!response.scroll_id
    };
  }
}`;
  }

  private generateStandardPaginationHelper(): string {
    return `
export class StandardPagination {
  static createOptions(page = 1, limit = 10) {
    return {
      page: Math.max(1, page),
      limit: Math.min(Math.max(1, limit), 100)
    };
  }
  
  static parseResponse(response: any) {
    return {
      currentPage: response.page || response.current_page,
      totalPages: response.total_pages || response.totalPages,
      hasMore: response.has_more || (response.page < response.total_pages)
    };
  }
}`;
  }
}
