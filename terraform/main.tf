terraform {
  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 3.0.1"
    }
    postgresql = {
      source  = "cyrilgdn/postgresql"
      version = "~> 1.21"
    }
  }
}

# Docker provider for local development
provider "docker" {
  host = "unix:///var/run/docker.sock"
}

# PostgreSQL provider
provider "postgresql" {
  host     = "localhost"
  port     = 5432
  username = "postgres"
  password = "postgres"
  sslmode  = "disable"
}

# Network for services
resource "docker_network" "ai_api_network" {
  name = "ai-api-network"
}

# PostgreSQL with pgvector
resource "docker_container" "postgres" {
  name  = "ai-api-postgres"
  image = "pgvector/pgvector:pg16"

  networks_advanced {
    name = docker_network.ai_api_network.name
  }

  ports {
    internal = 5432
    external = 5432
  }

  env = [
    "POSTGRES_DB=ai_api_integrator",
    "POSTGRES_USER=postgres",
    "POSTGRES_PASSWORD=postgres"
  ]

  volumes {
    container_path = "/var/lib/postgresql/data"
    host_path      = "./data/postgres"
  }

  restart = "unless-stopped"
}

# Redis
resource "docker_container" "redis" {
  name  = "ai-api-redis"
  image = "redis:7-alpine"

  networks_advanced {
    name = docker_network.ai_api_network.name
  }

  ports {
    internal = 6379
    external = 6379
  }

  restart = "unless-stopped"
}

# NATS
resource "docker_container" "nats" {
  name  = "ai-api-nats"
  image = "nats:2.10-alpine"

  networks_advanced {
    name = docker_network.ai_api_network.name
  }

  ports {
    internal = 4222
    external = 4222
  }

  ports {
    internal = 8222
    external = 8222
  }

  command = ["-js"]

  restart = "unless-stopped"
}

# MinIO S3-compatible storage
resource "docker_container" "minio" {
  name  = "ai-api-minio"
  image = "minio/minio:latest"

  networks_advanced {
    name = docker_network.ai_api_network.name
  }

  ports {
    internal = 9000
    external = 9000
  }

  ports {
    internal = 9001
    external = 9001
  }

  env = [
    "MINIO_ROOT_USER=minioadmin",
    "MINIO_ROOT_PASSWORD=minioadmin"
  ]

  volumes {
    container_path = "/data"
    host_path      = "./data/minio"
  }

  command = ["server", "/data", "--console-address", ":9001"]

  restart = "unless-stopped"
}

# Create MinIO buckets
resource "null_resource" "create_buckets" {
  depends_on = [docker_container.minio]

  provisioner "local-exec" {
    command = <<-EOT
      sleep 10
      docker run --rm --network ai-api-network minio/mc:latest alias set local http://ai-api-minio:9000 minioadmin minioadmin
      docker run --rm --network ai-api-network minio/mc:latest mb local/uploads
      docker run --rm --network ai-api-network minio/mc:latest mb local/artifacts
      docker run --rm --network ai-api-network minio/mc:latest mb local/exports
    EOT
  }
}
