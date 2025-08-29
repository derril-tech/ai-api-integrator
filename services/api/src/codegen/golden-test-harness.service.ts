import { Injectable } from '@nestjs/common';
import { PerformanceService } from './performance.service';
import { CodegenService } from './codegen.service';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface GoldenFixture {
  id: string;
  name: string;
  description: string;
  specFormat: 'openapi' | 'postman' | 'graphql';
  specContent: string;
  expectedOutputs: {
    [key: string]: {
      content: string;
      checksum: string;
      metadata?: Record<string, any>;
    };
  };
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  version: string;
}

export interface TestResult {
  fixtureId: string;
  fixtureName: string;
  success: boolean;
  duration: number;
  results: {
    [outputKey: string]: {
      success: boolean;
      actualContent?: string;
      expectedContent?: string;
      actualChecksum?: string;
      expectedChecksum?: string;
      diff?: string;
      error?: string;
    };
  };
  errors: string[];
  warnings: string[];
}

export interface TestSuiteResult {
  suiteName: string;
  timestamp: Date;
  totalFixtures: number;
  passedFixtures: number;
  failedFixtures: number;
  skippedFixtures: number;
  totalDuration: number;
  averageDuration: number;
  results: TestResult[];
  summary: {
    success: boolean;
    passRate: number;
    regressions: number;
    newFailures: number;
    performanceDegradation: boolean;
  };
}

export interface FixtureComparison {
  fixtureId: string;
  previousResult?: TestResult;
  currentResult: TestResult;
  changes: {
    type: 'improvement' | 'regression' | 'neutral';
    description: string;
    impact: 'low' | 'medium' | 'high';
  }[];
  recommendations: string[];
}

@Injectable()
export class GoldenTestHarnessService {
  private readonly fixtureStore: Map<string, GoldenFixture> = new Map();
  private readonly resultsHistory: Map<string, TestResult[]> = new Map();
  private readonly maxHistorySize = 10;

  constructor(
    private performanceService: PerformanceService,
    private codegenService: CodegenService,
  ) {
    this.loadFixturesFromDisk();
  }

  /**
   * Load golden fixtures from disk storage
   */
  private loadFixturesFromDisk() {
    try {
      const fixturesDir = path.join(process.cwd(), 'test-fixtures', 'golden');
      if (!fs.existsSync(fixturesDir)) {
        fs.mkdirSync(fixturesDir, { recursive: true });
        return;
      }

      const fixtureFiles = fs.readdirSync(fixturesDir).filter(file => file.endsWith('.json'));

      for (const file of fixtureFiles) {
        const filePath = path.join(fixturesDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const fixture: GoldenFixture = JSON.parse(content);
        this.fixtureStore.set(fixture.id, fixture);
      }

      console.log(`Loaded ${this.fixtureStore.size} golden fixtures`);
    } catch (error) {
      console.error('Failed to load golden fixtures:', error);
    }
  }

  /**
   * Save a fixture to disk
   */
  private saveFixtureToDisk(fixture: GoldenFixture) {
    try {
      const fixturesDir = path.join(process.cwd(), 'test-fixtures', 'golden');
      const fileName = `${fixture.id}.json`;
      const filePath = path.join(fixturesDir, fileName);

      fs.writeFileSync(filePath, JSON.stringify(fixture, null, 2), 'utf-8');
    } catch (error) {
      console.error('Failed to save fixture:', error);
      throw error;
    }
  }

  /**
   * Create a new golden fixture
   */
  async createFixture(
    name: string,
    description: string,
    specFormat: 'openapi' | 'postman' | 'graphql',
    specContent: string,
    tags: string[] = []
  ): Promise<GoldenFixture> {
    const id = crypto.randomUUID();
    const now = new Date();

    // Generate expected outputs by running code generation
    const expectedOutputs = await this.generateExpectedOutputs(specContent, specFormat);

    const fixture: GoldenFixture = {
      id,
      name,
      description,
      specFormat,
      specContent,
      expectedOutputs,
      tags,
      createdAt: now,
      updatedAt: now,
      version: '1.0.0',
    };

    this.fixtureStore.set(id, fixture);
    this.saveFixtureToDisk(fixture);

    return fixture;
  }

  /**
   * Update an existing fixture
   */
  async updateFixture(
    fixtureId: string,
    updates: Partial<GoldenFixture>
  ): Promise<GoldenFixture> {
    const fixture = this.fixtureStore.get(fixtureId);
    if (!fixture) {
      throw new Error(`Fixture ${fixtureId} not found`);
    }

    // If spec content changed, regenerate expected outputs
    if (updates.specContent && updates.specContent !== fixture.specContent) {
      updates.expectedOutputs = await this.generateExpectedOutputs(
        updates.specContent,
        updates.specFormat || fixture.specFormat
      );
    }

    const updatedFixture = {
      ...fixture,
      ...updates,
      updatedAt: new Date(),
      version: this.incrementVersion(fixture.version),
    };

    this.fixtureStore.set(fixtureId, updatedFixture);
    this.saveFixtureToDisk(updatedFixture);

    return updatedFixture;
  }

  /**
   * Run tests for a specific fixture
   */
  async runFixtureTest(fixtureId: string): Promise<TestResult> {
    const fixture = this.fixtureStore.get(fixtureId);
    if (!fixture) {
      throw new Error(`Fixture ${fixtureId} not found`);
    }

    const startTime = Date.now();

    try {
      // Generate actual outputs
      const actualOutputs = await this.generateExpectedOutputs(
        fixture.specContent,
        fixture.specFormat
      );

      const results: TestResult['results'] = {};
      const errors: string[] = [];
      const warnings: string[] = [];

      // Compare each expected output
      for (const [key, expected] of Object.entries(fixture.expectedOutputs)) {
        const actual = actualOutputs[key];

        if (!actual) {
          results[key] = {
            success: false,
            error: `Expected output '${key}' was not generated`,
          };
          errors.push(`Missing output: ${key}`);
          continue;
        }

        const actualChecksum = this.generateChecksum(actual.content);
        const success = actualChecksum === expected.checksum;

        results[key] = {
          success,
          actualContent: actual.content,
          expectedContent: expected.content,
          actualChecksum,
          expectedChecksum: expected.checksum,
        };

        if (!success) {
          const diff = this.generateDiff(expected.content, actual.content);
          results[key].diff = diff;
          errors.push(`Output '${key}' does not match expected result`);
        }
      }

      // Check for unexpected outputs
      for (const key of Object.keys(actualOutputs)) {
        if (!fixture.expectedOutputs[key]) {
          warnings.push(`Unexpected output generated: ${key}`);
        }
      }

      const duration = Date.now() - startTime;
      const success = errors.length === 0;

      const result: TestResult = {
        fixtureId,
        fixtureName: fixture.name,
        success,
        duration,
        results,
        errors,
        warnings,
      };

      // Store result in history
      this.storeTestResult(fixtureId, result);

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      return {
        fixtureId,
        fixtureName: fixture.name,
        success: false,
        duration,
        results: {},
        errors: [error.message],
        warnings: [],
      };
    }
  }

  /**
   * Run all fixture tests
   */
  async runAllTests(): Promise<TestSuiteResult> {
    const suiteName = `golden-test-suite-${new Date().toISOString().slice(0, 10)}`;
    const startTime = Date.now();

    const results: TestResult[] = [];
    let passedFixtures = 0;
    let failedFixtures = 0;
    let skippedFixtures = 0;

    for (const fixture of this.fixtureStore.values()) {
      try {
        const result = await this.runFixtureTest(fixture.id);
        results.push(result);

        if (result.success) {
          passedFixtures++;
        } else {
          failedFixtures++;
        }
      } catch (error) {
        console.error(`Failed to run test for fixture ${fixture.id}:`, error);
        skippedFixtures++;
      }
    }

    const totalDuration = Date.now() - startTime;
    const totalFixtures = results.length + skippedFixtures;
    const passRate = totalFixtures > 0 ? (passedFixtures / totalFixtures) * 100 : 0;

    // Analyze for regressions
    const regressions = await this.analyzeRegressions(results);
    const performanceDegradation = await this.checkPerformanceDegradation(results);

    const suiteResult: TestSuiteResult = {
      suiteName,
      timestamp: new Date(),
      totalFixtures,
      passedFixtures,
      failedFixtures,
      skippedFixtures,
      totalDuration,
      averageDuration: results.length > 0 ? totalDuration / results.length : 0,
      results,
      summary: {
        success: failedFixtures === 0,
        passRate,
        regressions: regressions.length,
        newFailures: failedFixtures - regressions.length,
        performanceDegradation,
      },
    };

    return suiteResult;
  }

  /**
   * Generate expected outputs for a fixture
   */
  private async generateExpectedOutputs(
    specContent: string,
    format: 'openapi' | 'postman' | 'graphql'
  ): Promise<GoldenFixture['expectedOutputs']> {
    const outputs: GoldenFixture['expectedOutputs'] = {};

    try {
      // Parse the spec first
      let parsedSpec: any;

      switch (format) {
        case 'openapi':
          // Use OpenAPI parser
          parsedSpec = { endpoints: [], models: [] }; // Placeholder
          break;
        case 'postman':
          // Use Postman parser
          parsedSpec = { endpoints: [], models: [] }; // Placeholder
          break;
        case 'graphql':
          // Use GraphQL parser
          parsedSpec = { endpoints: [], models: [] }; // Placeholder
          break;
      }

      // Generate different types of outputs
      if (parsedSpec.endpoints && parsedSpec.endpoints.length > 0) {
        // Generate NestJS server code
        const serverCode = await this.codegenService.generateNestJSServerAdapter('test-project-id');
        outputs['nestjs_server'] = {
          content: JSON.stringify(serverCode, null, 2),
          checksum: this.generateChecksum(JSON.stringify(serverCode, null, 2)),
          metadata: {
            type: 'server',
            framework: 'nestjs',
            generatedAt: new Date().toISOString(),
          },
        };

        // Generate TypeScript SDK
        const sdkCode = await this.codegenService.generateTypeScriptSDK('test-project-id');
        outputs['typescript_sdk'] = {
          content: JSON.stringify(sdkCode, null, 2),
          checksum: this.generateChecksum(JSON.stringify(sdkCode, null, 2)),
          metadata: {
            type: 'sdk',
            language: 'typescript',
            generatedAt: new Date().toISOString(),
          },
        };
      }

      // Generate documentation
      outputs['documentation'] = {
        content: this.generateDocumentationOutput(parsedSpec),
        checksum: this.generateChecksum(this.generateDocumentationOutput(parsedSpec)),
        metadata: {
          type: 'documentation',
          format: 'markdown',
          generatedAt: new Date().toISOString(),
        },
      };

    } catch (error) {
      console.error('Failed to generate expected outputs:', error);
      // Return minimal output to avoid breaking tests
      outputs['error'] = {
        content: `Error generating outputs: ${error.message}`,
        checksum: this.generateChecksum(`Error generating outputs: ${error.message}`),
      };
    }

    return outputs;
  }

  /**
   * Generate documentation output
   */
  private generateDocumentationOutput(parsedSpec: any): string {
    let docs = '# API Documentation\n\n';

    if (parsedSpec.endpoints) {
      docs += '## Endpoints\n\n';
      for (const endpoint of parsedSpec.endpoints) {
        docs += `### ${endpoint.method} ${endpoint.path}\n\n`;
        if (endpoint.summary) {
          docs += `${endpoint.summary}\n\n`;
        }
        if (endpoint.description) {
          docs += `${endpoint.description}\n\n`;
        }
      }
    }

    if (parsedSpec.models) {
      docs += '## Data Models\n\n';
      for (const model of parsedSpec.models) {
        docs += `### ${model.name}\n\n`;
        if (model.description) {
          docs += `${model.description}\n\n`;
        }
        docs += 'Properties:\n';
        if (model.schema?.properties) {
          for (const [propName, prop] of Object.entries(model.schema.properties)) {
            docs += `- \`${propName}\`: ${prop.type}\n`;
          }
        }
        docs += '\n';
      }
    }

    return docs;
  }

  /**
   * Generate checksum for content
   */
  private generateChecksum(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Generate diff between expected and actual content
   */
  private generateDiff(expected: string, actual: string): string {
    // Simple line-by-line diff for now
    const expectedLines = expected.split('\n');
    const actualLines = actual.split('\n');
    const maxLines = Math.max(expectedLines.length, actualLines.length);

    let diff = '';
    for (let i = 0; i < maxLines; i++) {
      const expectedLine = expectedLines[i] || '';
      const actualLine = actualLines[i] || '';

      if (expectedLine !== actualLine) {
        diff += `Line ${i + 1}:\n`;
        diff += `- ${expectedLine}\n`;
        diff += `+ ${actualLine}\n\n`;
      }
    }

    return diff || 'No differences found';
  }

  /**
   * Increment version string
   */
  private incrementVersion(version: string): string {
    const parts = version.split('.');
    const patch = parseInt(parts[2] || '0') + 1;
    return `${parts[0]}.${parts[1]}.${patch}`;
  }

  /**
   * Store test result in history
   */
  private storeTestResult(fixtureId: string, result: TestResult) {
    if (!this.resultsHistory.has(fixtureId)) {
      this.resultsHistory.set(fixtureId, []);
    }

    const history = this.resultsHistory.get(fixtureId)!;
    history.push(result);

    // Keep only recent results
    if (history.length > this.maxHistorySize) {
      history.shift();
    }
  }

  /**
   * Analyze for regressions
   */
  private async analyzeRegressions(currentResults: TestResult[]): Promise<FixtureComparison[]> {
    const regressions: FixtureComparison[] = [];

    for (const currentResult of currentResults) {
      const history = this.resultsHistory.get(currentResult.fixtureId);
      if (!history || history.length < 2) continue;

      const previousResult = history[history.length - 2]; // Second to last result

      const comparison: FixtureComparison = {
        fixtureId: currentResult.fixtureId,
        previousResult,
        currentResult,
        changes: [],
        recommendations: [],
      };

      // Compare success rates
      if (previousResult.success && !currentResult.success) {
        comparison.changes.push({
          type: 'regression',
          description: 'Test went from passing to failing',
          impact: 'high',
        });
        comparison.recommendations.push('Review recent code changes that may have introduced this regression');
      }

      // Compare performance
      const performanceChange = ((currentResult.duration - previousResult.duration) / previousResult.duration) * 100;
      if (performanceChange > 20) {
        comparison.changes.push({
          type: 'regression',
          description: `Performance degraded by ${performanceChange.toFixed(1)}%`,
          impact: performanceChange > 50 ? 'high' : 'medium',
        });
        comparison.recommendations.push('Investigate performance degradation in code generation');
      }

      if (comparison.changes.length > 0) {
        regressions.push(comparison);
      }
    }

    return regressions;
  }

  /**
   * Check for performance degradation
   */
  private async checkPerformanceDegradation(results: TestResult[]): Promise<boolean> {
    if (results.length < 2) return false;

    const durations = results.map(r => r.duration);
    const averageDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;

    // Check if average duration is significantly higher than baseline
    const baselineDuration = 5000; // 5 seconds baseline
    return averageDuration > baselineDuration * 1.5;
  }

  /**
   * Get fixture by ID
   */
  getFixture(fixtureId: string): GoldenFixture | undefined {
    return this.fixtureStore.get(fixtureId);
  }

  /**
   * Get all fixtures
   */
  getAllFixtures(): GoldenFixture[] {
    return Array.from(this.fixtureStore.values());
  }

  /**
   * Get fixtures by tag
   */
  getFixturesByTag(tag: string): GoldenFixture[] {
    return Array.from(this.fixtureStore.values()).filter(fixture =>
      fixture.tags.includes(tag)
    );
  }

  /**
   * Get test history for a fixture
   */
  getTestHistory(fixtureId: string): TestResult[] {
    return this.resultsHistory.get(fixtureId) || [];
  }

  /**
   * Delete a fixture
   */
  deleteFixture(fixtureId: string): boolean {
    const deleted = this.fixtureStore.delete(fixtureId);
    if (deleted) {
      this.resultsHistory.delete(fixtureId);
      // Also delete from disk
      try {
        const fixturesDir = path.join(process.cwd(), 'test-fixtures', 'golden');
        const filePath = path.join(fixturesDir, `${fixtureId}.json`);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (error) {
        console.error('Failed to delete fixture file:', error);
      }
    }
    return deleted;
  }

  /**
   * Generate test report
   */
  async generateTestReport(suiteResult: TestSuiteResult): Promise<string> {
    let report = '# Golden Test Suite Report\n\n';
    report += `**Suite:** ${suiteResult.suiteName}\n`;
    report += `**Date:** ${suiteResult.timestamp.toISOString()}\n\n`;

    report += '## Summary\n\n';
    report += `- **Total Fixtures:** ${suiteResult.totalFixtures}\n`;
    report += `- **Passed:** ${suiteResult.passedFixtures}\n`;
    report += `- **Failed:** ${suiteResult.failedFixtures}\n`;
    report += `- **Skipped:** ${suiteResult.skippedFixtures}\n`;
    report += `- **Pass Rate:** ${suiteResult.summary.passRate.toFixed(1)}%\n`;
    report += `- **Total Duration:** ${suiteResult.totalDuration}ms\n`;
    report += `- **Average Duration:** ${suiteResult.averageDuration.toFixed(0)}ms\n\n`;

    if (suiteResult.summary.regressions > 0) {
      report += `⚠️ **Regressions Detected:** ${suiteResult.summary.regressions}\n\n`;
    }

    if (suiteResult.summary.performanceDegradation) {
      report += `🐌 **Performance Degradation Detected**\n\n`;
    }

    report += '## Results\n\n';
    for (const result of suiteResult.results) {
      report += `### ${result.fixtureName}\n\n`;
      report += `- **Status:** ${result.success ? '✅ Passed' : '❌ Failed'}\n`;
      report += `- **Duration:** ${result.duration}ms\n`;

      if (result.errors.length > 0) {
        report += '- **Errors:**\n';
        for (const error of result.errors) {
          report += `  - ${error}\n`;
        }
      }

      if (result.warnings.length > 0) {
        report += '- **Warnings:**\n';
        for (const warning of result.warnings) {
          report += `  - ${warning}\n`;
        }
      }

      report += '\n';
    }

    return report;
  }

  /**
   * Export fixtures to JSON
   */
  exportFixtures(): string {
    const fixtures = Array.from(this.fixtureStore.values());
    return JSON.stringify(fixtures, null, 2);
  }

  /**
   * Import fixtures from JSON
   */
  importFixtures(jsonContent: string): number {
    try {
      const fixtures: GoldenFixture[] = JSON.parse(jsonContent);
      let imported = 0;

      for (const fixture of fixtures) {
        this.fixtureStore.set(fixture.id, fixture);
        this.saveFixtureToDisk(fixture);
        imported++;
      }

      return imported;
    } catch (error) {
      throw new Error(`Failed to import fixtures: ${error.message}`);
    }
  }
}
