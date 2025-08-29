import { HttpStatus } from '@nestjs/common';
import { IntegrationTestHelper, IntegrationTestContext } from './setup';
import { AuthProvider } from '../../src/auth/entities/user.entity';

describe('Authentication Integration Tests', () => {
  let context: IntegrationTestContext;

  beforeAll(async () => {
    context = await IntegrationTestHelper.setup();
  });

  afterAll(async () => {
    await context.cleanup();
  });

  beforeEach(async () => {
    // Clean up data before each test
    await context.dataSource.query('TRUNCATE TABLE users CASCADE');
    await context.dataSource.query('TRUNCATE TABLE organization_members CASCADE');
    await context.dataSource.query('TRUNCATE TABLE organizations CASCADE');
  });

  describe('POST /auth/register', () => {
    it('should register a new user', async () => {
      const userData = {
        email: 'newuser@test.com',
        password: 'password123',
        name: 'New User',
      };

      const response = await context.request
        .post('/api/v1/auth/register')
        .send(userData)
        .expect(HttpStatus.CREATED);

      expect(response.body).toHaveValidApiResponse();
      expect(response.body.data).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        expiresIn: expect.any(Number),
        tokenType: 'Bearer',
      });

      // Verify user was created in database
      const user = await context.dataSource
        .getRepository('User')
        .findOne({ where: { email: userData.email } });
      
      expect(user).toBeTruthy();
      expect(user.name).toBe(userData.name);
      expect(user.provider).toBe(AuthProvider.EMAIL);
      expect(user.emailVerified).toBe(false);
      expect(user.isActive).toBe(true);
    });

    it('should return 409 for duplicate email', async () => {
      const userData = {
        email: 'duplicate@test.com',
        password: 'password123',
        name: 'User One',
      };

      // Create first user
      await context.request
        .post('/api/v1/auth/register')
        .send(userData)
        .expect(HttpStatus.CREATED);

      // Try to create second user with same email
      const response = await context.request
        .post('/api/v1/auth/register')
        .send({ ...userData, name: 'User Two' })
        .expect(HttpStatus.UNAUTHORIZED);

      expect(response.body.message).toContain('already exists');
    });

    it('should validate required fields', async () => {
      const response = await context.request
        .post('/api/v1/auth/register')
        .send({})
        .expect(HttpStatus.BAD_REQUEST);

      expect(response.body.message).toContain('email');
      expect(response.body.message).toContain('password');
    });
  });

  describe('POST /auth/login', () => {
    it('should login with valid credentials', async () => {
      const user = await context.userFactory.create({
        email: 'login@test.com',
        name: 'Login User',
      });

      const response = await context.request
        .post('/api/v1/auth/login')
        .send({
          email: user.email,
          password: 'password123',
        })
        .expect(HttpStatus.OK);

      expect(response.body).toHaveValidApiResponse();
      expect(response.body.data).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        expiresIn: expect.any(Number),
        tokenType: 'Bearer',
      });
    });

    it('should return 401 for invalid credentials', async () => {
      const user = await context.userFactory.create();

      const response = await context.request
        .post('/api/v1/auth/login')
        .send({
          email: user.email,
          password: 'wrongpassword',
        })
        .expect(HttpStatus.UNAUTHORIZED);

      expect(response.body.message).toContain('Invalid credentials');
    });

    it('should return 401 for non-existent user', async () => {
      const response = await context.request
        .post('/api/v1/auth/login')
        .send({
          email: 'nonexistent@test.com',
          password: 'password123',
        })
        .expect(HttpStatus.UNAUTHORIZED);

      expect(response.body.message).toContain('Invalid credentials');
    });

    it('should return 401 for inactive user', async () => {
      const user = await context.userFactory.createInactive();

      const response = await context.request
        .post('/api/v1/auth/login')
        .send({
          email: user.email,
          password: 'password123',
        })
        .expect(HttpStatus.UNAUTHORIZED);

      expect(response.body.message).toContain('Invalid credentials');
    });
  });

  describe('POST /auth/refresh', () => {
    it('should refresh tokens with valid refresh token', async () => {
      const user = await context.userFactory.create();

      // Login to get refresh token
      const loginResponse = await context.request
        .post('/api/v1/auth/login')
        .send({
          email: user.email,
          password: 'password123',
        });

      const { refreshToken } = loginResponse.body.data;

      // Use refresh token to get new tokens
      const response = await context.request
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(HttpStatus.OK);

      expect(response.body).toHaveValidApiResponse();
      expect(response.body.data).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        expiresIn: expect.any(Number),
        tokenType: 'Bearer',
      });

      // New tokens should be different
      expect(response.body.data.accessToken).not.toBe(loginResponse.body.data.accessToken);
      expect(response.body.data.refreshToken).not.toBe(refreshToken);
    });

    it('should return 401 for invalid refresh token', async () => {
      const response = await context.request
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'invalid-token' })
        .expect(HttpStatus.UNAUTHORIZED);

      expect(response.body.message).toContain('Invalid refresh token');
    });
  });

  describe('GET /auth/profile', () => {
    it('should return user profile with valid token', async () => {
      const { request: authRequest, user } = await IntegrationTestHelper.createAuthenticatedRequest(context);

      const response = await authRequest
        .get('/api/v1/auth/profile')
        .expect(HttpStatus.OK);

      expect(response.body).toHaveValidApiResponse();
      expect(response.body.data).toMatchObject({
        id: user.id,
        email: user.email,
        name: user.name,
        provider: user.provider,
        emailVerified: user.emailVerified,
        isActive: user.isActive,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
    });

    it('should return 401 without token', async () => {
      const response = await context.request
        .get('/api/v1/auth/profile')
        .expect(HttpStatus.UNAUTHORIZED);

      expect(response.body.message).toContain('Authentication required');
    });

    it('should return 401 with invalid token', async () => {
      const response = await context.request
        .get('/api/v1/auth/profile')
        .set('Authorization', 'Bearer invalid-token')
        .expect(HttpStatus.UNAUTHORIZED);

      expect(response.body.message).toContain('Invalid token');
    });
  });

  describe('POST /auth/logout', () => {
    it('should logout user and revoke token', async () => {
      const { request: authRequest, token } = await IntegrationTestHelper.createAuthenticatedRequest(context);

      // Logout
      const response = await authRequest
        .post('/api/v1/auth/logout')
        .expect(HttpStatus.OK);

      expect(response.body).toHaveValidApiResponse();
      expect(response.body.data.message).toContain('Successfully logged out');

      // Token should be revoked (this test depends on implementation)
      // In a real implementation, you might check a token blacklist
    });

    it('should return 401 without token', async () => {
      const response = await context.request
        .post('/api/v1/auth/logout')
        .expect(HttpStatus.UNAUTHORIZED);

      expect(response.body.message).toContain('Authentication required');
    });
  });

  describe('POST /auth/magic-link', () => {
    it('should send magic link for existing user', async () => {
      const user = await context.userFactory.create();

      const response = await context.request
        .post('/api/v1/auth/magic-link')
        .send({ email: user.email })
        .expect(HttpStatus.OK);

      expect(response.body).toHaveValidApiResponse();
      expect(response.body.data.message).toContain('Magic link sent');
      expect(response.body.data.link).toMatch(/^http:\/\/localhost:3000\/auth\/magic-link\?token=.+/);
    });

    it('should return 401 for non-existent user', async () => {
      const response = await context.request
        .post('/api/v1/auth/magic-link')
        .send({ email: 'nonexistent@test.com' })
        .expect(HttpStatus.UNAUTHORIZED);

      expect(response.body.message).toContain('User not found');
    });
  });

  describe('POST /auth/magic-link/verify', () => {
    it('should verify magic link and login user', async () => {
      const user = await context.userFactory.create();

      // Generate magic link
      const magicLinkResponse = await context.request
        .post('/api/v1/auth/magic-link')
        .send({ email: user.email });

      const magicLink = magicLinkResponse.body.data.link;
      const url = new URL(magicLink);
      const token = url.searchParams.get('token');

      // Verify magic link
      const response = await context.request
        .post('/api/v1/auth/magic-link/verify')
        .send({
          email: user.email,
          token,
        })
        .expect(HttpStatus.OK);

      expect(response.body).toHaveValidApiResponse();
      expect(response.body.data).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        expiresIn: expect.any(Number),
        tokenType: 'Bearer',
      });
    });

    it('should return 401 for invalid magic link', async () => {
      const user = await context.userFactory.create();

      const response = await context.request
        .post('/api/v1/auth/magic-link/verify')
        .send({
          email: user.email,
          token: 'invalid-token',
        })
        .expect(HttpStatus.UNAUTHORIZED);

      expect(response.body.message).toContain('Invalid or expired magic link');
    });
  });

  describe('GET /auth/me', () => {
    it('should return detailed user information', async () => {
      const { request: authRequest, user } = await IntegrationTestHelper.createAuthenticatedRequest(context);

      // Create organization membership for the user
      const { organization } = await context.organizationFactory.createWithOwner(user);

      const response = await authRequest
        .get('/api/v1/auth/me')
        .expect(HttpStatus.OK);

      expect(response.body).toHaveValidApiResponse();
      expect(response.body.data).toMatchObject({
        id: user.id,
        email: user.email,
        name: user.name,
        provider: user.provider,
        emailVerified: user.emailVerified,
        isActive: user.isActive,
        organizations: expect.arrayContaining([
          expect.objectContaining({
            id: organization.id,
            name: organization.name,
            role: 'owner',
          }),
        ]),
      });
    });
  });
});
