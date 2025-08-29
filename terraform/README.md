# Infrastructure Setup

This directory contains Terraform configurations for provisioning the AI API Integrator infrastructure.

## Local Development Setup

For local development, we recommend using Docker Compose instead of Terraform for simplicity:

```bash
cd ..
docker-compose up -d
```

## Services Provisioned

- **PostgreSQL 16** with pgvector extension for document chunks and embeddings
- **Redis 7** for caching, queues, and job management
- **NATS 2.10** with JetStream for event-driven messaging
- **MinIO** S3-compatible object storage for uploads, artifacts, and exports

## Ports

- PostgreSQL: 5432
- Redis: 6379
- NATS: 4222 (client), 8222 (monitoring)
- MinIO: 9000 (API), 9001 (console)
- PgAdmin: 5050 (optional database admin)

## Environment Variables

Copy the example environment file and configure your applications:

```bash
cp config/env.example .env
```

## Terraform Usage (Production)

For production deployments:

```bash
terraform init
terraform plan
terraform apply
```

## Database Setup

After starting PostgreSQL, enable the pgvector extension:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

## MinIO Setup

Access the MinIO console at http://localhost:9001 with:
- Username: minioadmin
- Password: minioadmin

Create the required buckets:
- uploads
- artifacts
- exports
