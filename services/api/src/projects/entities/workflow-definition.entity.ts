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
import { Project } from './project.entity';
import { User } from '../../auth/entities/user.entity';
import { WorkflowExecution } from './workflow-execution.entity';

export interface WorkflowNode {
  id: string;
  type: 'http' | 'transform' | 'delay' | 'branch' | 'loop' | 'call' | 'webhook' | 'schedule';
  config: Record<string, any>;
  next?: string[];
  retryPolicy?: {
    maxAttempts: number;
    backoffMs: number;
    jitter: boolean;
  };
}

export interface WorkflowDefinitionData {
  id: string;
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  entry: string;
  variables?: Record<string, any>;
  timeout?: number;
  idempotencyKey?: string;
}

export interface WorkflowSchedule {
  cron?: string;
  interval?: number;
  timezone?: string;
  enabled: boolean;
}

@Entity('workflow_definitions')
@Index(['project_id'])
export class WorkflowDefinition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'project_id' })
  @Index()
  projectId: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'jsonb' })
  definition: WorkflowDefinitionData;

  @Column({ type: 'jsonb', nullable: true })
  schedule?: WorkflowSchedule;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'created_by' })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => Project, project => project.workflows, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'project_id' })
  project: Project;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by' })
  creator: User;

  @OneToMany(() => WorkflowExecution, execution => execution.workflow)
  executions: WorkflowExecution[];

  // Helper methods
  getDisplayName(): string {
    return this.name;
  }

  isScheduled(): boolean {
    return !!this.schedule && this.schedule.enabled;
  }

  getNodeCount(): number {
    return this.definition.nodes?.length || 0;
  }

  getEntryNode(): WorkflowNode | undefined {
    return this.definition.nodes?.find(node => node.id === this.definition.entry);
  }

  getNodeById(nodeId: string): WorkflowNode | undefined {
    return this.definition.nodes?.find(node => node.id === nodeId);
  }

  getNodesByType(type: WorkflowNode['type']): WorkflowNode[] {
    return this.definition.nodes?.filter(node => node.type === type) || [];
  }

  hasHttpNodes(): boolean {
    return this.getNodesByType('http').length > 0;
  }

  hasWebhookNodes(): boolean {
    return this.getNodesByType('webhook').length > 0;
  }

  getComplexity(): 'simple' | 'moderate' | 'complex' {
    const nodeCount = this.getNodeCount();
    const hasLoops = this.getNodesByType('loop').length > 0;
    const hasBranches = this.getNodesByType('branch').length > 0;
    const hasHttpCalls = this.hasHttpNodes();

    if (nodeCount > 10 || (hasLoops && hasBranches && hasHttpCalls)) return 'complex';
    if (nodeCount > 5 || hasLoops || hasBranches || hasHttpCalls) return 'moderate';
    return 'simple';
  }

  activate(): void {
    this.isActive = true;
  }

  deactivate(): void {
    this.isActive = false;
  }

  updateDefinition(newDefinition: Partial<WorkflowDefinitionData>): void {
    this.definition = { ...this.definition, ...newDefinition };
  }

  setSchedule(schedule: WorkflowSchedule): void {
    this.schedule = schedule;
  }

  clearSchedule(): void {
    this.schedule = undefined;
  }
}
