import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UnauthorizedException } from '@nestjs/common';
import { JwtAuthService, OAuthProfile } from './jwt-auth.service';
import { User, AuthProvider } from './entities/user.entity';
import { OrganizationMember } from '../organizations/entities/organization-member.entity';
import * as bcrypt from 'bcrypt';

// Mock bcrypt
jest.mock('bcrypt');
const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

describe('JwtAuthService', () => {
  let service: JwtAuthService;
  let userRepository: jest.Mocked<Repository<User>>;
  let organizationMemberRepository: jest.Mocked<Repository<OrganizationMember>>;
  let jwtService: jest.Mocked<JwtService>;
  let configService: jest.Mocked<ConfigService>;

  const mockUser: User = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'test@example.com',
    name: 'Test User',
    provider: AuthProvider.EMAIL,
    providerId: null,
    avatarUrl: null,
    emailVerified: true,
    isActive: true,
    lastLoginAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    organizationMemberships: [],
    getFullName: jest.fn().mockReturnValue('Test User'),
    isEmailProvider: jest.fn().mockReturnValue(true),
    isSocialProvider: jest.fn().mockReturnValue(false),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtAuthService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(OrganizationMember),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn(),
            verify: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<JwtAuthService>(JwtAuthService);
    userRepository = module.get(getRepositoryToken(User));
    organizationMemberRepository = module.get(getRepositoryToken(OrganizationMember));
    jwtService = module.get(JwtService);
    configService = module.get(ConfigService);

    // Setup default config service responses
    configService.get.mockImplementation((key: string, defaultValue?: any) => {
      const config = {
        JWT_SECRET: 'test-secret',
        JWT_EXPIRES_IN: '15m',
        JWT_REFRESH_SECRET: 'test-refresh-secret',
        JWT_REFRESH_EXPIRES_IN: '7d',
        FRONTEND_URL: 'http://localhost:3000',
      };
      return config[key] || defaultValue;
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('should login user with valid credentials', async () => {
      const credentials = { email: 'test@example.com', password: 'password123' };
      const hashedPassword = 'hashed-password';
      
      userRepository.findOne.mockResolvedValue({
        ...mockUser,
        passwordHash: hashedPassword,
      } as any);
      
      mockedBcrypt.compare.mockResolvedValue(true as never);
      jwtService.sign.mockReturnValue('mock-token');

      const result = await service.login(credentials);

      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { email: credentials.email },
      });
      expect(mockedBcrypt.compare).toHaveBeenCalledWith('password123', hashedPassword);
      expect(result).toEqual({
        accessToken: 'mock-token',
        refreshToken: 'mock-token',
        expiresIn: 15 * 60,
        tokenType: 'Bearer',
      });
    });

    it('should throw UnauthorizedException for invalid credentials', async () => {
      const credentials = { email: 'test@example.com', password: 'wrong-password' };
      
      userRepository.findOne.mockResolvedValue({
        ...mockUser,
        passwordHash: 'hashed-password',
      } as any);
      
      mockedBcrypt.compare.mockResolvedValue(false as never);

      await expect(service.login(credentials)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for non-existent user', async () => {
      const credentials = { email: 'nonexistent@example.com', password: 'password123' };
      
      userRepository.findOne.mockResolvedValue(null);

      await expect(service.login(credentials)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for inactive user', async () => {
      const credentials = { email: 'test@example.com', password: 'password123' };
      
      userRepository.findOne.mockResolvedValue({
        ...mockUser,
        isActive: false,
        passwordHash: 'hashed-password',
      } as any);

      await expect(service.login(credentials)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('loginWithOAuth', () => {
    const oauthProfile: OAuthProfile = {
      id: 'google-123',
      email: 'test@example.com',
      name: 'Test User',
      avatarUrl: 'https://example.com/avatar.jpg',
      provider: AuthProvider.GOOGLE,
      emailVerified: true,
    };

    it('should login existing OAuth user', async () => {
      userRepository.findOne.mockResolvedValueOnce(mockUser); // findUserByProvider
      userRepository.save.mockResolvedValue(mockUser);
      jwtService.sign.mockReturnValue('mock-token');

      const result = await service.loginWithOAuth(oauthProfile);

      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { provider: AuthProvider.GOOGLE, providerId: 'google-123' },
      });
      expect(result).toEqual({
        accessToken: 'mock-token',
        refreshToken: 'mock-token',
        expiresIn: 15 * 60,
        tokenType: 'Bearer',
      });
    });

    it('should create new OAuth user', async () => {
      userRepository.findOne.mockResolvedValueOnce(null); // findUserByProvider
      userRepository.findOne.mockResolvedValueOnce(null); // findUserByEmail
      userRepository.create.mockReturnValue(mockUser);
      userRepository.save.mockResolvedValue(mockUser);
      jwtService.sign.mockReturnValue('mock-token');

      const result = await service.loginWithOAuth(oauthProfile);

      expect(userRepository.create).toHaveBeenCalledWith({
        email: oauthProfile.email,
        name: oauthProfile.name,
        avatarUrl: oauthProfile.avatarUrl,
        provider: oauthProfile.provider,
        providerId: oauthProfile.id,
        emailVerified: true,
        isActive: true,
      });
      expect(result).toEqual({
        accessToken: 'mock-token',
        refreshToken: 'mock-token',
        expiresIn: 15 * 60,
        tokenType: 'Bearer',
      });
    });

    it('should link OAuth account to existing email user', async () => {
      const existingUser = { ...mockUser, provider: AuthProvider.EMAIL };
      
      userRepository.findOne.mockResolvedValueOnce(null); // findUserByProvider
      userRepository.findOne.mockResolvedValueOnce(existingUser as any); // findUserByEmail
      userRepository.save.mockResolvedValue(existingUser as any);
      jwtService.sign.mockReturnValue('mock-token');

      const result = await service.loginWithOAuth(oauthProfile);

      expect(userRepository.save).toHaveBeenCalledWith({
        ...existingUser,
        provider: oauthProfile.provider,
        providerId: oauthProfile.id,
        emailVerified: true,
        avatarUrl: oauthProfile.avatarUrl,
        name: oauthProfile.name,
      });
      expect(result).toEqual({
        accessToken: 'mock-token',
        refreshToken: 'mock-token',
        expiresIn: 15 * 60,
        tokenType: 'Bearer',
      });
    });
  });

  describe('register', () => {
    it('should register new user', async () => {
      const email = 'newuser@example.com';
      const password = 'password123';
      const name = 'New User';
      
      userRepository.findOne.mockResolvedValue(null); // user doesn't exist
      userRepository.create.mockReturnValue(mockUser);
      userRepository.save.mockResolvedValue(mockUser);
      mockedBcrypt.hash.mockResolvedValue('hashed-password' as never);
      jwtService.sign.mockReturnValue('mock-token');

      const result = await service.register(email, password, name);

      expect(userRepository.findOne).toHaveBeenCalledWith({ where: { email } });
      expect(mockedBcrypt.hash).toHaveBeenCalledWith(password, 12);
      expect(userRepository.create).toHaveBeenCalledWith({
        email,
        name,
        provider: AuthProvider.EMAIL,
        emailVerified: false,
        isActive: true,
      });
      expect(result).toEqual({
        accessToken: 'mock-token',
        refreshToken: 'mock-token',
        expiresIn: 15 * 60,
        tokenType: 'Bearer',
      });
    });

    it('should throw UnauthorizedException if user already exists', async () => {
      const email = 'existing@example.com';
      const password = 'password123';
      
      userRepository.findOne.mockResolvedValue(mockUser);

      await expect(service.register(email, password)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refreshTokens', () => {
    it('should refresh tokens with valid refresh token', async () => {
      const refreshToken = 'valid-refresh-token';
      const payload = { sub: mockUser.id, jti: 'token-id' };
      
      jwtService.verify.mockReturnValue(payload);
      userRepository.findOne.mockResolvedValue(mockUser);
      jwtService.sign.mockReturnValue('new-token');

      const result = await service.refreshTokens(refreshToken);

      expect(jwtService.verify).toHaveBeenCalledWith(refreshToken, {
        secret: 'test-refresh-secret',
      });
      expect(result).toEqual({
        accessToken: 'new-token',
        refreshToken: 'new-token',
        expiresIn: 15 * 60,
        tokenType: 'Bearer',
      });
    });

    it('should throw UnauthorizedException for invalid refresh token', async () => {
      const refreshToken = 'invalid-refresh-token';
      
      jwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(service.refreshTokens(refreshToken)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for non-existent user', async () => {
      const refreshToken = 'valid-refresh-token';
      const payload = { sub: 'non-existent-user-id', jti: 'token-id' };
      
      jwtService.verify.mockReturnValue(payload);
      userRepository.findOne.mockResolvedValue(null);

      await expect(service.refreshTokens(refreshToken)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('validateToken', () => {
    it('should validate token and return user', async () => {
      const token = 'valid-token';
      const payload = { sub: mockUser.id, email: mockUser.email };
      
      jwtService.verify.mockReturnValue(payload);
      userRepository.findOne.mockResolvedValue(mockUser);
      userRepository.save.mockResolvedValue(mockUser);

      const result = await service.validateToken(token);

      expect(jwtService.verify).toHaveBeenCalledWith(token);
      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { id: payload.sub },
        relations: ['organizationMemberships', 'organizationMemberships.organization'],
      });
      expect(result).toEqual(mockUser);
    });

    it('should throw UnauthorizedException for invalid token', async () => {
      const token = 'invalid-token';
      
      jwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(service.validateToken(token)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for inactive user', async () => {
      const token = 'valid-token';
      const payload = { sub: mockUser.id, email: mockUser.email };
      
      jwtService.verify.mockReturnValue(payload);
      userRepository.findOne.mockResolvedValue({
        ...mockUser,
        isActive: false,
      } as any);

      await expect(service.validateToken(token)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('generateMagicLink', () => {
    it('should generate magic link for existing user', async () => {
      const email = 'test@example.com';
      
      userRepository.findOne.mockResolvedValue(mockUser);
      userRepository.save.mockResolvedValue(mockUser);

      const result = await service.generateMagicLink(email);

      expect(userRepository.findOne).toHaveBeenCalledWith({ where: { email } });
      expect(result).toMatch(/^http:\/\/localhost:3000\/auth\/magic-link\?token=.+&email=test%40example\.com$/);
    });

    it('should throw UnauthorizedException for non-existent user', async () => {
      const email = 'nonexistent@example.com';
      
      userRepository.findOne.mockResolvedValue(null);

      await expect(service.generateMagicLink(email)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('verifyMagicLink', () => {
    it('should verify valid magic link and login user', async () => {
      const email = 'test@example.com';
      const token = 'valid-magic-token';
      
      userRepository.findOne.mockResolvedValue({
        ...mockUser,
        magicLinkToken: token,
        magicLinkExpiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes from now
      } as any);
      userRepository.save.mockResolvedValue(mockUser);
      jwtService.sign.mockReturnValue('jwt-token');

      const result = await service.verifyMagicLink(email, token);

      expect(result).toEqual({
        accessToken: 'jwt-token',
        refreshToken: 'jwt-token',
        expiresIn: 15 * 60,
        tokenType: 'Bearer',
      });
    });

    it('should throw UnauthorizedException for invalid magic link', async () => {
      const email = 'test@example.com';
      const token = 'invalid-magic-token';
      
      userRepository.findOne.mockResolvedValue({
        ...mockUser,
        magicLinkToken: 'different-token',
        magicLinkExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      } as any);

      await expect(service.verifyMagicLink(email, token)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for expired magic link', async () => {
      const email = 'test@example.com';
      const token = 'valid-magic-token';
      
      userRepository.findOne.mockResolvedValue({
        ...mockUser,
        magicLinkToken: token,
        magicLinkExpiresAt: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
      } as any);

      await expect(service.verifyMagicLink(email, token)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('getUserPermissions', () => {
    it('should return user permissions for organization', async () => {
      const userId = 'user-id';
      const organizationId = 'org-id';
      const membership = { id: 'membership-id', role: 'admin' };
      
      organizationMemberRepository.findOne.mockResolvedValue(membership as any);

      const result = await service.getUserPermissions(userId, organizationId);

      expect(organizationMemberRepository.findOne).toHaveBeenCalledWith({
        where: { userId, organizationId },
        relations: ['organization', 'user'],
      });
      expect(result).toEqual(membership);
    });

    it('should return null if user is not a member', async () => {
      const userId = 'user-id';
      const organizationId = 'org-id';
      
      organizationMemberRepository.findOne.mockResolvedValue(null);

      const result = await service.getUserPermissions(userId, organizationId);

      expect(result).toBeNull();
    });
  });
});
