import { 
  Controller, 
  Post, 
  Body, 
  Get, 
  UseGuards, 
  Request,
  Res,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { JwtAuthService, LoginCredentials, AuthTokens } from './jwt-auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { User } from './entities/user.entity';

class LoginDto {
  email: string;
  password: string;
}

class RegisterDto {
  email: string;
  password: string;
  name?: string;
}

class RefreshTokenDto {
  refreshToken: string;
}

class MagicLinkDto {
  email: string;
}

class VerifyMagicLinkDto {
  email: string;
  token: string;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly jwtAuthService: JwtAuthService) {}

  @Post('register')
  @Public()
  @ApiOperation({ summary: 'Register a new user with email/password' })
  @ApiResponse({ status: 201, description: 'User successfully registered' })
  async register(@Body() registerDto: RegisterDto): Promise<AuthTokens> {
    return this.jwtAuthService.register(
      registerDto.email,
      registerDto.password,
      registerDto.name,
    );
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email/password' })
  @ApiResponse({ status: 200, description: 'User successfully logged in' })
  async login(@Body() loginDto: LoginDto): Promise<AuthTokens> {
    return this.jwtAuthService.login(loginDto);
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({ status: 200, description: 'Token refreshed successfully' })
  async refresh(@Body() refreshDto: RefreshTokenDto): Promise<AuthTokens> {
    return this.jwtAuthService.refreshTokens(refreshDto.refreshToken);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout current user' })
  @ApiResponse({ status: 200, description: 'User successfully logged out' })
  async logout(@Request() req: any): Promise<{ message: string }> {
    const token = req.user.currentToken;
    if (token) {
      await this.jwtAuthService.revokeToken(token);
    }
    return { message: 'Successfully logged out' };
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'User profile retrieved' })
  async getProfile(@CurrentUser() user: User): Promise<User> {
    return user;
  }

  @Post('magic-link')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send magic link for passwordless login' })
  @ApiResponse({ status: 200, description: 'Magic link sent successfully' })
  async sendMagicLink(@Body() magicLinkDto: MagicLinkDto): Promise<{ message: string; link?: string }> {
    const link = await this.jwtAuthService.generateMagicLink(magicLinkDto.email);
    
    // In production, send email instead of returning link
    // await this.emailService.sendMagicLink(magicLinkDto.email, link);
    
    return { 
      message: 'Magic link sent to your email',
      link, // Remove this in production
    };
  }

  @Post('magic-link/verify')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify magic link and login' })
  @ApiResponse({ status: 200, description: 'Magic link verified successfully' })
  async verifyMagicLink(@Body() verifyDto: VerifyMagicLinkDto): Promise<AuthTokens> {
    return this.jwtAuthService.verifyMagicLink(verifyDto.email, verifyDto.token);
  }

  // OAuth Routes
  @Get('google')
  @Public()
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Login with Google OAuth' })
  async googleAuth(): Promise<void> {
    // Initiates Google OAuth flow
  }

  @Get('google/callback')
  @Public()
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Google OAuth callback' })
  async googleAuthCallback(@Request() req: any, @Res() res: Response): Promise<void> {
    const tokens: AuthTokens = req.user.tokens;
    
    // Redirect to frontend with tokens
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const redirectUrl = `${frontendUrl}/auth/callback?token=${tokens.accessToken}&refresh=${tokens.refreshToken}`;
    
    res.redirect(redirectUrl);
  }

  @Get('github')
  @Public()
  @UseGuards(AuthGuard('github'))
  @ApiOperation({ summary: 'Login with GitHub OAuth' })
  async githubAuth(): Promise<void> {
    // Initiates GitHub OAuth flow
  }

  @Get('github/callback')
  @Public()
  @UseGuards(AuthGuard('github'))
  @ApiOperation({ summary: 'GitHub OAuth callback' })
  async githubAuthCallback(@Request() req: any, @Res() res: Response): Promise<void> {
    const tokens: AuthTokens = req.user.tokens;
    
    // Redirect to frontend with tokens
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const redirectUrl = `${frontendUrl}/auth/callback?token=${tokens.accessToken}&refresh=${tokens.refreshToken}`;
    
    res.redirect(redirectUrl);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get detailed user information with permissions' })
  @ApiResponse({ status: 200, description: 'Detailed user information' })
  async getMe(@CurrentUser() user: User): Promise<any> {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      provider: user.provider,
      emailVerified: user.emailVerified,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      organizations: user.organizationMemberships?.map(membership => ({
        id: membership.organization.id,
        name: membership.organization.name,
        role: membership.role,
        permissions: membership.permissions,
        joinedAt: membership.joinedAt,
      })),
    };
  }
}
