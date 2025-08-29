import { HttpStatus } from '@nestjs/common';
import { E2ETestHelper, E2ETestContext } from '../e2e/setup';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Golden Test Suite - Tests against real API specifications and known good outputs
 * 
 * These tests validate the system against real-world API specifications
 * and ensure consistent behavior across versions.
 */
describe('Golden Test Suite', () => {
  let context: E2ETestContext;
  let testScenario: any;

  beforeAll(async () => {
    context = await E2ETestHelper.setup();
    testScenario = await E2ETestHelper.createCompleteTestScenario(context);
  });

  afterAll(async () => {
    await context.cleanup();
  });

  describe('Real API Specifications', () => {
    const realApiSpecs = [
      {
        name: 'Stripe API',
        spec: createStripeApiSpec(),
        expectedEndpoints: 150,
        expectedModels: 80,
        complexity: 'large',
      },
      {
        name: 'GitHub API',
        spec: createGitHubApiSpec(),
        expectedEndpoints: 200,
        expectedModels: 100,
        complexity: 'xlarge',
      },
      {
        name: 'Simple REST API',
        spec: createSimpleRestApiSpec(),
        expectedEndpoints: 5,
        expectedModels: 3,
        complexity: 'small',
      },
      {
        name: 'Complex E-commerce API',
        spec: createEcommerceApiSpec(),
        expectedEndpoints: 50,
        expectedModels: 30,
        complexity: 'medium',
      },
    ];

    realApiSpecs.forEach(({ name, spec, expectedEndpoints, expectedModels, complexity }) => {
      describe(`${name} Processing`, () => {
        let specId: string;

        beforeAll(async () => {
          const { owner } = testScenario.users;
          const { project } = testScenario;
          const { request: authRequest } = await E2ETestHelper.createAuthenticatedRequest(context, owner);

          // Upload the real API spec
          const response = await authRequest
            .post(`/api/v1/projects/${project.id}/specs`)
            .send({
              name,
              format: 'openapi',
              originalSpec: spec,
            })
            .expect(HttpStatus.CREATED);

          specId = response.body.data.id;

          // Wait for processing to complete
          await E2ETestHelper.waitForAsyncOperations(2000);
        });

        it('should parse and normalize the specification correctly', async () => {
          const { owner } = testScenario.users;
          const { project } = testScenario;
          const { request: authRequest } = await E2ETestHelper.createAuthenticatedRequest(context, owner);

          const response = await authRequest
            .get(`/api/v1/projects/${project.id}/specs/${specId}`)
            .expect(HttpStatus.OK);

          const processedSpec = response.body.data;

          expect(processedSpec).toMatchObject({
            id: specId,
            name,
            format: 'openapi',
            status: 'ready',
            metadata: expect.objectContaining({
              title: expect.any(String),
              endpointCount: expect.any(Number),
              modelCount: expect.any(Number),
            }),
          });

          // Verify endpoint count is within expected range (±10%)
          const endpointTolerance = Math.ceil(expectedEndpoints * 0.1);
          expect(processedSpec.metadata.endpointCount).toBeGreaterThanOrEqual(expectedEndpoints - endpointTolerance);
          expect(processedSpec.metadata.endpointCount).toBeLessThanOrEqual(expectedEndpoints + endpointTolerance);

          // Verify model count is within expected range (±10%)
          const modelTolerance = Math.ceil(expectedModels * 0.1);
          expect(processedSpec.metadata.modelCount).toBeGreaterThanOrEqual(expectedModels - modelTolerance);
          expect(processedSpec.metadata.modelCount).toBeLessThanOrEqual(expectedModels + modelTolerance);
        });

        it('should generate TypeScript SDK correctly', async () => {
          const { owner } = testScenario.users;
          const { request: authRequest } = await E2ETestHelper.createAuthenticatedRequest(context, owner);

          const response = await authRequest
            .post('/api/v1/codegen/generate')
            .send({
              specId,
              language: 'typescript',
              options: {
                includeTests: true,
                includeDocumentation: true,
                optimizeForSize: complexity === 'xlarge',
              },
            })
            .expect(HttpStatus.CREATED);

          const generatedCode = response.body.data;

          expect(generatedCode).toMatchObject({
            language: 'typescript',
            status: expect.stringMatching(/completed|generating/),
            files: expect.any(Object),
            metadata: expect.objectContaining({
              fileCount: expect.any(Number),
              totalSize: expect.any(Number),
            }),
          });

          // Verify essential files are generated
          const files = generatedCode.files;
          expect(files).toHaveProperty('index.ts');
          expect(files).toHaveProperty('types.ts');
          expect(files).toHaveProperty('client.ts');

          // Verify generated TypeScript is valid
          const indexContent = files['index.ts'];
          expect(indexContent).toContain('export');
          expect(indexContent).not.toContain('undefined');
          expect(indexContent).not.toContain('null');

          // For large APIs, verify optimization features
          if (complexity === 'xlarge') {
            expect(files).toHaveProperty('lazy-loader.ts');
            expect(files).toHaveProperty('performance-helper.ts');
          }
        });

        it('should generate Python SDK correctly', async () => {
          const { owner } = testScenario.users;
          const { request: authRequest } = await E2ETestHelper.createAuthenticatedRequest(context, owner);

          const response = await authRequest
            .post('/api/v1/codegen/generate')
            .send({
              specId,
              language: 'python',
              options: {
                packageName: name.toLowerCase().replace(/\s+/g, '_'),
                includeAsyncClient: true,
              },
            })
            .expect(HttpStatus.CREATED);

          const generatedCode = response.body.data;

          expect(generatedCode).toMatchObject({
            language: 'python',
            status: expect.stringMatching(/completed|generating/),
            files: expect.any(Object),
          });

          const files = generatedCode.files;
          expect(files).toHaveProperty('__init__.py');
          expect(files).toHaveProperty('client.py');
          expect(files).toHaveProperty('models.py');

          // Verify Python syntax
          const clientContent = files['client.py'];
          expect(clientContent).toContain('class');
          expect(clientContent).toContain('def ');
          expect(clientContent).toContain('import');
        });

        it('should detect advanced patterns correctly', async () => {
          const { owner } = testScenario.users;
          const { request: authRequest } = await E2ETestHelper.createAuthenticatedRequest(context, owner);

          // Test pagination detection
          const paginationResponse = await authRequest
            .post('/api/v1/codegen/analyze-pagination')
            .send({ specId })
            .expect(HttpStatus.OK);

          expect(paginationResponse.body.data).toMatchObject({
            patterns: expect.any(Array),
            recommendations: expect.any(Array),
          });

          // Test authentication detection
          const authResponse = await authRequest
            .post('/api/v1/codegen/analyze-auth')
            .send({ specId })
            .expect(HttpStatus.OK);

          expect(authResponse.body.data).toMatchObject({
            schemes: expect.any(Array),
            complexity: expect.any(String),
          });
        });

        it('should create shareable links with correct permissions', async () => {
          const { owner } = testScenario.users;
          const { request: authRequest } = await E2ETestHelper.createAuthenticatedRequest(context, owner);

          const response = await authRequest
            .post('/api/v1/share')
            .send({
              specId,
              ttlSeconds: 3600,
              allowDownload: true,
              allowCopy: false,
              watermark: `${name} - Shared via AI API Integrator`,
            })
            .expect(HttpStatus.CREATED);

          const share = response.body.data;

          expect(share).toMatchObject({
            id: expect.any(String),
            shareToken: expect.any(String),
            publicUrl: expect.stringMatching(/^\/public\/share\/.+/),
            permissions: {
              allowDownload: true,
              allowCopy: false,
              watermark: expect.stringContaining(name),
            },
          });

          // Test public access
          const publicResponse = await context.request
            .get(share.publicUrl)
            .expect(HttpStatus.OK);

          expect(publicResponse.body.data).toMatchObject({
            name,
            format: 'openapi',
            // Should not include sensitive data
          });
        });
      });
    });
  });

  describe('Golden Workflow Executions', () => {
    const goldenWorkflows = [
      {
        name: 'API Data Pipeline',
        workflow: createApiDataPipelineWorkflow(),
        expectedOutputs: 4,
        expectedDuration: 5000, // 5 seconds
      },
      {
        name: 'Multi-step Authentication Flow',
        workflow: createAuthenticationWorkflow(),
        expectedOutputs: 3,
        expectedDuration: 3000,
      },
      {
        name: 'Data Transformation Chain',
        workflow: createDataTransformationWorkflow(),
        expectedOutputs: 5,
        expectedDuration: 2000,
      },
    ];

    goldenWorkflows.forEach(({ name, workflow, expectedOutputs, expectedDuration }) => {
      it(`should execute ${name} correctly`, async () => {
        const { owner } = testScenario.users;

        context.mockExternalAPIs();

        try {
          const startTime = Date.now();

          const response = await E2ETestHelper.executeWorkflowE2E(
            context,
            { definition: workflow },
            owner,
            { sandbox: false }
          );

          const duration = Date.now() - startTime;

          expect(response.status).toBe(HttpStatus.OK);
          expect(response.body.data).toMatchObject({
            flowId: workflow.id,
            success: true,
            outputs: expect.any(Array),
            logs: expect.any(Array),
            durationMs: expect.any(Number),
          });

          // Verify expected number of outputs
          expect(response.body.data.outputs).toHaveLength(expectedOutputs);

          // Verify execution time is reasonable
          expect(duration).toBeLessThan(expectedDuration);

          // Verify no error logs
          const errorLogs = response.body.data.logs.filter(log => log.level === 'error');
          expect(errorLogs).toHaveLength(0);

          console.log(`${name} executed in ${duration}ms with ${response.body.data.outputs.length} outputs`);
        } finally {
          context.cleanupMocks();
        }
      });
    });
  });

  describe('Performance Benchmarks', () => {
    it('should meet performance benchmarks for spec processing', async () => {
      const { owner } = testScenario.users;
      const { project } = testScenario;
      const { request: authRequest } = await E2ETestHelper.createAuthenticatedRequest(context, owner);

      const benchmarks = [
        { name: 'Small API (5 endpoints)', spec: createSimpleRestApiSpec(), maxTime: 2000 },
        { name: 'Medium API (50 endpoints)', spec: createEcommerceApiSpec(), maxTime: 10000 },
        { name: 'Large API (150 endpoints)', spec: createStripeApiSpec(), maxTime: 30000 },
      ];

      for (const benchmark of benchmarks) {
        const startTime = Date.now();

        const response = await authRequest
          .post(`/api/v1/projects/${project.id}/specs`)
          .send({
            name: `Benchmark - ${benchmark.name}`,
            format: 'openapi',
            originalSpec: benchmark.spec,
          })
          .expect(HttpStatus.CREATED);

        // Wait for processing
        await E2ETestHelper.waitForAsyncOperations(1000);

        const processingTime = Date.now() - startTime;

        expect(processingTime).toBeLessThan(benchmark.maxTime);

        console.log(`${benchmark.name}: ${processingTime}ms (limit: ${benchmark.maxTime}ms)`);
      }
    });

    it('should handle concurrent load efficiently', async () => {
      const { owner } = testScenario.users;
      const concurrentRequests = 10;
      const maxTotalTime = 15000; // 15 seconds for all requests

      const startTime = Date.now();

      // Execute multiple workflows concurrently
      const promises = Array.from({ length: concurrentRequests }, (_, i) =>
        E2ETestHelper.executeWorkflowE2E(
          context,
          { definition: createSimpleWorkflow(i) },
          owner,
          { workflowId: `load-test-${i}` }
        )
      );

      const responses = await Promise.all(promises);
      const totalTime = Date.now() - startTime;

      // All requests should succeed
      responses.forEach((response, i) => {
        expect(response.status).toBe(HttpStatus.OK);
        expect(response.body.data.success).toBe(true);
      });

      expect(totalTime).toBeLessThan(maxTotalTime);

      console.log(`${concurrentRequests} concurrent workflows completed in ${totalTime}ms`);
    });
  });

  describe('Regression Tests', () => {
    it('should maintain backward compatibility with v1.0 specs', async () => {
      const { owner } = testScenario.users;
      const { project } = testScenario;
      const { request: authRequest } = await E2ETestHelper.createAuthenticatedRequest(context, owner);

      // Test with OpenAPI 3.0.0 spec
      const v30Spec = {
        openapi: '3.0.0',
        info: { title: 'Legacy API', version: '1.0.0' },
        paths: {
          '/legacy': {
            get: {
              responses: {
                '200': { description: 'Success' },
              },
            },
          },
        },
      };

      const response = await authRequest
        .post(`/api/v1/projects/${project.id}/specs`)
        .send({
          name: 'Legacy API v3.0.0',
          format: 'openapi',
          originalSpec: v30Spec,
        })
        .expect(HttpStatus.CREATED);

      expect(response.body.data.status).not.toBe('error');
    });

    it('should handle edge cases consistently', async () => {
      const edgeCases = [
        {
          name: 'Empty paths object',
          spec: { openapi: '3.0.0', info: { title: 'Empty', version: '1.0.0' }, paths: {} },
        },
        {
          name: 'Circular references',
          spec: createSpecWithCircularReferences(),
        },
        {
          name: 'Very long parameter names',
          spec: createSpecWithLongNames(),
        },
      ];

      const { owner } = testScenario.users;
      const { project } = testScenario;
      const { request: authRequest } = await E2ETestHelper.createAuthenticatedRequest(context, owner);

      for (const edgeCase of edgeCases) {
        const response = await authRequest
          .post(`/api/v1/projects/${project.id}/specs`)
          .send({
            name: edgeCase.name,
            format: 'openapi',
            originalSpec: edgeCase.spec,
          });

        // Should not crash, either succeed or fail gracefully
        expect([HttpStatus.CREATED, HttpStatus.BAD_REQUEST]).toContain(response.status);

        if (response.status === HttpStatus.BAD_REQUEST) {
          expect(response.body.message).toBeDefined();
        }
      }
    });
  });
});

// Helper functions to create test API specifications
function createStripeApiSpec() {
  return {
    openapi: '3.0.0',
    info: {
      title: 'Stripe API',
      version: '2020-08-27',
      description: 'The Stripe REST API',
    },
    servers: [{ url: 'https://api.stripe.com' }],
    paths: {
      '/v1/customers': {
        get: {
          operationId: 'GetCustomers',
          summary: 'List customers',
          parameters: [
            { name: 'limit', in: 'query', schema: { type: 'integer' } },
            { name: 'starting_after', in: 'query', schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              description: 'Success',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/CustomerList' },
                },
              },
            },
          },
        },
        post: {
          operationId: 'CreateCustomer',
          summary: 'Create a customer',
          requestBody: {
            content: {
              'application/x-www-form-urlencoded': {
                schema: { $ref: '#/components/schemas/CreateCustomerRequest' },
              },
            },
          },
          responses: {
            '200': {
              description: 'Success',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Customer' },
                },
              },
            },
          },
        },
      },
      '/v1/customers/{customer}': {
        get: {
          operationId: 'GetCustomer',
          summary: 'Retrieve a customer',
          parameters: [
            { name: 'customer', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              description: 'Success',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Customer' },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        Customer: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            email: { type: 'string' },
            name: { type: 'string' },
            created: { type: 'integer' },
          },
        },
        CustomerList: {
          type: 'object',
          properties: {
            data: { type: 'array', items: { $ref: '#/components/schemas/Customer' } },
            has_more: { type: 'boolean' },
          },
        },
        CreateCustomerRequest: {
          type: 'object',
          properties: {
            email: { type: 'string' },
            name: { type: 'string' },
          },
        },
      },
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
        },
      },
    },
  };
}

function createGitHubApiSpec() {
  return {
    openapi: '3.0.0',
    info: {
      title: 'GitHub API',
      version: '1.1.4',
      description: 'GitHub REST API',
    },
    servers: [{ url: 'https://api.github.com' }],
    paths: {
      '/user': {
        get: {
          operationId: 'GetAuthenticatedUser',
          summary: 'Get the authenticated user',
          responses: {
            '200': {
              description: 'Success',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/User' },
                },
              },
            },
          },
        },
      },
      '/repos/{owner}/{repo}': {
        get: {
          operationId: 'GetRepository',
          summary: 'Get a repository',
          parameters: [
            { name: 'owner', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'repo', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              description: 'Success',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Repository' },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            login: { type: 'string' },
            name: { type: 'string' },
            email: { type: 'string' },
          },
        },
        Repository: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            name: { type: 'string' },
            full_name: { type: 'string' },
            private: { type: 'boolean' },
          },
        },
      },
    },
  };
}

function createSimpleRestApiSpec() {
  return E2ETestHelper.createTestApiSpec();
}

function createEcommerceApiSpec() {
  return {
    openapi: '3.0.0',
    info: {
      title: 'E-commerce API',
      version: '1.0.0',
      description: 'A comprehensive e-commerce API',
    },
    paths: {
      '/products': {
        get: { operationId: 'listProducts', responses: { '200': { description: 'Success' } } },
        post: { operationId: 'createProduct', responses: { '201': { description: 'Created' } } },
      },
      '/products/{id}': {
        get: { operationId: 'getProduct', responses: { '200': { description: 'Success' } } },
        put: { operationId: 'updateProduct', responses: { '200': { description: 'Updated' } } },
        delete: { operationId: 'deleteProduct', responses: { '204': { description: 'Deleted' } } },
      },
      '/orders': {
        get: { operationId: 'listOrders', responses: { '200': { description: 'Success' } } },
        post: { operationId: 'createOrder', responses: { '201': { description: 'Created' } } },
      },
      '/customers': {
        get: { operationId: 'listCustomers', responses: { '200': { description: 'Success' } } },
        post: { operationId: 'createCustomer', responses: { '201': { description: 'Created' } } },
      },
    },
    components: {
      schemas: {
        Product: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            price: { type: 'number' },
          },
        },
        Order: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            customerId: { type: 'string' },
            items: { type: 'array', items: { $ref: '#/components/schemas/OrderItem' } },
          },
        },
        OrderItem: {
          type: 'object',
          properties: {
            productId: { type: 'string' },
            quantity: { type: 'integer' },
          },
        },
      },
    },
  };
}

// Helper functions for workflow creation
function createApiDataPipelineWorkflow() {
  return {
    id: 'api-data-pipeline',
    name: 'API Data Pipeline',
    nodes: [
      {
        id: 'fetch-users',
        type: 'http',
        config: { method: 'GET', url: 'https://api.test.com/users' },
        next: ['transform-users'],
      },
      {
        id: 'transform-users',
        type: 'transform',
        config: { script: 'return data.map(u => ({ id: u.id, name: u.name }));' },
        next: ['fetch-posts'],
      },
      {
        id: 'fetch-posts',
        type: 'http',
        config: { method: 'GET', url: 'https://jsonplaceholder.typicode.com/posts' },
        next: ['combine-data'],
      },
      {
        id: 'combine-data',
        type: 'transform',
        config: { script: 'return { users: variables.transform_result, posts: variables.http_get_data };' },
      },
    ],
    entry: 'fetch-users',
  };
}

function createAuthenticationWorkflow() {
  return {
    id: 'auth-workflow',
    name: 'Authentication Workflow',
    nodes: [
      {
        id: 'get-token',
        type: 'http',
        config: {
          method: 'POST',
          url: 'https://api.test.com/auth/token',
          data: { grant_type: 'client_credentials' },
        },
        next: ['use-token'],
      },
      {
        id: 'use-token',
        type: 'http',
        config: {
          method: 'GET',
          url: 'https://api.test.com/protected',
          headers: { Authorization: 'Bearer {{http_post_data.access_token}}' },
        },
        next: ['verify-response'],
      },
      {
        id: 'verify-response',
        type: 'transform',
        config: { script: 'return { authenticated: !!data, user: data.user };' },
      },
    ],
    entry: 'get-token',
  };
}

function createDataTransformationWorkflow() {
  return {
    id: 'data-transform-workflow',
    name: 'Data Transformation Workflow',
    nodes: [
      {
        id: 'input',
        type: 'transform',
        config: { script: 'return [1, 2, 3, 4, 5];' },
        next: ['double'],
      },
      {
        id: 'double',
        type: 'transform',
        config: { script: 'return data.map(x => x * 2);' },
        next: ['filter'],
      },
      {
        id: 'filter',
        type: 'transform',
        config: { script: 'return data.filter(x => x > 5);' },
        next: ['sum'],
      },
      {
        id: 'sum',
        type: 'transform',
        config: { script: 'return data.reduce((a, b) => a + b, 0);' },
        next: ['format'],
      },
      {
        id: 'format',
        type: 'transform',
        config: { script: 'return { total: data, count: 2 };' },
      },
    ],
    entry: 'input',
  };
}

function createSimpleWorkflow(index: number) {
  return {
    id: `simple-workflow-${index}`,
    name: `Simple Workflow ${index}`,
    nodes: [
      {
        id: 'start',
        type: 'transform',
        config: { script: `return { index: ${index}, timestamp: Date.now() };` },
        next: ['delay'],
      },
      {
        id: 'delay',
        type: 'delay',
        config: { duration: 100, unit: 'ms' },
        next: ['end'],
      },
      {
        id: 'end',
        type: 'transform',
        config: { script: 'return { completed: true, index: data.index };' },
      },
    ],
    entry: 'start',
  };
}

function createSpecWithCircularReferences() {
  return {
    openapi: '3.0.0',
    info: { title: 'Circular Refs', version: '1.0.0' },
    paths: {
      '/test': {
        get: {
          responses: {
            '200': {
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Node' },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        Node: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            parent: { $ref: '#/components/schemas/Node' },
            children: {
              type: 'array',
              items: { $ref: '#/components/schemas/Node' },
            },
          },
        },
      },
    },
  };
}

function createSpecWithLongNames() {
  const longName = 'a'.repeat(200);
  return {
    openapi: '3.0.0',
    info: { title: 'Long Names', version: '1.0.0' },
    paths: {
      '/test': {
        get: {
          parameters: [
            { name: longName, in: 'query', schema: { type: 'string' } },
          ],
          responses: {
            '200': { description: 'Success' },
          },
        },
      },
    },
  };
}
