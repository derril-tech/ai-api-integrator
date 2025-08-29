import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project } from '../projects/entities/project.entity';
import JSZip from 'jszip';

export interface ExportOptions {
  includeSdk?: boolean;
  includeServer?: boolean;
  includeFlows?: boolean;
  includeTests?: boolean;
  includeOps?: boolean;
  includeHelm?: boolean;
  includeDocs?: boolean;
}

@Injectable()
export class RepoExporterService {
  constructor(
    @InjectRepository(Project)
    private projectRepository: Repository<Project>,
  ) {}

  async exportRepository(projectId: string, options: ExportOptions = {}): Promise<Buffer> {
    const project = await this.projectRepository.findOne({ where: { id: projectId } });
    if (!project) {
      throw new Error(`Project with ID ${projectId} not found`);
    }

    const opts: Required<ExportOptions> = {
      includeSdk: options.includeSdk ?? true,
      includeServer: options.includeServer ?? true,
      includeFlows: options.includeFlows ?? true,
      includeTests: options.includeTests ?? true,
      includeOps: options.includeOps ?? true,
      includeHelm: options.includeHelm ?? true,
      includeDocs: options.includeDocs ?? true,
    };

    const zip = new JSZip();

    if (opts.includeSdk) {
      const sdkFolder = zip.folder('sdk/typescript');
      if (sdkFolder) {
        sdkFolder.file('index.ts', `// ${project.name} TypeScript SDK (placeholder)\nexport const ping = () => 'pong';\n`);
        sdkFolder.file('package.json', JSON.stringify({ name: `@ai-api-integrator/${project.name.toLowerCase()}-sdk`, version: '0.1.0' }, null, 2));
      }
    }

    if (opts.includeServer) {
      const serverFolder = zip.folder('server/nestjs');
      if (serverFolder) {
        serverFolder.file('README.md', `# ${project.name} Server Adapter\n\nGenerated NestJS server adapter (placeholder).\n`);
      }
    }

    if (opts.includeDocs) {
      zip.file('README.md', `# ${project.name}\n\nGenerated repository export.\n`);
    }

    return zip.generateAsync({ type: 'nodebuffer' });
  }
}

export type { ExportOptions as RepoExportOptions };
import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project } from '../projects/entities/project.entity';
import { CodegenService } from './codegen.service';
import { GuardrailsService } from './guardrails.service';
import { PerformanceService } from './performance.service';
import { TemplateProcessor } from './utils/template-processor.util';
import * as JSZip from 'jszip';
import * as path from 'path';

export interface RepoStructure {
  sdk: {
    typescript?: any[];
    python?: any[];
    go?: any[];
  };
  server: {
    nestjs?: any[];
    fastapi?: any[];
  };
  flows: any[];
  tests: any[];
  ops: any[];
  helm: any[];
  docs: any[];
  config: any[];
}

export interface ExportOptions {
  includeTests?: boolean;
  includeOps?: boolean;
  includeHelm?: boolean;
  includeDocs?: boolean;
  targetLanguages?: ('typescript' | 'python' | 'go')[];
  targetFrameworks?: ('nestjs' | 'fastapi')[];
}

@Injectable()
export class RepoExporterService {
  constructor(
    @InjectRepository(Project)
    private projectRepository: Repository<Project>,
    private codegenService: CodegenService,
    private guardrailsService: GuardrailsService,
    private performanceService: PerformanceService,
  ) {}

  async exportRepository(
    projectId: string,
    options: ExportOptions = {}
  ): Promise<Buffer> {
    return this.performanceService.benchmarkOperation(
      'export',
      async () => {
        const project = await this.projectRepository.findOne({
          where: { id: projectId },
          relations: ['organization'],
        });

        if (!project) {
          throw new Error(`Project with ID ${projectId} not found`);
        }

        // Validate project against guardrails before export
        const validation = await this.guardrailsService.validateProjectForExport(projectId);

        if (!validation.passed) {
          const errorMessage = `Export blocked due to guardrail violations:\n${validation.errors.map(e => `• ${e}`).join('\n')}`;
          throw new BadRequestException({
            message: 'Export blocked by guardrails',
            validation,
            details: errorMessage,
          });
        }

        // Log validation results
        console.log(`Guardrails validation passed for project ${projectId}. Score: ${validation.score}%`);
        if (validation.warnings.length > 0) {
          console.warn(`Guardrails warnings for project ${projectId}:`, validation.warnings);
        }

    const {
      includeTests = true,
      includeOps = true,
      includeHelm = true,
      includeDocs = true,
      targetLanguages = ['typescript'],
      targetFrameworks = ['nestjs'],
    } = options;

    // Generate all components
    const repoStructure = await this.generateRepoStructure(
      project,
      targetLanguages,
      targetFrameworks
    );

    // Create ZIP file
    const zip = new JSZip();

    // Add SDKs
    if (repoStructure.sdk.typescript?.length) {
      this.addSDKToZip(zip, 'typescript', repoStructure.sdk.typescript);
    }

    // Add server adapters
    if (repoStructure.server.nestjs?.length) {
      this.addServerToZip(zip, 'nestjs', repoStructure.server.nestjs);
    }

    // Add flows
    this.addFlowsToZip(zip, repoStructure.flows);

    // Add tests if requested
    if (includeTests) {
      this.addTestsToZip(zip, repoStructure.tests);
    }

    // Add ops if requested
    if (includeOps) {
      this.addOpsToZip(zip, repoStructure.ops);
    }

    // Add helm if requested
    if (includeHelm) {
      this.addHelmToZip(zip, repoStructure.helm);
    }

    // Add docs if requested
    if (includeDocs) {
      this.addDocsToZip(zip, repoStructure.docs);
    }

        // Add configuration files
        this.addConfigToZip(zip, repoStructure.config, project);

        // Generate the ZIP buffer
        return await zip.generateAsync({ type: 'nodebuffer' });
      },
      { projectId, options }
    );
  }

  private async generateRepoStructure(
    project: Project,
    targetLanguages: string[],
    targetFrameworks: string[]
  ): Promise<RepoStructure> {
    const structure: RepoStructure = {
      sdk: {},
      server: {},
      flows: [],
      tests: [],
      ops: [],
      helm: [],
      docs: [],
      config: [],
    };

    // Generate SDKs
    if (targetLanguages.includes('typescript')) {
      structure.sdk.typescript = await this.generateTypeScriptSDK(project);
    }

    // Generate server adapters
    if (targetFrameworks.includes('nestjs')) {
      structure.server.nestjs = await this.generateNestJSServer(project);
    }

    // Generate flows (placeholder for now)
    structure.flows = await this.generateFlows(project);

    // Generate tests
    structure.tests = await this.generateTests(project);

    // Generate ops
    structure.ops = await this.generateOps(project);

    // Generate helm
    structure.helm = await this.generateHelm(project);

    // Generate docs
    structure.docs = await this.generateDocs(project);

    // Generate config
    structure.config = await this.generateConfig(project);

    return structure;
  }

  private async generateTypeScriptSDK(project: Project): Promise<any[]> {
    try {
      const sdk = await this.codegenService.generateTypeScriptSDK(project.id);
      return this.convertToFileArray(sdk, 'typescript-sdk');
    } catch (error) {
      console.warn('Failed to generate TypeScript SDK:', error);
      return [];
    }
  }

  private async generateNestJSServer(project: Project): Promise<any[]> {
    try {
      const server = await this.codegenService.generateNestJSServerAdapter(project.id);
      return this.convertToFileArray(server, 'nestjs-server');
    } catch (error) {
      console.warn('Failed to generate NestJS server:', error);
      return [];
    }
  }

  private async generateFlows(project: Project): Promise<any[]> {
    // Placeholder for workflow generation
    return [
      {
        path: 'flows/README.md',
        content: `# ${project.name} Workflows

This directory contains workflow automations for ${project.name}.

## Available Flows

- **webhook-handler**: Processes incoming webhooks
- **data-sync**: Synchronizes data between systems
- **notification**: Sends notifications based on events

## Usage

\`\`\`bash
# Run a specific flow
npm run flow:webhook-handler

# Run all flows
npm run flows
\`\`\`
`,
      },
    ];
  }

  private async generateTests(project: Project): Promise<any[]> {
    return [
      {
        path: 'tests/integration/README.md',
        content: `# Integration Tests

This directory contains integration tests for ${project.name}.

## Running Tests

\`\`\`bash
# Run all integration tests
npm run test:integration

# Run specific test suite
npm run test:integration -- --grep "authentication"
\`\`\`
`,
      },
      {
        path: 'tests/unit/README.md',
        content: `# Unit Tests

This directory contains unit tests for ${project.name}.

## Running Tests

\`\`\`bash
# Run all unit tests
npm run test:unit

# Run with coverage
npm run test:unit:coverage
\`\`\`
`,
      },
    ];
  }

  private async generateOps(project: Project): Promise<any[]> {
    const templateVars = {
      projectName: project.name.toLowerCase(),
      port: 3000,
    };

    return [
      {
        path: 'ops/docker-compose.yml',
        content: TemplateProcessor.processTemplateFile('ops/docker-compose.template', templateVars),
      },
      {
        path: 'ops/prometheus.yml',
        content: `global:
  scrape_interval: 15s

scrape_configs:
  - job_name: '${project.name.toLowerCase()}-api'
    static_configs:
      - targets: ['localhost:3000']
`,
      },
      {
        path: 'ops/.github/workflows/ci-cd.yml',
        content: TemplateProcessor.processTemplateFile('ops/github-actions.template', templateVars),
      },
      {
        path: 'ops/grafana/provisioning/dashboards/api-metrics.json',
        content: JSON.stringify({
          dashboard: {
            title: `${project.name} API Metrics`,
            tags: ['api', 'metrics'],
            timezone: 'browser',
            panels: [
              {
                title: 'Request Rate',
                type: 'graph',
                targets: [{
                  expr: 'rate(http_requests_total[5m])',
                  legendFormat: '{{method}} {{status}}'
                }]
              },
              {
                title: 'Response Time',
                type: 'graph',
                targets: [{
                  expr: 'histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))',
                  legendFormat: '95th percentile'
                }]
              },
              {
                title: 'Error Rate',
                type: 'graph',
                targets: [{
                  expr: 'rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m]) * 100',
                  legendFormat: 'Error rate %'
                }]
              }
            ]
          }
        }, null, 2),
      },
    ];
  }

  private async generateHelm(project: Project): Promise<any[]> {
    const templateVars = {
      projectName: project.name.toLowerCase(),
      port: 3000,
    };

    return [
      {
        path: 'helm/Chart.yaml',
        content: TemplateProcessor.processTemplateFile('helm/chart.template', templateVars),
      },
      {
        path: 'helm/values.yaml',
        content: TemplateProcessor.processTemplateFile('helm/enhanced-values.template', templateVars),
      },
      {
        path: 'helm/templates/deployment.yaml',
        content: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "${project.name.toLowerCase()}.fullname" . }}
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      {{- include "${project.name.toLowerCase()}.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      labels:
        {{- include "${project.name.toLowerCase()}.selectorLabels" . | nindent 8 }}
    spec:
      containers:
        - name: api
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
          ports:
            - name: http
              containerPort: {{ .Values.service.port }}
              protocol: TCP
          env:
            - name: NODE_ENV
              value: production
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: {{ include "${project.name.toLowerCase()}.fullname" . }}
                  key: database-url
            - name: REDIS_URL
              value: redis://{{ .Values.redis.host }}:{{ .Values.redis.port }}
          resources:
            {{- toYaml .Values.resources | nindent 12 }}
      volumes:
        - name: tmp-volume
          emptyDir: {}
`,
      },
      {
        path: 'helm/templates/service.yaml',
        content: `apiVersion: v1
kind: Service
metadata:
  name: {{ include "${project.name.toLowerCase()}.fullname" . }}
spec:
  type: {{ .Values.service.type }}
  ports:
    - port: {{ .Values.service.port }}
      targetPort: http
      protocol: TCP
      name: http
  selector:
    {{- include "${project.name.toLowerCase()}.selectorLabels" . | nindent 4 }}
`,
      },
      {
        path: 'helm/templates/configmap.yaml',
        content: TemplateProcessor.processTemplateFile('helm/configmap.template', templateVars),
      },
      {
        path: 'helm/templates/secret.yaml',
        content: TemplateProcessor.processTemplateFile('helm/secret.template', templateVars),
      },
      {
        path: 'helm/templates/serviceaccount.yaml',
        content: TemplateProcessor.processTemplateFile('helm/serviceaccount.template', templateVars),
      },
      {
        path: 'helm/templates/ingress.yaml',
        content: TemplateProcessor.processTemplateFile('helm/ingress.template', templateVars),
      },
      {
        path: 'helm/templates/networkpolicy.yaml',
        content: TemplateProcessor.processTemplateFile('helm/networkpolicy.template', templateVars),
      },
      {
        path: 'helm/templates/_helpers.tpl',
        content: `{{/*
Expand the name of the chart.
*/}}
{{- define "${project.name.toLowerCase()}.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "${project.name.toLowerCase()}.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "${project.name.toLowerCase()}.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "${project.name.toLowerCase()}.labels" -}}
helm.sh/chart: {{ include "${project.name.toLowerCase()}.chart" . }}
{{ include "${project.name.toLowerCase()}.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "${project.name.toLowerCase()}.selectorLabels" -}}
app.kubernetes.io/name: {{ include "${project.name.toLowerCase()}.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}
`,
      },
    ];
  }

  private async generateDocs(project: Project): Promise<any[]> {
    return [
      {
        path: 'README.md',
        content: `# ${project.name}

Generated API integration for ${project.name}.

## Overview

This repository contains auto-generated code for integrating with ${project.name} API.

## Structure

- \`/sdk\` - Generated SDKs for various languages
- \`/server\` - Generated server adapters
- \`/flows\` - Workflow automations
- \`/tests\` - Test suites
- \`/ops\` - Operational configurations
- \`/helm\` - Kubernetes deployments

## Quick Start

1. **Install dependencies:**
   \`\`\`bash
   npm install
   \`\`\`

2. **Configure environment:**
   \`\`\`bash
   cp .env.example .env
   # Edit .env with your API credentials
   \`\`\`

3. **Use the SDK:**
   \`\`\`typescript
   import { ${project.name}Client } from '@ai-api-integrator/${project.name.toLowerCase()}-sdk';

   const client = new ${project.name}Client({
     baseURL: 'https://api.${project.name.toLowerCase()}.com',
     apiKey: process.env.API_KEY,
   });

   const items = await client.findAll();
   \`\`\`

## Development

### Running Tests

\`\`\`bash
# Run all tests
npm run test

# Run specific test suite
npm run test -- --testNamePattern="api"
\`\`\`

### Building

\`\`\`bash
# Build for production
npm run build

# Build and watch for changes
npm run build:watch
\`\`\`

### Linting

\`\`\`bash
# Check code style
npm run lint

# Fix linting issues automatically
npm run lint:fix
\`\`\`

## API Reference

See [API_REFERENCE.md](./API_REFERENCE.md) for detailed documentation.

## Support

This code was generated by [AI API Integrator](https://github.com/ai-api-integrator).

For issues with the generated code, please check:
1. The original API documentation
2. The AI API Integrator issue tracker
3. Your specific use case requirements
`,
      },
      {
        path: 'API_REFERENCE.md',
        content: `# ${project.name} API Reference

This document provides detailed information about the generated ${project.name} integration.

## Authentication

The SDK supports API key authentication:

\`\`\`typescript
const client = new ${project.name}Client({
  apiKey: 'your-api-key',
  baseURL: 'https://api.${project.name.toLowerCase()}.com',
});
\`\`\`

## Basic Usage

### Making Requests

\`\`\`typescript
// GET request
const items = await client.findAll();

// POST request
const newItem = await client.create({
  name: 'New Item',
  description: 'Description',
});

// PUT request
const updatedItem = await client.update(itemId, {
  name: 'Updated Name',
});

// DELETE request
await client.delete(itemId);
\`\`\`

## Pagination

### Offset-based pagination

\`\`\`typescript
const response = await client.findAll({
  offset: 0,
  limit: 10
});
\`\`\`

### Cursor-based pagination

\`\`\`typescript
const response = await client.findAll({
  cursor: 'next-cursor-token',
  limit: 10
});
\`\`\`

### Auto-pagination

\`\`\`typescript
const paginator = new AutoPaginator(client.findAll.bind(client));
const allItems = await paginator.all();
\`\`\`

## Retry Logic

The SDK automatically retries failed requests:

\`\`\`typescript
// Custom retry configuration
const result = await RetryHelper.withRetry(
  () => client.findAll(),
  {
    maxRetries: 5,
    baseDelay: 1000,
  }
);
\`\`\`

## Rate Limiting

Built-in rate limiting protection:

\`\`\`typescript
const limiter = new RateLimiter(100, 60000); // 100 requests per minute
await limiter.waitForSlot();
const result = await client.findAll();
\`\`\`

## Error Handling

The SDK provides comprehensive error handling:

\`\`\`typescript
try {
  const result = await client.findAll();
} catch (error) {
  if (error instanceof AuthenticationError) {
    console.log('Authentication failed');
  } else if (error instanceof RateLimitError) {
    console.log('Rate limited:', error.retryAfter);
  } else if (error instanceof ValidationError) {
    console.log('Validation error:', error.details);
  } else {
    console.log('Other error:', error.message);
  }
}
\`\`\`

## Configuration Options

\`\`\`typescript
const client = new ${project.name}Client({
  baseURL: 'https://api.${project.name.toLowerCase()}.com',
  apiKey: 'your-api-key',
  timeout: 30000, // 30 seconds
  retries: 3,
  retryDelay: 1000,
});
\`\`\`

## Advanced Features

### Custom Headers

\`\`\`typescript
const client = new ${project.name}Client({
  apiKey: 'your-api-key',
  headers: {
    'X-Custom-Header': 'value',
    'User-Agent': 'MyApp/1.0.0',
  },
});
\`\`\`

### Request Interceptors

\`\`\`typescript
client.addRequestInterceptor((request) => {
  // Modify request before sending
  request.headers['X-Request-ID'] = generateRequestId();
  return request;
});
\`\`\`

### Response Interceptors

\`\`\`typescript
client.addResponseInterceptor((response) => {
  // Process response after receiving
  console.log(\`Request took \${response.duration}ms\`);
  return response;
});
\`\`\`
\`,
      },
      {
        path: 'DEPLOYMENT.md',
        content: `# ${project.name} Deployment Guide

This guide provides instructions for deploying the generated ${project.name} integration.

## Prerequisites

- Node.js 18+ or Python 3.8+
- Docker (optional)
- Kubernetes (optional)

## Local Development

### Using Node.js

1. **Install dependencies:**
   \`\`\`bash
   npm install
   \`\`\`

2. **Set up environment:**
   \`\`\`bash
   cp .env.example .env
   # Edit .env with your configuration
   \`\`\`

3. **Run the application:**
   \`\`\`bash
   npm run dev
   \`\`\`

### Using Python

1. **Create virtual environment:**
   \`\`\`bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\\Scripts\\activate
   \`\`\`

2. **Install dependencies:**
   \`\`\`bash
   pip install -r requirements.txt
   \`\`\`

3. **Run the application:**
   \`\`\`bash
   python main.py
   \`\`\`

## Docker Deployment

### Build the image

\`\`\`bash
docker build -t ${project.name.toLowerCase()}-api .
\`\`\`

### Run with Docker

\`\`\`bash
docker run -p 3000:3000 \\
  -e API_KEY=your-api-key \\
  ${project.name.toLowerCase()}-api
\`\`\`

## Kubernetes Deployment

### Using Helm

1. **Install Helm chart:**
   \`\`\`bash
   helm install ${project.name.toLowerCase()} ./helm
   \`\`\`

2. **Upgrade deployment:**
   \`\`\`bash
   helm upgrade ${project.name.toLowerCase()} ./helm
   \`\`\`

### Manual Kubernetes deployment

1. **Apply configurations:**
   \`\`\`bash
   kubectl apply -f k8s/
   \`\`\`

2. **Check deployment status:**
   \`\`\`bash
   kubectl get pods
   kubectl get services
   \`\`\`

## Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| API_KEY | API authentication key | Yes | - |
| BASE_URL | API base URL | No | https://api.example.com |
| PORT | Server port | No | 3000 |
| NODE_ENV | Environment | No | development |
| LOG_LEVEL | Logging level | No | info |

## Monitoring

### Health Checks

The application provides health check endpoints:

- \`GET /health\` - General health status
- \`GET /health/live\` - Liveness probe
- \`GET /health/ready\` - Readiness probe

### Metrics

Prometheus metrics are available at \`/metrics\`.

### Logging

Logs are output in JSON format for easy parsing:

\`\`\`json
{
  "timestamp": "2023-12-01T10:00:00Z",
  "level": "info",
  "message": "Request processed",
  "requestId": "req-123",
  "duration": 150
}
\`\`\`

## Troubleshooting

### Common Issues

1. **Connection timeouts**
   - Check network connectivity
   - Verify API credentials
   - Review timeout settings

2. **Rate limiting**
   - Implement request throttling
   - Check API usage limits
   - Use exponential backoff

3. **Memory issues**
   - Monitor heap usage
   - Adjust garbage collection settings
   - Scale horizontally if needed

### Debug Mode

Enable debug logging:

\`\`\`bash
export LOG_LEVEL=debug
export DEBUG=*
\`\`\`

## Security Considerations

1. **API Keys**: Store securely using environment variables or secret management
2. **HTTPS**: Always use HTTPS in production
3. **Rate Limiting**: Implement appropriate rate limiting
4. **Input Validation**: Validate all input data
5. **Error Handling**: Don't expose sensitive information in errors

## Performance Tuning

### Node.js Optimization

\`\`\`javascript
// Use clustering for multi-core utilization
const cluster = require('cluster');
const numCPUs = require('os').cpus().length;

if (cluster.isMaster) {
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }
}
\`\`\`

### Database Connection Pooling

Configure appropriate connection pool sizes based on your workload.

## Backup and Recovery

1. **Regular backups** of configuration and data
2. **Disaster recovery** procedures
3. **Rollback strategies** for deployments

## Support

For deployment issues, please check:
1. This deployment guide
2. Application logs
3. Infrastructure monitoring
4. The AI API Integrator documentation
`,
      }
    ];
  }
   \`\`\`

2. **Configure environment:**
   \`\`\`bash
   cp .env.example .env
   # Edit .env with your API credentials
   \`\`\`

3. **Use the SDK:**
   \`\`\`typescript
   import { ${project.name}Client } from '@ai-api-integrator/${project.name.toLowerCase()}-sdk';

   const client = new ${project.name}Client({
     baseURL: 'https://api.${project.name.toLowerCase()}.com',
     apiKey: process.env.API_KEY,
   });

   const items = await client.findAll();
   \`\`\`

\`\`\`

## Development

### Running Tests

\`\`\`bash
# Run all tests
npm run test

# Run with coverage
npm run test:coverage
\`\`\`

### Building

\`\`\`bash
# Build SDK
cd sdk/typescript
npm run build

# Build server
cd ../../server/nestjs
npm run build
\`\`\`

## Deployment

### Docker

\`\`\`bash
cd ops
docker-compose up -d
\`\`\`

### Kubernetes

\`\`\`bash
cd helm
helm install ${project.name.toLowerCase()} .
\`\`\`

## Support

This code was generated by [AI API Integrator](https://github.com/ai-api-integrator).

For issues with the generated code, please check:
1. The original API documentation
2. The AI API Integrator issue tracker
3. Your specific use case requirements
`,
      },
      {
        path: 'API_REFERENCE.md',
        content: `# ${project.name} API Reference

This document provides detailed information about the generated ${project.name} integration.

## Authentication

The SDK supports API key authentication:

\`\`\`typescript
const client = new ${project.name}Client({
  baseURL: 'https://api.${project.name.toLowerCase()}.com',
  apiKey: 'your-api-key',
});
\`\`\`

## Error Handling

The SDK provides specific error types:

- \`AuthenticationError\` - Invalid API key
- \`AuthorizationError\` - Insufficient permissions
- \`NotFoundError\` - Resource not found
- \`RateLimitError\` - Rate limit exceeded
- \`ValidationError\` - Invalid request data
- \`ServerError\` - Server-side errors
- \`NetworkError\` - Network connectivity issues

## Pagination

### Offset-based pagination

\`\`\`typescript
const response = await client.findAll({
  page: 1,
  limit: 10
});
\`\`\`

### Cursor-based pagination

\`\`\`typescript
const response = await client.findAll({
  cursor: 'next-cursor-token',
  limit: 10
});
\`\`\`

### Auto-pagination

\`\`\`typescript
const paginator = new AutoPaginator(client.findAll.bind(client));
const allItems = await paginator.all();
\`\`\`

## Retry Logic

The SDK automatically retries failed requests:

\`\`\`typescript
// Custom retry configuration
const result = await RetryHelper.withRetry(
  () => client.findAll(),
  {
    maxRetries: 5,
    baseDelay: 1000,
  }
);
\`\`\`

## Rate Limiting

Built-in rate limiting protection:

\`\`\`typescript
const limiter = new RateLimiter(100, 60000); // 100 requests per minute
await limiter.waitForSlot();
const result = await client.findAll();
\`\`\`
`,
      },
    ];
  }

  private async generateConfig(project: Project): Promise<any[]> {
    return [
      {
        path: '.gitignore',
        content: `# Dependencies
node_modules/
__pycache__/
*.py[cod]
*$py.class

# Environment variables
.env
.env.local
.env.production

# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Runtime data
pids
*.pid
*.seed
*.pid.lock

# Coverage directory used by tools like istanbul
coverage/
*.lcov

# nyc test coverage
.nyc_output

# Dependency directories
node_modules/
jspm_packages/

# TypeScript cache
*.tsbuildinfo

# Optional npm cache directory
.npm

# Optional eslint cache
.eslintcache

# Microbundle cache
.rpt2_cache/
.rts2_cache_cjs/
.rts2_cache_es/
.rts2_cache_umd/

# Optional REPL history
.node_repl_history

# Output of 'npm pack'
*.tgz

# Yarn Integrity file
.yarn-integrity

# parcel-bundler cache (https://parceljs.org/)
.cache
.parcel-cache

# Next.js build output
.next

# Nuxt.js build / generate output
.nuxt
dist

# Gatsby files
.cache/
public

# Storybook build outputs
.out
.storybook-out

# Temporary folders
tmp/
temp/

# Editor directories and files
.vscode/
.idea
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?

# OS generated files
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db
`,
      },
      {
        path: '.env.example',
        content: `# ${project.name} Configuration

# API Configuration
API_BASE_URL=https://api.${project.name.toLowerCase()}.com
API_KEY=your-api-key-here

# Database (for server deployment)
DATABASE_URL=postgresql://user:password@localhost:5432/${project.name.toLowerCase()}

# Redis (for caching and queues)
REDIS_URL=redis://localhost:6379

# Logging
LOG_LEVEL=info

# Rate Limiting
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=60000

# Retry Configuration
RETRY_MAX_ATTEMPTS=3
RETRY_BASE_DELAY=1000
RETRY_MAX_DELAY=10000
`,
      },
    ];
  }

  private convertToFileArray(generatedCode: any, prefix: string): any[] {
    const files: any[] = [];

    // Convert the nested structure to flat file array
    Object.entries(generatedCode).forEach(([category, items]) => {
      if (Array.isArray(items)) {
        items.forEach((content, index) => {
          files.push({
            path: `${prefix}/${category}/${index + 1}.ts`,
            content,
          });
        });
      }
    });

    return files;
  }

  private addSDKToZip(zip: JSZip, language: string, files: any[]): void {
    const sdkFolder = zip.folder(`sdk/${language}`);
    if (!sdkFolder) return;

    files.forEach(file => {
      sdkFolder.file(file.path.replace(`typescript-sdk/`, ''), file.content);
    });
  }

  private addServerToZip(zip: JSZip, framework: string, files: any[]): void {
    const serverFolder = zip.folder(`server/${framework}`);
    if (!serverFolder) return;

    files.forEach(file => {
      serverFolder.file(file.path.replace(`nestjs-server/`, ''), file.content);
    });
  }

  private addFlowsToZip(zip: JSZip, files: any[]): void {
    const flowsFolder = zip.folder('flows');
    if (!flowsFolder) return;

    files.forEach(file => {
      flowsFolder.file(file.path.replace('flows/', ''), file.content);
    });
  }

  private addTestsToZip(zip: JSZip, files: any[]): void {
    const testsFolder = zip.folder('tests');
    if (!testsFolder) return;

    files.forEach(file => {
      testsFolder.file(file.path.replace('tests/', ''), file.content);
    });
  }

  private addOpsToZip(zip: JSZip, files: any[]): void {
    const opsFolder = zip.folder('ops');
    if (!opsFolder) return;

    files.forEach(file => {
      opsFolder.file(file.path.replace('ops/', ''), file.content);
    });
  }

  private addHelmToZip(zip: JSZip, files: any[]): void {
    const helmFolder = zip.folder('helm');
    if (!helmFolder) return;

    files.forEach(file => {
      helmFolder.file(file.path.replace('helm/', ''), file.content);
    });
  }

  private addDocsToZip(zip: JSZip, files: any[]): void {
    files.forEach(file => {
      if (file.path === 'README.md') {
        zip.file(file.path, file.content);
      } else {
        const docsFolder = zip.folder('docs');
        if (docsFolder) {
          docsFolder.file(file.path.replace('docs/', ''), file.content);
        }
      }
    });
  }

  private addConfigToZip(zip: JSZip, files: any[], project: Project): void {
    files.forEach(file => {
      zip.file(file.path, file.content);
    });

    // Add package.json at root level
    zip.file('package.json', JSON.stringify({
      name: `${project.name.toLowerCase()}-integration`,
      version: '1.0.0',
      description: `Generated integration for ${project.name}`,
      private: true,
      scripts: {
        'test': 'npm run test --workspaces',
        'build': 'npm run build --workspaces',
        'lint': 'npm run lint --workspaces'
      },
      workspaces: [
        'sdk/*',
        'server/*'
      ]
    }, null, 2));
  }
}
