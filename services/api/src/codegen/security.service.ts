import { Injectable } from '@nestjs/common';

export interface PIIDetectionResult {
  hasPII: boolean;
  piiFields: string[];
  redactedData: any;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  recommendations: string[];
}

export interface SecurityAuditEntry {
  id: string;
  timestamp: Date;
  operation: string;
  userId?: string;
  projectId?: string;
  ipAddress?: string;
  userAgent?: string;
  action: string;
  resource: string;
  success: boolean;
  details?: Record<string, any>;
  riskScore: number;
  flagged: boolean;
  flagReason?: string;
}

export interface SecurityHeadersCheck {
  missingHeaders: string[];
  insecureHeaders: string[];
  recommendations: string[];
  score: number;
}

export interface RateLimitAnalysis {
  requestsPerMinute: number;
  requestsPerHour: number;
  suspiciousPatterns: string[];
  blockedRequests: number;
  recommendations: string[];
}

@Injectable()
export class SecurityService {
  private readonly piiPatterns = new Map<string, RegExp>([
    ['email', /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g],
    ['phone', /(\+?\d{1,3}[-.\s]?)?\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})\b/g],
    ['ssn', /\b\d{3}-\d{2}-\d{4}\b/g],
    ['credit_card', /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g],
    ['api_key', /\b[A-Za-z0-9]{20,}\b/g], // Generic API key pattern
    ['jwt_token', /\beyJ[A-Za-z0-9-_]*\.[A-Za-z0-9-_]*\.[A-Za-z0-9-_]*\b/g],
    ['password', /password["\s]*:[\s"]*[^"\s,]+/gi],
    ['secret', /secret["\s]*:[\s"]*[^"\s,]+/gi],
    ['token', /token["\s]*:[\s"]*[^"\s,]+/gi],
  ]);

  private readonly piiFieldNames = new Set([
    'email', 'phone', 'ssn', 'social_security', 'credit_card', 'card_number',
    'password', 'passwd', 'secret', 'token', 'api_key', 'apikey', 'auth_token',
    'jwt', 'bearer', 'authorization', 'firstname', 'lastname', 'fullname',
    'address', 'zipcode', 'postal_code', 'birthdate', 'dob', 'age'
  ]);

  private readonly securityHeaders = new Map([
    ['Strict-Transport-Security', 'max-age=31536000; includeSubDomains'],
    ['X-Content-Type-Options', 'nosniff'],
    ['X-Frame-Options', 'DENY'],
    ['X-XSS-Protection', '1; mode=block'],
    ['Content-Security-Policy', "default-src 'self'"],
    ['Referrer-Policy', 'strict-origin-when-cross-origin'],
    ['Permissions-Policy', 'geolocation=(), microphone=(), camera=()'],
  ]);

  private readonly auditLog: SecurityAuditEntry[] = [];
  private readonly maxAuditLogSize = 10000;

  constructor() {}

  async detectAndRedactPII(data: any, context: string = 'general'): Promise<PIIDetectionResult> {
    const piiFields: string[] = [];
    const redactedData = JSON.parse(JSON.stringify(data)); // Deep clone

    this.scanForPII(redactedData, '', piiFields);

    // Redact detected PII
    for (const field of piiFields) {
      this.redactField(redactedData, field);
    }

    const riskLevel = this.calculateRiskLevel(piiFields, context);
    const recommendations = this.generatePIRecommendations(piiFields, riskLevel);

    return {
      hasPII: piiFields.length > 0,
      piiFields,
      redactedData,
      riskLevel,
      recommendations,
    };
  }

  private scanForPII(obj: any, path: string, piiFields: string[]): void {
    if (obj === null || obj === undefined) return;

    if (typeof obj === 'string') {
      // Check against regex patterns
      for (const [type, pattern] of this.piiPatterns) {
        if (pattern.test(obj)) {
          piiFields.push(path || type);
          break;
        }
      }
      return;
    }

    if (Array.isArray(obj)) {
      obj.forEach((item, index) => {
        this.scanForPII(item, `${path}[${index}]`, piiFields);
      });
      return;
    }

    if (typeof obj === 'object') {
      for (const [key, value] of Object.entries(obj)) {
        const currentPath = path ? `${path}.${key}` : key;

        // Check if field name suggests PII
        if (this.piiFieldNames.has(key.toLowerCase())) {
          piiFields.push(currentPath);
        }

        // Recursively scan nested objects
        this.scanForPII(value, currentPath, piiFields);
      }
    }
  }

  private redactField(obj: any, fieldPath: string): void {
    const pathParts = fieldPath.split('.');
    let current = obj;

    for (let i = 0; i < pathParts.length - 1; i++) {
      const part = pathParts[i];
      if (part.includes('[')) {
        const [arrayName, indexStr] = part.split('[');
        const index = parseInt(indexStr.replace(']', ''));
        if (!current[arrayName]) current[arrayName] = [];
        if (!current[arrayName][index]) current[arrayName][index] = {};
        current = current[arrayName][index];
      } else {
        if (!current[part]) current[part] = {};
        current = current[part];
      }
    }

    const lastPart = pathParts[pathParts.length - 1];
    if (lastPart.includes('[')) {
      const [arrayName, indexStr] = lastPart.split('[');
      const index = parseInt(indexStr.replace(']', ''));
      if (current[arrayName] && current[arrayName][index] !== undefined) {
        current[arrayName][index] = '[REDACTED]';
      }
    } else {
      current[lastPart] = '[REDACTED]';
    }
  }

  private calculateRiskLevel(piiFields: string[], context: string): 'low' | 'medium' | 'high' | 'critical' {
    if (piiFields.length === 0) return 'low';

    const hasSensitiveData = piiFields.some(field =>
      field.toLowerCase().includes('password') ||
      field.toLowerCase().includes('ssn') ||
      field.toLowerCase().includes('credit_card') ||
      field.toLowerCase().includes('secret')
    );

    const hasAuthData = piiFields.some(field =>
      field.toLowerCase().includes('token') ||
      field.toLowerCase().includes('jwt') ||
      field.toLowerCase().includes('api_key')
    );

    if (hasSensitiveData || (hasAuthData && context === 'logs')) {
      return 'critical';
    }

    if (hasAuthData || piiFields.length > 5) {
      return 'high';
    }

    if (piiFields.length > 2) {
      return 'medium';
    }

    return 'low';
  }

  private generatePIRecommendations(piiFields: string[], riskLevel: string): string[] {
    const recommendations: string[] = [];

    if (piiFields.length === 0) {
      recommendations.push('No PII detected in the data');
      return recommendations;
    }

    if (riskLevel === 'critical') {
      recommendations.push('CRITICAL: Implement immediate log redaction and data sanitization');
      recommendations.push('Review data handling practices to prevent PII exposure');
      recommendations.push('Consider implementing data masking at the source');
    }

    if (piiFields.some(f => f.toLowerCase().includes('password'))) {
      recommendations.push('Never log passwords or authentication credentials');
    }

    if (piiFields.some(f => f.toLowerCase().includes('token') || f.toLowerCase().includes('jwt'))) {
      recommendations.push('Implement token redaction in logs and error messages');
    }

    recommendations.push('Use structured logging with PII detection');
    recommendations.push('Implement log aggregation with automatic PII redaction');
    recommendations.push('Regular security audits of log data');

    return recommendations;
  }

  async checkSecurityHeaders(headers: Record<string, string>): Promise<SecurityHeadersCheck> {
    const missingHeaders: string[] = [];
    const insecureHeaders: string[] = [];
    const recommendations: string[] = [];

    // Check for required security headers
    for (const [header, expectedValue] of this.securityHeaders) {
      if (!headers[header]) {
        missingHeaders.push(header);
        recommendations.push(`Add ${header} header`);
      } else if (header === 'Content-Security-Policy' && headers[header] === "'unsafe-inline'") {
        insecureHeaders.push(header);
        recommendations.push('Avoid unsafe-inline in CSP');
      }
    }

    // Check for insecure headers
    if (headers['X-Powered-By']) {
      insecureHeaders.push('X-Powered-By');
      recommendations.push('Remove X-Powered-By header to avoid information disclosure');
    }

    const score = Math.max(0, 100 - (missingHeaders.length * 15) - (insecureHeaders.length * 10));

    return {
      missingHeaders,
      insecureHeaders,
      recommendations,
      score,
    };
  }

  async logSecurityEvent(
    operation: string,
    userId?: string,
    projectId?: string,
    details?: Record<string, any>,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    // Detect PII in details and redact if necessary
    const sanitizedDetails = details ? await this.detectAndRedactPII(details, 'audit') : undefined;

    const riskScore = this.calculateAuditRisk(operation, sanitizedDetails?.piiFields || []);

    const entry: SecurityAuditEntry = {
      id: this.generateAuditId(),
      timestamp: new Date(),
      operation,
      userId,
      projectId,
      ipAddress,
      userAgent,
      action: operation,
      resource: projectId ? `project:${projectId}` : 'system',
      success: true,
      details: sanitizedDetails?.redactedData,
      riskScore,
      flagged: riskScore > 70,
      flagReason: riskScore > 70 ? 'High risk operation detected' : undefined,
    };

    this.auditLog.push(entry);

    // Maintain log size
    if (this.auditLog.length > this.maxAuditLogSize) {
      this.auditLog.shift();
    }

    // Log high-risk events
    if (entry.flagged) {
      console.warn('SECURITY ALERT:', {
        operation: entry.operation,
        riskScore: entry.riskScore,
        userId: entry.userId,
        projectId: entry.projectId,
        timestamp: entry.timestamp,
      });
    }
  }

  private calculateAuditRisk(operation: string, piiFields: string[]): number {
    let risk = 0;

    // Base risk by operation
    const operationRisks: Record<string, number> = {
      'export_repository': 30,
      'generate_code': 20,
      'delete_project': 40,
      'access_sensitive_data': 50,
      'authentication': 25,
      'authorization': 20,
    };

    risk += operationRisks[operation] || 10;

    // PII increases risk
    risk += piiFields.length * 15;

    // High-risk PII types
    const highRiskPII = ['password', 'secret', 'ssn', 'credit_card'];
    const hasHighRiskPII = piiFields.some(field =>
      highRiskPII.some(type => field.toLowerCase().includes(type))
    );

    if (hasHighRiskPII) {
      risk += 30;
    }

    return Math.min(100, risk);
  }

  private generateAuditId(): string {
    return `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async analyzeRateLimiting(
    requests: Array<{ timestamp: Date; ip: string; userId?: string; endpoint: string }>
  ): Promise<RateLimitAnalysis> {
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const recentRequests = requests.filter(r => r.timestamp > oneMinuteAgo);
    const hourlyRequests = requests.filter(r => r.timestamp > oneHourAgo);

    const requestsPerMinute = recentRequests.length;
    const requestsPerHour = hourlyRequests.length;

    const suspiciousPatterns: string[] = [];
    const recommendations: string[] = [];

    // Detect suspicious patterns
    const ipCounts = new Map<string, number>();
    const userCounts = new Map<string, number>();
    const endpointCounts = new Map<string, number>();

    for (const req of recentRequests) {
      ipCounts.set(req.ip, (ipCounts.get(req.ip) || 0) + 1);
      if (req.userId) {
        userCounts.set(req.userId, (userCounts.get(req.userId) || 0) + 1);
      }
      endpointCounts.set(req.endpoint, (endpointCounts.get(req.endpoint) || 0) + 1);
    }

    // Check for IP-based attacks
    for (const [ip, count] of ipCounts) {
      if (count > 30) { // More than 30 requests per minute from one IP
        suspiciousPatterns.push(`High request rate from IP ${ip}: ${count}/min`);
      }
    }

    // Check for user-based abuse
    for (const [userId, count] of userCounts) {
      if (count > 20) {
        suspiciousPatterns.push(`High request rate from user ${userId}: ${count}/min`);
      }
    }

    // Check for endpoint abuse
    for (const [endpoint, count] of endpointCounts) {
      if (count > 10) {
        suspiciousPatterns.push(`High request rate to ${endpoint}: ${count}/min`);
      }
    }

    // Generate recommendations
    if (suspiciousPatterns.length > 0) {
      recommendations.push('Implement rate limiting based on IP and user');
      recommendations.push('Consider implementing CAPTCHA for suspicious traffic');
      recommendations.push('Monitor for DDoS attack patterns');
    }

    if (requestsPerMinute > 100) {
      recommendations.push('Overall request rate is high - consider scaling');
    }

    const blockedRequests = recentRequests.length - Math.min(recentRequests.length, 60); // Assuming 60 req/min limit

    return {
      requestsPerMinute,
      requestsPerHour,
      suspiciousPatterns,
      blockedRequests: Math.max(0, blockedRequests),
      recommendations,
    };
  }

  async performSecurityReview(data: any): Promise<{
    overallScore: number;
    issues: string[];
    recommendations: string[];
    riskAssessment: string;
  }> {
    const issues: string[] = [];
    const recommendations: string[] = [];
    let score = 100;

    // Check for PII
    const piiResult = await this.detectAndRedactPII(data, 'review');
    if (piiResult.hasPII) {
      issues.push(`PII detected: ${piiResult.piiFields.join(', ')}`);
      score -= piiResult.piiFields.length * 10;
    }

    // Check for security headers (if it's an HTTP response)
    if (data.headers) {
      const headerCheck = await this.checkSecurityHeaders(data.headers);
      if (headerCheck.missingHeaders.length > 0) {
        issues.push(`Missing security headers: ${headerCheck.missingHeaders.join(', ')}`);
        score -= headerCheck.missingHeaders.length * 5;
      }
      if (headerCheck.insecureHeaders.length > 0) {
        issues.push(`Insecure headers: ${headerCheck.insecureHeaders.join(', ')}`);
        score -= headerCheck.insecureHeaders.length * 10;
      }
    }

    // Check for insecure configurations
    if (data.database?.url?.includes('password')) {
      issues.push('Database URL contains password in plain text');
      score -= 20;
      recommendations.push('Use environment variables for database credentials');
    }

    if (data.api?.keys?.some((key: string) => key.length < 20)) {
      issues.push('API keys are too short or potentially weak');
      score -= 15;
      recommendations.push('Use strong, randomly generated API keys (32+ characters)');
    }

    // Generate risk assessment
    let riskAssessment = 'Low Risk';
    if (score < 70) riskAssessment = 'High Risk';
    else if (score < 85) riskAssessment = 'Medium Risk';

    return {
      overallScore: Math.max(0, score),
      issues,
      recommendations: [...recommendations, ...piiResult.recommendations],
      riskAssessment,
    };
  }

  getAuditLog(limit: number = 100, filter?: { userId?: string; operation?: string; flagged?: boolean }): SecurityAuditEntry[] {
    let filtered = this.auditLog;

    if (filter?.userId) {
      filtered = filtered.filter(entry => entry.userId === filter.userId);
    }

    if (filter?.operation) {
      filtered = filtered.filter(entry => entry.operation === filter.operation);
    }

    if (filter?.flagged !== undefined) {
      filtered = filtered.filter(entry => entry.flagged === filter.flagged);
    }

    return filtered.slice(-limit).reverse();
  }

  getSecurityMetrics(): {
    totalEvents: number;
    highRiskEvents: number;
    piiIncidents: number;
    averageRiskScore: number;
    recentActivity: SecurityAuditEntry[];
  } {
    const highRiskEvents = this.auditLog.filter(entry => entry.flagged).length;
    const totalRiskScore = this.auditLog.reduce((sum, entry) => sum + entry.riskScore, 0);
    const averageRiskScore = this.auditLog.length > 0 ? totalRiskScore / this.auditLog.length : 0;

    // Count PII incidents (entries with redacted data)
    const piiIncidents = this.auditLog.filter(entry =>
      entry.details && JSON.stringify(entry.details).includes('[REDACTED]')
    ).length;

    return {
      totalEvents: this.auditLog.length,
      highRiskEvents,
      piiIncidents,
      averageRiskScore: Math.round(averageRiskScore * 100) / 100,
      recentActivity: this.auditLog.slice(-10).reverse(),
    };
  }
}
