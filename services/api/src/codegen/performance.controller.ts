import { Controller, Get, Post, Query, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PerformanceService, PerformanceReport } from './performance.service';

class PerformanceQueryDto {
  operation?: string;
  limit?: number;
  offset?: number;
  startDate?: string;
  endDate?: string;
}

@ApiTags('performance')
@Controller('performance')
export class PerformanceController {
  constructor(private readonly performanceService: PerformanceService) {}

  @Get('health')
  @ApiOperation({ summary: 'Get performance health status' })
  @ApiResponse({ status: 200, description: 'Performance health status' })
  async getHealthStatus() {
    return this.performanceService.getHealthStatus();
  }

  @Get('thresholds')
  @ApiOperation({ summary: 'Get performance thresholds' })
  @ApiResponse({ status: 200, description: 'Performance thresholds' })
  getThresholds() {
    return {
      thresholds: this.performanceService.getThresholds(),
      lastUpdated: new Date().toISOString(),
    };
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Get performance metrics' })
  @ApiResponse({ status: 200, description: 'Performance metrics' })
  getMetrics(@Query() query: PerformanceQueryDto) {
    const limit = query.limit || 100;
    const offset = query.offset || 0;

    const metrics = this.performanceService.getMetrics(query.operation, limit, offset);

    return {
      metrics,
      pagination: {
        limit,
        offset,
        total: metrics.length,
        hasMore: metrics.length === limit,
      },
      filters: {
        operation: query.operation || 'all',
      },
    };
  }

  @Post('report')
  @ApiOperation({ summary: 'Generate performance report' })
  @ApiResponse({ status: 200, description: 'Performance report' })
  async generateReport(@Query() query: PerformanceQueryDto): Promise<PerformanceReport> {
    const startDate = query.startDate ? new Date(query.startDate) : undefined;
    const endDate = query.endDate ? new Date(query.endDate) : undefined;

    return this.performanceService.generateReport(startDate, endDate);
  }

  @Get('operations/:operation/stats')
  @ApiOperation({ summary: 'Get operation performance statistics' })
  @ApiResponse({ status: 200, description: 'Operation statistics' })
  async getOperationStats(@Param('operation') operation: string) {
    const metrics = this.performanceService.getMetrics(operation, 1000);

    if (metrics.length === 0) {
      return {
        operation,
        message: 'No metrics found for this operation',
        stats: null,
      };
    }

    const durations = metrics.map(m => m.duration).sort((a, b) => a - b);
    const successful = metrics.filter(m => m.success);

    const stats = {
      total: metrics.length,
      successful: successful.length,
      failed: metrics.length - successful.length,
      successRate: (successful.length / metrics.length) * 100,
      averageDuration: durations.reduce((sum, d) => sum + d, 0) / durations.length,
      medianDuration: durations[Math.floor(durations.length / 2)],
      p95Duration: durations[Math.floor(durations.length * 0.95)],
      p99Duration: durations[Math.floor(durations.length * 0.99)],
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      timeRange: {
        from: metrics[metrics.length - 1]?.timestamp,
        to: metrics[0]?.timestamp,
      },
    };

    return {
      operation,
      stats,
      threshold: this.performanceService.getThresholds()[operation],
      lastUpdated: new Date().toISOString(),
    };
  }

  @Get('alerts')
  @ApiOperation({ summary: 'Get active performance alerts' })
  @ApiResponse({ status: 200, description: 'Active performance alerts' })
  async getAlerts() {
    const report = await this.performanceService.generateReport(
      new Date(Date.now() - 60 * 60 * 1000), // Last hour
      new Date()
    );

    const alerts = report.violations.map(violation => ({
      id: `${violation.operation}-${violation.timestamp.getTime()}`,
      operation: violation.operation,
      message: `${violation.operation} exceeded ${violation.threshold} threshold`,
      severity: violation.severity,
      actualValue: violation.actualValue,
      expectedValue: violation.expectedValue,
      timestamp: violation.timestamp,
    }));

    return {
      alerts,
      summary: {
        total: alerts.length,
        critical: alerts.filter(a => a.severity === 'critical').length,
        warning: alerts.filter(a => a.severity === 'warning').length,
      },
      period: report.period,
    };
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Get performance dashboard data' })
  @ApiResponse({ status: 200, description: 'Performance dashboard data' })
  async getDashboard() {
    const health = await this.performanceService.getHealthStatus();
    const report = await this.performanceService.generateReport(
      new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
      new Date()
    );

    // Calculate trends
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const sixHoursAgo = now - 6 * 60 * 60 * 1000;

    const recentMetrics = this.performanceService.getMetrics(undefined, 1000).filter(
      m => m.timestamp.getTime() > oneHourAgo
    );

    const olderMetrics = this.performanceService.getMetrics(undefined, 1000).filter(
      m => m.timestamp.getTime() > sixHoursAgo && m.timestamp.getTime() <= oneHourAgo
    );

    const currentAvg = recentMetrics.length > 0
      ? recentMetrics.reduce((sum, m) => sum + m.duration, 0) / recentMetrics.length
      : 0;

    const previousAvg = olderMetrics.length > 0
      ? olderMetrics.reduce((sum, m) => sum + m.duration, 0) / olderMetrics.length
      : 0;

    const trend = previousAvg > 0 ? ((currentAvg - previousAvg) / previousAvg) * 100 : 0;

    return {
      health,
      summary: report.summary,
      trend: {
        direction: trend > 5 ? 'up' : trend < -5 ? 'down' : 'stable',
        percentage: Math.round(Math.abs(trend) * 100) / 100,
        description: trend > 5 ? 'Performance degraded' :
                    trend < -5 ? 'Performance improved' :
                    'Performance stable'
      },
      topOperations: Object.entries(report.operations)
        .sort(([, a], [, b]) => b.count - a.count)
        .slice(0, 5)
        .map(([name, stats]) => ({
          name,
          count: stats.count,
          avgDuration: Math.round(stats.averageDuration),
          successRate: Math.round(stats.successRate * 100) / 100,
        })),
      recentViolations: report.violations
        .filter(v => v.timestamp.getTime() > now - 60 * 60 * 1000) // Last hour
        .slice(0, 10),
      recommendations: report.recommendations.slice(0, 5),
      lastUpdated: new Date().toISOString(),
    };
  }
}
