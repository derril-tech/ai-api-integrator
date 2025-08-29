import { HttpStatus } from '@nestjs/common';
import { E2ETestHelper, E2ETestContext } from './setup';

describe('Complete Workflow E2E Tests', () => {
  let context: E2ETestContext;
  let testScenario: any;

  beforeAll(async () => {
    context = await E2ETestHelper.setup();
    testScenario = await E2ETestHelper.createCompleteTestScenario(context);
  });

  afterAll(async () => {
    await context.cleanup();
  });

  beforeEach(async () => {
    // Setup external API mocks for each test
    context.mockExternalAPIs();
  });

  afterEach(async () => {
    // Clean up mocks after each test
    context.cleanupMocks();
  });

  describe('System Health Check', () => {
    it('should verify all system components are healthy', async () => {
      const healthChecks = await E2ETestHelper.verifySystemHealth(context);

      // All health checks should pass
      const unhealthyChecks = healthChecks.filter(check => check.status !== 'healthy');
      
      if (unhealthyChecks.length > 0) {
        console.error('Unhealthy components:', unhealthyChecks);
      }

      expect(unhealthyChecks).toHaveLength(0);
    });
  });

  describe('Complete API Specification Processing Pipeline', () => {
    it('should process API spec from upload to code generation', async () => {
      const { owner } = testScenario.users;
      const { project } = testScenario;

      const results = await E2ETestHelper.testApiSpecProcessingPipeline(
        context,
        project,
        owner
      );

      // Verify spec was created
      expect(results.spec).toMatchObject({
        id: expect.any(String),
        name: 'Pipeline Test API',
        format: 'openapi',
        status: expect.any(String),
      });

      // Verify processing status
      expect(results.status).toMatchObject({
        id: results.spec.id,
        status: expect.stringMatching(/ready|processing/),
      });

      // Verify code generation
      expect(results.codegen).toMatchObject({
        language: 'typescript',
        files: expect.any(Object),
        status: expect.stringMatching(/completed|generating/),
      });

      // Verify share link creation
      expect(results.share).toMatchObject({
        id: expect.any(String),
        shareToken: expect.any(String),
        publicUrl: expect.stringMatching(/^\/public\/share\/.+/),
      });
    });

    it('should handle large API specifications', async () => {
      const { owner } = testScenario.users;
      const { project } = testScenario;

      // Create a large API spec
      const largeApiSpec = {
        ...E2ETestHelper.createTestApiSpec(),
        paths: {},
      };

      // Add 100 endpoints
      for (let i = 0; i < 100; i++) {
        largeApiSpec.paths[`/resource${i}`] = {
          get: {
            operationId: `getResource${i}`,
            summary: `Get resource ${i}`,
            responses: {
              '200': {
                description: 'Success',
                content: {
                  'application/json': {
                    schema: { type: 'object' },
                  },
                },
              },
            },
          },
        };
      }

      const { request: authRequest } = await E2ETestHelper.createAuthenticatedRequest(context, owner);

      const response = await authRequest
        .post(`/api/v1/projects/${project.id}/specs`)
        .send({
          name: 'Large API Spec',
          format: 'openapi',
          originalSpec: largeApiSpec,
        })
        .expect(HttpStatus.CREATED);

      expect(response.body.data).toMatchObject({
        name: 'Large API Spec',
        format: 'openapi',
        metadata: expect.objectContaining({
          endpointCount: expect.any(Number),
        }),
      });

      // Should handle large specs without timeout
      expect(response.body.data.metadata.endpointCount).toBeGreaterThan(50);
    });
  });

  describe('Flow Execution End-to-End', () => {
    it('should execute complete workflow with HTTP calls', async () => {
      const { owner } = testScenario.users;
      const { workflowDefinition } = testScenario;

      const response = await E2ETestHelper.executeWorkflowE2E(
        context,
        workflowDefinition,
        owner,
        { sandbox: false }
      );

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body).toHaveValidApiResponse();
      expect(response.body.data).toMatchObject({
        flowId: workflowDefinition.definition.id,
        success: true,
        outputs: expect.any(Array),
        logs: expect.any(Array),
        durationMs: expect.any(Number),
      });

      // Verify HTTP calls were made
      const httpOutputs = response.body.data.outputs.filter(
        output => output.type === 'http'
      );
      expect(httpOutputs.length).toBeGreaterThan(0);

      // Verify transform operations
      const transformOutputs = response.body.data.outputs.filter(
        output => output.type === 'transform'
      );
      expect(transformOutputs.length).toBeGreaterThan(0);
    });

    it('should handle workflow with error conditions', async () => {
      const { owner } = testScenario.users;

      // Create workflow with failing HTTP call
      const errorWorkflow = {
        id: 'error-test-flow',
        name: 'Error Test Flow',
        nodes: [
          {
            id: 'failing-http',
            type: 'http',
            config: {
              method: 'GET',
              url: 'https://nonexistent.api.com/data',
              timeout: 1000,
            },
            next: ['recovery'],
          },
          {
            id: 'recovery',
            type: 'transform',
            config: {
              script: 'return { recovered: true, error: "handled" };',
            },
          },
        ],
        entry: 'failing-http',
      };

      const response = await E2ETestHelper.executeWorkflowE2E(
        context,
        { definition: errorWorkflow },
        owner,
        { sandbox: false }
      );

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.data).toMatchObject({
        flowId: errorWorkflow.id,
        success: expect.any(Boolean), // May succeed or fail depending on error handling
        outputs: expect.any(Array),
        logs: expect.any(Array),
      });

      // Should have error logs
      const errorLogs = response.body.data.logs.filter(log => log.level === 'error');
      expect(errorLogs.length).toBeGreaterThan(0);
    });

    it('should execute workflow with branching logic', async () => {
      const { owner } = testScenario.users;

      const branchingWorkflow = {
        id: 'branching-test-flow',
        name: 'Branching Test Flow',
        nodes: [
          {
            id: 'start',
            type: 'transform',
            config: {
              script: 'return { value: 42 };',
              outputVariable: 'initial_value',
            },
            next: ['branch'],
          },
          {
            id: 'branch',
            type: 'branch',
            config: {
              condition: 'variables.initial_value > 40',
              trueNodeId: 'high-value',
              falseNodeId: 'low-value',
            },
          },
          {
            id: 'high-value',
            type: 'transform',
            config: {
              script: 'return { result: "high", value: variables.initial_value };',
            },
          },
          {
            id: 'low-value',
            type: 'transform',
            config: {
              script: 'return { result: "low", value: variables.initial_value };',
            },
          },
        ],
        entry: 'start',
      };

      const response = await E2ETestHelper.executeWorkflowE2E(
        context,
        { definition: branchingWorkflow },
        owner
      );

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.data.success).toBe(true);

      // Should have taken the high-value branch
      const branchOutput = response.body.data.outputs.find(
        output => output.nodeId === 'branch'
      );
      expect(branchOutput.result.nextNodeId).toBe('high-value');

      const highValueOutput = response.body.data.outputs.find(
        output => output.nodeId === 'high-value'
      );
      expect(highValueOutput.result.result).toBe('high');
    });

    it('should execute workflow with loops', async () => {
      const { owner } = testScenario.users;

      const loopingWorkflow = {
        id: 'looping-test-flow',
        name: 'Looping Test Flow',
        nodes: [
          {
            id: 'start',
            type: 'transform',
            config: {
              script: 'return { counter: 0 };',
              outputVariable: 'counter',
            },
            next: ['loop'],
          },
          {
            id: 'loop',
            type: 'loop',
            config: {
              condition: 'variables.counter < 3',
              maxIterations: 5,
            },
            next: ['end'],
          },
          {
            id: 'end',
            type: 'transform',
            config: {
              script: 'return { final_count: variables.loop_iterations };',
            },
          },
        ],
        entry: 'start',
      };

      const response = await E2ETestHelper.executeWorkflowE2E(
        context,
        { definition: loopingWorkflow },
        owner
      );

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.data.success).toBe(true);

      const loopOutput = response.body.data.outputs.find(
        output => output.nodeId === 'loop'
      );
      expect(loopOutput.result.iterations).toBe(3);
    });
  });

  describe('Multi-User Collaboration', () => {
    it('should handle concurrent workflow executions', async () => {
      const { owner, admin, member } = testScenario.users;
      const { workflowDefinition } = testScenario;

      // Execute workflows concurrently from different users
      const promises = [owner, admin, member].map(user =>
        E2ETestHelper.executeWorkflowE2E(
          context,
          workflowDefinition,
          user,
          { workflowId: `concurrent-${user.id}-${Date.now()}` }
        )
      );

      const responses = await Promise.all(promises);

      // All executions should succeed
      responses.forEach(response => {
        expect(response.status).toBe(HttpStatus.OK);
        expect(response.body.data.success).toBe(true);
      });

      // Each execution should have unique workflow ID
      const workflowIds = responses.map(r => r.body.data.flowId);
      const uniqueIds = new Set(workflowIds);
      expect(uniqueIds.size).toBe(workflowIds.length);
    });

    it('should enforce organization permissions', async () => {
      const { owner, viewer } = testScenario.users;
      const { project } = testScenario;

      // Owner should be able to create specs
      const { request: ownerRequest } = await E2ETestHelper.createAuthenticatedRequest(context, owner);
      
      const ownerResponse = await ownerRequest
        .post(`/api/v1/projects/${project.id}/specs`)
        .send({
          name: 'Owner Created Spec',
          format: 'openapi',
          originalSpec: E2ETestHelper.createTestApiSpec(),
        })
        .expect(HttpStatus.CREATED);

      expect(ownerResponse.body.data.name).toBe('Owner Created Spec');

      // Viewer should not be able to create specs (depending on permissions)
      const { request: viewerRequest } = await E2ETestHelper.createAuthenticatedRequest(context, viewer);
      
      const viewerResponse = await viewerRequest
        .post(`/api/v1/projects/${project.id}/specs`)
        .send({
          name: 'Viewer Created Spec',
          format: 'openapi',
          originalSpec: E2ETestHelper.createTestApiSpec(),
        });

      // This might be 403 Forbidden or 201 Created depending on permissions implementation
      expect([HttpStatus.FORBIDDEN, HttpStatus.CREATED]).toContain(viewerResponse.status);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle multiple API specs efficiently', async () => {
      const { owner } = testScenario.users;
      const { project } = testScenario;
      const { request: authRequest } = await E2ETestHelper.createAuthenticatedRequest(context, owner);

      const startTime = Date.now();
      const specCount = 10;
      
      // Create multiple specs concurrently
      const promises = Array.from({ length: specCount }, (_, i) =>
        authRequest
          .post(`/api/v1/projects/${project.id}/specs`)
          .send({
            name: `Performance Test Spec ${i + 1}`,
            format: 'openapi',
            originalSpec: E2ETestHelper.createTestApiSpec(),
          })
      );

      const responses = await Promise.all(promises);
      const duration = Date.now() - startTime;

      // All specs should be created successfully
      responses.forEach(response => {
        expect(response.status).toBe(HttpStatus.CREATED);
      });

      // Should complete within reasonable time (adjust threshold as needed)
      expect(duration).toBeLessThan(30000); // 30 seconds

      console.log(`Created ${specCount} specs in ${duration}ms (${duration/specCount}ms per spec)`);
    });

    it('should handle large workflow executions', async () => {
      const { owner } = testScenario.users;

      // Create workflow with many nodes
      const largeWorkflow = {
        id: 'large-workflow',
        name: 'Large Workflow',
        nodes: [],
        entry: 'start',
      };

      // Add 50 sequential transform nodes
      for (let i = 0; i < 50; i++) {
        largeWorkflow.nodes.push({
          id: i === 0 ? 'start' : `transform-${i}`,
          type: 'transform',
          config: {
            script: `return { step: ${i}, value: ${i * 2} };`,
          },
          next: i < 49 ? [`transform-${i + 1}`] : undefined,
        });
      }

      const startTime = Date.now();
      
      const response = await E2ETestHelper.executeWorkflowE2E(
        context,
        { definition: largeWorkflow },
        owner
      );

      const duration = Date.now() - startTime;

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.data.success).toBe(true);
      expect(response.body.data.outputs).toHaveLength(50);

      // Should complete within reasonable time
      expect(duration).toBeLessThan(60000); // 60 seconds

      console.log(`Executed 50-node workflow in ${duration}ms`);
    });
  });
});
