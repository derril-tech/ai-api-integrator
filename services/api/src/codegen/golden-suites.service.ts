import { Injectable } from '@nestjs/common';
import { Project } from '../projects/entities/project.entity';

export interface GoldenSuiteResult {
  suiteName: string;
  tests: TestResult[];
  passed: boolean;
  duration: number;
  coverage?: number;
}

export interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
  assertions?: AssertionResult[];
}

export interface AssertionResult {
  description: string;
  passed: boolean;
  actual?: any;
  expected?: any;
  error?: string;
}

export interface APISpec {
  name: string;
  description: string;
  endpoints: APIEndpoint[];
  models: APIModel[];
  auth: AuthSpec;
}

export interface APIEndpoint {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  description: string;
  parameters?: ParameterSpec[];
  requestBody?: ModelRef;
  responses: ResponseSpec[];
  pagination?: PaginationSpec;
}

export interface ParameterSpec {
  name: string;
  type: 'query' | 'path' | 'header';
  required: boolean;
  schema: SchemaSpec;
}

export interface ResponseSpec {
  status: number;
  description: string;
  schema?: SchemaSpec;
}

export interface ModelRef {
  model: string;
  required?: boolean;
}

export interface APIModel {
  name: string;
  properties: PropertySpec[];
  required?: string[];
}

export interface PropertySpec {
  name: string;
  type: SchemaSpec;
  required?: boolean;
  description?: string;
}

export interface SchemaSpec {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  format?: string;
  enum?: string[];
  items?: SchemaSpec;
  properties?: Record<string, SchemaSpec>;
}

export interface AuthSpec {
  type: 'api_key' | 'oauth2' | 'bearer';
  location?: 'header' | 'query';
  name?: string;
}

export interface PaginationSpec {
  type: 'offset' | 'cursor';
  parameters: {
    page?: string;
    limit?: string;
    cursor?: string;
  };
  response: {
    data: string;
    total?: string;
    hasNext?: string;
    hasPrev?: string;
    nextCursor?: string;
  };
}

@Injectable()
export class GoldenSuitesService {
  private readonly suites: Map<string, APISpec> = new Map();

  constructor() {
    this.initializeGoldenSuites();
  }

  private initializeGoldenSuites() {
    // Stripe-like API specification
    this.suites.set('stripe-like', {
      name: 'Stripe-like Payment API',
      description: 'Payment processing API similar to Stripe',
      auth: {
        type: 'bearer',
        location: 'header',
        name: 'Authorization'
      },
      endpoints: [
        {
          path: '/customers',
          method: 'GET',
          description: 'List customers',
          parameters: [
            { name: 'limit', type: 'query', required: false, schema: { type: 'number' } },
            { name: 'starting_after', type: 'query', required: false, schema: { type: 'string' } }
          ],
          responses: [
            { status: 200, description: 'Success', schema: { type: 'object', properties: {
              data: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' } } } },
              has_more: { type: 'boolean' }
            }}}
          ],
          pagination: {
            type: 'cursor',
            parameters: { cursor: 'starting_after', limit: 'limit' },
            response: { data: 'data', hasNext: 'has_more', nextCursor: 'data[-1].id' }
          }
        },
        {
          path: '/customers',
          method: 'POST',
          description: 'Create customer',
          requestBody: { model: 'Customer' },
          responses: [
            { status: 200, description: 'Created', schema: { type: 'object', properties: { id: { type: 'string' } } } }
          ]
        },
        {
          path: '/customers/{id}',
          method: 'GET',
          description: 'Retrieve customer',
          parameters: [
            { name: 'id', type: 'path', required: true, schema: { type: 'string' } }
          ],
          responses: [
            { status: 200, description: 'Success', schema: { type: 'object', properties: { id: { type: 'string' } } } }
          ]
        },
        {
          path: '/payment_intents',
          method: 'POST',
          description: 'Create payment intent',
          requestBody: { model: 'PaymentIntent' },
          responses: [
            { status: 200, description: 'Created', schema: { type: 'object', properties: { id: { type: 'string' }, client_secret: { type: 'string' } } } }
          ]
        }
      ],
      models: [
        {
          name: 'Customer',
          properties: [
            { name: 'id', type: { type: 'string' }, description: 'Unique identifier' },
            { name: 'email', type: { type: 'string', format: 'email' }, required: true },
            { name: 'name', type: { type: 'string' }, required: true },
            { name: 'created', type: { type: 'number' }, description: 'Unix timestamp' }
          ],
          required: ['email', 'name']
        },
        {
          name: 'PaymentIntent',
          properties: [
            { name: 'id', type: { type: 'string' } },
            { name: 'amount', type: { type: 'number' }, required: true },
            { name: 'currency', type: { type: 'string' }, required: true },
            { name: 'customer', type: { type: 'string' } },
            { name: 'status', type: { type: 'string', enum: ['requires_payment_method', 'requires_confirmation', 'processing', 'succeeded', 'canceled'] } }
          ],
          required: ['amount', 'currency']
        }
      ]
    });

    // Salesforce-like API specification
    this.suites.set('salesforce-like', {
      name: 'Salesforce-like CRM API',
      description: 'CRM API similar to Salesforce',
      auth: {
        type: 'oauth2',
        location: 'header',
        name: 'Authorization'
      },
      endpoints: [
        {
          path: '/sobjects/Account',
          method: 'GET',
          description: 'Query accounts',
          responses: [
            { status: 200, description: 'Success', schema: { type: 'object', properties: {
              totalSize: { type: 'number' },
              done: { type: 'boolean' },
              records: { type: 'array', items: { type: 'object' } },
              nextRecordsUrl: { type: 'string' }
            }}}
          ]
        },
        {
          path: '/sobjects/Account',
          method: 'POST',
          description: 'Create account',
          requestBody: { model: 'Account' },
          responses: [
            { status: 201, description: 'Created', schema: { type: 'object', properties: { id: { type: 'string' } } } }
          ]
        },
        {
          path: '/sobjects/Lead',
          method: 'POST',
          description: 'Create lead',
          requestBody: { model: 'Lead' },
          responses: [
            { status: 201, description: 'Created', schema: { type: 'object', properties: { id: { type: 'string' } } } }
          ]
        },
        {
          path: '/query',
          method: 'GET',
          description: 'SOQL Query',
          parameters: [
            { name: 'q', type: 'query', required: true, schema: { type: 'string' } }
          ],
          responses: [
            { status: 200, description: 'Success', schema: { type: 'object', properties: {
              totalSize: { type: 'number' },
              records: { type: 'array', items: { type: 'object' } }
            }}}
          ]
        }
      ],
      models: [
        {
          name: 'Account',
          properties: [
            { name: 'Id', type: { type: 'string' } },
            { name: 'Name', type: { type: 'string' }, required: true },
            { name: 'Type', type: { type: 'string', enum: ['Customer', 'Partner', 'Vendor'] } },
            { name: 'Industry', type: { type: 'string' } },
            { name: 'AnnualRevenue', type: { type: 'number' } }
          ],
          required: ['Name']
        },
        {
          name: 'Lead',
          properties: [
            { name: 'Id', type: { type: 'string' } },
            { name: 'FirstName', type: { type: 'string' } },
            { name: 'LastName', type: { type: 'string' }, required: true },
            { name: 'Email', type: { type: 'string', format: 'email' } },
            { name: 'Company', type: { type: 'string' }, required: true },
            { name: 'Status', type: { type: 'string', enum: ['Open', 'Contacted', 'Qualified', 'Unqualified'] } }
          ],
          required: ['LastName', 'Company']
        }
      ]
    });
  }

  async runGoldenSuite(suiteName: string, projectId: string): Promise<GoldenSuiteResult> {
    const suite = this.suites.get(suiteName);
    if (!suite) {
      throw new Error(`Golden suite '${suiteName}' not found`);
    }

    const startTime = Date.now();
    const tests: TestResult[] = [];

    // Run authentication tests
    tests.push(await this.testAuthentication(suite, projectId));

    // Run endpoint tests
    for (const endpoint of suite.endpoints) {
      tests.push(await this.testEndpoint(endpoint, suite, projectId));
    }

    // Run model validation tests
    for (const model of suite.models) {
      tests.push(await this.testModel(model, suite, projectId));
    }

    // Run pagination tests
    tests.push(await this.testPagination(suite, projectId));

    const duration = Date.now() - startTime;
    const passed = tests.every(test => test.passed);

    return {
      suiteName,
      tests,
      passed,
      duration,
      coverage: this.calculateCoverage(tests)
    };
  }

  private async testAuthentication(suite: APISpec, projectId: string): Promise<TestResult> {
    const startTime = Date.now();

    try {
      // Test authentication mechanism
      const assertions: AssertionResult[] = [];

      // Check if auth type is properly handled
      assertions.push({
        description: 'Authentication type is supported',
        passed: ['api_key', 'bearer', 'oauth2'].includes(suite.auth.type),
      });

      // Check if auth location is valid
      assertions.push({
        description: 'Authentication location is valid',
        passed: ['header', 'query'].includes(suite.auth.location || 'header'),
      });

      const passed = assertions.every(a => a.passed);
      const duration = Date.now() - startTime;

      return {
        name: 'Authentication Test',
        passed,
        duration,
        assertions
      };
    } catch (error) {
      return {
        name: 'Authentication Test',
        passed: false,
        duration: Date.now() - startTime,
        error: error.message
      };
    }
  }

  private async testEndpoint(endpoint: APIEndpoint, suite: APISpec, projectId: string): Promise<TestResult> {
    const startTime = Date.now();

    try {
      const assertions: AssertionResult[] = [];

      // Check HTTP method is valid
      assertions.push({
        description: `HTTP method ${endpoint.method} is valid`,
        passed: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(endpoint.method),
      });

      // Check path format
      assertions.push({
        description: 'Path format is valid',
        passed: endpoint.path.startsWith('/'),
      });

      // Check required parameters
      const requiredParams = endpoint.parameters?.filter(p => p.required) || [];
      assertions.push({
        description: 'Required parameters are defined',
        passed: requiredParams.every(p => p.name && p.schema),
      });

      // Check responses
      assertions.push({
        description: 'At least one success response defined',
        passed: endpoint.responses.some(r => r.status >= 200 && r.status < 300),
      });

      // Check error responses
      assertions.push({
        description: 'Error responses are defined',
        passed: endpoint.responses.some(r => r.status >= 400),
      });

      const passed = assertions.every(a => a.passed);
      const duration = Date.now() - startTime;

      return {
        name: `Endpoint Test: ${endpoint.method} ${endpoint.path}`,
        passed,
        duration,
        assertions
      };
    } catch (error) {
      return {
        name: `Endpoint Test: ${endpoint.method} ${endpoint.path}`,
        passed: false,
        duration: Date.now() - startTime,
        error: error.message
      };
    }
  }

  private async testModel(model: APIModel, suite: APISpec, projectId: string): Promise<TestResult> {
    const startTime = Date.now();

    try {
      const assertions: AssertionResult[] = [];

      // Check model has properties
      assertions.push({
        description: 'Model has properties defined',
        passed: model.properties.length > 0,
      });

      // Check required properties are in required array
      const requiredProps = model.properties.filter(p => p.required);
      const allRequiredListed = requiredProps.every(p =>
        model.required?.includes(p.name)
      );
      assertions.push({
        description: 'All required properties are listed in required array',
        passed: allRequiredListed,
      });

      // Check property types are valid
      const validTypes = ['string', 'number', 'boolean', 'object', 'array'];
      const invalidTypes = model.properties.filter(p =>
        !validTypes.includes(p.type.type)
      );
      assertions.push({
        description: 'All property types are valid',
        passed: invalidTypes.length === 0,
      });

      const passed = assertions.every(a => a.passed);
      const duration = Date.now() - startTime;

      return {
        name: `Model Test: ${model.name}`,
        passed,
        duration,
        assertions
      };
    } catch (error) {
      return {
        name: `Model Test: ${model.name}`,
        passed: false,
        duration: Date.now() - startTime,
        error: error.message
      };
    }
  }

  private async testPagination(suite: APISpec, projectId: string): Promise<TestResult> {
    const startTime = Date.now();

    try {
      const assertions: AssertionResult[] = [];

      // Find endpoints with pagination
      const paginatedEndpoints = suite.endpoints.filter(e => e.pagination);

      if (paginatedEndpoints.length > 0) {
        // Check pagination types are valid
        const validTypes = paginatedEndpoints.every(e =>
          ['offset', 'cursor'].includes(e.pagination!.type)
        );
        assertions.push({
          description: 'Pagination types are valid',
          passed: validTypes,
        });

        // Check pagination parameters are defined
        const hasValidParams = paginatedEndpoints.every(e => {
          const pagination = e.pagination!;
          if (pagination.type === 'offset') {
            return pagination.parameters.page && pagination.parameters.limit;
          } else if (pagination.type === 'cursor') {
            return pagination.parameters.cursor || pagination.parameters.limit;
          }
          return false;
        });
        assertions.push({
          description: 'Pagination parameters are properly defined',
          passed: hasValidParams,
        });
      } else {
        // No pagination is also acceptable
        assertions.push({
          description: 'No pagination required for this API',
          passed: true,
        });
      }

      const passed = assertions.every(a => a.passed);
      const duration = Date.now() - startTime;

      return {
        name: 'Pagination Test',
        passed,
        duration,
        assertions
      };
    } catch (error) {
      return {
        name: 'Pagination Test',
        passed: false,
        duration: Date.now() - startTime,
        error: error.message
      };
    }
  }

  private calculateCoverage(tests: TestResult[]): number {
    const totalAssertions = tests.reduce((sum, test) =>
      sum + (test.assertions?.length || 0), 0
    );

    const passedAssertions = tests.reduce((sum, test) =>
      sum + (test.assertions?.filter(a => a.passed).length || 0), 0
    );

    return totalAssertions > 0 ? (passedAssertions / totalAssertions) * 100 : 0;
  }

  getAvailableSuites(): string[] {
    return Array.from(this.suites.keys());
  }

  getSuiteSpec(suiteName: string): APISpec | undefined {
    return this.suites.get(suiteName);
  }
}
