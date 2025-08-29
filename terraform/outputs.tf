output "postgres_host" {
  description = "PostgreSQL host"
  value       = "localhost"
}

output "postgres_port" {
  description = "PostgreSQL port"
  value       = 5432
}

output "redis_host" {
  description = "Redis host"
  value       = "localhost"
}

output "redis_port" {
  description = "Redis port"
  value       = 6379
}

output "nats_host" {
  description = "NATS host"
  value       = "localhost"
}

output "nats_port" {
  description = "NATS port"
  value       = 4222
}

output "minio_host" {
  description = "MinIO host"
  value       = "localhost"
}

output "minio_port" {
  description = "MinIO port"
  value       = 9000
}

output "minio_console_port" {
  description = "MinIO console port"
  value       = 9001
}
