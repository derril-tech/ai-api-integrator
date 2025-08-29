import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthIndicatorResult, HealthIndicator } from '@nestjs/terminus';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { HttpClientService } from '../common/services/http-client.service';
import { TemporalClientService } from '../temporal/temporal-client.service';
import * as os from 'os';
import * as process from 'process';

export interface DetailedHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  services: {
    database: ServiceHealth;
    redis: ServiceHealth;
    temporal: ServiceHealth;
    externalApis: ServiceHealth;
  };
  system: {
    memory: MemoryHealth;
    cpu: CpuHealth;
    disk: DiskHealth;
    network: NetworkHealth;
  };
  application: {
    activeConnections: number;
    requestsPerSecond: number;
    errorRate: number;
    responseTime: ResponseTimeHealth;
  };
}

interface ServiceHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime?: number;
  lastCheck: string;
  error?: string;
  details?: any;
}

interface MemoryHealth {
  used: number;
  total: number;
  percentage: number;
  heap: {
    used: number;
    total: number;
    percentage: number;
  };
}

interface CpuHealth {
  usage: number;
  loadAverage: number[];
  cores: number;
}

interface DiskHealth {
  usage: number;
  available: number;
  total: number;
  percentage: number;
}

interface NetworkHealth {
  connections: number;
  bandwidth: {
    in: number;
    out: number;
  };
}

interface ResponseTimeHealth {
  p50: number;
  p95: number;
  p99: number;
  average: number;
}

@Injectable()
export class HealthService extends HealthIndicator {
  private readonly logger = new Logger(HealthService.name);
  private readonly startTime = Date.now();
  private healthMetrics = {
    requestCount: 0,
    errorCount: 0,
    responseTimes: [] as number[],
    lastRequestTime: Date.now(),
  };

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly httpClient: HttpClientService,
    private readonly temporalClient: TemporalClientService,
  ) {
    super();
  }

  /**
   * Check Redis connectivity
   */
  async checkRedis(key: string): Promise<HealthIndicatorResult> {
    try {
      // In a real implementation, you would inject a Redis client
      // For now, we'll simulate the check
      const startTime = Date.now();
      
      // Simulate Redis ping
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const responseTime = Date.now() - startTime;
      
      return this.getStatus(key, true, {
        responseTime,
        status: 'connected',
      });
    } catch (error) {
      this.logger.error('Redis health check failed:', error);
      return this.getStatus(key, false, {
        error: error.message,
      });
    }
  }

  /**
   * Check external services connectivity
   */
  async checkExternalServices(key: string): Promise<HealthIndicatorResult> {
    try {
      const services = [
        { name: 'OpenAI API', url: 'https://api.openai.com/v1/models' },
        // Add other external services as needed
      ];

      const results = await Promise.allSettled(
        services.map(async (service) => {
          const startTime = Date.now();
          try {
            await this.httpClient.head(service.url, {}, {
              timeout: 5000,
              retries: 1,
            });
            return {
              name: service.name,
              status: 'healthy',
              responseTime: Date.now() - startTime,
            };
          } catch (error) {
            return {
              name: service.name,
              status: 'unhealthy',
              error: error.message,
              responseTime: Date.now() - startTime,
            };
          }
        })
      );

      const serviceResults = results.map((result, index) => 
        result.status === 'fulfilled' ? result.value : {
          name: services[index].name,
          status: 'unhealthy',
          error: 'Promise rejected',
        }
      );

      const healthyServices = serviceResults.filter(s => s.status === 'healthy').length;
      const isHealthy = healthyServices > 0; // At least one service should be healthy

      return this.getStatus(key, isHealthy, {
        services: serviceResults,
        healthyCount: healthyServices,
        totalCount: services.length,
      });
    } catch (error) {
      this.logger.error('External services health check failed:', error);
      return this.getStatus(key, false, {
        error: error.message,
      });
    }
  }

  /**
   * Check critical services
   */
  async checkCriticalServices(key: string): Promise<HealthIndicatorResult> {
    try {
      const checks = await Promise.allSettled([
        this.checkDatabaseConnection(),
        this.checkTemporalConnection(),
        this.checkSystemResources(),
      ]);

      const results = checks.map(check => 
        check.status === 'fulfilled' ? check.value : { healthy: false, error: 'Check failed' }
      );

      const allHealthy = results.every(result => result.healthy);

      return this.getStatus(key, allHealthy, {
        database: results[0],
        temporal: results[1],
        system: results[2],
      });
    } catch (error) {
      this.logger.error('Critical services health check failed:', error);
      return this.getStatus(key, false, {
        error: error.message,
      });
    }
  }

  /**
   * Get detailed health status
   */
  async getDetailedHealthStatus(): Promise<DetailedHealthStatus> {
    const [
      databaseHealth,
      redisHealth,
      temporalHealth,
      externalApisHealth,
      systemHealth,
      applicationHealth,
    ] = await Promise.allSettled([
      this.getDatabaseHealth(),
      this.getRedisHealth(),
      this.getTemporalHealth(),
      this.getExternalApisHealth(),
      this.getSystemHealth(),
      this.getApplicationHealth(),
    ]);

    const services = {
      database: this.getServiceResult(databaseHealth),
      redis: this.getServiceResult(redisHealth),
      temporal: this.getServiceResult(temporalHealth),
      externalApis: this.getServiceResult(externalApisHealth),
    };

    const system = systemHealth.status === 'fulfilled' ? systemHealth.value : this.getDefaultSystemHealth();
    const application = applicationHealth.status === 'fulfilled' ? applicationHealth.value : this.getDefaultApplicationHealth();

    // Determine overall status
    const serviceStatuses = Object.values(services).map(s => s.status);
    const hasUnhealthy = serviceStatuses.includes('unhealthy');
    const hasDegraded = serviceStatuses.includes('degraded');
    
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (hasUnhealthy) overallStatus = 'unhealthy';
    else if (hasDegraded) overallStatus = 'degraded';

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
      version: process.env.npm_package_version || '1.0.0',
      environment: this.configService.get('NODE_ENV', 'development'),
      services,
      system,
      application,
    };
  }

  /**
   * Get health metrics for monitoring systems
   */
  async getHealthMetrics() {
    const uptime = Date.now() - this.startTime;
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    return {
      uptime_seconds: Math.floor(uptime / 1000),
      memory_heap_used_bytes: memoryUsage.heapUsed,
      memory_heap_total_bytes: memoryUsage.heapTotal,
      memory_rss_bytes: memoryUsage.rss,
      memory_external_bytes: memoryUsage.external,
      cpu_user_microseconds: cpuUsage.user,
      cpu_system_microseconds: cpuUsage.system,
      requests_total: this.healthMetrics.requestCount,
      errors_total: this.healthMetrics.errorCount,
      response_time_seconds: this.getAverageResponseTime(),
      error_rate: this.getErrorRate(),
      timestamp: Date.now(),
    };
  }

  /**
   * Record request metrics
   */
  recordRequest(responseTime: number, isError: boolean = false) {
    this.healthMetrics.requestCount++;
    this.healthMetrics.responseTimes.push(responseTime);
    this.healthMetrics.lastRequestTime = Date.now();

    if (isError) {
      this.healthMetrics.errorCount++;
    }

    // Keep only last 1000 response times for memory efficiency
    if (this.healthMetrics.responseTimes.length > 1000) {
      this.healthMetrics.responseTimes = this.healthMetrics.responseTimes.slice(-1000);
    }
  }

  // Private helper methods
  private async checkDatabaseConnection(): Promise<{ healthy: boolean; responseTime?: number; error?: string }> {
    try {
      const startTime = Date.now();
      await this.dataSource.query('SELECT 1');
      return {
        healthy: true,
        responseTime: Date.now() - startTime,
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
      };
    }
  }

  private async checkTemporalConnection(): Promise<{ healthy: boolean; error?: string }> {
    try {
      const isConnected = this.temporalClient.isTemporalConnected();
      return {
        healthy: isConnected,
        error: isConnected ? undefined : 'Not connected to Temporal',
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
      };
    }
  }

  private async checkSystemResources(): Promise<{ healthy: boolean; details?: any }> {
    const memoryUsage = process.memoryUsage();
    const memoryLimit = 1024 * 1024 * 1024; // 1GB limit
    const memoryHealthy = memoryUsage.heapUsed < memoryLimit * 0.9;

    const loadAverage = os.loadavg();
    const cpuCount = os.cpus().length;
    const loadHealthy = loadAverage[0] < cpuCount * 2; // Load should be less than 2x CPU count

    return {
      healthy: memoryHealthy && loadHealthy,
      details: {
        memory: {
          used: memoryUsage.heapUsed,
          limit: memoryLimit,
          healthy: memoryHealthy,
        },
        cpu: {
          load: loadAverage[0],
          cores: cpuCount,
          healthy: loadHealthy,
        },
      },
    };
  }

  private async getDatabaseHealth(): Promise<ServiceHealth> {
    try {
      const startTime = Date.now();
      await this.dataSource.query('SELECT 1');
      return {
        status: 'healthy',
        responseTime: Date.now() - startTime,
        lastCheck: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        lastCheck: new Date().toISOString(),
        error: error.message,
      };
    }
  }

  private async getRedisHealth(): Promise<ServiceHealth> {
    // Simulate Redis health check
    return {
      status: 'healthy',
      responseTime: 5,
      lastCheck: new Date().toISOString(),
    };
  }

  private async getTemporalHealth(): Promise<ServiceHealth> {
    const isConnected = this.temporalClient.isTemporalConnected();
    return {
      status: isConnected ? 'healthy' : 'degraded',
      lastCheck: new Date().toISOString(),
      error: isConnected ? undefined : 'Not connected to Temporal',
    };
  }

  private async getExternalApisHealth(): Promise<ServiceHealth> {
    // Simulate external API health check
    return {
      status: 'healthy',
      responseTime: 150,
      lastCheck: new Date().toISOString(),
    };
  }

  private async getSystemHealth() {
    const memoryUsage = process.memoryUsage();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const loadAverage = os.loadavg();

    return {
      memory: {
        used: totalMemory - freeMemory,
        total: totalMemory,
        percentage: ((totalMemory - freeMemory) / totalMemory) * 100,
        heap: {
          used: memoryUsage.heapUsed,
          total: memoryUsage.heapTotal,
          percentage: (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100,
        },
      },
      cpu: {
        usage: 0, // Would need additional monitoring for real CPU usage
        loadAverage,
        cores: os.cpus().length,
      },
      disk: {
        usage: 0, // Would need disk usage monitoring
        available: 0,
        total: 0,
        percentage: 0,
      },
      network: {
        connections: 0, // Would need network monitoring
        bandwidth: {
          in: 0,
          out: 0,
        },
      },
    };
  }

  private async getApplicationHealth() {
    const responseTimes = this.healthMetrics.responseTimes;
    const sortedTimes = [...responseTimes].sort((a, b) => a - b);
    
    return {
      activeConnections: 0, // Would need connection monitoring
      requestsPerSecond: this.getRequestsPerSecond(),
      errorRate: this.getErrorRate(),
      responseTime: {
        p50: this.getPercentile(sortedTimes, 50),
        p95: this.getPercentile(sortedTimes, 95),
        p99: this.getPercentile(sortedTimes, 99),
        average: this.getAverageResponseTime(),
      },
    };
  }

  private getServiceResult(result: PromiseSettledResult<ServiceHealth>): ServiceHealth {
    return result.status === 'fulfilled' ? result.value : {
      status: 'unhealthy',
      lastCheck: new Date().toISOString(),
      error: 'Health check failed',
    };
  }

  private getDefaultSystemHealth() {
    return {
      memory: { used: 0, total: 0, percentage: 0, heap: { used: 0, total: 0, percentage: 0 } },
      cpu: { usage: 0, loadAverage: [0, 0, 0], cores: 1 },
      disk: { usage: 0, available: 0, total: 0, percentage: 0 },
      network: { connections: 0, bandwidth: { in: 0, out: 0 } },
    };
  }

  private getDefaultApplicationHealth() {
    return {
      activeConnections: 0,
      requestsPerSecond: 0,
      errorRate: 0,
      responseTime: { p50: 0, p95: 0, p99: 0, average: 0 },
    };
  }

  private getAverageResponseTime(): number {
    const times = this.healthMetrics.responseTimes;
    return times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;
  }

  private getErrorRate(): number {
    return this.healthMetrics.requestCount > 0 
      ? this.healthMetrics.errorCount / this.healthMetrics.requestCount 
      : 0;
  }

  private getRequestsPerSecond(): number {
    const timeWindow = 60000; // 1 minute
    const now = Date.now();
    const windowStart = now - timeWindow;
    
    // This is a simplified calculation
    // In a real implementation, you'd track requests with timestamps
    return this.healthMetrics.requestCount / 60; // Rough estimate
  }

  private getPercentile(sortedArray: number[], percentile: number): number {
    if (sortedArray.length === 0) return 0;
    
    const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, Math.min(index, sortedArray.length - 1))];
  }
}
