import { IntegrationTestHelper, IntegrationTestContext } from '../integration/setup';
import * as nock from 'nock';

export interface E2ETestContext extends IntegrationTestContext {
  mockExternalAPIs: () => void;
  cleanupMocks: () => void;
}

export class E2ETestHelper extends IntegrationTestHelper {
  /**
   * Setup E2E test environment with external API mocking
   */
  static async setup(): Promise<E2ETestContext> {
    const baseContext = await super.setup();

    // Setup external API mocks
    const mockExternalAPIs = () => {
      // Mock external HTTP calls
      nock('https://api.test.com')
        .persist()
        .get('/users')
        .reply(200, [
          { id: '1', name: 'John Doe', email: 'john@test.com' },
          { id: '2', name: 'Jane Smith', email: 'jane@test.com' },
        ])
        .get('/users/1')
        .reply(200, { id: '1', name: 'John Doe', email: 'john@test.com' })
        .post('/users')
        .reply(201, { id: '3', name: 'New User', email: 'new@test.com' })
        .put('/users/1')
        .reply(200, { id: '1', name: 'Updated User', email: 'updated@test.com' })
        .delete('/users/1')
        .reply(204);

      // Mock webhook endpoints
      nock('https://webhook.test.com')
        .persist()
        .post('/webhook')
        .reply(200, { received: true, timestamp: new Date().toISOString() });

      // Mock third-party APIs
      nock('https://api.github.com')
        .persist()
        .get('/user')
        .reply(200, { login: 'testuser', id: 12345 });

      nock('https://jsonplaceholder.typicode.com')
        .persist()
        .get('/posts')
        .reply(200, [
          { id: 1, title: 'Test Post', body: 'Test content' },
        ])
        .get('/posts/1')
        .reply(200, { id: 1, title: 'Test Post', body: 'Test content' });

      // Mock OpenAI API
      nock('https://api.openai.com')
        .persist()
        .post('/v1/embeddings')
        .reply(200, {
          data: [
            {
              embedding: Array(1536).fill(0).map(() => Math.random()),
              index: 0,
            },
          ],
          model: 'text-embedding-ada-002',
          usage: { prompt_tokens: 10, total_tokens: 10 },
        })
        .post('/v1/chat/completions')
        .reply(200, {
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'This is a test response from the mocked OpenAI API.',
              },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 20, completion_tokens: 15, total_tokens: 35 },
        });
    };

    const cleanupMocks = () => {
      nock.cleanAll();
    };

    return {
      ...baseContext,
      mockExternalAPIs,
      cleanupMocks,
    };
  }

  /**
   * Create a complete test scenario with user, organization, and project
   */
  static async createCompleteTestScenario(context: E2ETestContext) {
    // Create users
    const users = await context.userFactory.createMany(4);
    const [owner, admin, member, viewer] = users;

    // Create organization with members
    const { organization, memberships } = await context.organizationFactory.createWithMembers(
      users,
      { name: 'E2E Test Organization', slug: 'e2e-test-org' },
      ['owner', 'admin', 'member', 'viewer'] as any
    );

    // Create project
    const project = await context.dataSource.getRepository('Project').save({
      organizationId: organization.id,
      name: 'E2E Test Project',
      description: 'A project for E2E testing',
      createdBy: owner.id,
      settings: {
        defaultLanguage: 'typescript',
        enabledFeatures: ['rag', 'workflows', 'sharing'],
      },
    });

    // Create API specification
    const apiSpec = await context.dataSource.getRepository('ApiSpec').save({
      projectId: project.id,
      name: 'E2E Test API',
      version: '1.0.0',
      format: 'openapi',
      originalSpec: IntegrationTestHelper.createTestApiSpec(),
      normalizedSpec: IntegrationTestHelper.createTestApiSpec(),
      metadata: {
        title: 'E2E Test API',
        endpointCount: 3,
        modelCount: 2,
      },
      status: 'ready',
      createdBy: owner.id,
    });

    // Create workflow definition
    const workflowDefinition = await context.dataSource.getRepository('WorkflowDefinition').save({
      projectId: project.id,
      name: 'E2E Test Workflow',
      description: 'A workflow for E2E testing',
      definition: IntegrationTestHelper.createTestFlowDefinition(),
      isActive: true,
      createdBy: owner.id,
    });

    return {
      users: { owner, admin, member, viewer },
      organization,
      memberships,
      project,
      apiSpec,
      workflowDefinition,
    };
  }

  /**
   * Execute a complete workflow and verify results
   */
  static async executeWorkflowE2E(
    context: E2ETestContext,
    workflowDefinition: any,
    user: any,
    options: any = {}
  ) {
    // Setup mocks
    context.mockExternalAPIs();

    try {
      // Create authenticated request
      const { request: authRequest } = await IntegrationTestHelper.createAuthenticatedRequest(context, user);

      // Execute workflow
      const response = await authRequest
        .post('/api/v1/flows/run')
        .send({
          flow: workflowDefinition.definition,
          options: {
            sandbox: false,
            temporalEnabled: false,
            ...options,
          },
        });

      return response;
    } finally {
      // Cleanup mocks
      context.cleanupMocks();
    }
  }

  /**
   * Test complete API specification processing pipeline
   */
  static async testApiSpecProcessingPipeline(
    context: E2ETestContext,
    project: any,
    user: any
  ) {
    const { request: authRequest } = await IntegrationTestHelper.createAuthenticatedRequest(context, user);

    // Upload API specification
    const uploadResponse = await authRequest
      .post(`/api/v1/projects/${project.id}/specs`)
      .send({
        name: 'Pipeline Test API',
        format: 'openapi',
        originalSpec: IntegrationTestHelper.createTestApiSpec(),
      });

    const specId = uploadResponse.body.data.id;

    // Wait for processing
    await IntegrationTestHelper.waitForAsyncOperations(1000);

    // Check processing status
    const statusResponse = await authRequest
      .get(`/api/v1/projects/${project.id}/specs/${specId}`);

    // Generate code
    const codegenResponse = await authRequest
      .post(`/api/v1/codegen/generate`)
      .send({
        specId,
        language: 'typescript',
        options: {
          includeTests: true,
          includeDocumentation: true,
        },
      });

    // Create share link
    const shareResponse = await authRequest
      .post(`/api/v1/share`)
      .send({
        specId,
        ttlSeconds: 3600,
        allowDownload: true,
      });

    return {
      spec: uploadResponse.body.data,
      status: statusResponse.body.data,
      codegen: codegenResponse.body.data,
      share: shareResponse.body.data,
    };
  }

  /**
   * Verify system health and readiness
   */
  static async verifySystemHealth(context: E2ETestContext) {
    const healthChecks = [];

    // Check API health
    const healthResponse = await context.request.get('/health');
    healthChecks.push({
      name: 'API Health',
      status: healthResponse.status === 200 ? 'healthy' : 'unhealthy',
      response: healthResponse.body,
    });

    // Check database connectivity
    try {
      await context.dataSource.query('SELECT 1');
      healthChecks.push({
        name: 'Database',
        status: 'healthy',
      });
    } catch (error) {
      healthChecks.push({
        name: 'Database',
        status: 'unhealthy',
        error: error.message,
      });
    }

    // Check authentication
    try {
      const user = await context.userFactory.create();
      const { request: authRequest } = await IntegrationTestHelper.createAuthenticatedRequest(context, user);
      const profileResponse = await authRequest.get('/api/v1/auth/profile');
      
      healthChecks.push({
        name: 'Authentication',
        status: profileResponse.status === 200 ? 'healthy' : 'unhealthy',
      });
    } catch (error) {
      healthChecks.push({
        name: 'Authentication',
        status: 'unhealthy',
        error: error.message,
      });
    }

    return healthChecks;
  }
}

// Global E2E cleanup
afterAll(async () => {
  nock.cleanAll();
});
