import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';
import { User } from '../../auth/entities/user.entity';
import { ApiSpec } from './api-spec.entity';
import { WorkflowDefinition } from './workflow-definition.entity';

export interface ProjectSettings {
  defaultLanguage?: string;
  enabledFeatures?: string[];
  codegenOptions?: Record<string, any>;
  workflowOptions?: Record<string, any>;
  securitySettings?: Record<string, any>;
}

@Entity('projects')
@Index(['organization_id'])
export class Project {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id' })
  @Index()
  organizationId: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'jsonb', default: {} })
  settings: ProjectSettings;

  @Column({ name: 'created_by' })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => Organization, organization => organization.projects, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by' })
  creator: User;

  @OneToMany(() => ApiSpec, spec => spec.project)
  apiSpecs: ApiSpec[];

  @OneToMany(() => WorkflowDefinition, workflow => workflow.project)
  workflows: WorkflowDefinition[];

  // Helper methods
  getDisplayName(): string {
    return this.name;
  }

  isFeatureEnabled(feature: string): boolean {
    return this.settings.enabledFeatures?.includes(feature) ?? true;
  }

  getCodegenLanguages(): string[] {
    return this.settings.codegenOptions?.languages ?? ['typescript'];
  }
}