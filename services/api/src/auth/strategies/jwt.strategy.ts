import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { JwtAuthService, JwtPayload } from '../jwt-auth.service';
import { User } from '../entities/user.entity';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtAuthService: JwtAuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('JWT_SECRET'),
      passReqToCallback: true,
    });
  }

  async validate(req: any, payload: JwtPayload): Promise<User> {
    try {
      // Extract token from request
      const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
      
      // Validate token and get user
      const user = await this.jwtAuthService.validateToken(token);
      
      // Attach token to user for potential revocation
      (user as any).currentToken = token;
      
      return user;
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }
}