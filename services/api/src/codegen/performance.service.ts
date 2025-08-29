import { Injectable } from '@nestjs/common';

export interface PerformanceMetric {
  operation: string;
  duration: number;
  timestamp: Date;
  success: boolean;
  metadata?: Record<string, any>;
}

export interface PerformanceThreshold {
  operation: string;
  p50: number;    // 50th percentile in ms
  p95: number;    // 95th percentile in ms
  p99: number;    // 99th percentile in ms
  maxDuration: number; // Maximum allowed duration in ms
}

export interface PerformanceReport {
  period: {
    start: Date;
    end: Date;
  };
  summary: {
    totalOperations: number;
    successfulOperations: number;
    failedOperations: number;
    averageDuration: number;
    medianDuration: number;
    p95Duration: number;
    p99Duration: number;
  };
  operations: {
    [operationName: string]: {
      count: number;
      successRate: number;
      averageDuration: number;
      p95Duration: number;
      p99Duration: number;
      slowest: number;
      fastest: number;
      violations: PerformanceViolation[];
    };
  };
  violations: PerformanceViolation[];
  recommendations: string[];
}

export interface PerformanceViolation {
  operation: string;
  threshold: keyof PerformanceThreshold;
  actualValue: number;
  expectedValue: number;
  timestamp: Date;
  severity: 'warning' | 'critical';
}

@Injectable()
export class PerformanceService {
  private readonly thresholds: Map<string, PerformanceThreshold> = new Map();
  private readonly metrics: PerformanceMetric[] = [];
  private readonly maxMetricsHistory = 10000; // Keep last 10k metrics

  constructor() {
    this.initializeThresholds();
  }

  private initializeThresholds() {
    // Set performance thresholds based on requirements
    this.thresholds.set('normalize', {
      operation: 'normalize',
      p50: 5000,    // 5 seconds
      p95: 20000,   // 20 seconds
      p99: 30000,   // 30 seconds
      maxDuration: 60000, // 1 minute
    });

    this.thresholds.set('codegen', {
      operation: 'codegen',
      p50: 3000,    // 3 seconds
      p95: 15000,   // 15 seconds
      p99: 25000,   // 25 seconds
      maxDuration: 45000, // 45 seconds
    });

    this.thresholds.set('export', {
      operation: 'export',
      p50: 2000,    // 2 seconds
      p95: 10000,   // 10 seconds
      p99: 15000,   // 15 seconds
      maxDuration: 30000, // 30 seconds
    });

    this.thresholds.set('guardrails', {
      operation: 'guardrails',
      p50: 1000,    // 1 second
      p95: 5000,    // 5 seconds
      p99: 8000,    // 8 seconds
      maxDuration: 15000, // 15 seconds
    });

    this.thresholds.set('sbom_generation', {
      operation: 'sbom_generation',
      p50: 500,     // 0.5 seconds
      p95: 2000,    // 2 seconds
      p99: 3000,    // 3 seconds
      maxDuration: 5000, // 5 seconds
    });

    this.thresholds.set('golden_suite', {
      operation: 'golden_suite',
      p50: 2000,    // 2 seconds
      p95: 8000,    // 8 seconds
      p99: 12000,   // 12 seconds
      maxDuration: 20000, // 20 seconds
    });
  }

  async recordMetric(
    operation: string,
    duration: number,
    success: boolean,
    metadata?: Record<string, any>
  ): Promise<void> {
    const metric: PerformanceMetric = {
      operation,
      duration,
      timestamp: new Date(),
      success,
      metadata,
    };

    this.metrics.push(metric);

    // Maintain history size
    if (this.metrics.length > this.maxMetricsHistory) {
      this.metrics.shift();
    }

    // Check for violations
    const threshold = this.thresholds.get(operation);
    if (threshold) {
      const violations = this.checkViolations(metric, threshold);
      if (violations.length > 0) {
        console.warn(`Performance violations detected for ${operation}:`, violations);
        // In a real system, this would trigger alerts
      }
    }
  }

  private checkViolations(metric: PerformanceMetric, threshold: PerformanceThreshold): PerformanceViolation[] {
    const violations: PerformanceViolation[] = [];

    // Check P95 violation (most important for user experience)
    if (metric.duration > threshold.p95) {
      violations.push({
        operation: metric.operation,
        threshold: 'p95',
        actualValue: metric.duration,
        expectedValue: threshold.p95,
        timestamp: metric.timestamp,
        severity: metric.duration > threshold.maxDuration ? 'critical' : 'warning',
      });
    }

    // Check max duration violation
    if (metric.duration > threshold.maxDuration) {
      violations.push({
        operation: metric.operation,
        threshold: 'maxDuration',
        actualValue: metric.duration,
        expectedValue: threshold.maxDuration,
        timestamp: metric.timestamp,
        severity: 'critical',
      });
    }

    return violations;
  }

  async generateReport(
    startDate?: Date,
    endDate?: Date
  ): Promise<PerformanceReport> {
    const start = startDate || new Date(Date.now() - 24 * 60 * 60 * 1000); // Last 24 hours
    const end = endDate || new Date();

    const relevantMetrics = this.metrics.filter(m =>
      m.timestamp >= start && m.timestamp <= end
    );

    const summary = this.calculateSummary(relevantMetrics);
    const operations = this.analyzeOperations(relevantMetrics);
    const violations = this.collectViolations(relevantMetrics);
    const recommendations = this.generateRecommendations(summary, operations, violations);

    return {
      period: { start, end },
      summary,
      operations,
      violations,
      recommendations,
    };
  }

  private calculateSummary(metrics: PerformanceMetric[]) {
    if (metrics.length === 0) {
      return {
        totalOperations: 0,
        successfulOperations: 0,
        failedOperations: 0,
        averageDuration: 0,
        medianDuration: 0,
        p95Duration: 0,
        p99Duration: 0,
      };
    }

    const sortedDurations = metrics.map(m => m.duration).sort((a, b) => a - b);
    const successfulOperations = metrics.filter(m => m.success).length;

    return {
      totalOperations: metrics.length,
      successfulOperations,
      failedOperations: metrics.length - successfulOperations,
      averageDuration: metrics.reduce((sum, m) => sum + m.duration, 0) / metrics.length,
      medianDuration: sortedDurations[Math.floor(sortedDurations.length / 2)],
      p95Duration: sortedDurations[Math.floor(sortedDurations.length * 0.95)],
      p99Duration: sortedDurations[Math.floor(sortedDurations.length * 0.99)],
    };
  }

  private analyzeOperations(metrics: PerformanceMetric[]) {
    const operations: Record<string, PerformanceMetric[]> = {};

    // Group metrics by operation
    metrics.forEach(metric => {
      if (!operations[metric.operation]) {
        operations[metric.operation] = [];
      }
      operations[metric.operation].push(metric);
    });

    const analysis: Record<string, any> = {};

    Object.entries(operations).forEach(([operation, opMetrics]) => {
      const durations = opMetrics.map(m => m.duration).sort((a, b) => a - b);
      const successful = opMetrics.filter(m => m.success);

      analysis[operation] = {
        count: opMetrics.length,
        successRate: (successful.length / opMetrics.length) * 100,
        averageDuration: durations.reduce((sum, d) => sum + d, 0) / durations.length,
        p95Duration: durations[Math.floor(durations.length * 0.95)] || 0,
        p99Duration: durations[Math.floor(durations.length * 0.99)] || 0,
        slowest: Math.max(...durations),
        fastest: Math.min(...durations),
        violations: this.collectViolations(opMetrics),
      };
    });

    return analysis;
  }

  private collectViolations(metrics: PerformanceMetric[]): PerformanceViolation[] {
    const violations: PerformanceViolation[] = [];

    metrics.forEach(metric => {
      const threshold = this.thresholds.get(metric.operation);
      if (threshold) {
        violations.push(...this.checkViolations(metric, threshold));
      }
    });

    return violations;
  }

  private generateRecommendations(
    summary: any,
    operations: Record<string, any>,
    violations: PerformanceViolation[]
  ): string[] {
    const recommendations: string[] = [];

    // Check overall performance
    if (summary.p95Duration > 30000) { // 30 seconds
      recommendations.push('Overall system performance is slow. Consider optimizing the most time-consuming operations.');
    }

    if (summary.failedOperations / summary.totalOperations > 0.1) { // >10% failure rate
      recommendations.push('High failure rate detected. Investigate and fix failing operations.');
    }

    // Check individual operations
    Object.entries(operations).forEach(([operation, stats]) => {
      if (stats.p95Duration > 10000 && operation !== 'export') { // 10 seconds for non-export ops
        recommendations.push(`Optimize ${operation} operation - P95 duration is ${Math.round(stats.p95Duration)}ms`);
      }

      if (stats.successRate < 95) {
        recommendations.push(`Improve reliability of ${operation} operation - success rate is ${stats.successRate.toFixed(1)}%`);
      }
    });

    // Check violations
    if (violations.some(v => v.severity === 'critical')) {
      recommendations.push('Critical performance violations detected. Immediate action required.');
    }

    if (violations.length > 0) {
      recommendations.push(`Address ${violations.length} performance violations to improve user experience.`);
    }

    return recommendations;
  }

  async benchmarkOperation<T>(
    operation: string,
    fn: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T> {
    const startTime = Date.now();

    try {
      const result = await fn();
      const duration = Date.now() - startTime;

      await this.recordMetric(operation, duration, true, metadata);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      await this.recordMetric(operation, duration, false, { ...metadata, error: error.message });
      throw error;
    }
  }

  getThresholds(): Record<string, PerformanceThreshold> {
    return Object.fromEntries(this.thresholds);
  }

  updateThreshold(operation: string, threshold: Partial<PerformanceThreshold>): void {
    const existing = this.thresholds.get(operation);
    if (existing) {
      this.thresholds.set(operation, { ...existing, ...threshold });
    }
  }

  getMetrics(
    operation?: string,
    limit: number = 100,
    offset: number = 0
  ): PerformanceMetric[] {
    let filteredMetrics = this.metrics;

    if (operation) {
      filteredMetrics = filteredMetrics.filter(m => m.operation === operation);
    }

    return filteredMetrics
      .slice(-limit - offset, -offset || undefined)
      .reverse(); // Most recent first
  }

  async getHealthStatus(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    message: string;
    metrics: {
      totalMetrics: number;
      recentViolations: number;
      averageResponseTime: number;
    };
  }> {
    const recentMetrics = this.metrics.slice(-100); // Last 100 metrics
    const recentViolations = recentMetrics.filter(m => {
      const threshold = this.thresholds.get(m.operation);
      return threshold && m.duration > threshold.p95;
    }).length;

    const averageResponseTime = recentMetrics.length > 0
      ? recentMetrics.reduce((sum, m) => sum + m.duration, 0) / recentMetrics.length
      : 0;

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    let message = 'All systems operating within performance thresholds.';

    if (recentViolations > 20) { // >20% of recent metrics violated thresholds
      status = 'unhealthy';
      message = 'Critical performance issues detected. Immediate attention required.';
    } else if (recentViolations > 5) { // >5% of recent metrics violated thresholds
      status = 'degraded';
      message = 'Performance degradation detected. Monitoring recommended.';
    }

    return {
      status,
      message,
      metrics: {
        totalMetrics: this.metrics.length,
        recentViolations,
        averageResponseTime: Math.round(averageResponseTime),
      },
    };
  }
}
