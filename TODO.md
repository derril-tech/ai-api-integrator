# AI API Integrator — TODO Backlog

## PHASE 1 (Foundation):
- [x] Bootstrap monorepo (turbo) with `apps/web` (Next.js) & `services/api` (NestJS).
- [x] Provision Postgres + pgvector, Redis, NATS, S3 buckets via Terraform.
- [x] Auth skeleton (email magic link or OIDC), org/project models, RBAC.
- [x] File upload pipeline (signed URLs), artifact storage shim.
- [x] OpenAPI 3.0/3.1 parser (basic), endpoint/model extraction.
- [x] Postman/GraphQL SDL ingest; Markdown/HTML splitter to chunks.
- [x] RAG gap inference (auth/pagination/rate limits) with provenance & confidence.
- [x] SpecViewer + ModelExplorer UI; "inferred" badges & accept/override.

- [x] Codegen determinism snapshot test harness (golden fixtures).

## PHASE 2:
- [x] NestJS server adapter template (logging, tracing, error mapping).
- [x] TS SDK template: typed client, retries/backoff, error taxonomy, pagination helpers.
- [x] Repo exporter (zip): `/sdk`, `/server`, `/flows`, `/tests`, `/ops`, `/helm`.
- [x] Guardrails: block export until auth+retry+error mapping set.
- [x] Helm chart + Dockerfile presets; README skin with quickstart.
- [x] Golden API suites (Stripe-like/Salesforce-like) green in CI.
- [x] SBOM + license scan for generated repos; dependency CVE check.
- [x] Performance passes (normalize<20s, codegen<15s, export<10s p95).
- [x] Security review; log redaction for likely PII fields.

## PHASE 3
- [x] Python & Go SDK templates.
- [x] AsyncAPI streaming support; webhook signature validators.
- [x] OAuth app provisioning helpers; secrets broker (Vault).
- [x] Live sandbox runner for flows; Temporal cloud toggle.
- [x] Partner share links with read-only spec view.
## Bugs / Known Unknowns
- [x] Non-standard pagination patterns (compound cursors).
- [x] Weird auth combos (HMAC + OAuth).
- [x] Extremely large specs (1k+ endpoints) perf tuning.
