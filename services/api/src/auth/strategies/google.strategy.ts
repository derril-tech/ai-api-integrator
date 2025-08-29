import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import { JwtAuthService, OAuthProfile } from '../jwt-auth.service';
import { AuthProvider } from '../entities/user.entity';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtAuthService: JwtAuthService,
  ) {
    super({
      clientID: configService.get('GOOGLE_CLIENT_ID'),
      clientSecret: configService.get('GOOGLE_CLIENT_SECRET'),
      callbackURL: configService.get('GOOGLE_CALLBACK_URL', '/auth/google/callback'),
      scope: ['email', 'profile'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<any> {
    try {
      const oauthProfile: OAuthProfile = {
        id: profile.id,
        email: profile.emails[0].value,
        name: profile.displayName,
        avatarUrl: profile.photos[0]?.value,
        provider: AuthProvider.GOOGLE,
        emailVerified: profile.emails[0].verified,
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
