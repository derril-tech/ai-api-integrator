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

export interface ModelSchema {
  type?: string;
  format?: string;
  title?: string;
  description?: string;
  properties?: Record<string, any>;
  required?: string[];
  additionalProperties?: boolean | Record<string, any>;
  items?: Record<string, any>;
  enum?: any[];
  example?: any;
  examples?: Record<string, any>;
  allOf?: Record<string, any>[];
  oneOf?: Record<string, any>[];
  anyOf?: Record<string, any>[];
  not?: Record<string, any>;
  discriminator?: {
    propertyName: string;
    mapping?: Record<string, string>;
  };
  xml?: {
    name?: string;
    namespace?: string;
    prefix?: string;
    attribute?: boolean;
    wrapped?: boolean;
  };
  externalDocs?: {
    description?: string;
    url: string;
  };
  deprecated?: boolean;
}

@Entity('api_models')
@Index(['spec_id'])
@Index(['spec_id', 'name'], { unique: true })
export class ApiModel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'spec_id' })
  @Index()
  specId: string;

  @Column()
  name: string;

  @Column({ type: 'jsonb' })
  schema: ModelSchema;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'jsonb', nullable: true })
  example?: any;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => ApiSpec, spec => spec.models, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'spec_id' })
  spec: ApiSpec;

  // Helper methods
  getDisplayName(): string {
    return this.schema.title || this.name;
  }

  getDescription(): string {
    return this.description || this.schema.description || '';
  }

  isObject(): boolean {
    return this.schema.type === 'object' || !!this.schema.properties;
  }

  isArray(): boolean {
    return this.schema.type === 'array' || !!this.schema.items;
  }

  isPrimitive(): boolean {
    return ['string', 'number', 'integer', 'boolean'].includes(this.schema.type || '');
  }

  isEnum(): boolean {
    return !!this.schema.enum;
  }

  getRequiredProperties(): string[] {
    return this.schema.required || [];
  }

  getOptionalProperties(): string[] {
    if (!this.schema.properties) return [];
    const required = this.getRequiredProperties();
    return Object.keys(this.schema.properties).filter(prop => !required.includes(prop));
  }

  getPropertyCount(): number {
    return Object.keys(this.schema.properties || {}).length;
  }

  hasDiscriminator(): boolean {
    return !!this.schema.discriminator;
  }

  isPolymorphic(): boolean {
    return !!(this.schema.allOf || this.schema.oneOf || this.schema.anyOf);
  }

  isDeprecated(): boolean {
    return this.schema.deprecated === true;
  }

  getComplexity(): 'simple' | 'moderate' | 'complex' {
    if (this.isPrimitive() || this.isEnum()) return 'simple';
    
    const propertyCount = this.getPropertyCount();
    const hasPolymorphism = this.isPolymorphic();
    const hasDiscriminator = this.hasDiscriminator();
    
    if (hasPolymorphism || hasDiscriminator || propertyCount > 10) return 'complex';
    if (propertyCount > 3) return 'moderate';
    return 'simple';
  }

  getJsonSchema(): Record<string, any> {
    return {
      type: this.schema.type,
      properties: this.schema.properties,
      required: this.schema.required,
      additionalProperties: this.schema.additionalProperties,
      ...this.schema,
    };
  }
}
