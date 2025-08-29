// Salesforce-like API test fixtures and mock data
export const salesforceFixtures = {
  accounts: {
    valid: {
      Id: '001123456789012345',
      Name: 'Acme Corporation',
      Type: 'Customer',
      Industry: 'Technology',
      AnnualRevenue: 5000000,
      NumberOfEmployees: 150,
      BillingCity: 'San Francisco',
      BillingState: 'CA',
      BillingCountry: 'USA',
      CreatedDate: '2024-01-01T00:00:00Z',
      LastModifiedDate: '2024-01-01T00:00:00Z'
    },
    createRequest: {
      Name: 'TechStart Inc',
      Type: 'Customer',
      Industry: 'Software',
      AnnualRevenue: 1000000,
      BillingCity: 'New York',
      BillingState: 'NY'
    },
    queryResponse: {
      totalSize: 2,
      done: true,
      records: [
        {
          Id: '001123456789012345',
          Name: 'Acme Corporation',
          Type: 'Customer',
          Industry: 'Technology'
        },
        {
          Id: '001987654321098765',
          Name: 'Global Solutions Ltd',
          Type: 'Partner',
          Industry: 'Consulting'
        }
      ]
    }
  },

  leads: {
    valid: {
      Id: '00Q123456789012345',
      FirstName: 'Jane',
      LastName: 'Smith',
      Email: 'jane.smith@company.com',
      Company: 'Tech Corp',
      Status: 'Open',
      LeadSource: 'Web',
      Rating: 'Hot',
      CreatedDate: '2024-01-01T00:00:00Z'
    },
    createRequest: {
      FirstName: 'John',
      LastName: 'Doe',
      Email: 'john.doe@startup.com',
      Company: 'StartupXYZ',
      Status: 'New',
      LeadSource: 'Website'
    },
    convertRequest: {
      convertedStatus: 'Closed - Converted',
      accountId: '001123456789012345',
      contactId: '003123456789012345'
    }
  },

  contacts: {
    valid: {
      Id: '003123456789012345',
      FirstName: 'Jane',
      LastName: 'Smith',
      Email: 'jane.smith@acme.com',
      Phone: '+1-555-0123',
      AccountId: '001123456789012345',
      Title: 'CEO'
    }
  },

  opportunities: {
    valid: {
      Id: '006123456789012345',
      Name: 'Enterprise Software Deal',
      AccountId: '001123456789012345',
      StageName: 'Proposal',
      Amount: 250000,
      CloseDate: '2024-03-31',
      Probability: 75,
      Type: 'New Customer'
    },
    createRequest: {
      Name: 'Mobile App Development',
      AccountId: '001123456789012345',
      StageName: 'Qualification',
      Amount: 150000,
      CloseDate: '2024-06-30',
      Type: 'New Customer'
    }
  },

  cases: {
    valid: {
      Id: '500123456789012345',
      Subject: 'Login Issues',
      Status: 'New',
      Priority: 'High',
      Origin: 'Web',
      AccountId: '001123456789012345',
      ContactId: '003123456789012345'
    }
  },

  users: {
    valid: {
      Id: '005123456789012345',
      Username: 'john.doe@acme.com',
      FirstName: 'John',
      LastName: 'Doe',
      Email: 'john.doe@acme.com',
      UserRoleId: '00E123456789012345',
      ProfileId: '00e123456789012345'
    }
  },

  soql: {
    simple: 'SELECT Id, Name FROM Account LIMIT 10',
    withWhere: 'SELECT Id, Name, Industry FROM Account WHERE Industry = \'Technology\'',
    withJoin: 'SELECT a.Name, c.FirstName, c.LastName FROM Account a, a.Contacts c',
    aggregate: 'SELECT Industry, COUNT(Id) FROM Account GROUP BY Industry'
  },

  errors: {
    invalidSession: {
      message: 'INVALID_SESSION_ID',
      errorCode: 'INVALID_SESSION_ID'
    },
    malformedQuery: {
      message: 'MALFORMED_QUERY',
      errorCode: 'MALFORMED_QUERY'
    },
    insufficientAccess: {
      message: 'INSUFFICIENT_ACCESS',
      errorCode: 'INSUFFICIENT_ACCESS'
    },
    requiredFieldMissing: {
      message: 'REQUIRED_FIELD_MISSING',
      errorCode: 'REQUIRED_FIELD_MISSING',
      fields: ['Name']
    }
  }
};

export const salesforceTestScenarios = {
  accountManagement: {
    name: 'Account Management',
    steps: [
      {
        name: 'Create Account',
        request: {
          method: 'POST',
          path: '/sobjects/Account',
          body: salesforceFixtures.accounts.createRequest
        },
        expectedStatus: 201,
        validateResponse: (response: any) => {
          return response.id && response.success === true;
        }
      },
      {
        name: 'Query Accounts',
        request: {
          method: 'GET',
          path: '/query',
          query: { q: 'SELECT Id, Name FROM Account LIMIT 5' }
        },
        expectedStatus: 200,
        validateResponse: (response: any) => {
          return response.totalSize >= 0 && Array.isArray(response.records);
        }
      },
      {
        name: 'Retrieve Account',
        request: {
          method: 'GET',
          path: '/sobjects/Account/{id}'
        },
        expectedStatus: 200,
        validateResponse: (response: any) => {
          return response.Id && response.Name;
        }
      }
    ]
  },

  leadConversion: {
    name: 'Lead Conversion',
    steps: [
      {
        name: 'Create Lead',
        request: {
          method: 'POST',
          path: '/sobjects/Lead',
          body: salesforceFixtures.leads.createRequest
        },
        expectedStatus: 201,
        validateResponse: (response: any) => {
          return response.id && response.success === true;
        }
      },
      {
        name: 'Update Lead Status',
        request: {
          method: 'PATCH',
          path: '/sobjects/Lead/{id}',
          body: { Status: 'Qualified' }
        },
        expectedStatus: 204,
        validateResponse: () => true // No content response
      }
    ]
  },

  soqlQueries: {
    name: 'SOQL Query Testing',
    steps: [
      {
        name: 'Simple SOQL Query',
        request: {
          method: 'GET',
          path: '/query',
          query: { q: salesforceFixtures.soql.simple }
        },
        expectedStatus: 200,
        validateResponse: (response: any) => {
          return response.records && response.totalSize !== undefined;
        }
      },
      {
        name: 'SOQL with WHERE clause',
        request: {
          method: 'GET',
          path: '/query',
          query: { q: salesforceFixtures.soql.withWhere }
        },
        expectedStatus: 200,
        validateResponse: (response: any) => {
          return Array.isArray(response.records);
        }
      }
    ]
  },

  errorScenarios: {
    name: 'Error Handling',
    steps: [
      {
        name: 'Invalid Session',
        request: {
          method: 'GET',
          path: '/sobjects/Account',
          headers: { 'Authorization': 'Bearer invalid-session' }
        },
        expectedStatus: 401,
        validateResponse: (response: any) => {
          return response.errorCode === 'INVALID_SESSION_ID';
        }
      },
      {
        name: 'Malformed SOQL',
        request: {
          method: 'GET',
          path: '/query',
          query: { q: 'INVALID SOQL QUERY' }
        },
        expectedStatus: 400,
        validateResponse: (response: any) => {
          return response.errorCode === 'MALFORMED_QUERY';
        }
      },
      {
        name: 'Required Field Missing',
        request: {
          method: 'POST',
          path: '/sobjects/Account',
          body: { Type: 'Customer' } // Missing required Name field
        },
        expectedStatus: 400,
        validateResponse: (response: any) => {
          return response.errorCode === 'REQUIRED_FIELD_MISSING';
        }
      }
    ]
  },

  bulkOperations: {
    name: 'Bulk Operations',
    steps: [
      {
        name: 'Bulk Create Leads',
        request: {
          method: 'POST',
          path: '/composite/tree/Lead',
          body: {
            records: [
              { ...salesforceFixtures.leads.createRequest, LastName: 'Smith1' },
              { ...salesforceFixtures.leads.createRequest, LastName: 'Smith2' },
              { ...salesforceFixtures.leads.createRequest, LastName: 'Smith3' }
            ]
          }
        },
        expectedStatus: 200,
        validateResponse: (response: any) => {
          return response.hasErrors === false && response.results.length === 3;
        }
      }
    ]
  }
};
