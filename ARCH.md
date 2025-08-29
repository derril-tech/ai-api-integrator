# AI API Integrator — Architecture

## 1) System Overview
A multi-worker architecture that ingests API docs/specs, normalizes them, generates SDKs/servers/flows/tests/monitors, and exports an installable repo. Evidence gaps are filled via RAG with paragraph-level citations.

```
Next.js (BFF)  ──► NestJS API Gateway (/v1)
                      │       └─ RBAC, Problem+JSON, SSE
                      ▼
            NATS Event Bus  ⇄  Workers (FastAPI)
            ├─ spec-worker      (parse/normalize, RAG infer)
            ├─ gen-worker       (SDK/server codegen)
            ├─ flow-worker      (DAG build, retries/idempotency/DLQ)
            ├─ ops-worker       (metrics/monitors/runbooks)
            └─ export-worker    (repo bundling, Helm/Docker, JSON)
                      ▼
  Postgres + pgvector ─ specs/endpoints/models/flows/chunks
  S3/R2               ─ uploads/artifacts/exports
  Redis               ─ jobs/progress/rate-limit sims
  OpenTelemetry + Prometheus + Sentry
```

## 2) Components
- **Frontend (Next.js 14, App Router)**: SpecViewer, ModelExplorer, FlowBuilder, Codegen, Tests, Ops, ExportWizard. Server Actions for signed uploads/exports; SSR for designer.
- **API Gateway (NestJS/Node20)**: REST /v1 with Zod validation, RBAC (Casbin), RLS via project scoping, Idempotency-Key, Request-ID, SSE streams.
- **Workers (Python 3.11 + FastAPI)**:
  - `spec-worker`: OpenAPI/Postman/SDL parsing; Markdown/HTML ingestion; RAG inference (auth, pagination, rate limits) with provenance.
  - `gen-worker`: SDK templates (TS, PY preview); server adapter (NestJS/FastAPI); typed errors, retries, pagination helpers.
  - `flow-worker`: DAG schema → runtime (Temporal/BullMQ/Celery pluggable); idempotency keys, retry/backoff with jitter, DLQ, compensation hooks.
  - `ops-worker`: OTel tracing, Prom metrics, Grafana JSON; runbook scaffolds.
  - `export-worker`: Repo composer (sdk/, server/, flows/, tests/, ops/), README, Dockerfile, Helm chart, JSON bundle.
- **Data Stores**: Postgres 16 (+pgvector for doc chunks), S3/R2 for binaries, Redis for queues and previews.
- **Messaging**: NATS topics (`spec.ingest`, `code.generate`, `flow.build`, `ops.scaffold`, `export.make`), DLQ with backoff.
- **Observability**: OTel traces/metrics/logs, Prom/Grafana dashboards, Sentry errors.
- **Secrets/Security**: Cloud KMS envelopes; signed URLs; SBOM on exports; log redaction for likely PII fields.

## 3) Data Model (high level)
- `projects(org_id, name)`
- `docs(project_id, kind, s3_key)` + `chunks(embedding, meta)`
- `specs(type, normalized, score)`
- `endpoints(method, path, auth, rate_limit, pagination, request, response)`
- `models(schema, example)`
- `flows(dag, schedule, retries, idempotency, dlq)`
- `artifacts(kind, s3_key)` and `exports(kind, s3_key)`
- `reviews(status, comment)`

## 4) Core Flows
### 4.1 Upload & Normalize
1. User uploads OpenAPI/Postman/SDL/MD → `spec.ingest`.
2. Parser builds normalized spec; RAG fills gaps with citations & confidence.
3. Endpoints/models persisted; SpecViewer renders diffs & “inferred” badges.

### 4.2 Code Generation
1. User selects languages/frameworks → `code.generate`.
2. Templates render SDK + server; compile smoke; determinism snapshot.
3. Error taxonomy, retries/backoff, pagination helpers included.

### 4.3 Workflow Build
1. DAG composed (trigger → transform → call → store → notify).
2. Policies enforced: retries + idempotency + DLQ required.
3. Runtime stubs generated (Temporal/BullMQ/Celery selectable).

### 4.4 Tests & Monitors
- Mock server + fixtures; contract tests; Postman export.
- Prom metrics + Grafana JSON; SLO builder for latency/error rate.

### 4.5 Export
- Repo zipper with `/sdk`, `/server`, `/flows`, `/tests`, `/ops`, `/helm`.
- JSON bundle of spec/endpoints/models/flows for automation.

## 5) APIs (selected)
- `POST /docs/upload`, `POST /specs/normalize`
- `POST /codegen/sdk`, `POST /codegen/server`
- `POST /flows`
- `POST /tests/generate`, `POST /ops/monitors`
- `POST /exports/repo`

## 6) Security
- RLS by project; signed URLs; least-privilege S3; short-lived build creds.
- Export guardrails (auth, retry, error mapping must be defined).
- License scan + SBOM; dependency CVE check for exports.

## 7) Scaling & Reliability
- Horizontal workers on queue depth; idempotent tasks with dedupe keys.
- Chunked uploads; streaming parse for large specs (1k+ endpoints).
- Deterministic codegen snapshot cache; artifacts content-addressed.
- DLQ & retry with jitter; compensating cleanups on partial failures.

## 8) Testing Strategy
- Unit: parsers, auth/pagination detectors, retry policies.
- Golden fixtures: Stripe-like/Salesforce-like → deterministic outputs.
- Contract tests: mock server validation; schema drift alarms.
- E2E (Playwright): upload → normalize → codegen → flow run → export.
- Perf: p95 gates for normalize/codegen/export.
