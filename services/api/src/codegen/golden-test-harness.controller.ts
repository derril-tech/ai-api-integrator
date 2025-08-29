import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { GoldenTestHarnessService, GoldenFixture, TestResult, TestSuiteResult } from './golden-test-harness.service';

class CreateFixtureDto {
  name: string;
  description: string;
  specFormat: 'openapi' | 'postman' | 'graphql';
  specContent: string;
  tags?: string[];
}

class UpdateFixtureDto {
  name?: string;
  description?: string;
  specContent?: string;
  specFormat?: 'openapi' | 'postman' | 'graphql';
  tags?: string[];
}

class RunTestDto {
  fixtureId: string;
}

class ImportFixturesDto {
  fixturesJson: string;
}

@ApiTags('golden-test-harness')
@Controller('golden-test-harness')
export class GoldenTestHarnessController {
  constructor(private readonly harnessService: GoldenTestHarnessService) {}

  @Post('fixtures')
  @ApiOperation({ summary: 'Create a new golden fixture' })
  @ApiResponse({ status: 201, description: 'Fixture created successfully' })
  async createFixture(@Body() dto: CreateFixtureDto): Promise<{
    success: boolean;
    fixture: GoldenFixture;
  }> {
    try {
      if (!dto.name || !dto.specContent) {
        throw new BadRequestException('Name and spec content are required');
      }

      const fixture = await this.harnessService.createFixture(
        dto.name,
        dto.description,
        dto.specFormat,
        dto.specContent,
        dto.tags || []
      );

      return {
        success: true,
        fixture,
      };
    } catch (error) {
      throw new BadRequestException({
        success: false,
        error: error.message,
      });
    }
  }

  @Get('fixtures')
  @ApiOperation({ summary: 'Get all golden fixtures' })
  @ApiResponse({ status: 200, description: 'Fixtures retrieved successfully' })
  async getAllFixtures(@Query('tag') tag?: string): Promise<{
    success: boolean;
    fixtures: GoldenFixture[];
    summary: {
      total: number;
      byFormat: Record<string, number>;
      byTag: Record<string, number>;
    };
  }> {
    try {
      const fixtures = tag
        ? this.harnessService.getFixturesByTag(tag)
        : this.harnessService.getAllFixtures();

      // Generate summary
      const byFormat: Record<string, number> = {};
      const byTag: Record<string, number> = {};

      for (const fixture of fixtures) {
        byFormat[fixture.specFormat] = (byFormat[fixture.specFormat] || 0) + 1;

        for (const tag of fixture.tags) {
          byTag[tag] = (byTag[tag] || 0) + 1;
        }
      }

      return {
        success: true,
        fixtures,
        summary: {
          total: fixtures.length,
          byFormat,
          byTag,
        },
      };
    } catch (error) {
      throw new BadRequestException({
        success: false,
        error: error.message,
      });
    }
  }

  @Get('fixtures/:id')
  @ApiOperation({ summary: 'Get a specific golden fixture' })
  @ApiResponse({ status: 200, description: 'Fixture retrieved successfully' })
  async getFixture(@Param('id') id: string): Promise<{
    success: boolean;
    fixture: GoldenFixture;
    testHistory?: TestResult[];
  }> {
    try {
      const fixture = this.harnessService.getFixture(id);
      if (!fixture) {
        throw new NotFoundException('Fixture not found');
      }

      const testHistory = this.harnessService.getTestHistory(id);

      return {
        success: true,
        fixture,
        testHistory: testHistory.length > 0 ? testHistory : undefined,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException({
        success: false,
        error: error.message,
      });
    }
  }

  @Put('fixtures/:id')
  @ApiOperation({ summary: 'Update a golden fixture' })
  @ApiResponse({ status: 200, description: 'Fixture updated successfully' })
  async updateFixture(
    @Param('id') id: string,
    @Body() dto: UpdateFixtureDto
  ): Promise<{
    success: boolean;
    fixture: GoldenFixture;
    regenerated: boolean;
  }> {
    try {
      const fixture = await this.harnessService.updateFixture(id, dto);
      const regenerated = !!(dto.specContent || dto.specFormat);

      return {
        success: true,
        fixture,
        regenerated,
      };
    } catch (error) {
      throw new BadRequestException({
        success: false,
        error: error.message,
      });
    }
  }

  @Delete('fixtures/:id')
  @ApiOperation({ summary: 'Delete a golden fixture' })
  @ApiResponse({ status: 200, description: 'Fixture deleted successfully' })
  async deleteFixture(@Param('id') id: string): Promise<{
    success: boolean;
    deleted: boolean;
  }> {
    try {
      const deleted = this.harnessService.deleteFixture(id);

      return {
        success: true,
        deleted,
      };
    } catch (error) {
      throw new BadRequestException({
        success: false,
        error: error.message,
      });
    }
  }

  @Post('tests/run/:fixtureId')
  @ApiOperation({ summary: 'Run test for a specific fixture' })
  @ApiResponse({ status: 200, description: 'Test completed successfully' })
  async runFixtureTest(@Param('fixtureId') fixtureId: string): Promise<{
    success: boolean;
    result: TestResult;
    performance: {
      duration: number;
      status: 'fast' | 'normal' | 'slow';
    };
  }> {
    try {
      const result = await this.harnessService.runFixtureTest(fixtureId);

      // Analyze performance
      let performanceStatus: 'fast' | 'normal' | 'slow' = 'normal';
      if (result.duration < 1000) performanceStatus = 'fast';
      else if (result.duration > 10000) performanceStatus = 'slow';

      return {
        success: true,
        result,
        performance: {
          duration: result.duration,
          status: performanceStatus,
        },
      };
    } catch (error) {
      throw new BadRequestException({
        success: false,
        error: error.message,
      });
    }
  }

  @Post('tests/run-all')
  @ApiOperation({ summary: 'Run all golden fixture tests' })
  @ApiResponse({ status: 200, description: 'Test suite completed successfully' })
  async runAllTests(): Promise<{
    success: boolean;
    suiteResult: TestSuiteResult;
    report: string;
  }> {
    try {
      const suiteResult = await this.harnessService.runAllTests();
      const report = await this.harnessService.generateTestReport(suiteResult);

      return {
        success: true,
        suiteResult,
        report,
      };
    } catch (error) {
      throw new BadRequestException({
        success: false,
        error: error.message,
      });
    }
  }

  @Get('tests/history/:fixtureId')
  @ApiOperation({ summary: 'Get test history for a fixture' })
  @ApiResponse({ status: 200, description: 'Test history retrieved successfully' })
  async getTestHistory(@Param('fixtureId') fixtureId: string): Promise<{
    success: boolean;
    history: TestResult[];
    trends: {
      improving: boolean;
      averageDuration: number;
      successRate: number;
      recentResults: TestResult[];
    };
  }> {
    try {
      const history = this.harnessService.getTestHistory(fixtureId);

      if (history.length === 0) {
        return {
          success: true,
          history: [],
          trends: {
            improving: false,
            averageDuration: 0,
            successRate: 0,
            recentResults: [],
          },
        };
      }

      // Calculate trends
      const recentResults = history.slice(-5); // Last 5 results
      const averageDuration = history.reduce((sum, r) => sum + r.duration, 0) / history.length;
      const successRate = (history.filter(r => r.success).length / history.length) * 100;

      // Check if improving (more recent successes)
      const recentSuccessRate = (recentResults.filter(r => r.success).length / recentResults.length) * 100;
      const olderResults = history.slice(-10, -5);
      const olderSuccessRate = olderResults.length > 0
        ? (olderResults.filter(r => r.success).length / olderResults.length) * 100
        : 0;
      const improving = recentSuccessRate > olderSuccessRate;

      return {
        success: true,
        history,
        trends: {
          improving,
          averageDuration: Math.round(averageDuration),
          successRate: Math.round(successRate * 100) / 100,
          recentResults,
        },
      };
    } catch (error) {
      throw new BadRequestException({
        success: false,
        error: error.message,
      });
    }
  }

  @Post('fixtures/import')
  @ApiOperation({ summary: 'Import golden fixtures from JSON' })
  @ApiResponse({ status: 200, description: 'Fixtures imported successfully' })
  async importFixtures(@Body() dto: ImportFixturesDto): Promise<{
    success: boolean;
    imported: number;
    skipped: number;
    errors: string[];
  }> {
    try {
      if (!dto.fixturesJson) {
        throw new BadRequestException('Fixtures JSON is required');
      }

      const imported = this.harnessService.importFixtures(dto.fixturesJson);

      return {
        success: true,
        imported,
        skipped: 0, // For now, we don't track skipped
        errors: [],
      };
    } catch (error) {
      throw new BadRequestException({
        success: false,
        error: error.message,
      });
    }
  }

  @Get('fixtures/export')
  @ApiOperation({ summary: 'Export all golden fixtures as JSON' })
  @ApiResponse({ status: 200, description: 'Fixtures exported successfully' })
  async exportFixtures(): Promise<{
    success: boolean;
    fixturesJson: string;
    metadata: {
      exportedAt: string;
      totalFixtures: number;
      version: string;
    };
  }> {
    try {
      const fixturesJson = this.harnessService.exportFixtures();
      const fixtures = JSON.parse(fixturesJson);

      return {
        success: true,
        fixturesJson,
        metadata: {
          exportedAt: new Date().toISOString(),
          totalFixtures: fixtures.length,
          version: '1.0.0',
        },
      };
    } catch (error) {
      throw new BadRequestException({
        success: false,
        error: error.message,
      });
    }
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Get golden test harness dashboard data' })
  @ApiResponse({ status: 200, description: 'Dashboard data retrieved successfully' })
  async getDashboard(): Promise<{
    success: boolean;
    dashboard: {
      overview: {
        totalFixtures: number;
        passingFixtures: number;
        failingFixtures: number;
        averageTestDuration: number;
        lastRunDate?: string;
      };
      recentRuns: TestResult[];
      topFailing: Array<{
        fixtureId: string;
        fixtureName: string;
        failureCount: number;
        lastFailure: string;
      }>;
      performance: {
        fastestTests: TestResult[];
        slowestTests: TestResult[];
        trend: 'improving' | 'stable' | 'degrading';
      };
      recommendations: string[];
    };
  }> {
    try {
      const fixtures = this.harnessService.getAllFixtures();
      const allHistory: TestResult[] = [];

      // Collect all test history
      for (const fixture of fixtures) {
        const history = this.harnessService.getTestHistory(fixture.id);
        allHistory.push(...history);
      }

      // Calculate overview stats
      const recentRuns = allHistory.slice(-10);
      const passingFixtures = new Set(
        allHistory.filter(r => r.success).map(r => r.fixtureId)
      ).size;
      const failingFixtures = new Set(
        allHistory.filter(r => !r.success).map(r => r.fixtureId)
      ).size;

      const averageTestDuration = allHistory.length > 0
        ? allHistory.reduce((sum, r) => sum + r.duration, 0) / allHistory.length
        : 0;

      const lastRunDate = recentRuns.length > 0
        ? recentRuns[0].fixtureName // This is a placeholder - would need proper timestamp
        : undefined;

      // Find top failing fixtures
      const failureCounts = new Map<string, { count: number; lastFailure: string; name: string }>();
      for (const result of allHistory.filter(r => !r.success)) {
        const existing = failureCounts.get(result.fixtureId) || {
          count: 0,
          lastFailure: '',
          name: result.fixtureName
        };
        failureCounts.set(result.fixtureId, {
          count: existing.count + 1,
          lastFailure: result.fixtureName, // Placeholder for actual timestamp
          name: result.fixtureName,
        });
      }

      const topFailing = Array.from(failureCounts.entries())
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 5)
        .map(([fixtureId, data]) => ({
          fixtureId,
          fixtureName: data.name,
          failureCount: data.count,
          lastFailure: data.lastFailure,
        }));

      // Performance analysis
      const sortedByDuration = [...allHistory].sort((a, b) => b.duration - a.duration);
      const fastestTests = sortedByDuration.slice(-5).reverse();
      const slowestTests = sortedByDuration.slice(0, 5);

      // Simple trend analysis
      let trend: 'improving' | 'stable' | 'degrading' = 'stable';
      if (recentRuns.length >= 2) {
        const recentSuccessRate = recentRuns.filter(r => r.success).length / recentRuns.length;
        const olderRuns = allHistory.slice(-20, -10);
        if (olderRuns.length > 0) {
          const olderSuccessRate = olderRuns.filter(r => r.success).length / olderRuns.length;
          if (recentSuccessRate > olderSuccessRate + 0.1) trend = 'improving';
          else if (recentSuccessRate < olderSuccessRate - 0.1) trend = 'degrading';
        }
      }

      // Generate recommendations
      const recommendations = this.generateDashboardRecommendations(
        fixtures.length,
        passingFixtures,
        failingFixtures,
        topFailing.length,
        trend
      );

      return {
        success: true,
        dashboard: {
          overview: {
            totalFixtures: fixtures.length,
            passingFixtures,
            failingFixtures,
            averageTestDuration: Math.round(averageTestDuration),
            lastRunDate,
          },
          recentRuns,
          topFailing,
          performance: {
            fastestTests,
            slowestTests,
            trend,
          },
          recommendations,
        },
      };
    } catch (error) {
      throw new BadRequestException({
        success: false,
        error: error.message,
      });
    }
  }

  private generateDashboardRecommendations(
    totalFixtures: number,
    passingFixtures: number,
    failingFixtures: number,
    topFailingCount: number,
    trend: string
  ): string[] {
    const recommendations: string[] = [];

    if (totalFixtures === 0) {
      recommendations.push('Create your first golden fixture to establish test coverage');
    } else if (totalFixtures < 5) {
      recommendations.push('Add more fixtures to improve test coverage across different API patterns');
    }

    if (failingFixtures > 0) {
      const failureRate = (failingFixtures / (passingFixtures + failingFixtures)) * 100;
      if (failureRate > 20) {
        recommendations.push(`High failure rate (${failureRate.toFixed(1)}%) - review recent code changes`);
      }
    }

    if (topFailingCount > 0) {
      recommendations.push(`Address ${topFailingCount} frequently failing fixtures`);
    }

    if (trend === 'degrading') {
      recommendations.push('Test results are trending downward - investigate recent changes');
    } else if (trend === 'improving') {
      recommendations.push('Great! Test results are improving - keep up the good work');
    }

    if (recommendations.length === 0) {
      recommendations.push('All systems operational - continue monitoring test health');
    }

    return recommendations;
  }

  @Post('fixtures/:id/regenerate')
  @ApiOperation({ summary: 'Regenerate expected outputs for a fixture' })
  @ApiResponse({ status: 200, description: 'Fixture outputs regenerated successfully' })
  async regenerateFixtureOutputs(@Param('id') id: string): Promise<{
    success: boolean;
    fixture: GoldenFixture;
    changes: {
      added: string[];
      removed: string[];
      modified: string[];
    };
  }> {
    try {
      const fixture = this.harnessService.getFixture(id);
      if (!fixture) {
        throw new NotFoundException('Fixture not found');
      }

      // Store original outputs for comparison
      const originalOutputs = { ...fixture.expectedOutputs };

      // Regenerate outputs
      const newOutputs = await this.harnessService['generateExpectedOutputs'](
        fixture.specContent,
        fixture.specFormat
      );

      // Compare outputs
      const added: string[] = [];
      const removed: string[] = [];
      const modified: string[] = [];

      // Check for new outputs
      for (const key of Object.keys(newOutputs)) {
        if (!originalOutputs[key]) {
          added.push(key);
        } else if (newOutputs[key].checksum !== originalOutputs[key].checksum) {
          modified.push(key);
        }
      }

      // Check for removed outputs
      for (const key of Object.keys(originalOutputs)) {
        if (!newOutputs[key]) {
          removed.push(key);
        }
      }

      // Update fixture with new outputs
      const updatedFixture = await this.harnessService.updateFixture(id, {
        expectedOutputs: newOutputs,
      });

      return {
        success: true,
        fixture: updatedFixture,
        changes: {
          added,
          removed,
          modified,
        },
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException({
        success: false,
        error: error.message,
      });
    }
  }
}
