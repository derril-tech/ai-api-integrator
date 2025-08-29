import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1703001000000 implements MigrationInterface {
  name = 'InitialSchema1703001000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable pgvector extension
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // Organizations table
    await queryRunner.query(`
      CREATE TABLE "organizations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying NOT NULL,
        "slug" character varying NOT NULL,
        "description" text,
        "settings" jsonb DEFAULT '{}',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_organizations" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_organizations_slug" UNIQUE ("slug")
      )
    `);

    // Users table
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "email" character varying NOT NULL,
        "name" character varying,
        "avatar_url" character varying,
        "provider" character varying NOT NULL DEFAULT 'email',
        "provider_id" character varying,
        "email_verified" boolean NOT NULL DEFAULT false,
        "is_active" boolean NOT NULL DEFAULT true,
        "last_login_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_users" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_users_email" UNIQUE ("email")
      )
    `);

    // Organization members table
    await queryRunner.query(`
      CREATE TABLE "organization_members" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "role" character varying NOT NULL DEFAULT 'member',
        "permissions" jsonb DEFAULT '[]',
        "joined_at" TIMESTAMP NOT NULL DEFAULT now(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_organization_members" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_organization_members_org_user" UNIQUE ("organization_id", "user_id")
      )
    `);

    // Projects table
    await queryRunner.query(`
      CREATE TABLE "projects" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" uuid NOT NULL,
        "name" character varying NOT NULL,
        "description" text,
        "settings" jsonb DEFAULT '{}',
        "created_by" uuid NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_projects" PRIMARY KEY ("id")
      )
    `);

    // API specifications table
    await queryRunner.query(`
      CREATE TABLE "api_specs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "project_id" uuid NOT NULL,
        "name" character varying NOT NULL,
        "version" character varying NOT NULL DEFAULT '1.0.0',
        "format" character varying NOT NULL,
        "original_spec" jsonb NOT NULL,
        "normalized_spec" jsonb NOT NULL,
        "metadata" jsonb DEFAULT '{}',
        "status" character varying NOT NULL DEFAULT 'processing',
        "created_by" uuid NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_api_specs" PRIMARY KEY ("id")
      )
    `);

    // API endpoints table
    await queryRunner.query(`
      CREATE TABLE "api_endpoints" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "spec_id" uuid NOT NULL,
        "method" character varying NOT NULL,
        "path" character varying NOT NULL,
        "operation_id" character varying,
        "summary" text,
        "description" text,
        "tags" jsonb DEFAULT '[]',
        "parameters" jsonb DEFAULT '[]',
        "request_body" jsonb,
        "responses" jsonb DEFAULT '{}',
        "security" jsonb DEFAULT '[]',
        "deprecated" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_api_endpoints" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_api_endpoints_spec_method_path" UNIQUE ("spec_id", "method", "path")
      )
    `);

    // API models/schemas table
    await queryRunner.query(`
      CREATE TABLE "api_models" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "spec_id" uuid NOT NULL,
        "name" character varying NOT NULL,
        "schema" jsonb NOT NULL,
        "description" text,
        "example" jsonb,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_api_models" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_api_models_spec_name" UNIQUE ("spec_id", "name")
      )
    `);

    // RAG inference results table
    await queryRunner.query(`
      CREATE TABLE "rag_inferences" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "spec_id" uuid NOT NULL,
        "endpoint_id" uuid,
        "field" character varying NOT NULL,
        "category" character varying NOT NULL,
        "inferred_value" jsonb NOT NULL,
        "confidence" decimal(3,2) NOT NULL,
        "reasoning" text NOT NULL,
        "evidence" jsonb DEFAULT '[]',
        "provenance" jsonb DEFAULT '[]',
        "alternatives" jsonb DEFAULT '[]',
        "status" character varying NOT NULL DEFAULT 'pending',
        "reviewed_by" uuid,
        "reviewed_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_rag_inferences" PRIMARY KEY ("id")
      )
    `);

    // Document chunks for RAG (with vector embeddings)
    await queryRunner.query(`
      CREATE TABLE "document_chunks" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "spec_id" uuid NOT NULL,
        "content" text NOT NULL,
        "embedding" vector(1536),
        "metadata" jsonb DEFAULT '{}',
        "chunk_index" integer NOT NULL,
        "source" character varying NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_document_chunks" PRIMARY KEY ("id")
      )
    `);

    // Generated artifacts table
    await queryRunner.query(`
      CREATE TABLE "generated_artifacts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "spec_id" uuid NOT NULL,
        "type" character varying NOT NULL,
        "language" character varying,
        "files" jsonb NOT NULL,
        "metadata" jsonb DEFAULT '{}',
        "s3_key" character varying,
        "status" character varying NOT NULL DEFAULT 'generating',
        "created_by" uuid NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_generated_artifacts" PRIMARY KEY ("id")
      )
    `);

    // Workflow definitions table
    await queryRunner.query(`
      CREATE TABLE "workflow_definitions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "project_id" uuid NOT NULL,
        "name" character varying NOT NULL,
        "description" text,
        "definition" jsonb NOT NULL,
        "schedule" jsonb,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_by" uuid NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_workflow_definitions" PRIMARY KEY ("id")
      )
    `);

    // Workflow executions table
    await queryRunner.query(`
      CREATE TABLE "workflow_executions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workflow_id" uuid NOT NULL,
        "temporal_workflow_id" character varying,
        "status" character varying NOT NULL DEFAULT 'running',
        "input" jsonb,
        "output" jsonb,
        "logs" jsonb DEFAULT '[]',
        "started_at" TIMESTAMP NOT NULL DEFAULT now(),
        "completed_at" TIMESTAMP,
        "duration_ms" integer,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_workflow_executions" PRIMARY KEY ("id")
      )
    `);

    // Shared specs table
    await queryRunner.query(`
      CREATE TABLE "shared_specs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "spec_id" uuid NOT NULL,
        "share_token" character varying NOT NULL,
        "permissions" jsonb NOT NULL DEFAULT '{}',
        "analytics" jsonb NOT NULL DEFAULT '{"views": 0, "viewerIps": []}',
        "expires_at" TIMESTAMP,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_by" uuid NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_shared_specs" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_shared_specs_token" UNIQUE ("share_token")
      )
    `);

    // Performance metrics table
    await queryRunner.query(`
      CREATE TABLE "performance_metrics" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "operation" character varying NOT NULL,
        "duration_ms" integer NOT NULL,
        "success" boolean NOT NULL,
        "metadata" jsonb DEFAULT '{}',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_performance_metrics" PRIMARY KEY ("id")
      )
    `);

    // Add foreign key constraints
    await queryRunner.query(`
      ALTER TABLE "organization_members" 
      ADD CONSTRAINT "FK_organization_members_organization" 
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "organization_members" 
      ADD CONSTRAINT "FK_organization_members_user" 
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "projects" 
      ADD CONSTRAINT "FK_projects_organization" 
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "projects" 
      ADD CONSTRAINT "FK_projects_created_by" 
      FOREIGN KEY ("created_by") REFERENCES "users"("id")
    `);

    await queryRunner.query(`
      ALTER TABLE "api_specs" 
      ADD CONSTRAINT "FK_api_specs_project" 
      FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "api_specs" 
      ADD CONSTRAINT "FK_api_specs_created_by" 
      FOREIGN KEY ("created_by") REFERENCES "users"("id")
    `);

    await queryRunner.query(`
      ALTER TABLE "api_endpoints" 
      ADD CONSTRAINT "FK_api_endpoints_spec" 
      FOREIGN KEY ("spec_id") REFERENCES "api_specs"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "api_models" 
      ADD CONSTRAINT "FK_api_models_spec" 
      FOREIGN KEY ("spec_id") REFERENCES "api_specs"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "rag_inferences" 
      ADD CONSTRAINT "FK_rag_inferences_spec" 
      FOREIGN KEY ("spec_id") REFERENCES "api_specs"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "rag_inferences" 
      ADD CONSTRAINT "FK_rag_inferences_endpoint" 
      FOREIGN KEY ("endpoint_id") REFERENCES "api_endpoints"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "document_chunks" 
      ADD CONSTRAINT "FK_document_chunks_spec" 
      FOREIGN KEY ("spec_id") REFERENCES "api_specs"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "generated_artifacts" 
      ADD CONSTRAINT "FK_generated_artifacts_spec" 
      FOREIGN KEY ("spec_id") REFERENCES "api_specs"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "workflow_definitions" 
      ADD CONSTRAINT "FK_workflow_definitions_project" 
      FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "workflow_executions" 
      ADD CONSTRAINT "FK_workflow_executions_workflow" 
      FOREIGN KEY ("workflow_id") REFERENCES "workflow_definitions"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "shared_specs" 
      ADD CONSTRAINT "FK_shared_specs_spec" 
      FOREIGN KEY ("spec_id") REFERENCES "api_specs"("id") ON DELETE CASCADE
    `);

    // Create indexes for performance
    await queryRunner.query(`CREATE INDEX "IDX_organizations_slug" ON "organizations" ("slug")`);
    await queryRunner.query(`CREATE INDEX "IDX_users_email" ON "users" ("email")`);
    await queryRunner.query(`CREATE INDEX "IDX_users_provider" ON "users" ("provider", "provider_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_organization_members_org" ON "organization_members" ("organization_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_organization_members_user" ON "organization_members" ("user_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_projects_org" ON "projects" ("organization_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_api_specs_project" ON "api_specs" ("project_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_api_specs_status" ON "api_specs" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_api_endpoints_spec" ON "api_endpoints" ("spec_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_api_endpoints_method_path" ON "api_endpoints" ("method", "path")`);
    await queryRunner.query(`CREATE INDEX "IDX_api_models_spec" ON "api_models" ("spec_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_rag_inferences_spec" ON "rag_inferences" ("spec_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_rag_inferences_status" ON "rag_inferences" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_document_chunks_spec" ON "document_chunks" ("spec_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_generated_artifacts_spec" ON "generated_artifacts" ("spec_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_workflow_definitions_project" ON "workflow_definitions" ("project_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_workflow_executions_workflow" ON "workflow_executions" ("workflow_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_workflow_executions_status" ON "workflow_executions" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_shared_specs_token" ON "shared_specs" ("share_token")`);
    await queryRunner.query(`CREATE INDEX "IDX_shared_specs_active" ON "shared_specs" ("is_active")`);
    await queryRunner.query(`CREATE INDEX "IDX_performance_metrics_operation" ON "performance_metrics" ("operation")`);
    await queryRunner.query(`CREATE INDEX "IDX_performance_metrics_created_at" ON "performance_metrics" ("created_at")`);

    // Create vector similarity index for document chunks
    await queryRunner.query(`CREATE INDEX "IDX_document_chunks_embedding" ON "document_chunks" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100)`);

    // Create RLS policies (Row Level Security)
    await queryRunner.query(`ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "api_specs" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "api_endpoints" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "api_models" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "rag_inferences" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "document_chunks" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "generated_artifacts" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "workflow_definitions" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "workflow_executions" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "shared_specs" ENABLE ROW LEVEL SECURITY`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop all tables in reverse order
    await queryRunner.query(`DROP TABLE "performance_metrics"`);
    await queryRunner.query(`DROP TABLE "shared_specs"`);
    await queryRunner.query(`DROP TABLE "workflow_executions"`);
    await queryRunner.query(`DROP TABLE "workflow_definitions"`);
    await queryRunner.query(`DROP TABLE "generated_artifacts"`);
    await queryRunner.query(`DROP TABLE "document_chunks"`);
    await queryRunner.query(`DROP TABLE "rag_inferences"`);
    await queryRunner.query(`DROP TABLE "api_models"`);
    await queryRunner.query(`DROP TABLE "api_endpoints"`);
    await queryRunner.query(`DROP TABLE "api_specs"`);
    await queryRunner.query(`DROP TABLE "projects"`);
    await queryRunner.query(`DROP TABLE "organization_members"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TABLE "organizations"`);
    
    // Drop extensions
    await queryRunner.query(`DROP EXTENSION IF EXISTS vector`);
    await queryRunner.query(`DROP EXTENSION IF EXISTS "uuid-ossp"`);
  }
}
