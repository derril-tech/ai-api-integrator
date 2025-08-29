import { Injectable } from '@nestjs/common';
import { Project } from '../projects/entities/project.entity';

export interface SBOMComponent {
  name: string;
  version: string;
  type: 'library' | 'framework' | 'application';
  supplier?: string;
  description?: string;
  licenses?: LicenseInfo[];
  hashes?: HashInfo[];
  externalReferences?: ExternalReference[];
  properties?: Record<string, string>;
}

export interface LicenseInfo {
  license: string;
  url?: string;
  text?: string;
  isSpdx?: boolean;
}

export interface HashInfo {
  algorithm: string;
  value: string;
}

export interface ExternalReference {
  type: 'website' | 'issue-tracker' | 'vcs' | 'documentation';
  url: string;
  comment?: string;
}

export interface CVEInfo {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  cvssScore: number;
  description: string;
  publishedDate: string;
  lastModifiedDate: string;
  references: string[];
  affectedVersions: string[];
  fixedVersions?: string[];
}

export interface LicenseScanResult {
  component: string;
  version: string;
  licenses: LicenseInfo[];
  compliance: {
    isCompatible: boolean;
    issues: string[];
    recommendations: string[];
  };
}

export interface SBOMReport {
  spdxVersion: string;
  dataLicense: string;
  spdxId: string;
  name: string;
  namespace: string;
  creationInfo: {
    creators: string[];
    created: string;
  };
  packages: SBOMComponent[];
  relationships: Relationship[];
  annotations?: Annotation[];
}

export interface Relationship {
  spdxElementId: string;
  relationshipType: string;
  relatedSpdxElement: string;
}

export interface Annotation {
  annotator: string;
  annotationType: string;
  annotationDate: string;
  annotationComment: string;
}

@Injectable()
export class SBOMService {
  private readonly knownComponents = new Map<string, SBOMComponent>();

  constructor() {
    this.initializeKnownComponents();
  }

  private initializeKnownComponents() {
    // TypeScript/JavaScript ecosystem components
    this.knownComponents.set('axios', {
      name: 'axios',
      version: '1.6.0',
      type: 'library',
      supplier: 'axios',
      description: 'Promise based HTTP client for the browser and node.js',
      licenses: [{
        license: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
        isSpdx: true
      }],
      externalReferences: [{
        type: 'website',
        url: 'https://axios-http.com/'
      }, {
        type: 'vcs',
        url: 'https://github.com/axios/axios'
      }]
    });

    this.knownComponents.set('@nestjs/common', {
      name: '@nestjs/common',
      version: '10.0.0',
      type: 'framework',
      supplier: 'NestJS',
      description: 'NestJS common utilities',
      licenses: [{
        license: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
        isSpdx: true
      }],
      externalReferences: [{
        type: 'website',
        url: 'https://nestjs.com/'
      }, {
        type: 'vcs',
        url: 'https://github.com/nestjs/nest'
      }]
    });

    this.knownComponents.set('typescript', {
      name: 'typescript',
      version: '5.0.0',
      type: 'library',
      supplier: 'Microsoft',
      description: 'TypeScript is a superset of JavaScript',
      licenses: [{
        license: 'Apache-2.0',
        url: 'https://opensource.org/licenses/Apache-2.0',
        isSpdx: true
      }],
      externalReferences: [{
        type: 'website',
        url: 'https://www.typescriptlang.org/'
      }, {
        type: 'vcs',
        url: 'https://github.com/microsoft/TypeScript'
      }]
    });

    this.knownComponents.set('jest', {
      name: 'jest',
      version: '29.0.0',
      type: 'library',
      supplier: 'Meta (Facebook)',
      description: 'JavaScript testing framework',
      licenses: [{
        license: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
        isSpdx: true
      }],
      externalReferences: [{
        type: 'website',
        url: 'https://jestjs.io/'
      }, {
        type: 'vcs',
        url: 'https://github.com/facebook/jest'
      }]
    });

    this.knownComponents.set('pg', {
      name: 'pg',
      version: '8.11.0',
      type: 'library',
      supplier: 'PostgreSQL Global Development Group',
      description: 'PostgreSQL client for Node.js',
      licenses: [{
        license: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
        isSpdx: true
      }],
      externalReferences: [{
        type: 'website',
        url: 'https://node-postgres.com/'
      }, {
        type: 'vcs',
        url: 'https://github.com/brianc/node-postgres'
      }]
    });

    this.knownComponents.set('redis', {
      name: 'redis',
      version: '4.6.0',
      type: 'library',
      supplier: 'Redis Labs',
      description: 'Redis client for Node.js',
      licenses: [{
        license: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
        isSpdx: true
      }],
      externalReferences: [{
        type: 'website',
        url: 'https://redis.js.org/'
      }, {
        type: 'vcs',
        url: 'https://github.com/redis/node-redis'
      }]
    });
  }

  async generateSBOM(project: Project, components: string[]): Promise<SBOMReport> {
    const packages: SBOMComponent[] = [];
    const relationships: Relationship[] = [];

    // Add main project package
    const mainPackage: SBOMComponent = {
      name: project.name,
      version: '1.0.0',
      type: 'application',
      supplier: 'AI API Integrator',
      description: `Generated ${project.name} integration`,
      licenses: [{
        license: 'ISC',
        isSpdx: true
      }],
      properties: {
        'project:id': project.id,
        'generated:at': new Date().toISOString(),
        'generator': 'AI API Integrator'
      }
    };

    packages.push(mainPackage);

    // Add dependencies
    for (const componentName of components) {
      const component = this.knownComponents.get(componentName);
      if (component) {
        packages.push(component);
        relationships.push({
          spdxElementId: mainPackage.name,
          relationshipType: 'DEPENDS_ON',
          relatedSpdxElement: component.name
        });
      } else {
        // Create unknown component entry
        const unknownComponent: SBOMComponent = {
          name: componentName,
          version: 'unknown',
          type: 'library',
          description: 'Unknown component',
          licenses: [{
            license: 'unknown'
          }]
        };
        packages.push(unknownComponent);
      }
    }

    const report: SBOMReport = {
      spdxVersion: 'SPDX-2.3',
      dataLicense: 'CC0-1.0',
      spdxId: 'SPDXRef-DOCUMENT',
      name: `${project.name}-SBOM`,
      namespace: `https://ai-api-integrator.com/spdx/${project.id}`,
      creationInfo: {
        creators: ['Tool: AI API Integrator'],
        created: new Date().toISOString()
      },
      packages,
      relationships
    };

    return report;
  }

  async scanLicenses(components: string[]): Promise<LicenseScanResult[]> {
    const results: LicenseScanResult[] = [];

    for (const componentName of components) {
      const component = this.knownComponents.get(componentName);

      if (component) {
        const licenseResult = await this.analyzeLicenseCompliance(component);
        results.push(licenseResult);
      } else {
        results.push({
          component: componentName,
          version: 'unknown',
          licenses: [{ license: 'unknown' }],
          compliance: {
            isCompatible: false,
            issues: ['Component not found in license database'],
            recommendations: ['Verify component license manually']
          }
        });
      }
    }

    return results;
  }

  private async analyzeLicenseCompliance(component: SBOMComponent): Promise<LicenseScanResult> {
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Check for problematic licenses
    const problematicLicenses = ['GPL-3.0', 'AGPL-3.0', 'SSPL'];
    const hasProblematicLicense = component.licenses?.some(license =>
      problematicLicenses.includes(license.license)
    );

    if (hasProblematicLicense) {
      issues.push(`Contains potentially incompatible license: ${component.licenses?.find(l => problematicLicenses.includes(l.license))?.license}`);
      recommendations.push('Consider using MIT or Apache-2.0 licensed alternatives');
    }

    // Check for missing license information
    if (!component.licenses || component.licenses.length === 0) {
      issues.push('No license information available');
      recommendations.push('Verify license with component maintainer');
    }

    // Check for SPDX compliance
    const nonSpdxLicenses = component.licenses?.filter(l => !l.isSpdx) || [];
    if (nonSpdxLicenses.length > 0) {
      recommendations.push('Consider using SPDX license identifiers for better compliance tracking');
    }

    return {
      component: component.name,
      version: component.version,
      licenses: component.licenses || [],
      compliance: {
        isCompatible: issues.length === 0,
        issues,
        recommendations
      }
    };
  }

  async scanCVEs(components: string[]): Promise<CVEInfo[]> {
    // Mock CVE data - in a real implementation, this would query CVE databases
    const mockCVEs: CVEInfo[] = [
      {
        id: 'CVE-2023-1234',
        severity: 'high',
        cvssScore: 8.5,
        description: 'Potential security vulnerability in HTTP client library',
        publishedDate: '2023-01-15',
        lastModifiedDate: '2023-01-20',
        references: ['https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2023-1234'],
        affectedVersions: ['< 1.6.1'],
        fixedVersions: ['1.6.1']
      }
    ];

    // Filter CVEs relevant to our components
    return mockCVEs.filter(cve =>
      components.some(component => {
        const componentData = this.knownComponents.get(component);
        return componentData && this.isVersionAffected(componentData.version, cve.affectedVersions);
      })
    );
  }

  private isVersionAffected(componentVersion: string, affectedVersions: string[]): boolean {
    // Simple version comparison - in reality, this would be more sophisticated
    for (const affected of affectedVersions) {
      if (affected.includes('<') && componentVersion < affected.replace('< ', '')) {
        return true;
      }
      if (affected.includes('<=') && componentVersion <= affected.replace('<= ', '')) {
        return true;
      }
    }
    return false;
  }

  async generateSecurityReport(project: Project, components: string[]): Promise<{
    sbom: SBOMReport;
    licenseScan: LicenseScanResult[];
    cveScan: CVEInfo[];
    summary: {
      totalComponents: number;
      licenseCompliant: number;
      cveCount: number;
      criticalIssues: number;
      recommendations: string[];
    };
  }> {
    const [sbom, licenseScan, cveScan] = await Promise.all([
      this.generateSBOM(project, components),
      this.scanLicenses(components),
      this.scanCVEs(components)
    ]);

    const criticalIssues = licenseScan.filter(l => !l.compliance.isCompatible).length + cveScan.length;
    const recommendations = [
      ...licenseScan.flatMap(l => l.compliance.recommendations),
      ...cveScan.map(cve => `Update to fix ${cve.id}`)
    ];

    return {
      sbom,
      licenseScan,
      cveScan,
      summary: {
        totalComponents: components.length,
        licenseCompliant: licenseScan.filter(l => l.compliance.isCompatible).length,
        cveCount: cveScan.length,
        criticalIssues,
        recommendations: [...new Set(recommendations)] // Remove duplicates
      }
    };
  }
}
