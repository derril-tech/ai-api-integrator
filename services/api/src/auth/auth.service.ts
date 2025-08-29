import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as nodemailer from 'nodemailer';
import { v4 as uuidv4 } from 'uuid';
import { UserService } from './user.service';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class AuthService {
  private transporter: nodemailer.Transporter;

  constructor(
    private userService: UserService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {
    // Initialize email transporter
    this.transporter = nodemailer.createTransporter({
      host: this.configService.get('SMTP_HOST', 'smtp.gmail.com'),
      port: this.configService.get('SMTP_PORT', 587),
      secure: false,
      auth: {
        user: this.configService.get('SMTP_USER'),
        pass: this.configService.get('SMTP_PASS'),
      },
    });
  }

  async validateUser(email: string, password: string): Promise<any> {
    // For magic link auth, we don't use passwords
    // This method is here for future password-based auth if needed
    throw new UnauthorizedException('Password authentication not supported');
  }

  async login(user: User) {
    const payload = { email: user.email, sub: user.id };
    await this.userService.updateLastLogin(user.id);
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    };
  }

  async sendMagicLink(email: string): Promise<{ message: string }> {
    // Check if user exists, create if not
    let user = await this.userService.findByEmail(email);
    if (!user) {
      const createUserDto: CreateUserDto = { email };
      user = await this.userService.create(createUserDto);
    }

    // Generate magic link token (expires in 1 hour)
    const token = this.jwtService.sign(
      { email: user.email, sub: user.id, type: 'magic-link' },
      { expiresIn: '1h' }
    );

    const magicLink = `${this.configService.get('FRONTEND_URL', 'http://localhost:3000')}/auth/verify?token=${token}`;

    // Send email
    try {
      await this.transporter.sendMail({
        from: this.configService.get('SMTP_FROM', 'noreply@ai-api-integrator.com'),
        to: email,
        subject: 'Your Magic Link - AI API Integrator',
        html: `
          <h1>Welcome to AI API Integrator</h1>
          <p>Click the link below to sign in:</p>
          <a href="${magicLink}" style="padding: 10px 20px; background-color: #0070f3; color: white; text-decoration: none; border-radius: 5px;">Sign In</a>
          <p>This link will expire in 1 hour.</p>
          <p>If you didn't request this, please ignore this email.</p>
        `,
      });
    } catch (error) {
      console.error('Failed to send magic link email:', error);
      throw new BadRequestException('Failed to send magic link');
    }

    return { message: 'Magic link sent successfully' };
  }

  async verifyMagicLink(token: string): Promise<any> {
    try {
      const payload = this.jwtService.verify(token);
      if (payload.type !== 'magic-link') {
        throw new UnauthorizedException('Invalid token type');
      }

      const user = await this.userService.findById(payload.sub);
      return this.login(user);
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired magic link');
    }
  }
}
