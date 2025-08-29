// Stripe-like API test fixtures and mock data
export const stripeFixtures = {
  customers: {
    valid: {
      id: 'cus_1234567890',
      email: 'john.doe@example.com',
      name: 'John Doe',
      created: 1640995200,
      metadata: {
        user_id: 'user_123'
      }
    },
    createRequest: {
      email: 'jane.smith@example.com',
      name: 'Jane Smith',
      metadata: {
        source: 'website'
      }
    },
    listResponse: {
      data: [
        {
          id: 'cus_1234567890',
          email: 'john.doe@example.com',
          name: 'John Doe',
          created: 1640995200
        },
        {
          id: 'cus_0987654321',
          email: 'jane.smith@example.com',
          name: 'Jane Smith',
          created: 1641081600
        }
      ],
      has_more: false,
      url: '/v1/customers'
    }
  },

  paymentIntents: {
    valid: {
      id: 'pi_1234567890',
      amount: 2000,
      currency: 'usd',
      status: 'requires_payment_method',
      client_secret: 'pi_1234567890_secret_abc123',
      created: 1640995200,
      customer: 'cus_1234567890'
    },
    createRequest: {
      amount: 1500,
      currency: 'usd',
      customer: 'cus_1234567890',
      metadata: {
        order_id: 'order_123'
      }
    },
    confirmRequest: {
      payment_method: 'pm_1234567890'
    }
  },

  paymentMethods: {
    card: {
      id: 'pm_1234567890',
      type: 'card',
      card: {
        brand: 'visa',
        last4: '4242',
        exp_month: 12,
        exp_year: 2025
      },
      created: 1640995200
    }
  },

  charges: {
    valid: {
      id: 'ch_1234567890',
      amount: 2000,
      currency: 'usd',
      status: 'succeeded',
      paid: true,
      customer: 'cus_1234567890',
      payment_intent: 'pi_1234567890',
      created: 1640995200
    }
  },

  refunds: {
    valid: {
      id: 'rf_1234567890',
      amount: 1000,
      currency: 'usd',
      status: 'succeeded',
      charge: 'ch_1234567890',
      created: 1640995200
    },
    createRequest: {
      charge: 'ch_1234567890',
      amount: 500
    }
  },

  subscriptions: {
    valid: {
      id: 'sub_1234567890',
      customer: 'cus_1234567890',
      status: 'active',
      current_period_start: 1640995200,
      current_period_end: 1643673600,
      items: {
        data: [{
          id: 'si_1234567890',
          price: {
            id: 'price_1234567890',
            product: 'prod_1234567890'
          }
        }]
      }
    }
  },

  prices: {
    valid: {
      id: 'price_1234567890',
      product: 'prod_1234567890',
      unit_amount: 2000,
      currency: 'usd',
      recurring: {
        interval: 'month'
      },
      active: true
    }
  },

  products: {
    valid: {
      id: 'prod_1234567890',
      name: 'Premium Plan',
      description: 'Premium subscription plan',
      active: true,
      created: 1640995200
    }
  },

  errors: {
    invalidApiKey: {
      error: {
        type: 'invalid_request_error',
        message: 'Invalid API Key provided'
      }
    },
    resourceNotFound: {
      error: {
        type: 'invalid_request_error',
        message: 'No such customer: cus_invalid'
      }
    },
    rateLimit: {
      error: {
        type: 'api_error',
        message: 'Too many requests, please try again later'
      }
    },
    validationError: {
      error: {
        type: 'invalid_request_error',
        message: 'Missing required parameter: email'
      }
    }
  }
};

export const stripeTestScenarios = {
  customerLifecycle: {
    name: 'Customer Lifecycle',
    steps: [
      {
        name: 'Create Customer',
        request: {
          method: 'POST',
          path: '/customers',
          body: stripeFixtures.customers.createRequest
        },
        expectedStatus: 200,
        validateResponse: (response: any) => {
          return response.id && response.email === stripeFixtures.customers.createRequest.email;
        }
      },
      {
        name: 'Retrieve Customer',
        request: {
          method: 'GET',
          path: '/customers/{id}'
        },
        expectedStatus: 200,
        validateResponse: (response: any) => {
          return response.id && response.email;
        }
      },
      {
        name: 'List Customers',
        request: {
          method: 'GET',
          path: '/customers'
        },
        expectedStatus: 200,
        validateResponse: (response: any) => {
          return Array.isArray(response.data);
        }
      }
    ]
  },

  paymentFlow: {
    name: 'Payment Flow',
    steps: [
      {
        name: 'Create Payment Intent',
        request: {
          method: 'POST',
          path: '/payment_intents',
          body: stripeFixtures.paymentIntents.createRequest
        },
        expectedStatus: 200,
        validateResponse: (response: any) => {
          return response.id && response.client_secret && response.amount === 1500;
        }
      },
      {
        name: 'Retrieve Payment Intent',
        request: {
          method: 'GET',
          path: '/payment_intents/{id}'
        },
        expectedStatus: 200,
        validateResponse: (response: any) => {
          return response.id && response.status;
        }
      }
    ]
  },

  errorHandling: {
    name: 'Error Handling',
    steps: [
      {
        name: 'Invalid API Key',
        request: {
          method: 'GET',
          path: '/customers',
          headers: { 'Authorization': 'Bearer invalid-key' }
        },
        expectedStatus: 401,
        validateResponse: (response: any) => {
          return response.error && response.error.type === 'invalid_request_error';
        }
      },
      {
        name: 'Resource Not Found',
        request: {
          method: 'GET',
          path: '/customers/cus_invalid'
        },
        expectedStatus: 404,
        validateResponse: (response: any) => {
          return response.error && response.error.message.includes('No such customer');
        }
      }
    ]
  }
};
