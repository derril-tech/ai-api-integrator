import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-github2';
import { ConfigService } from '@nestjs/config';
import { JwtAuthService, OAuthProfile } from '../jwt-auth.service';
import { AuthProvider } from '../entities/user.entity';

@Injectable()
export class GitHubStrategy extends PassportStrategy(Strategy, 'github') {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtAuthService: JwtAuthService,
  ) {
    super({
      clientID: configService.get('GITHUB_CLIENT_ID'),
      clientSecret: configService.get('GITHUB_CLIENT_SECRET'),
      callbackURL: configService.get('GITHUB_CALLBACK_URL', '/auth/github/callback'),
      scope: ['user:email'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: any,
  ): Promise<any> {
    try {
      const email = profile.emails?.find((email: any) => email.primary)?.value || profile.emails?.[0]?.value;
      
      if (!email) {
        throw new Error('No email found in GitHub profile');
      }

      const oauthProfile: OAuthProfile = {
        id: profile.id,
        email,
        name: profile.displayName || profile.username,
        avatarUrl: profile.photos[0]?.value,
        provider: AuthProvider.GITHUB,
        emailVerified: true, // GitHub emails are considered verified
      };

      const tokens = await this.jwtAuthService.loginWithOAuth(oauthProfile);
      
      done(null, {
        profile: oauthProfile,
        tokens,
      });
    } catch (error) {
      done(error, null);
    }
  }
}
