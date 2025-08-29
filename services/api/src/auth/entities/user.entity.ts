import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { OrganizationMember } from '../../organizations/entities/organization-member.entity';

export enum AuthProvider {
  EMAIL = 'email',
  GOOGLE = 'google',
  GITHUB = 'github',
  MICROSOFT = 'microsoft',
}

@Entity('users')
@Index(['email'], { unique: true })
@Index(['provider', 'provider_id'])
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  @Index()
  email: string;

  @Column({ nullable: true })
  name?: string;

  @Column({ name: 'avatar_url', nullable: true })
  avatarUrl?: string;

  @Column({
    type: 'enum',
    enum: AuthProvider,
    default: AuthProvider.EMAIL,
  })
  @Index()
  provider: AuthProvider;

  @Column({ name: 'provider_id', nullable: true })
  @Index()
  providerId?: string;

  @Column({ name: 'email_verified', default: false })
  emailVerified: boolean;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'last_login_at', nullable: true })
  lastLoginAt?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @OneToMany(() => OrganizationMember, member => member.user)
  organizationMemberships: OrganizationMember[];

  // Helper methods
  getFullName(): string {
    return this.name || this.email.split('@')[0];
  }

  isEmailProvider(): boolean {
    return this.provider === AuthProvider.EMAIL;
  }

  isSocialProvider(): boolean {
    return this.provider !== AuthProvider.EMAIL;
  }
}