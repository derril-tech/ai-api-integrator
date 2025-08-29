import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { 
  AxiosInstance, 
  AxiosRequestConfig, 
  AxiosResponse, 
  AxiosError,
  InternalAxiosRequestConfig,
} from 'axios';
import * as https from 'https';

export interface HttpClientOptions {
  baseURL?: string;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  headers?: Record<string, string>;
  auth?: {
    type: 'bearer' | 'basic' | 'api-key' | 'hmac' | 'oauth2';
    token?: string;
    username?: string;
    password?: string;
    apiKey?: string;
    apiKeyHeader?: string;
    hmacSecret?: string;
    hmacAlgorithm?: string;
    oauthToken?: string;
  };
  validateStatus?: (status: number) => boolean;
  followRedirects?: boolean;
  maxRedirects?: number;
  compression?: boolean;
  keepAlive?: boolean;
  rejectUnauthorized?: boolean;
}

export interface HttpResponse<T = any> {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  config: AxiosRequestConfig;
  duration: number;
  retryCount: number;
}

export interface HttpError {
  message: string;
  status?: number;
  statusText?: string;
  code?: string;
  config?: AxiosRequestConfig;
  response?: {
    data: any;
    status: number;
    statusText: string;
    headers: Record<string, string>;
  };
  isTimeout: boolean;
  isNetworkError: boolean;
  retryCount: number;
}

@Injectable()
export class HttpClientService {
  private readonly logger = new Logger(HttpClientService.name);
  private readonly defaultOptions: HttpClientOptions;

  constructor(private readonly configService: ConfigService) {
    this.defaultOptions = {
      timeout: this.configService.get('HTTP_TIMEOUT', 30000),
      retries: this.configService.get('HTTP_RETRIES', 3),
      retryDelay: this.configService.get('HTTP_RETRY_DELAY', 1000),
      followRedirects: true,
      maxRedirects: 5,
      compression: true,
      keepAlive: true,
      rejectUnauthorized: this.configService.get('NODE_ENV') === 'production',
      validateStatus: (status) => status < 500, // Retry on 5xx errors
    };
  }

  /**
   * Create a configured HTTP client instance
   */
  createClient(options: HttpClientOptions = {}): AxiosInstance {
    const mergedOptions = { ...this.defaultOptions, ...options };
    
    const client = axios.create({
      baseURL: mergedOptions.baseURL,
      timeout: mergedOptions.timeout,
      headers: {
        'User-Agent': 'AI-API-Integrator/1.0',
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...mergedOptions.headers,
      },
      validateStatus: mergedOptions.validateStatus,
      maxRedirects: mergedOptions.maxRedirects,
      httpsAgent: new https.Agent({
        keepAlive: mergedOptions.keepAlive,
        rejectUnauthorized: mergedOptions.rejectUnauthorized,
      }),
    });

    // Add authentication
    this.addAuthentication(client, mergedOptions.auth);

    // Add request interceptor for logging and timing
    client.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        config.metadata = { startTime: Date.now(), retryCount: 0 };
        
        this.logger.debug(`HTTP Request: ${config.method?.toUpperCase()} ${config.url}`, {
          headers: this.sanitizeHeaders(config.headers || {}),
          timeout: config.timeout,
        });

        return config;
      },
      (error) => {
        this.logger.error('HTTP Request Error:', error);
        return Promise.reject(error);
      }
    );

    // Add response interceptor for logging and error handling
    client.interceptors.response.use(
      (response: AxiosResponse) => {
        const duration = Date.now() - (response.config.metadata?.startTime || 0);
        const retryCount = response.config.metadata?.retryCount || 0;

        this.logger.debug(`HTTP Response: ${response.status} ${response.statusText}`, {
          url: response.config.url,
          method: response.config.method?.toUpperCase(),
          duration,
          retryCount,
          dataSize: JSON.stringify(response.data).length,
        });

        // Attach metadata to response
        (response as any).duration = duration;
        (response as any).retryCount = retryCount;

        return response;
      },
      async (error: AxiosError) => {
        const duration = Date.now() - (error.config?.metadata?.startTime || 0);
        const retryCount = error.config?.metadata?.retryCount || 0;

        // Create standardized error
        const httpError: HttpError = {
          message: error.message,
          status: error.response?.status,
          statusText: error.response?.statusText,
          code: error.code,
          config: error.config,
          response: error.response ? {
            data: error.response.data,
            status: error.response.status,
            statusText: error.response.statusText,
            headers: error.response.headers as Record<string, string>,
          } : undefined,
          isTimeout: error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT',
          isNetworkError: !error.response && !!error.request,
          retryCount,
        };

        this.logger.error(`HTTP Error: ${error.response?.status || error.code}`, {
          url: error.config?.url,
          method: error.config?.method?.toUpperCase(),
          duration,
          retryCount,
          error: httpError,
        });

        // Retry logic
        if (this.shouldRetry(error, mergedOptions, retryCount)) {
          return this.retryRequest(client, error.config!, mergedOptions, retryCount + 1);
        }

        return Promise.reject(httpError);
      }
    );

    return client;
  }

  /**
   * Make a GET request
   */
  async get<T = any>(
    url: string, 
    config: AxiosRequestConfig = {}, 
    options: HttpClientOptions = {}
  ): Promise<HttpResponse<T>> {
    const client = this.createClient(options);
    const response = await client.get<T>(url, config);
    return this.formatResponse(response);
  }

  /**
   * Make a POST request
   */
  async post<T = any>(
    url: string, 
    data?: any, 
    config: AxiosRequestConfig = {}, 
    options: HttpClientOptions = {}
  ): Promise<HttpResponse<T>> {
    const client = this.createClient(options);
    const response = await client.post<T>(url, data, config);
    return this.formatResponse(response);
  }

  /**
   * Make a PUT request
   */
  async put<T = any>(
    url: string, 
    data?: any, 
    config: AxiosRequestConfig = {}, 
    options: HttpClientOptions = {}
  ): Promise<HttpResponse<T>> {
    const client = this.createClient(options);
    const response = await client.put<T>(url, data, config);
    return this.formatResponse(response);
  }

  /**
   * Make a PATCH request
   */
  async patch<T = any>(
    url: string, 
    data?: any, 
    config: AxiosRequestConfig = {}, 
    options: HttpClientOptions = {}
  ): Promise<HttpResponse<T>> {
    const client = this.createClient(options);
    const response = await client.patch<T>(url, data, config);
    return this.formatResponse(response);
  }

  /**
   * Make a DELETE request
   */
  async delete<T = any>(
    url: string, 
    config: AxiosRequestConfig = {}, 
    options: HttpClientOptions = {}
  ): Promise<HttpResponse<T>> {
    const client = this.createClient(options);
    const response = await client.delete<T>(url, config);
    return this.formatResponse(response);
  }

  /**
   * Make a HEAD request
   */
  async head(
    url: string, 
    config: AxiosRequestConfig = {}, 
    options: HttpClientOptions = {}
  ): Promise<HttpResponse<void>> {
    const client = this.createClient(options);
    const response = await client.head(url, config);
    return this.formatResponse(response);
  }

  /**
   * Make an OPTIONS request
   */
  async options<T = any>(
    url: string, 
    config: AxiosRequestConfig = {}, 
    options: HttpClientOptions = {}
  ): Promise<HttpResponse<T>> {
    const client = this.createClient(options);
    const response = await client.options<T>(url, config);
    return this.formatResponse(response);
  }

  // Private helper methods
  private addAuthentication(client: AxiosInstance, auth?: HttpClientOptions['auth']): void {
    if (!auth) return;

    switch (auth.type) {
      case 'bearer':
        if (auth.token) {
          client.defaults.headers.common['Authorization'] = `Bearer ${auth.token}`;
        }
        break;

      case 'basic':
        if (auth.username && auth.password) {
          const credentials = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
          client.defaults.headers.common['Authorization'] = `Basic ${credentials}`;
        }
        break;

      case 'api-key':
        if (auth.apiKey && auth.apiKeyHeader) {
          client.defaults.headers.common[auth.apiKeyHeader] = auth.apiKey;
        }
        break;

      case 'oauth2':
        if (auth.oauthToken) {
          client.defaults.headers.common['Authorization'] = `Bearer ${auth.oauthToken}`;
        }
        break;

      case 'hmac':
        // HMAC signing will be handled per-request in an interceptor
        if (auth.hmacSecret) {
          client.interceptors.request.use((config) => {
            const signature = this.generateHmacSignature(config, auth.hmacSecret!, auth.hmacAlgorithm || 'sha256');
            config.headers = config.headers || {};
            config.headers['X-Signature'] = signature;
            return config;
          });
        }
        break;
    }
  }

  private generateHmacSignature(config: InternalAxiosRequestConfig, secret: string, algorithm: string): string {
    const crypto = require('crypto');
    const method = config.method?.toUpperCase() || 'GET';
    const url = config.url || '';
    const body = config.data ? JSON.stringify(config.data) : '';
    const timestamp = Date.now().toString();
    
    const payload = `${method}\n${url}\n${body}\n${timestamp}`;
    const signature = crypto.createHmac(algorithm, secret).update(payload).digest('hex');
    
    // Add timestamp to headers for verification
    config.headers = config.headers || {};
    config.headers['X-Timestamp'] = timestamp;
    
    return signature;
  }

  private shouldRetry(error: AxiosError, options: HttpClientOptions, retryCount: number): boolean {
    if (retryCount >= (options.retries || 0)) return false;

    // Retry on network errors
    if (!error.response && error.request) return true;

    // Retry on 5xx errors
    if (error.response && error.response.status >= 500) return true;

    // Retry on timeout
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') return true;

    // Retry on rate limiting (429)
    if (error.response && error.response.status === 429) return true;

    return false;
  }

  private async retryRequest(
    client: AxiosInstance, 
    config: InternalAxiosRequestConfig, 
    options: HttpClientOptions, 
    retryCount: number
  ): Promise<AxiosResponse> {
    const delay = (options.retryDelay || 1000) * Math.pow(2, retryCount - 1); // Exponential backoff
    
    this.logger.debug(`Retrying request (attempt ${retryCount}/${options.retries}) after ${delay}ms`, {
      url: config.url,
      method: config.method?.toUpperCase(),
    });

    await new Promise(resolve => setTimeout(resolve, delay));

    config.metadata = { ...config.metadata, retryCount };
    return client.request(config);
  }

  private formatResponse<T>(response: AxiosResponse<T>): HttpResponse<T> {
    return {
      data: response.data,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers as Record<string, string>,
      config: response.config,
      duration: (response as any).duration || 0,
      retryCount: (response as any).retryCount || 0,
    };
  }

  private sanitizeHeaders(headers: Record<string, any>): Record<string, any> {
    const sanitized = { ...headers };
    const sensitiveHeaders = ['authorization', 'x-api-key', 'x-signature', 'cookie'];
    
    for (const key of Object.keys(sanitized)) {
      if (sensitiveHeaders.includes(key.toLowerCase())) {
        sanitized[key] = '[REDACTED]';
      }
    }
    
    return sanitized;
  }
}
