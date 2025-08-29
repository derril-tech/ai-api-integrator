import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Organization } from './organization.entity';
import { User } from '../../auth/entities/user.entity';

export enum OrganizationRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  MEMBER = 'member',
  VIEWER = 'viewer',
}

export interface OrganizationPermissions {
  canCreateProjects?: boolean;
  canDeleteProjects?: boolean;
  canManageMembers?: boolean;
  canManageSettings?: boolean;
  canViewBilling?: boolean;
  canManageBilling?: boolean;
  canExportData?: boolean;
  canManageIntegrations?: boolean;
}

@Entity('organization_members')
@Index(['organization_id', 'user_id'], { unique: true })
@Index(['organization_id'])
@Index(['user_id'])
export class OrganizationMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id' })
  @Index()
  organizationId: string;

  @Column({ name: 'user_id' })
  @Index()
  userId: string;

  @Column({
    type: 'enum',
    enum: OrganizationRole,
    default: OrganizationRole.MEMBER,
  })
  role: OrganizationRole;

  @Column({ type: 'jsonb', default: [] })
  permissions: OrganizationPermissions;

  @Column({ name: 'joined_at' })
  joinedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => Organization, organization => organization.members, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @ManyToOne(() => User, user => user.organizationMemberships, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'user_id' })
  user: User;

  // Helper methods
  isOwner(): boolean {
    return this.role === OrganizationRole.OWNER;
  }

  isAdmin(): boolean {
    return this.role === OrganizationRole.ADMIN || this.isOwner();
  }

  canManageMembers(): boolean {
    return this.isAdmin() || this.permissions.canManageMembers === true;
  }

  canCreateProjects(): boolean {
    return this.role !== OrganizationRole.VIEWER && 
           (this.isAdmin() || this.permissions.canCreateProjects !== false);
  }

  canDeleteProjects(): boolean {
    return this.isAdmin() || this.permissions.canDeleteProjects === true;
  }

  canManageSettings(): boolean {
    return this.isAdmin() || this.permissions.canManageSettings === true;
  }

  canExportData(): boolean {
    return this.isAdmin() || this.permissions.canExportData === true;
  }
}
