import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('error_rate');
const responseTime = new Trend('response_time');
const requestCount = new Counter('request_count');

// Test configuration
export const options = {
  stages: [
    // Ramp-up
    { duration: '2m', target: 10 }, // Ramp up to 10 users over 2 minutes
    { duration: '5m', target: 10 }, // Stay at 10 users for 5 minutes
    { duration: '2m', target: 50 }, // Ramp up to 50 users over 2 minutes
    { duration: '10m', target: 50 }, // Stay at 50 users for 10 minutes
    { duration: '2m', target: 100 }, // Ramp up to 100 users over 2 minutes
    { duration: '10m', target: 100 }, // Stay at 100 users for 10 minutes
    { duration: '5m', target: 0 }, // Ramp down to 0 users over 5 minutes
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% of requests should be below 2s
    http_req_failed: ['rate<0.05'], // Error rate should be less than 5%
    error_rate: ['rate<0.05'],
    response_time: ['p(95)<2000'],
  },
};

// Test data
const API_BASE_URL = __ENV.API_BASE_URL || 'http://localhost:3001';
const TEST_USER_EMAIL = 'loadtest@example.com';
const TEST_USER_PASSWORD = 'loadtest123';

// Authentication token (will be set during setup)
let authToken = '';

export function setup() {
  console.log('Setting up load test...');
  
  // Register test user
  const registerPayload = {
    email: TEST_USER_EMAIL,
    password: TEST_USER_PASSWORD,
    name: 'Load Test User',
  };
  
  const registerResponse = http.post(`${API_BASE_URL}/api/v1/auth/register`, JSON.stringify(registerPayload), {
    headers: { 'Content-Type': 'application/json' },
  });
  
  if (registerResponse.status === 201 || registerResponse.status === 409) {
    // Login to get token
    const loginPayload = {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    };
    
    const loginResponse = http.post(`${API_BASE_URL}/api/v1/auth/login`, JSON.stringify(loginPayload), {
      headers: { 'Content-Type': 'application/json' },
    });
    
    if (loginResponse.status === 200) {
      const loginData = JSON.parse(loginResponse.body);
      authToken = loginData.data.accessToken;
      console.log('Authentication successful');
      return { authToken };
    }
  }
  
  console.error('Failed to authenticate test user');
  return { authToken: null };
}

export default function(data) {
  if (!data.authToken) {
    console.error('No auth token available, skipping test');
    return;
  }
  
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${data.authToken}`,
  };
  
  // Test scenarios with different weights
  const scenario = Math.random();
  
  if (scenario < 0.3) {
    // 30% - Health check (lightweight)
    testHealthCheck();
  } else if (scenario < 0.5) {
    // 20% - Authentication flow
    testAuthenticationFlow();
  } else if (scenario < 0.7) {
    // 20% - API spec operations
    testApiSpecOperations(headers);
  } else if (scenario < 0.9) {
    // 20% - Workflow execution
    testWorkflowExecution(headers);
  } else {
    // 10% - Code generation (heavy operation)
    testCodeGeneration(headers);
  }
  
  // Random sleep between 1-3 seconds
  sleep(Math.random() * 2 + 1);
}

function testHealthCheck() {
  const response = http.get(`${API_BASE_URL}/health`);
  
  const success = check(response, {
    'health check status is 200': (r) => r.status === 200,
    'health check response time < 500ms': (r) => r.timings.duration < 500,
  });
  
  recordMetrics(response, success, 'health_check');
}

function testAuthenticationFlow() {
  // Test login
  const loginPayload = {
    email: TEST_USER_EMAIL,
    password: TEST_USER_PASSWORD,
  };
  
  const loginResponse = http.post(`${API_BASE_URL}/api/v1/auth/login`, JSON.stringify(loginPayload), {
    headers: { 'Content-Type': 'application/json' },
  });
  
  const loginSuccess = check(loginResponse, {
    'login status is 200': (r) => r.status === 200,
    'login response time < 1000ms': (r) => r.timings.duration < 1000,
    'login returns access token': (r) => {
      try {
        const data = JSON.parse(r.body);
        return data.data && data.data.accessToken;
      } catch (e) {
        return false;
      }
    },
  });
  
  recordMetrics(loginResponse, loginSuccess, 'auth_login');
  
  if (loginSuccess) {
    const loginData = JSON.parse(loginResponse.body);
    const token = loginData.data.accessToken;
    
    // Test profile endpoint
    const profileResponse = http.get(`${API_BASE_URL}/api/v1/auth/profile`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    
    const profileSuccess = check(profileResponse, {
      'profile status is 200': (r) => r.status === 200,
      'profile response time < 500ms': (r) => r.timings.duration < 500,
    });
    
    recordMetrics(profileResponse, profileSuccess, 'auth_profile');
  }
}

function testApiSpecOperations(headers) {
  // Create a simple API spec
  const apiSpec = {
    name: `Load Test Spec ${Date.now()}`,
    format: 'openapi',
    originalSpec: {
      openapi: '3.0.0',
      info: {
        title: 'Load Test API',
        version: '1.0.0',
      },
      paths: {
        '/test': {
          get: {
            operationId: 'getTest',
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
        },
      },
    },
  };
  
  // First, get organizations to find a project
  const orgsResponse = http.get(`${API_BASE_URL}/api/v1/organizations`, { headers });
  
  if (orgsResponse.status === 200) {
    const orgsData = JSON.parse(orgsResponse.body);
    if (orgsData.data && orgsData.data.length > 0) {
      const orgId = orgsData.data[0].id;
      
      // Get projects for the organization
      const projectsResponse = http.get(`${API_BASE_URL}/api/v1/organizations/${orgId}/projects`, { headers });
      
      if (projectsResponse.status === 200) {
        const projectsData = JSON.parse(projectsResponse.body);
        if (projectsData.data && projectsData.data.length > 0) {
          const projectId = projectsData.data[0].id;
          
          // Create API spec
          const createResponse = http.post(
            `${API_BASE_URL}/api/v1/projects/${projectId}/specs`,
            JSON.stringify(apiSpec),
            { headers }
          );
          
          const createSuccess = check(createResponse, {
            'spec creation status is 201': (r) => r.status === 201,
            'spec creation response time < 3000ms': (r) => r.timings.duration < 3000,
          });
          
          recordMetrics(createResponse, createSuccess, 'spec_create');
          
          if (createSuccess) {
            const specData = JSON.parse(createResponse.body);
            const specId = specData.data.id;
            
            // Get the created spec
            const getResponse = http.get(`${API_BASE_URL}/api/v1/projects/${projectId}/specs/${specId}`, { headers });
            
            const getSuccess = check(getResponse, {
              'spec get status is 200': (r) => r.status === 200,
              'spec get response time < 1000ms': (r) => r.timings.duration < 1000,
            });
            
            recordMetrics(getResponse, getSuccess, 'spec_get');
          }
        }
      }
    }
  }
}

function testWorkflowExecution(headers) {
  const workflow = {
    flow: {
      id: `load-test-flow-${Date.now()}`,
      name: 'Load Test Flow',
      nodes: [
        {
          id: 'start',
          type: 'transform',
          config: {
            script: 'return { message: "Hello from load test", timestamp: Date.now() };',
          },
          next: ['delay'],
        },
        {
          id: 'delay',
          type: 'delay',
          config: {
            duration: 100,
            unit: 'ms',
          },
          next: ['end'],
        },
        {
          id: 'end',
          type: 'transform',
          config: {
            script: 'return { completed: true, data: variables.transform_result };',
          },
        },
      ],
      entry: 'start',
    },
    options: {
      sandbox: true,
      temporalEnabled: false,
    },
  };
  
  const response = http.post(`${API_BASE_URL}/api/v1/flows/run`, JSON.stringify(workflow), { headers });
  
  const success = check(response, {
    'workflow execution status is 200': (r) => r.status === 200,
    'workflow execution response time < 5000ms': (r) => r.timings.duration < 5000,
    'workflow execution successful': (r) => {
      try {
        const data = JSON.parse(r.body);
        return data.data && data.data.success === true;
      } catch (e) {
        return false;
      }
    },
  });
  
  recordMetrics(response, success, 'workflow_execution');
}

function testCodeGeneration(headers) {
  // This is a heavy operation, so we'll simulate it with a simpler request
  // In a real scenario, you'd need a valid spec ID
  const response = http.get(`${API_BASE_URL}/api/v1/codegen/languages`, { headers });
  
  const success = check(response, {
    'codegen languages status is 200': (r) => r.status === 200,
    'codegen languages response time < 1000ms': (r) => r.timings.duration < 1000,
  });
  
  recordMetrics(response, success, 'codegen_languages');
}

function recordMetrics(response, success, operation) {
  requestCount.add(1, { operation });
  responseTime.add(response.timings.duration, { operation });
  errorRate.add(!success, { operation });
}

export function teardown(data) {
  console.log('Load test completed');
  
  // Cleanup: In a real scenario, you might want to clean up test data
  // For now, we'll just log the completion
  console.log('Teardown completed');
}

// Export test configuration for different scenarios
export const scenarios = {
  // Smoke test - minimal load
  smoke: {
    executor: 'constant-vus',
    vus: 1,
    duration: '1m',
  },
  
  // Load test - normal expected load
  load: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '2m', target: 10 },
      { duration: '10m', target: 10 },
      { duration: '2m', target: 0 },
    ],
  },
  
  // Stress test - beyond normal capacity
  stress: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '2m', target: 50 },
      { duration: '5m', target: 50 },
      { duration: '2m', target: 100 },
      { duration: '5m', target: 100 },
      { duration: '2m', target: 200 },
      { duration: '5m', target: 200 },
      { duration: '5m', target: 0 },
    ],
  },
  
  // Spike test - sudden load increase
  spike: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '1m', target: 10 },
      { duration: '30s', target: 100 },
      { duration: '1m', target: 10 },
      { duration: '30s', target: 200 },
      { duration: '1m', target: 10 },
      { duration: '2m', target: 0 },
    ],
  },
};
