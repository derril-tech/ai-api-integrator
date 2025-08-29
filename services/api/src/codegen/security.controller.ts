import { Controller, Get, Post, Body, Query, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SecurityService, PIIDetectionResult, SecurityAuditEntry } from './security.service';

class AnalyzeDataDto {
  data: any;
  context?: string;
}

class LogSecurityEventDto {
  operation: string;
  userId?: string;
  projectId?: string;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

class RateLimitAnalysisDto {
  requests: Array<{
    timestamp: Date;
    ip: string;
    userId?: string;
    endpoint: string;
  }>;
}

@ApiTags('security')
@Controller('security')
export class SecurityController {
  constructor(private readonly securityService: SecurityService) {}

  @Post('pii/analyze')
  @ApiOperation({ summary: 'Analyze data for PII and redact sensitive information' })
  @ApiResponse({ status: 200, description: 'PII analysis completed' })
  async analyzePII(@Body() analyzeDto: AnalyzeDataDto): Promise<PIIDetectionResult> {
    return this.securityService.detectAndRedactPII(analyzeDto.data, analyzeDto.context);
  }

  @Post('headers/check')
  @ApiOperation({ summary: 'Check security headers in HTTP response' })
  @ApiResponse({ status: 200, description: 'Security headers analysis completed' })
  async checkSecurityHeaders(@Body() body: { headers: Record<string, string> }) {
    return this.securityService.checkSecurityHeaders(body.headers);
  }

  @Post('audit/log')
  @ApiOperation({ summary: 'Log a security event' })
  @ApiResponse({ status: 201, description: 'Security event logged' })
  async logSecurityEvent(@Body() eventDto: LogSecurityEventDto): Promise<{ success: boolean; eventId?: string }> {
    try {
      await this.securityService.logSecurityEvent(
        eventDto.operation,
        eventDto.userId,
        eventDto.projectId,
        eventDto.details,
        eventDto.ipAddress,
        eventDto.userAgent
      );
      return { success: true };
    } catch (error) {
      return { success: false };
    }
  }

  @Post('rate-limit/analyze')
  @ApiOperation({ summary: 'Analyze request patterns for rate limiting violations' })
  @ApiResponse({ status: 200, description: 'Rate limit analysis completed' })
  async analyzeRateLimiting(@Body() analysisDto: RateLimitAnalysisDto) {
    return this.securityService.analyzeRateLimiting(analysisDto.requests);
  }

  @Post('review')
  @ApiOperation({ summary: 'Perform comprehensive security review' })
  @ApiResponse({ status: 200, description: 'Security review completed' })
  async performSecurityReview(@Body() body: { data: any }) {
    return this.securityService.performSecurityReview(body.data);
  }

  @Get('audit')
  @ApiOperation({ summary: 'Get security audit log' })
  @ApiResponse({ status: 200, description: 'Audit log retrieved' })
  getAuditLog(
    @Query('limit') limit?: number,
    @Query('userId') userId?: string,
    @Query('operation') operation?: string,
    @Query('flagged') flagged?: boolean
  ): SecurityAuditEntry[] {
    const filter = {
      userId,
      operation,
      flagged: flagged !== undefined ? flagged : undefined,
    };

    return this.securityService.getAuditLog(limit || 100, filter);
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Get security metrics and statistics' })
  @ApiResponse({ status: 200, description: 'Security metrics retrieved' })
  getSecurityMetrics() {
    return this.securityService.getSecurityMetrics();
  }

  @Get('audit/:eventId')
  @ApiOperation({ summary: 'Get specific audit event details' })
  @ApiResponse({ status: 200, description: 'Audit event retrieved' })
  getAuditEvent(@Param('eventId') eventId: string) {
    const auditLog = this.securityService.getAuditLog(1000);
    const event = auditLog.find(entry => entry.id === eventId);

    if (!event) {
      return { error: 'Audit event not found' };
    }

    return event;
  }

  @Get('alerts')
  @ApiOperation({ summary: 'Get active security alerts' })
  @ApiResponse({ status: 200, description: 'Security alerts retrieved' })
  getSecurityAlerts() {
    const metrics = this.securityService.getSecurityMetrics();
    const auditLog = this.securityService.getAuditLog(100);

    const alerts = [];

    // High-risk events
    const highRiskEvents = auditLog.filter(entry => entry.flagged);
    if (highRiskEvents.length > 0) {
      alerts.push({
        type: 'high_risk_activity',
        severity: 'high',
        message: `${highRiskEvents.length} high-risk security events detected`,
        details: highRiskEvents.slice(0, 5),
        timestamp: new Date(),
      });
    }

    // PII incidents
    if (metrics.piiIncidents > 0) {
      alerts.push({
        type: 'pii_incident',
        severity: 'medium',
        message: `${metrics.piiIncidents} PII incidents detected in logs`,
        details: { totalIncidents: metrics.piiIncidents },
        timestamp: new Date(),
      });
    }

    // Abnormal activity patterns
    const recentActivity = auditLog.slice(0, 10);
    const failedOperations = recentActivity.filter(entry => !entry.success);
    if (failedOperations.length > recentActivity.length * 0.5) {
      alerts.push({
        type: 'high_failure_rate',
        severity: 'medium',
        message: 'High rate of failed operations detected',
        details: {
          failedCount: failedOperations.length,
          totalCount: recentActivity.length,
          failureRate: Math.round((failedOperations.length / recentActivity.length) * 100)
        },
        timestamp: new Date(),
      });
    }

    return {
      alerts,
      summary: {
        totalAlerts: alerts.length,
        highSeverity: alerts.filter(a => a.severity === 'high').length,
        mediumSeverity: alerts.filter(a => a.severity === 'medium').length,
        lastUpdated: new Date(),
      },
    };
  }

  @Get('health')
  @ApiOperation({ summary: 'Get security health status' })
  @ApiResponse({ status: 200, description: 'Security health status retrieved' })
  getSecurityHealth() {
    const metrics = this.securityService.getSecurityMetrics();

    let status = 'healthy';
    let message = 'Security posture is good';

    if (metrics.highRiskEvents > 10) {
      status = 'critical';
      message = 'Critical security issues detected - immediate action required';
    } else if (metrics.highRiskEvents > 5 || metrics.piiIncidents > 0) {
      status = 'warning';
      message = 'Security concerns detected - review recommended';
    }

    return {
      status,
      message,
      metrics,
      recommendations: this.generateHealthRecommendations(metrics),
      timestamp: new Date(),
    };
  }

  private generateHealthRecommendations(metrics: any): string[] {
    const recommendations = [];

    if (metrics.highRiskEvents > 5) {
      recommendations.push('Review high-risk security events in audit log');
      recommendations.push('Consider implementing additional access controls');
    }

    if (metrics.piiIncidents > 0) {
      recommendations.push('Review PII handling and redaction procedures');
      recommendations.push('Ensure all logs are properly sanitized');
    }

    if (metrics.averageRiskScore > 30) {
      recommendations.push('Average risk score is elevated - review security policies');
    }

    if (recommendations.length === 0) {
      recommendations.push('Security posture is healthy - continue monitoring');
    }

    return recommendations;
  }
}
