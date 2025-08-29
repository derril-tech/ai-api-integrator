import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ApiSpec } from './api-spec.entity';

export interface ChunkMetadata {
  source: string;
  section?: string;
  page?: number;
  line?: number;
  confidence?: number;
  language?: string;
  contentType?: string;
  extractedFrom?: string;
  processingVersion?: string;
}

@Entity('document_chunks')
@Index(['spec_id'])
export class DocumentChunk {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'spec_id' })
  @Index()
  specId: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'vector', nullable: true })
  embedding?: number[];

  @Column({ type: 'jsonb', default: {} })
  metadata: ChunkMetadata;

  @Column({ name: 'chunk_index' })
  chunkIndex: number;

  @Column()
  source: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  // Relations
  @ManyToOne(() => ApiSpec, spec => spec.documentChunks, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'spec_id' })
  spec: ApiSpec;

  // Helper methods
  getDisplayContent(maxLength: number = 100): string {
    return this.content.length > maxLength 
      ? `${this.content.substring(0, maxLength)}...`
      : this.content;
  }

  hasEmbedding(): boolean {
    return this.embedding !== null && this.embedding !== undefined;
  }

  getWordCount(): number {
    return this.content.split(/\s+/).length;
  }

  getCharacterCount(): number {
    return this.content.length;
  }

  isFromDocumentation(): boolean {
    return this.source === 'documentation' || this.metadata.source === 'documentation';
  }

  isFromSpec(): boolean {
    return this.source === 'spec' || this.metadata.source === 'spec';
  }

  getSourceSection(): string {
    return this.metadata.section || 'unknown';
  }
}
