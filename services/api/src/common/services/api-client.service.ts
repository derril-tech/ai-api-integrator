import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { HttpClientService, HttpClientOptions, HttpResponse, HttpError } from './http-client.service';
import { ConfigService } from '@nestjs/config';

export interface ApiEndpointConfig {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
  url: string;
  headers?: Record<string, string>;
  queryParams?: Record<string, any>;
  pathParams?: Record<string, string>;
  body?: any;
  timeout?: number;
  retries?: number;
  auth?: HttpClientOptions['auth'];
  validateResponse?: boolean;
  expectedStatus?: number | number[];
}

export interface ApiCallResult<T = any> {
  success: boolean;
  data?: T;
  error?: HttpError;
  response?: HttpResponse<T>;
  duration: number;
  retryCount: number;
  endpoint: ApiEndpointConfig;
}

export interface ApiSpecValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  endpoint?: {
    found: boolean;
    method: string;
    path: string;
    parameters: {
      required: string[];
      optional: string[];
      missing: string[];
    };
    responses: {
      expected: number[];
      actual?: number;
      valid: boolean;
    };
  };
}

@Injectable()
export class ApiClientService {
  private readonly logger = new Logger(ApiClientService.name);

  constructor(
    private readonly httpClient: HttpClientService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Execute an API call based on endpoint configuration
   */
  async executeApiCall<T = any>(
    config: ApiEndpointConfig,
    options: HttpClientOptions = {}
  ): Promise<ApiCallResult<T>> {
    const startTime = Date.now();
    
    try {
      // Validate endpoint configuration
      this.validateEndpointConfig(config);

      // Build the complete URL with path parameters
      const url = this.buildUrl(config.url, config.pathParams);

      // Prepare request options
      const requestOptions: HttpClientOptions = {
        ...options,
        timeout: config.timeout || options.timeout,
        retries: config.retries ?? options.retries,
        auth: config.auth || options.auth,
        headers: {
          ...options.headers,
          ...config.headers,
        },
      };

      // Prepare request config
      const requestConfig = {
        params: config.queryParams,
        headers: config.headers,
      };

      let response: HttpResponse<T>;

      // Execute the HTTP request based on method
      switch (config.method) {
        case 'GET':
          response = await this.httpClient.get<T>(url, requestConfig, requestOptions);
          break;
        case 'POST':
          response = await this.httpClient.post<T>(url, config.body, requestConfig, requestOptions);
          break;
        case 'PUT':
          response = await this.httpClient.put<T>(url, config.body, requestConfig, requestOptions);
          break;
        case 'PATCH':
          response = await this.httpClient.patch<T>(url, config.body, requestConfig, requestOptions);
          break;
        case 'DELETE':
          response = await this.httpClient.delete<T>(url, requestConfig, requestOptions);
          break;
        case 'HEAD':
          response = await this.httpClient.head(url, requestConfig, requestOptions) as HttpResponse<T>;
          break;
        case 'OPTIONS':
          response = await this.httpClient.options<T>(url, requestConfig, requestOptions);
          break;
        default:
          throw new BadRequestException(`Unsupported HTTP method: ${config.method}`);
      }

      // Validate response status if specified
      if (config.expectedStatus) {
        const expectedStatuses = Array.isArray(config.expectedStatus) 
          ? config.expectedStatus 
          : [config.expectedStatus];
        
        if (!expectedStatuses.includes(response.status)) {
          throw new Error(`Unexpected response status: ${response.status}. Expected: ${expectedStatuses.join(', ')}`);
        }
      }

      const duration = Date.now() - startTime;

      this.logger.debug(`API call successful: ${config.method} ${url}`, {
        status: response.status,
        duration,
        retryCount: response.retryCount,
      });

      return {
        success: true,
        data: response.data,
        response,
        duration,
        retryCount: response.retryCount,
        endpoint: config,
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const httpError = error as HttpError;

      this.logger.error(`API call failed: ${config.method} ${config.url}`, {
        error: httpError.message,
        status: httpError.status,
        duration,
        retryCount: httpError.retryCount,
      });

      return {
        success: false,
        error: httpError,
        duration,
        retryCount: httpError.retryCount || 0,
        endpoint: config,
      };
    }
  }

  /**
   * Execute multiple API calls in parallel
   */
  async executeBatch<T = any>(
    configs: ApiEndpointConfig[],
    options: HttpClientOptions = {}
  ): Promise<ApiCallResult<T>[]> {
    this.logger.debug(`Executing batch of ${configs.length} API calls`);

    const promises = configs.map(config => this.executeApiCall<T>(config, options));
    const results = await Promise.allSettled(promises);

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          success: false,
          error: {
            message: result.reason.message || 'Unknown error',
            isTimeout: false,
            isNetworkError: false,
            retryCount: 0,
          },
          duration: 0,
          retryCount: 0,
          endpoint: configs[index],
        };
      }
    });
  }

  /**
   * Test API connectivity and basic functionality
   */
  async testApiConnectivity(
    baseUrl: string,
    auth?: HttpClientOptions['auth'],
    timeout: number = 10000
  ): Promise<{
    reachable: boolean;
    responseTime: number;
    status?: number;
    error?: string;
    headers?: Record<string, string>;
  }> {
    const startTime = Date.now();

    try {
      const response = await this.httpClient.head('/', {}, {
        baseURL: baseUrl,
        timeout,
        auth,
        retries: 0, // No retries for connectivity test
      });

      return {
        reachable: true,
        responseTime: Date.now() - startTime,
        status: response.status,
        headers: response.headers,
      };
    } catch (error) {
      const httpError = error as HttpError;
      return {
        reachable: false,
        responseTime: Date.now() - startTime,
        status: httpError.status,
        error: httpError.message,
      };
    }
  }

  /**
   * Validate API call against OpenAPI specification
   */
  validateAgainstSpec(
    config: ApiEndpointConfig,
    spec: any, // OpenAPI spec object
    response?: HttpResponse
  ): ApiSpecValidation {
    const validation: ApiSpecValidation = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    try {
      // Find the endpoint in the spec
      const path = this.normalizePathForSpec(config.url);
      const method = config.method.toLowerCase();
      
      const pathItem = spec.paths?.[path];
      const operation = pathItem?.[method];

      validation.endpoint = {
        found: !!operation,
        method: config.method,
        path,
        parameters: {
          required: [],
          optional: [],
          missing: [],
        },
        responses: {
          expected: [],
          valid: true,
        },
      };

      if (!operation) {
        validation.isValid = false;
        validation.errors.push(`Endpoint not found in spec: ${config.method} ${path}`);
        return validation;
      }

      // Validate parameters
      const specParameters = operation.parameters || [];
      const requiredParams = specParameters.filter((p: any) => p.required).map((p: any) => p.name);
      const optionalParams = specParameters.filter((p: any) => !p.required).map((p: any) => p.name);

      validation.endpoint.parameters.required = requiredParams;
      validation.endpoint.parameters.optional = optionalParams;

      // Check for missing required parameters
      const providedParams = [
        ...Object.keys(config.queryParams || {}),
        ...Object.keys(config.pathParams || {}),
        ...Object.keys(config.headers || {}),
      ];

      const missingParams = requiredParams.filter(param => !providedParams.includes(param));
      validation.endpoint.parameters.missing = missingParams;

      if (missingParams.length > 0) {
        validation.isValid = false;
        validation.errors.push(`Missing required parameters: ${missingParams.join(', ')}`);
      }

      // Validate response if provided
      if (response) {
        const expectedStatuses = Object.keys(operation.responses || {}).map(Number).filter(n => !isNaN(n));
        validation.endpoint.responses.expected = expectedStatuses;
        validation.endpoint.responses.actual = response.status;
        validation.endpoint.responses.valid = expectedStatuses.includes(response.status) || expectedStatuses.includes(0); // 0 means default

        if (!validation.endpoint.responses.valid) {
          validation.warnings.push(`Unexpected response status: ${response.status}. Expected: ${expectedStatuses.join(', ')}`);
        }
      }

      // Validate request body if present
      if (config.body && operation.requestBody) {
        const contentType = config.headers?.['Content-Type'] || 'application/json';
        const requestBodySpec = operation.requestBody.content?.[contentType];
        
        if (!requestBodySpec) {
          validation.warnings.push(`Request body content type not defined in spec: ${contentType}`);
        }
      }

    } catch (error) {
      validation.isValid = false;
      validation.errors.push(`Spec validation error: ${error.message}`);
    }

    return validation;
  }

  /**
   * Generate curl command for debugging
   */
  generateCurlCommand(config: ApiEndpointConfig, options: HttpClientOptions = {}): string {
    const url = this.buildUrl(config.url, config.pathParams);
    let curl = `curl -X ${config.method}`;

    // Add headers
    const allHeaders = { ...options.headers, ...config.headers };
    for (const [key, value] of Object.entries(allHeaders)) {
      curl += ` -H "${key}: ${value}"`;
    }

    // Add authentication
    const auth = config.auth || options.auth;
    if (auth) {
      switch (auth.type) {
        case 'bearer':
          curl += ` -H "Authorization: Bearer ${auth.token}"`;
          break;
        case 'basic':
          curl += ` -u "${auth.username}:${auth.password}"`;
          break;
        case 'api-key':
          curl += ` -H "${auth.apiKeyHeader}: ${auth.apiKey}"`;
          break;
      }
    }

    // Add query parameters
    if (config.queryParams && Object.keys(config.queryParams).length > 0) {
      const params = new URLSearchParams(config.queryParams).toString();
      curl += ` "${url}?${params}"`;
    } else {
      curl += ` "${url}"`;
    }

    // Add body
    if (config.body && ['POST', 'PUT', 'PATCH'].includes(config.method)) {
      curl += ` -d '${JSON.stringify(config.body)}'`;
    }

    return curl;
  }

  // Private helper methods
  private validateEndpointConfig(config: ApiEndpointConfig): void {
    if (!config.method) {
      throw new BadRequestException('HTTP method is required');
    }

    if (!config.url) {
      throw new BadRequestException('URL is required');
    }

    // Validate URL format
    try {
      new URL(config.url.startsWith('http') ? config.url : `https://example.com${config.url}`);
    } catch (error) {
      throw new BadRequestException(`Invalid URL format: ${config.url}`);
    }
  }

  private buildUrl(urlTemplate: string, pathParams?: Record<string, string>): string {
    let url = urlTemplate;

    if (pathParams) {
      for (const [key, value] of Object.entries(pathParams)) {
        url = url.replace(`{${key}}`, encodeURIComponent(value));
        url = url.replace(`:${key}`, encodeURIComponent(value));
      }
    }

    return url;
  }

  private normalizePathForSpec(url: string): string {
    // Convert URL to OpenAPI path format
    // e.g., /users/123 -> /users/{id}
    return url.replace(/\/\d+/g, '/{id}')
              .replace(/\/[a-f0-9-]{36}/g, '/{uuid}')
              .replace(/\/[a-zA-Z0-9_-]+/g, (match) => {
                // Only replace if it looks like a parameter
                if (match.match(/^\/[0-9]+$/) || match.match(/^\/[a-f0-9-]{8,}$/)) {
                  return '/{id}';
                }
                return match;
              });
  }
}
