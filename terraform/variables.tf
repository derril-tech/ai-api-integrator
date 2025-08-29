variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "project_name" {
  description = "Project name"
  type        = string
  default     = "ai-api-integrator"
}

variable "postgres_version" {
  description = "PostgreSQL version"
  type        = string
  default     = "16"
}

variable "redis_version" {
  description = "Redis version"
  type        = string
  default     = "7-alpine"
}

variable "nats_version" {
  description = "NATS version"
  type        = string
  default     = "2.10-alpine"
}
