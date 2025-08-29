import { Injectable } from '@nestjs/common';
import { GoldenSuitesService, GoldenSuiteResult } from './golden-suites.service';

export interface CIReport {
  projectId: string;
  branch: string;
  commit: string;
  timestamp: string;
  results: GoldenSuiteResult[];
  overallStatus: 'SUCCESS' | 'FAILURE' | 'ERROR';
  coverage: number;
  duration: number;
  artifacts: CIArtifact[];
}

export interface CIArtifact {
  name: string;
  type: 'report' | 'coverage' | 'logs';
  path: string;
  content?: string;
}

export interface MockServerConfig {
  port: number;
  apiSpec: any;
  responses: MockResponse[];
}

export interface MockResponse {
  path: string;
  method: string;
  status: number;
  body: any;
  delay?: number;
}

@Injectable()
export class CIIntegrationService {
  private mockServers: Map<string, any> = new Map();

  constructor(private readonly goldenSuitesService: GoldenSuitesService) {}

  async runCISuites(
    projectId: string,
    branch: string = 'main',
    commit: string = 'HEAD'
  ): Promise<CIReport> {
    const startTime = Date.now();
    const suites = this.goldenSuitesService.getAvailableSuites();
    const results: GoldenSuiteResult[] = [];

    // Start mock servers for each suite
    for (const suiteName of suites) {
      await this.startMockServer(suiteName);
    }

    try {
      // Run all golden suites
      for (const suiteName of suites) {
        const result = await this.goldenSuitesService.runGoldenSuite(suiteName, projectId);
        results.push(result);
      }

      const duration = Date.now() - startTime;
      const overallStatus = this.determineOverallStatus(results);
      const coverage = this.calculateAverageCoverage(results);

      const report: CIReport = {
        projectId,
        branch,
        commit,
        timestamp: new Date().toISOString(),
        results,
        overallStatus,
        coverage,
        duration,
        artifacts: this.generateArtifacts(results, projectId)
      };

      // Generate JUnit XML for CI systems
      report.artifacts.push({
        name: 'junit-report.xml',
        type: 'report',
        path: 'reports/junit-report.xml',
        content: this.generateJUnitXML(results)
      });

      return report;

    } finally {
      // Clean up mock servers
      for (const suiteName of suites) {
        await this.stopMockServer(suiteName);
      }
    }
  }

  private async startMockServer(suiteName: string): Promise<void> {
    const suite = this.goldenSuitesService.getSuiteSpec(suiteName);
    if (!suite) return;

    // Create mock responses based on the API spec
    const mockResponses = this.generateMockResponses(suite);

    const config: MockServerConfig = {
      port: this.getMockServerPort(suiteName),
      apiSpec: suite,
      responses: mockResponses
    };

    // In a real implementation, this would start an actual HTTP server
    // For now, we'll just store the configuration
    this.mockServers.set(suiteName, config);
  }

  private async stopMockServer(suiteName: string): Promise<void> {
    // Clean up mock server
    this.mockServers.delete(suiteName);
  }

  private generateMockResponses(suite: any): MockResponse[] {
    const responses: MockResponse[] = [];

    for (const endpoint of suite.endpoints) {
      const mockResponse = this.generateMockResponse(endpoint);
      responses.push(mockResponse);
    }

    return responses;
  }

  private generateMockResponse(endpoint: any): MockResponse {
    let body: any = {};

    // Generate mock data based on endpoint
    if (endpoint.responses && endpoint.responses.length > 0) {
      const successResponse = endpoint.responses.find((r: any) => r.status >= 200 && r.status < 300);
      if (successResponse && successResponse.schema) {
        body = this.generateMockDataFromSchema(successResponse.schema);
      }
    }

    return {
      path: endpoint.path,
      method: endpoint.method,
      status: 200,
      body,
      delay: Math.random() * 100 // Random delay up to 100ms
    };
  }

  private generateMockDataFromSchema(schema: any): any {
    if (!schema) return {};

    switch (schema.type) {
      case 'string':
        if (schema.format === 'email') return 'test@example.com';
        if (schema.enum) return schema.enum[0];
        return 'mock-string';

      case 'number':
        return 42;

      case 'boolean':
        return true;

      case 'array':
        return [
          this.generateMockDataFromSchema(schema.items || { type: 'string' }),
          this.generateMockDataFromSchema(schema.items || { type: 'string' })
        ];

      case 'object':
        const obj: any = {};
        if (schema.properties) {
          for (const [key, propSchema] of Object.entries(schema.properties)) {
            obj[key] = this.generateMockDataFromSchema(propSchema as any);
          }
        }
        return obj;

      default:
        return {};
    }
  }

  private getMockServerPort(suiteName: string): number {
    const ports = {
      'stripe-like': 3001,
      'salesforce-like': 3002
    };
    return ports[suiteName as keyof typeof ports] || 3000;
  }

  private determineOverallStatus(results: GoldenSuiteResult[]): 'SUCCESS' | 'FAILURE' | 'ERROR' {
    if (results.some(r => 'error' in r)) return 'ERROR';
    if (results.every(r => r.passed)) return 'SUCCESS';
    return 'FAILURE';
  }

  private calculateAverageCoverage(results: GoldenSuiteResult[]): number {
    const validResults = results.filter(r => r.coverage !== undefined);
    if (validResults.length === 0) return 0;

    const totalCoverage = validResults.reduce((sum, r) => sum + (r.coverage || 0), 0);
    return totalCoverage / validResults.length;
  }

  private generateArtifacts(results: GoldenSuiteResult[], projectId: string): CIArtifact[] {
    const artifacts: CIArtifact[] = [];

    // Generate test summary
    artifacts.push({
      name: 'test-summary.json',
      type: 'report',
      path: 'reports/test-summary.json',
      content: JSON.stringify({
        projectId,
        timestamp: new Date().toISOString(),
        summary: {
          totalSuites: results.length,
          passedSuites: results.filter(r => r.passed).length,
          failedSuites: results.filter(r => !r.passed).length,
          averageDuration: results.reduce((sum, r) => sum + r.duration, 0) / results.length,
          averageCoverage: this.calculateAverageCoverage(results)
        },
        results: results.map(r => ({
          suiteName: r.suiteName,
          passed: r.passed,
          duration: r.duration,
          coverage: r.coverage,
          testCount: r.tests.length
        }))
      }, null, 2)
    });

    // Generate coverage report
    artifacts.push({
      name: 'coverage-summary.json',
      type: 'coverage',
      path: 'reports/coverage-summary.json',
      content: JSON.stringify({
        projectId,
        timestamp: new Date().toISOString(),
        coverage: this.calculateAverageCoverage(results),
        suites: results.map(r => ({
          name: r.suiteName,
          coverage: r.coverage,
          tests: r.tests.length
        }))
      }, null, 2)
    });

    return artifacts;
  }

  private generateJUnitXML(results: GoldenSuiteResult[]): string {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<testsuites>\n';

    for (const result of results) {
      xml += `  <testsuite name="${result.suiteName}" tests="${result.tests.length}" `;
      xml += `failures="${result.tests.filter(t => !t.passed).length}" `;
      xml += `time="${result.duration / 1000}">\n`;

      for (const test of result.tests) {
        xml += `    <testcase name="${test.name}" time="${test.duration / 1000}"`;
        if (!test.passed) {
          xml += '>\n';
          xml += `      <failure message="${test.error || 'Test failed'}"/>\n`;
          xml += '    </testcase>\n';
        } else {
          xml += '/>\n';
        }
      }

      xml += '  </testsuite>\n';
    }

    xml += '</testsuites>\n';
    return xml;
  }

  async generateCIBadge(projectId: string, branch: string = 'main'): Promise<string> {
    const report = await this.runCISuites(projectId, branch);
    const status = report.overallStatus;
    const color = status === 'SUCCESS' ? 'green' : status === 'ERROR' ? 'red' : 'yellow';

    // Generate SVG badge
    const badgeSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="20">
  <rect width="40" height="20" fill="#555"/>
  <rect x="40" width="80" height="20" fill="#{color}"/>
  <text x="20" y="14" fill="white" font-family="Arial" font-size="11" text-anchor="middle">CI</text>
  <text x="80" y="14" fill="white" font-family="Arial" font-size="11" text-anchor="middle">{status}</text>
</svg>`;

    return badgeSVG.replace('{color}', color).replace('{status}', status.toLowerCase());
  }

  getMockServerConfig(suiteName: string): MockServerConfig | undefined {
    return this.mockServers.get(suiteName);
  }
}
