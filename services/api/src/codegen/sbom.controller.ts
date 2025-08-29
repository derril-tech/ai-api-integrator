import { Controller, Get, Post, Param, Body, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SBOMService, SBOMReport, LicenseScanResult, CVEInfo } from './sbom.service';

class GenerateSBOMDto {
  projectId: string;
  components: string[];
}

@ApiTags('sbom')
@Controller('sbom')
export class SBOMController {
  constructor(private readonly sbomService: SBOMService) {}

  @Post('generate')
  @ApiOperation({ summary: 'Generate SBOM for project' })
  @ApiResponse({ status: 200, description: 'SBOM generated successfully' })
  async generateSBOM(@Body() generateDto: GenerateSBOMDto) {
    try {
      const sbom = await this.sbomService.generateSBOM(
        { id: generateDto.projectId, name: 'temp' } as any,
        generateDto.components
      );

      return {
        success: true,
        sbom,
        metadata: {
          format: 'SPDX-2.3',
          generatedAt: new Date().toISOString(),
          componentCount: sbom.packages.length
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  @Post('scan/licenses')
  @ApiOperation({ summary: 'Scan component licenses' })
  @ApiResponse({ status: 200, description: 'License scan completed' })
  async scanLicenses(@Body() body: { components: string[] }) {
    try {
      const results = await this.sbomService.scanLicenses(body.components);

      const summary = {
        totalComponents: results.length,
        compliant: results.filter(r => r.compliance.isCompatible).length,
        nonCompliant: results.filter(r => !r.compliance.isCompatible).length,
        issues: results.flatMap(r => r.compliance.issues),
        recommendations: results.flatMap(r => r.compliance.recommendations)
      };

      return {
        success: true,
        results,
        summary,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  @Post('scan/cves')
  @ApiOperation({ summary: 'Scan for CVEs in components' })
  @ApiResponse({ status: 200, description: 'CVE scan completed' })
  async scanCVEs(@Body() body: { components: string[] }) {
    try {
      const cves = await this.sbomService.scanCVEs(body.components);

      const summary = {
        totalCVEs: cves.length,
        critical: cves.filter(c => c.severity === 'critical').length,
        high: cves.filter(c => c.severity === 'high').length,
        medium: cves.filter(c => c.severity === 'medium').length,
        low: cves.filter(c => c.severity === 'low').length
      };

      return {
        success: true,
        cves,
        summary,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  @Post('security-report/:projectId')
  @ApiOperation({ summary: 'Generate comprehensive security report' })
  @ApiResponse({ status: 200, description: 'Security report generated' })
  async generateSecurityReport(
    @Param('projectId') projectId: string,
    @Body() body: { components: string[] }
  ) {
    try {
      const project = { id: projectId, name: 'temp' } as any;
      const report = await this.sbomService.generateSecurityReport(project, body.components);

      const securityStatus = this.determineSecurityStatus(report);

      return {
        success: true,
        projectId,
        securityStatus,
        report,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  @Get('compliance-status/:projectId')
  @ApiOperation({ summary: 'Get compliance status for project' })
  @ApiResponse({ status: 200, description: 'Compliance status retrieved' })
  async getComplianceStatus(@Param('projectId') projectId: string) {
    // In a real implementation, this would fetch stored compliance data
    // For now, return a mock status
    return {
      projectId,
      lastScan: new Date().toISOString(),
      status: 'compliant',
      licenseCompliance: {
        compliant: 95,
        total: 100,
        issues: 2
      },
      securityCompliance: {
        cves: 0,
        critical: 0,
        high: 0
      },
      recommendations: [
        'Update axios to latest version',
        'Review license compatibility for 2 components'
      ]
    };
  }

  private determineSecurityStatus(report: any): 'secure' | 'warning' | 'critical' {
    const hasCriticalCVEs = report.cveScan.some((cve: CVEInfo) => cve.severity === 'critical');
    const hasHighCVEs = report.cveScan.some((cve: CVEInfo) => cve.severity === 'high');
    const nonCompliantLicenses = report.licenseScan.filter((l: LicenseScanResult) => !l.compliance.isCompatible).length;

    if (hasCriticalCVEs || nonCompliantLicenses > 5) {
      return 'critical';
    } else if (hasHighCVEs || nonCompliantLicenses > 0) {
      return 'warning';
    } else {
      return 'secure';
    }
  }
}
