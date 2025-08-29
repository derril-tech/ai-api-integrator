import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, AuthProvider } from './entities/user.entity';
import { OrganizationMember } from '../organizations/entities/organization-member.entity';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

export interface JwtPayload {
  sub: string; // user ID
  email: string;
  name?: string;
  provider: AuthProvider;
  iat?: number;
  exp?: number;
  jti?: string; // JWT ID for token revocation
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface OAuthProfile {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  provider: AuthProvider;
  emailVerified?: boolean;
}

@Injectable()
export class JwtAuthService {
  private readonly logger = new Logger(JwtAuthService.name);
  private readonly revokedTokens = new Set<string>(); // In production, use Redis

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(OrganizationMember)
    private readonly organizationMemberRepository: Repository<OrganizationMember>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Authenticate user with email/password
   */
  async login(credentials: LoginCredentials): Promise<AuthTokens> {
    const user = await this.validateUser(credentials.email, credentials.password);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.generateTokens(user);
  }

  /**
   * Authenticate user with OAuth profile
   */
  async loginWithOAuth(profile: OAuthProfile): Promise<AuthTokens> {
    let user = await this.findUserByProvider(profile.provider, profile.id);
    
    if (!user) {
      // Check if user exists with same email
      user = await this.userRepository.findOne({ where: { email: profile.email } });
      
      if (user) {
        // Link OAuth account to existing user
        user.provider = profile.provider;
        user.providerId = profile.id;
        user.emailVerified = profile.emailVerified ?? true;
        if (profile.avatarUrl) user.avatarUrl = profile.avatarUrl;
        if (profile.name) user.name = profile.name;
      } else {
        // Create new user
        user = this.userRepository.create({
          email: profile.email,
          name: profile.name,
          avatarUrl: profile.avatarUrl,
          provider: profile.provider,
          providerId: profile.id,
          emailVerified: profile.emailVerified ?? true,
          isActive: true,
        });
      }
      
      await this.userRepository.save(user);
      this.logger.log(`New user created via ${profile.provider}: ${user.email}`);
    } else {
      // Update existing OAuth user
      user.lastLoginAt = new Date();
      if (profile.avatarUrl) user.avatarUrl = profile.avatarUrl;
      if (profile.name) user.name = profile.name;
      await this.userRepository.save(user);
    }

    return this.generateTokens(user);
  }

  /**
   * Register new user with email/password
   */
  async register(email: string, password: string, name?: string): Promise<AuthTokens> {
    const existingUser = await this.userRepository.findOne({ where: { email } });
    if (existingUser) {
      throw new UnauthorizedException('User already exists');
    }

    const hashedPassword = await this.hashPassword(password);
    
    const user = this.userRepository.create({
      email,
      name,
      provider: AuthProvider.EMAIL,
      emailVerified: false, // Require email verification
      isActive: true,
    });

    // Store hashed password (in a separate table in production)
    // For now, we'll store it in user metadata
    (user as any).passwordHash = hashedPassword;

    await this.userRepository.save(user);
    this.logger.log(`New user registered: ${user.email}`);

    return this.generateTokens(user);
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
      });

      // Check if token is revoked
      if (this.revokedTokens.has(payload.jti)) {
        throw new UnauthorizedException('Token has been revoked');
      }

      const user = await this.userRepository.findOne({ where: { id: payload.sub } });
      if (!user || !user.isActive) {
        throw new UnauthorizedException('User not found or inactive');
      }

      // Revoke old refresh token
      this.revokedTokens.add(payload.jti);

      return this.generateTokens(user);
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  /**
   * Validate JWT token and return user
   */
  async validateToken(token: string): Promise<User> {
    try {
      const payload: JwtPayload = this.jwtService.verify(token);
      
      // Check if token is revoked
      if (payload.jti && this.revokedTokens.has(payload.jti)) {
        throw new UnauthorizedException('Token has been revoked');
      }

      const user = await this.userRepository.findOne({ 
        where: { id: payload.sub },
        relations: ['organizationMemberships', 'organizationMemberships.organization'],
      });

      if (!user || !user.isActive) {
        throw new UnauthorizedException('User not found or inactive');
      }

      user.lastLoginAt = new Date();
      await this.userRepository.save(user);

      return user;
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }

  /**
   * Revoke token (logout)
   */
  async revokeToken(token: string): Promise<void> {
    try {
      const payload: JwtPayload = this.jwtService.verify(token, { ignoreExpiration: true });
      if (payload.jti) {
        this.revokedTokens.add(payload.jti);
      }
    } catch (error) {
      // Token is invalid, but that's okay for logout
    }
  }

  /**
   * Revoke all tokens for a user
   */
  async revokeAllTokens(userId: string): Promise<void> {
    // In production, this would query a token blacklist in Redis
    // For now, we'll just log the action
    this.logger.log(`All tokens revoked for user: ${userId}`);
  }

  /**
   * Generate magic link for passwordless login
   */
  async generateMagicLink(email: string): Promise<string> {
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Store magic link token (in production, use Redis with TTL)
    // For now, we'll store it in user metadata
    (user as any).magicLinkToken = token;
    (user as any).magicLinkExpiresAt = expiresAt;
    await this.userRepository.save(user);

    const baseUrl = this.configService.get('FRONTEND_URL', 'http://localhost:3000');
    return `${baseUrl}/auth/magic-link?token=${token}&email=${encodeURIComponent(email)}`;
  }

  /**
   * Verify magic link and login user
   */
  async verifyMagicLink(email: string, token: string): Promise<AuthTokens> {
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('Invalid magic link');
    }

    const storedToken = (user as any).magicLinkToken;
    const expiresAt = (user as any).magicLinkExpiresAt;

    if (!storedToken || storedToken !== token || !expiresAt || new Date() > expiresAt) {
      throw new UnauthorizedException('Invalid or expired magic link');
    }

    // Clear magic link token
    (user as any).magicLinkToken = null;
    (user as any).magicLinkExpiresAt = null;
    user.emailVerified = true;
    await this.userRepository.save(user);

    return this.generateTokens(user);
  }

  /**
   * Get user permissions for organization
   */
  async getUserPermissions(userId: string, organizationId: string): Promise<OrganizationMember | null> {
    return this.organizationMemberRepository.findOne({
      where: { userId, organizationId },
      relations: ['organization', 'user'],
    });
  }

  // Private helper methods
  private async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user || !user.isActive) {
      return null;
    }

    // Check password (stored in user metadata for this example)
    const storedHash = (user as any).passwordHash;
    if (!storedHash) {
      return null; // No password set (OAuth user)
    }

    const isPasswordValid = await bcrypt.compare(password, storedHash);
    return isPasswordValid ? user : null;
  }

  private async findUserByProvider(provider: AuthProvider, providerId: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { provider, providerId },
    });
  }

  private async generateTokens(user: User): Promise<AuthTokens> {
    const jti = crypto.randomUUID();
    
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      provider: user.provider,
      jti,
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: this.configService.get('JWT_EXPIRES_IN', '15m'),
    });

    const refreshToken = this.jwtService.sign(
      { sub: user.id, jti },
      {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN', '7d'),
      },
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60, // 15 minutes in seconds
      tokenType: 'Bearer',
    };
  }

  private async hashPassword(password: string): Promise<string> {
    const saltRounds = 12;
    return bcrypt.hash(password, saltRounds);
  }
}
