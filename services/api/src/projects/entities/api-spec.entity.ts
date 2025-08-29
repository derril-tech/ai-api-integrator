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
import { ApiEndpoint } from './api-endpoint.entity';
import { ApiModel } from './api-model.entity';
import { RagInference } from './rag-inference.entity';
import { DocumentChunk } from './document-chunk.entity';
import { GeneratedArtifact } from './generated-artifact.entity';
import { SharedSpec } from './shared-spec.entity';

export enum SpecFormat {
  OPENAPI = 'openapi',
  POSTMAN = 'postman',
  GRAPHQL = 'graphql',
  ASYNCAPI = 'asyncapi',
  MARKDOWN = 'markdown',
}

export enum SpecStatus {
  UPLOADING = 'uploading',
  PROCESSING = 'processing',
  ANALYZING = 'analyzing',
  READY = 'ready',
  ERROR = 'error',
}

export interface SpecMetadata {
  title?: string;
  version?: string;
  description?: string;
  contact?: {
    name?: string;
    email?: string;
    url?: string;
  };
  license?: {
    name?: string;
    url?: string;
  };
  servers?: Array<{
    url: string;
    description?: string;
  }>;
  tags?: string[];
  externalDocs?: {
    description?: string;
    url: string;
  };
  uploadedFileName?: string;
  fileSize?: number;
  processingTime?: number;
  endpointCount?: number;
  modelCount?: number;
  inferenceCount?: number;
}

@Entity('api_specs')
@Index(['project_id'])
@Index(['status'])
export class ApiSpec {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'project_id' })
  @Index()
  projectId: string;

  @Column()
  name: string;

  @Column({ default: '1.0.0' })
  version: string;

  @Column({
    type: 'enum',
    enum: SpecFormat,
  })
  format: SpecFormat;

  @Column({ name: 'original_spec', type: 'jsonb' })
  originalSpec: Record<string, any>;

  @Column({ name: 'normalized_spec', type: 'jsonb' })
  normalizedSpec: Record<string, any>;

  @Column({ type: 'jsonb', default: {} })
  metadata: SpecMetadata;

  @Column({
    type: 'enum',
    enum: SpecStatus,
    default: SpecStatus.PROCESSING,
  })
  @Index()
  status: SpecStatus;

  @Column({ name: 'created_by' })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => Project, project => project.apiSpecs, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'project_id' })
  project: Project;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by' })
  creator: User;

  @OneToMany(() => ApiEndpoint, endpoint => endpoint.spec)
  endpoints: ApiEndpoint[];

  @OneToMany(() => ApiModel, model => model.spec)
  models: ApiModel[];

  @OneToMany(() => RagInference, inference => inference.spec)
  inferences: RagInference[];

  @OneToMany(() => DocumentChunk, chunk => chunk.spec)
  documentChunks: DocumentChunk[];

  @OneToMany(() => GeneratedArtifact, artifact => artifact.spec)
  artifacts: GeneratedArtifact[];

  @OneToMany(() => SharedSpec, share => share.spec)
  shares: SharedSpec[];

  // Helper methods
  getDisplayName(): string {
    return this.metadata.title || this.name;
  }

  getFullVersion(): string {
    return `${this.getDisplayName()} v${this.version}`;
  }

  isReady(): boolean {
    return this.status === SpecStatus.READY;
  }

  hasError(): boolean {
    return this.status === SpecStatus.ERROR;
  }

  isProcessing(): boolean {
    return [SpecStatus.UPLOADING, SpecStatus.PROCESSING, SpecStatus.ANALYZING].includes(this.status);
  }

  getEndpointCount(): number {
    return this.metadata.endpointCount ?? this.endpoints?.length ?? 0;
  }

  getModelCount(): number {
    return this.metadata.modelCount ?? this.models?.length ?? 0;
  }

  getInferenceCount(): number {
    return this.metadata.inferenceCount ?? this.inferences?.length ?? 0;
  }

  getComplexity(): 'small' | 'medium' | 'large' | 'xlarge' {
    const endpointCount = this.getEndpointCount();
    if (endpointCount > 1000) return 'xlarge';
    if (endpointCount > 500) return 'large';
    if (endpointCount > 100) return 'medium';
    return 'small';
  }
}
