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
import { WorkflowDefinition } from './workflow-definition.entity';

export enum WorkflowExecutionStatus {
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  TIMED_OUT = 'timed_out',
}

export interface WorkflowExecutionLog {
  level: 'info' | 'warn' | 'error';
  message: string;
  timestamp: number;
  nodeId?: string;
  metadata?: Record<string, any>;
}

@Entity('workflow_executions')
@Index(['workflow_id'])
@Index(['status'])
export class WorkflowExecution {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'workflow_id' })
  @Index()
  workflowId: string;

  @Column({ name: 'temporal_workflow_id', nullable: true })
  temporalWorkflowId?: string;

  @Column({
    type: 'enum',
    enum: WorkflowExecutionStatus,
    default: WorkflowExecutionStatus.RUNNING,
  })
  @Index()
  status: WorkflowExecutionStatus;

  @Column({ type: 'jsonb', nullable: true })
  input?: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  output?: Record<string, any>;

  @Column({ type: 'jsonb', default: [] })
  logs: WorkflowExecutionLog[];

  @Column({ name: 'started_at' })
  startedAt: Date;

  @Column({ name: 'completed_at', nullable: true })
  completedAt?: Date;

  @Column({ name: 'duration_ms', nullable: true })
  durationMs?: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => WorkflowDefinition, workflow => workflow.executions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'workflow_id' })
  workflow: WorkflowDefinition;

  // Helper methods
  isRunning(): boolean {
    return this.status === WorkflowExecutionStatus.RUNNING;
  }

  isCompleted(): boolean {
    return this.status === WorkflowExecutionStatus.COMPLETED;
  }

  isFailed(): boolean {
    return this.status === WorkflowExecutionStatus.FAILED;
  }

  isCancelled(): boolean {
    return this.status === WorkflowExecutionStatus.CANCELLED;
  }

  isTimedOut(): boolean {
    return this.status === WorkflowExecutionStatus.TIMED_OUT;
  }

  isFinished(): boolean {
    return !this.isRunning();
  }

  wasSuccessful(): boolean {
    return this.isCompleted();
  }

  getDuration(): number | null {
    if (this.durationMs) return this.durationMs;
    if (this.completedAt) {
      return this.completedAt.getTime() - this.startedAt.getTime();
    }
    if (this.isRunning()) {
      return Date.now() - this.startedAt.getTime();
    }
    return null;
  }

  getDurationFormatted(): string {
    const duration = this.getDuration();
    if (!duration) return 'Unknown';

    const seconds = Math.floor(duration / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  addLog(level: WorkflowExecutionLog['level'], message: string, nodeId?: string, metadata?: Record<string, any>): void {
    const log: WorkflowExecutionLog = {
      level,
      message,
      timestamp: Date.now(),
      nodeId,
      metadata,
    };

    this.logs = [...(this.logs || []), log];
  }

  getLogsByLevel(level: WorkflowExecutionLog['level']): WorkflowExecutionLog[] {
    return this.logs.filter(log => log.level === level);
  }

  getErrorLogs(): WorkflowExecutionLog[] {
    return this.getLogsByLevel('error');
  }

  getWarningLogs(): WorkflowExecutionLog[] {
    return this.getLogsByLevel('warn');
  }

  hasErrors(): boolean {
    return this.getErrorLogs().length > 0;
  }

  hasWarnings(): boolean {
    return this.getWarningLogs().length > 0;
  }

  complete(output?: Record<string, any>): void {
    this.status = WorkflowExecutionStatus.COMPLETED;
    this.completedAt = new Date();
    this.durationMs = this.getDuration();
    if (output) this.output = output;
  }

  fail(error?: string): void {
    this.status = WorkflowExecutionStatus.FAILED;
    this.completedAt = new Date();
    this.durationMs = this.getDuration();
    if (error) {
      this.addLog('error', error);
    }
  }

  cancel(): void {
    this.status = WorkflowExecutionStatus.CANCELLED;
    this.completedAt = new Date();
    this.durationMs = this.getDuration();
    this.addLog('info', 'Workflow execution cancelled');
  }

  timeout(): void {
    this.status = WorkflowExecutionStatus.TIMED_OUT;
    this.completedAt = new Date();
    this.durationMs = this.getDuration();
    this.addLog('error', 'Workflow execution timed out');
  }
}
