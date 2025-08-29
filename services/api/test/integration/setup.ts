import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import * as request from 'supertest';

// Import all entities
import { User } from '../../src/auth/entities/user.entity';
import { Organization } from '../../src/organizations/entities/organization.entity';
import { OrganizationMember } from '../../src/organizations/entities/organization-member.entity';
import { Project } from '../../src/projects/entities/project.entity';
import { ApiSpec } from '../../src/projects/entities/api-spec.entity';
import { ApiEndpoint } from '../../src/projects/entities/api-endpoint.entity';
import { ApiModel } from '../../src/projects/entities/api-model.entity';
import { RagInference } from '../../src/projects/entities/rag-inference.entity';
import { DocumentChunk } from '../../src/projects/entities/document-chunk.entity';
import { SharedSpec } from '../../src/projects/entities/shared-spec.entity';
import { WorkflowDefinition } from '../../src/projects/entities/workflow-definition.entity';
import { WorkflowExecution } from '../../src/projects/entities/workflow-execution.entity';

// Import test factories
import { UserFactory } from '../factories/user.factory';
import { OrganizationFactory } from '../factories/organization.factory';

// Import modules
import { AppModule } from '../../src/app.module';

export interface IntegrationTestContext {
  app: INestApplication;
  dataSource: DataSource;
  userFactory: UserFactory;
  organizationFactory: OrganizationFactory;
  request: request.SuperTest<request.Test>;
  cleanup: () => Promise<void>;
}

export class IntegrationTestHelper {
  private static testDatabases: string[] = [];

  /**
   * Setup integration test environment
   */
  static async setup(): Promise<IntegrationTestContext> {
    // Generate unique test database name
    const testDbName = global.testUtils.getTestDatabaseName();
    this.testDatabases.push(testDbName);

    // Create test module with test database
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: 'test.env',
        }),
        TypeOrmModule.forRootAsync({
          imports: [ConfigModule],
          useFactory: async (configService: ConfigService) => ({
            type: 'postgres',
            host: configService.get('DATABASE_HOST', 'localhost'),
            port: configService.get('DATABASE_PORT', 5432),
            username: configService.get('DATABASE_USERNAME', 'postgres'),
            password: configService.get('DATABASE_PASSWORD', 'postgres'),
            database: testDbName,
            entities: [
              User,
              Organization,
              OrganizationMember,
              Project,
              ApiSpec,
              ApiEndpoint,
              ApiModel,
              RagInference,
              DocumentChunk,
              SharedSpec,
              WorkflowDefinition,
              WorkflowExecution,
            ],
            synchronize: true, // Create schema automatically for tests
            dropSchema: true, // Drop schema before creating
            logging: false,
          }),
          inject: [ConfigService],
        }),
        AppModule,
      ],
    }).compile();

    // Create app instance
    const app = moduleFixture.createNestApplication();
    
    // Apply global configurations
    app.setGlobalPrefix('api/v1');
    
    await app.init();

    // Get data source for direct database operations
    const dataSource = moduleFixture.get<DataSource>(DataSource);

    // Create test factories
    const userFactory = new UserFactory(dataSource.getRepository(User));
    const organizationFactory = new OrganizationFactory(
      dataSource.getRepository(Organization),
      dataSource.getRepository(OrganizationMember),
    );

    // Create supertest instance
    const testRequest = request(app.getHttpServer());

    // Cleanup function
    const cleanup = async () => {
      await app.close();
      await dataSource.destroy();
    };

    return {
      app,
      dataSource,
      userFactory,
      organizationFactory,
      request: testRequest,
      cleanup,
    };
  }

  /**
   * Create authenticated request with JWT token
   */
  static async createAuthenticatedRequest(
    context: IntegrationTestContext,
    user?: User
  ): Promise<{
    request: request.SuperTest<request.Test>;
    user: User;
    token: string;
  }> {
    // Create user if not provided
    if (!user) {
      user = await context.userFactory.create();
    }

    // Login to get token
    const loginResponse = await context.request
      .post('/api/v1/auth/login')
      .send({
        email: user.email,
        password: 'password123', // Default test password
      });

    const token = loginResponse.body.data.accessToken;

    // Create authenticated request function
    const authenticatedRequest = context.request;
    const originalGet = authenticatedRequest.get.bind(authenticatedRequest);
    const originalPost = authenticatedRequest.post.bind(authenticatedRequest);
    const originalPut = authenticatedRequest.put.bind(authenticatedRequest);
    const originalPatch = authenticatedRequest.patch.bind(authenticatedRequest);
    const originalDelete = authenticatedRequest.delete.bind(authenticatedRequest);

    // Override methods to include auth header
    authenticatedRequest.get = (url: string) => originalGet(url).set('Authorization', `Bearer ${token}`);
    authenticatedRequest.post = (url: string) => originalPost(url).set('Authorization', `Bearer ${token}`);
    authenticatedRequest.put = (url: string) => originalPut(url).set('Authorization', `Bearer ${token}`);
    authenticatedRequest.patch = (url: string) => originalPatch(url).set('Authorization', `Bearer ${token}`);
    authenticatedRequest.delete = (url: string) => originalDelete(url).set('Authorization', `Bearer ${token}`);

    return {
      request: authenticatedRequest,
      user,
      token,
    };
  }

  /**
   * Clean up all test databases
   */
  static async cleanupAll(): Promise<void> {
    // In a real implementation, you would connect to the main database
    // and drop all test databases created during testing
    console.log(`Cleaning up ${this.testDatabases.length} test databases`);
    this.testDatabases.length = 0;
  }

  /**
   * Wait for async operations to complete
   */
  static async waitForAsyncOperations(ms: number = 100): Promise<void> {
    await global.testUtils.sleep(ms);
  }

  /**
   * Create test API specification
   */
  static createTestApiSpec() {
    return {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0',
        description: 'A test API specification',
      },
      servers: [
        {
          url: 'https://api.test.com',
          description: 'Test server',
        },
      ],
      paths: {
        '/users': {
          get: {
            operationId: 'getUsers',
            summary: 'Get all users',
            responses: {
              '200': {
                description: 'List of users',
                content: {
                  'application/json': {
                    schema: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/User' },
                    },
                  },
                },
              },
            },
          },
          post: {
            operationId: 'createUser',
            summary: 'Create a new user',
            requestBody: {
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/CreateUserRequest' },
                },
              },
            },
            responses: {
              '201': {
                description: 'User created',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/User' },
                  },
                },
              },
            },
          },
        },
        '/users/{id}': {
          get: {
            operationId: 'getUserById',
            summary: 'Get user by ID',
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                schema: { type: 'string' },
              },
            ],
            responses: {
              '200': {
                description: 'User details',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/User' },
                  },
                },
              },
              '404': {
                description: 'User not found',
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
              id: { type: 'string' },
              name: { type: 'string' },
              email: { type: 'string', format: 'email' },
              createdAt: { type: 'string', format: 'date-time' },
            },
            required: ['id', 'name', 'email'],
          },
          CreateUserRequest: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              email: { type: 'string', format: 'email' },
            },
            required: ['name', 'email'],
          },
        },
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    };
  }

  /**
   * Create test flow definition
   */
  static createTestFlowDefinition() {
    return {
      id: global.testUtils.generateTestId(),
      name: 'Test Flow',
      description: 'A test flow definition',
      nodes: [
        {
          id: 'start',
          type: 'http',
          config: {
            method: 'GET',
            url: 'https://api.test.com/users',
            headers: {
              'Content-Type': 'application/json',
            },
          },
          next: ['transform'],
        },
        {
          id: 'transform',
          type: 'transform',
          config: {
            script: 'return data.map(user => ({ id: user.id, name: user.name }));',
            inputVariable: 'http_get_data',
            outputVariable: 'transformed_users',
          },
          next: ['end'],
        },
        {
          id: 'end',
          type: 'delay',
          config: {
            duration: 100,
            unit: 'ms',
          },
        },
      ],
      entry: 'start',
    };
  }
}

// Global cleanup
afterAll(async () => {
  await IntegrationTestHelper.cleanupAll();
});
