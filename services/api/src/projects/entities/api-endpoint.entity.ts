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
import { ApiSpec } from './api-spec.entity';
import { RagInference } from './rag-inference.entity';

export enum HttpMethod {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  PATCH = 'PATCH',
  DELETE = 'DELETE',
  HEAD = 'HEAD',
  OPTIONS = 'OPTIONS',
  TRACE = 'TRACE',
}

export interface EndpointParameter {
  name: string;
  in: 'query' | 'header' | 'path' | 'cookie';
  description?: string;
  required?: boolean;
  schema?: Record<string, any>;
  example?: any;
}

export interface EndpointResponse {
  description: string;
  headers?: Record<string, any>;
  content?: Record<string, any>;
  examples?: Record<string, any>;
}

export interface EndpointSecurity {
  type: string;
  name?: string;
  in?: string;
  scheme?: string;
  bearerFormat?: string;
  flows?: Record<string, any>;
}

@Entity('api_endpoints')
@Index(['spec_id'])
@Index(['method', 'path'])
@Index(['spec_id', 'method', 'path'], { unique: true })
export class ApiEndpoint {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'spec_id' })
  @Index()
  specId: string;

  @Column({
    type: 'enum',
    enum: HttpMethod,
  })
  method: HttpMethod;

  @Column()
  path: string;

  @Column({ name: 'operation_id', nullable: true })
  operationId?: string;

  @Column({ type: 'text', nullable: true })
  summary?: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'jsonb', default: [] })
  tags: string[];

  @Column({ type: 'jsonb', default: [] })
  parameters: EndpointParameter[];

  @Column({ name: 'request_body', type: 'jsonb', nullable: true })
  requestBody?: Record<string, any>;

  @Column({ type: 'jsonb', default: {} })
  responses: Record<string, EndpointResponse>;

  @Column({ type: 'jsonb', default: [] })
  security: EndpointSecurity[];

  @Column({ default: false })
  deprecated: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => ApiSpec, spec => spec.endpoints, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'spec_id' })
  spec: ApiSpec;

  @OneToMany(() => RagInference, inference => inference.endpoint)
  inferences: RagInference[];

  // Helper methods
  getFullPath(): string {
    return `${this.method} ${this.path}`;
  }

  getDisplayName(): string {
    return this.summary || this.operationId || this.getFullPath();
  }

  hasAuthentication(): boolean {
    return this.security.length > 0;
  }

  getRequiredParameters(): EndpointParameter[] {
    return this.parameters.filter(param => param.required);
  }

  getQueryParameters(): EndpointParameter[] {
    return this.parameters.filter(param => param.in === 'query');
  }

  getPathParameters(): EndpointParameter[] {
    return this.parameters.filter(param => param.in === 'path');
  }

  getHeaderParameters(): EndpointParameter[] {
    return this.parameters.filter(param => param.in === 'header');
  }

  hasRequestBody(): boolean {
    return this.requestBody !== null && this.requestBody !== undefined;
  }

  getSuccessResponses(): Record<string, EndpointResponse> {
    return Object.fromEntries(
      Object.entries(this.responses).filter(([code]) => 
        code.startsWith('2') || code === 'default'
      )
    );
  }

  getErrorResponses(): Record<string, EndpointResponse> {
    return Object.fromEntries(
      Object.entries(this.responses).filter(([code]) => 
        code.startsWith('4') || code.startsWith('5')
      )
    );
  }

  isIdempotent(): boolean {
    return [HttpMethod.GET, HttpMethod.HEAD, HttpMethod.PUT, HttpMethod.DELETE, HttpMethod.OPTIONS].includes(this.method);
  }

  isSafe(): boolean {
    return [HttpMethod.GET, HttpMethod.HEAD, HttpMethod.OPTIONS].includes(this.method);
  }
}
