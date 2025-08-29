import { Controller, Get, Post, Param, Body, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { GoldenSuitesService, GoldenSuiteResult, APISpec } from './golden-suites.service';

class RunSuiteDto {
  projectId: string;
  suiteName: string;
}

@ApiTags('golden-suites')
@Controller('golden-suites')
export class GoldenSuitesController {
  constructor(private readonly goldenSuitesService: GoldenSuitesService) {}

  @Get('suites')
  @ApiOperation({ summary: 'Get available golden test suites' })
  @ApiResponse({ status: 200, description: 'List of available test suites' })
  getAvailableSuites() {
    const suites = this.goldenSuitesService.getAvailableSuites();
    return {
      suites: suites.map(name => ({
        name,
        spec: this.goldenSuitesService.getSuiteSpec(name)
      })),
      count: suites.length
    };
  }

  @Get('suites/:suiteName')
  @ApiOperation({ summary: 'Get golden test suite specification' })
  @ApiResponse({ status: 200, description: 'Suite specification' })
  @ApiResponse({ status: 404, description: 'Suite not found' })
  getSuiteSpec(@Param('suiteName') suiteName: string) {
    const spec = this.goldenSuitesService.getSuiteSpec(suiteName);
    if (!spec) {
      return {
        error: 'Suite not found',
        availableSuites: this.goldenSuitesService.getAvailableSuites()
      };
    }
    return spec;
  }

  @Post('run')
  @ApiOperation({ summary: 'Run golden test suite' })
  @ApiResponse({ status: 200, description: 'Test results' })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  async runSuite(@Body() runSuiteDto: RunSuiteDto) {
    try {
      const result = await this.goldenSuitesService.runGoldenSuite(
        runSuiteDto.suiteName,
        runSuiteDto.projectId
      );

      return {
        ...result,
        status: result.passed ? 'PASSED' : 'FAILED',
        timestamp: new Date().toISOString(),
        summary: {
          totalTests: result.tests.length,
          passedTests: result.tests.filter(t => t.passed).length,
          failedTests: result.tests.filter(t => !t.passed).length,
          totalAssertions: result.tests.reduce((sum, t) => sum + (t.assertions?.length || 0), 0),
          passedAssertions: result.tests.reduce((sum, t) =>
            sum + (t.assertions?.filter(a => a.passed).length || 0), 0
          )
        }
      };
    } catch (error) {
      return {
        error: error.message,
        suiteName: runSuiteDto.suiteName,
        projectId: runSuiteDto.projectId,
        timestamp: new Date().toISOString(),
        status: 'ERROR'
      };
    }
  }

  @Post('run-all/:projectId')
  @ApiOperation({ summary: 'Run all golden test suites for a project' })
  @ApiResponse({ status: 200, description: 'All test results' })
  async runAllSuites(@Param('projectId') projectId: string) {
    const suites = this.goldenSuitesService.getAvailableSuites();
    const results: GoldenSuiteResult[] = [];

    for (const suiteName of suites) {
      try {
        const result = await this.goldenSuitesService.runGoldenSuite(suiteName, projectId);
        results.push(result);
      } catch (error) {
        results.push({
          suiteName,
          tests: [],
          passed: false,
          duration: 0,
          error: error.message
        } as any);
      }
    }

    const overallPassed = results.every(r => r.passed);
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

    return {
      projectId,
      results,
      overallResult: {
        passed: overallPassed,
        totalSuites: results.length,
        passedSuites: results.filter(r => r.passed).length,
        failedSuites: results.filter(r => !r.passed).length,
        totalDuration
      },
      timestamp: new Date().toISOString()
    };
  }

  @Get('ci-status/:projectId')
  @ApiOperation({ summary: 'Get CI status for golden suites' })
  @ApiResponse({ status: 200, description: 'CI status summary' })
  async getCIStatus(@Param('projectId') projectId: string) {
    const suites = this.goldenSuitesService.getAvailableSuites();
    const suiteStatuses = [];

    for (const suiteName of suites) {
      try {
        const result = await this.goldenSuitesService.runGoldenSuite(suiteName, projectId);
        suiteStatuses.push({
          suiteName,
          status: result.passed ? 'PASSED' : 'FAILED',
          duration: result.duration,
          tests: result.tests.length,
          coverage: result.coverage
        });
      } catch (error) {
        suiteStatuses.push({
          suiteName,
          status: 'ERROR',
          error: error.message
        });
      }
    }

    const overallStatus = suiteStatuses.every(s => s.status === 'PASSED') ? 'SUCCESS' :
                         suiteStatuses.some(s => s.status === 'ERROR') ? 'ERROR' : 'FAILURE';

    return {
      projectId,
      overallStatus,
      suites: suiteStatuses,
      timestamp: new Date().toISOString(),
      ci: {
        badge: overallStatus === 'SUCCESS' ? 'passing' : 'failing',
        color: overallStatus === 'SUCCESS' ? 'green' : 'red',
        summary: `${suiteStatuses.filter(s => s.status === 'PASSED').length}/${suiteStatuses.length} suites passing`
      }
    };
  }
}
