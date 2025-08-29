import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpClientService, HttpClientOptions } from './http-client.service';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('HttpClientService', () => {
  let service: HttpClientService;
  let configService: ConfigService;
  let mockAxios: MockAdapter;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HttpClientService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              const config = {
                HTTP_TIMEOUT: 30000,
                HTTP_RETRIES: 3,
                HTTP_RETRY_DELAY: 1000,
                NODE_ENV: 'test',
              };
              return config[key] || defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<HttpClientService>(HttpClientService);
    configService = module.get<ConfigService>(ConfigService);

    // Setup axios mock
    mockAxios = new MockAdapter(axios);
  });

  afterEach(() => {
    mockAxios.reset();
    jest.clearAllMocks();
  });

  afterAll(() => {
    mockAxios.restore();
  });

  describe('createClient', () => {
    it('should create axios client with default options', () => {
      const mockCreate = jest.fn().mockReturnValue({
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
        defaults: { headers: { common: {} } },
      });
      mockedAxios.create = mockCreate;

      const client = service.createClient();

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 30000,
          headers: expect.objectContaining({
            'User-Agent': 'AI-API-Integrator/1.0',
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should create client with custom options', () => {
      const mockCreate = jest.fn().mockReturnValue({
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
        defaults: { headers: { common: {} } },
      });
      mockedAxios.create = mockCreate;

      const options: HttpClientOptions = {
        baseURL: 'https://api.example.com',
        timeout: 10000,
        headers: { 'Custom-Header': 'value' },
      };

      service.createClient(options);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://api.example.com',
          timeout: 10000,
          headers: expect.objectContaining({
            'Custom-Header': 'value',
          }),
        })
      );
    });

    it('should add bearer authentication', () => {
      const mockClient = {
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
        defaults: { headers: { common: {} } },
      };
      mockedAxios.create = jest.fn().mockReturnValue(mockClient);

      const options: HttpClientOptions = {
        auth: {
          type: 'bearer',
          token: 'test-token',
        },
      };

      service.createClient(options);

      expect(mockClient.defaults.headers.common['Authorization']).toBe('Bearer test-token');
    });

    it('should add basic authentication', () => {
      const mockClient = {
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
        defaults: { headers: { common: {} } },
      };
      mockedAxios.create = jest.fn().mockReturnValue(mockClient);

      const options: HttpClientOptions = {
        auth: {
          type: 'basic',
          username: 'user',
          password: 'pass',
        },
      };

      service.createClient(options);

      const expectedAuth = Buffer.from('user:pass').toString('base64');
      expect(mockClient.defaults.headers.common['Authorization']).toBe(`Basic ${expectedAuth}`);
    });

    it('should add API key authentication', () => {
      const mockClient = {
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
        defaults: { headers: { common: {} } },
      };
      mockedAxios.create = jest.fn().mockReturnValue(mockClient);

      const options: HttpClientOptions = {
        auth: {
          type: 'api-key',
          apiKey: 'test-key',
          apiKeyHeader: 'X-API-Key',
        },
      };

      service.createClient(options);

      expect(mockClient.defaults.headers.common['X-API-Key']).toBe('test-key');
    });
  });

  describe('HTTP methods', () => {
    beforeEach(() => {
      // Mock axios.create to return a mock client
      const mockClient = {
        get: jest.fn(),
        post: jest.fn(),
        put: jest.fn(),
        patch: jest.fn(),
        delete: jest.fn(),
        head: jest.fn(),
        options: jest.fn(),
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
        defaults: { headers: { common: {} } },
      };
      mockedAxios.create = jest.fn().mockReturnValue(mockClient);
    });

    it('should make GET request', async () => {
      const mockResponse = {
        data: { message: 'success' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {},
      };

      const mockClient = mockedAxios.create();
      mockClient.get = jest.fn().mockResolvedValue(mockResponse);

      const response = await service.get('/test');

      expect(mockClient.get).toHaveBeenCalledWith('/test', {});
      expect(response.data).toEqual({ message: 'success' });
      expect(response.status).toBe(200);
    });

    it('should make POST request with data', async () => {
      const mockResponse = {
        data: { id: 1 },
        status: 201,
        statusText: 'Created',
        headers: {},
        config: {},
      };

      const mockClient = mockedAxios.create();
      mockClient.post = jest.fn().mockResolvedValue(mockResponse);

      const postData = { name: 'test' };
      const response = await service.post('/test', postData);

      expect(mockClient.post).toHaveBeenCalledWith('/test', postData, {});
      expect(response.data).toEqual({ id: 1 });
      expect(response.status).toBe(201);
    });

    it('should handle request errors', async () => {
      const mockError = new Error('Network Error');
      
      const mockClient = mockedAxios.create();
      mockClient.get = jest.fn().mockRejectedValue(mockError);

      await expect(service.get('/test')).rejects.toThrow('Network Error');
    });
  });

  describe('error handling', () => {
    it('should format HTTP errors correctly', async () => {
      const mockError = {
        message: 'Request failed',
        response: {
          status: 404,
          statusText: 'Not Found',
          data: { error: 'Resource not found' },
          headers: {},
        },
        config: { url: '/test', method: 'get' },
        isAxiosError: true,
      };

      const mockClient = mockedAxios.create();
      mockClient.get = jest.fn().mockRejectedValue(mockError);

      try {
        await service.get('/test');
      } catch (error) {
        expect(error.status).toBe(404);
        expect(error.statusText).toBe('Not Found');
        expect(error.response.data).toEqual({ error: 'Resource not found' });
      }
    });

    it('should handle network errors', async () => {
      const mockError = {
        message: 'Network Error',
        code: 'ECONNREFUSED',
        request: {},
        config: { url: '/test', method: 'get' },
        isAxiosError: true,
      };

      const mockClient = mockedAxios.create();
      mockClient.get = jest.fn().mockRejectedValue(mockError);

      try {
        await service.get('/test');
      } catch (error) {
        expect(error.isNetworkError).toBe(true);
        expect(error.message).toBe('Network Error');
      }
    });

    it('should handle timeout errors', async () => {
      const mockError = {
        message: 'timeout of 5000ms exceeded',
        code: 'ECONNABORTED',
        config: { url: '/test', method: 'get' },
        isAxiosError: true,
      };

      const mockClient = mockedAxios.create();
      mockClient.get = jest.fn().mockRejectedValue(mockError);

      try {
        await service.get('/test');
      } catch (error) {
        expect(error.isTimeout).toBe(true);
        expect(error.code).toBe('ECONNABORTED');
      }
    });
  });

  describe('authentication', () => {
    it('should generate HMAC signature', async () => {
      const mockClient = {
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
        defaults: { headers: { common: {} } },
        get: jest.fn().mockResolvedValue({ data: {}, status: 200, headers: {}, config: {} }),
      };
      mockedAxios.create = jest.fn().mockReturnValue(mockClient);

      const options: HttpClientOptions = {
        auth: {
          type: 'hmac',
          hmacSecret: 'secret-key',
          hmacAlgorithm: 'sha256',
        },
      };

      await service.get('/test', {}, options);

      // Verify that request interceptor was added for HMAC
      expect(mockClient.interceptors.request.use).toHaveBeenCalled();
    });
  });

  describe('configuration', () => {
    it('should use config service values', () => {
      expect(configService.get).toHaveBeenCalledWith('HTTP_TIMEOUT', 30000);
      expect(configService.get).toHaveBeenCalledWith('HTTP_RETRIES', 3);
      expect(configService.get).toHaveBeenCalledWith('HTTP_RETRY_DELAY', 1000);
    });

    it('should respect NODE_ENV for SSL validation', () => {
      const mockCreate = jest.fn().mockReturnValue({
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
        defaults: { headers: { common: {} } },
      });
      mockedAxios.create = mockCreate;

      service.createClient();

      const createCall = mockCreate.mock.calls[0][0];
      expect(createCall.httpsAgent.options.rejectUnauthorized).toBe(false); // test environment
    });
  });
});
