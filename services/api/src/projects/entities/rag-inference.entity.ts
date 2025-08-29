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
import { ApiSpec } from './api-spec.entity';
import { ApiEndpoint } from './api-endpoint.entity';
import { User } from '../../auth/entities/user.entity';

export enum InferenceCategory {
  AUTH = 'auth',
  PAGINATION = 'pagination',
  RATE_LIMIT = 'rate_limit',
  ERROR_HANDLING = 'error_handling',
  DATA_FORMAT = 'data_format',
  OTHER = 'other',
}

export enum InferenceStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  OVERRIDDEN = 'overridden',
}

export interface InferenceProvenance {
  source: 'pattern_analysis' | 'similar_apis' | 'documentation' | 'community_knowledge' | 'statistical';
  confidence: number;
  description: string;
  examples?: string[];
}

export interface InferenceAlternative {
  value: any;
  confidence: number;
  reasoning: string;
  useCases: string[];
}

@Entity('rag_inferences')
@Index(['spec_id'])
@Index(['status'])
export class RagInference {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'spec_id' })
  @Index()
  specId: string;

  @Column({ name: 'endpoint_id', nullable: true })
  endpointId?: string;

  @Column()
  field: string;

  @Column({
    type: 'enum',
    enum: InferenceCategory,
  })
  category: InferenceCategory;

  @Column({ name: 'inferred_value', type: 'jsonb' })
  inferredValue: any;

  @Column({ type: 'decimal', precision: 3, scale: 2 })
  confidence: number;

  @Column({ type: 'text' })
  reasoning: string;

  @Column({ type: 'jsonb', default: [] })
  evidence: string[];

  @Column({ type: 'jsonb', default: [] })
  provenance: InferenceProvenance[];

  @Column({ type: 'jsonb', default: [] })
  alternatives: InferenceAlternative[];

  @Column({
    type: 'enum',
    enum: InferenceStatus,
    default: InferenceStatus.PENDING,
  })
  @Index()
  status: InferenceStatus;

  @Column({ name: 'reviewed_by', nullable: true })
  reviewedBy?: string;

  @Column({ name: 'reviewed_at', nullable: true })
  reviewedAt?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => ApiSpec, spec => spec.inferences, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'spec_id' })
  spec: ApiSpec;

  @ManyToOne(() => ApiEndpoint, endpoint => endpoint.inferences, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  @JoinColumn({ name: 'endpoint_id' })
  endpoint?: ApiEndpoint;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'reviewed_by' })
  reviewer?: User;

  // Helper methods
  isPending(): boolean {
    return this.status === InferenceStatus.PENDING;
  }

  isAccepted(): boolean {
    return this.status === InferenceStatus.ACCEPTED;
  }

  isRejected(): boolean {
    return this.status === InferenceStatus.REJECTED;
  }

  isOverridden(): boolean {
    return this.status === InferenceStatus.OVERRIDDEN;
  }

  isReviewed(): boolean {
    return this.status !== InferenceStatus.PENDING;
  }

  isHighConfidence(): boolean {
    return this.confidence >= 0.8;
  }

  isMediumConfidence(): boolean {
    return this.confidence >= 0.6 && this.confidence < 0.8;
  }

  isLowConfidence(): boolean {
    return this.confidence < 0.6;
  }

  getConfidenceLevel(): 'high' | 'medium' | 'low' {
    if (this.isHighConfidence()) return 'high';
    if (this.isMediumConfidence()) return 'medium';
    return 'low';
  }

  getDisplayName(): string {
    return `${this.category}: ${this.field}`;
  }

  accept(userId: string): void {
    this.status = InferenceStatus.ACCEPTED;
    this.reviewedBy = userId;
    this.reviewedAt = new Date();
  }

  reject(userId: string): void {
    this.status = InferenceStatus.REJECTED;
    this.reviewedBy = userId;
    this.reviewedAt = new Date();
  }

  override(userId: string, newValue: any): void {
    this.status = InferenceStatus.OVERRIDDEN;
    this.inferredValue = newValue;
    this.reviewedBy = userId;
    this.reviewedAt = new Date();
  }

  getBestAlternative(): InferenceAlternative | null {
    if (this.alternatives.length === 0) return null;
    return this.alternatives.reduce((best, current) => 
      current.confidence > best.confidence ? current : best
    );
  }
}
