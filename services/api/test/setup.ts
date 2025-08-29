import { config } from 'dotenv';
import { join } from 'path';

// Load test environment variables
config({ path: join(__dirname, '..', '.env.test') });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Reduce log noise in tests

// Global test timeout
jest.setTimeout(30000);

// Mock external services by default
jest.mock('@temporalio/client', () => ({
  Client: jest.fn(),
  Connection: {
    connect: jest.fn(),
  },
}));

// Global test utilities
global.testUtils = {
  // Helper to create test database name
  getTestDatabaseName: () => `test_ai_api_integrator_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  
  // Helper to wait for async operations
  sleep: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
  
  // Helper to generate test data
  generateTestId: () => `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
};

// Extend Jest matchers
expect.extend({
  toBeValidUUID(received: string) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const pass = uuidRegex.test(received);
    
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid UUID`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid UUID`,
        pass: false,
      };
    }
  },
  
  toBeValidEmail(received: string) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const pass = emailRegex.test(received);
    
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid email`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid email`,
        pass: false,
      };
    }
  },
  
  toBeValidDate(received: any) {
    const pass = received instanceof Date && !isNaN(received.getTime());
    
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid date`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid date`,
        pass: false,
      };
    }
  },
  
  toHaveValidApiResponse(received: any) {
    const hasRequiredFields = received && 
      typeof received.success === 'boolean' &&
      received.timestamp &&
      received.path &&
      received.method;
    
    if (hasRequiredFields) {
      return {
        message: () => `expected response not to have valid API structure`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected response to have valid API structure (success, timestamp, path, method)`,
        pass: false,
      };
    }
  },
});

// Declare global types for TypeScript
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidUUID(): R;
      toBeValidEmail(): R;
      toBeValidDate(): R;
      toHaveValidApiResponse(): R;
    }
  }
  
  namespace NodeJS {
    interface Global {
      testUtils: {
        getTestDatabaseName: () => string;
        sleep: (ms: number) => Promise<void>;
        generateTestId: () => string;
      };
    }
  }
}

// Clean up after all tests
afterAll(async () => {
  // Close any open connections, clean up resources
  await new Promise(resolve => setTimeout(resolve, 100));
});
