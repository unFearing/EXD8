---
title: 'Azure Backend Foundation + Cosmos JSON Contracts'
type: 'feature'
created: '2026-06-14'
status: 'done'
baseline_commit: 'dca1ee1676dfe9ad7dec4429ad1235e610147417'
context:
  - '{project-root}/_bmad-output/planning-artifacts/prd.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The project has a local frontend, but the Azure backend layer is not implemented yet and there are no enforceable JSON contracts for CosmosDB documents. Without contracts and backend scaffolding, cloud deployment and reliable data persistence cannot proceed.

**Approach:** Establish a production-oriented Azure Functions TypeScript backend foundation as the HTTP API handler for the React app, define versioned TypeScript-first JSON contracts for Cosmos containers, implement initial API routes that validate and persist contract-shaped documents to CosmosDB, and wire frontend click-driven actions through typed API clients/hooks.

## Boundaries & Constraints

**Always:** Build inside existing folders; keep TypeScript strict; define explicit contracts for season, match night, build, and user documents; validate request payloads before writes; keep partition key strategy aligned with planning docs (`teamId`); use environment-based Azure configuration; keep endpoints compatible with current React app migration path; deploy app + API on Azure Static Web Apps with Azure Functions as the backend tier.

**Ask First:** Final auth enforcement mode for MVP endpoints (mock role gate vs full Discord OAuth on day one); exact container names if changed from architecture draft; whether to include Web PubSub negotiation in this first backend slice.

**Never:** Do not redesign product scope; do not introduce a different database; do not hardcode secrets; do not block this slice on final UI design; do not delete existing local data fixtures yet.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| CREATE_MATCHNIGHT_VALID | Authenticated TL request with valid match night payload and teamId | API writes document to `matchNights` container and returns normalized saved object with id/timestamps | N/A |
| CREATE_MATCHNIGHT_INVALID_SCHEMA | Payload missing required nested fields (for example drops[].slots[].slotId) | API rejects write and returns 400 with machine-readable validation details | Error body includes failing field paths and reason |
| GET_MATCHNIGHT_NOT_FOUND | Valid id/teamId query where document does not exist | API returns 404 and no document body | Error body includes not-found code |
| WRITE_PARTITION_MISMATCH | Payload teamId differs from caller team context | API rejects write | Return 403 or 409 with partition/team mismatch code |

</frozen-after-approval>

## Code Map

- `api/package.json` -- Azure Functions Node/TypeScript runtime, scripts, backend dependencies
- `api/host.json` -- Functions host configuration
- `api/tsconfig.json` -- Compiler settings for backend strict typing
- `api/src/types/contracts.ts` -- Canonical Cosmos document contracts and shared enums
- `api/src/types/api.ts` -- Request/response DTO contracts for HTTP functions
- `api/src/db/cosmos.ts` -- Cosmos client factory, container accessors, partition helpers
- `api/src/db/repositories/matchNightRepository.ts` -- Match night data access with contract-safe mapping
- `api/src/functions/health/get.ts` -- Health endpoint for deployment validation
- `api/src/functions/matchNights/create.ts` -- Create endpoint with payload validation + write
- `api/src/functions/matchNights/getById.ts` -- Read endpoint by id/team partition
- `api/src/middleware/http.ts` -- Common response helpers and error mapping
- `api/src/middleware/authGuard.ts` -- Role/team guard boundary for write/read endpoints
- `app/src/types/contracts.ts` -- Frontend mirror of backend contracts for typed integration
- `app/src/api/client.ts` -- Typed HTTP client wrappers for Azure Functions endpoints
- `app/src/hooks/useMatchNightApi.ts` -- UI-facing hook that translates click actions into API calls
- `staticwebapp.config.json` -- Azure Static Web Apps routing/auth config for app + functions
- `.github/workflows/deploy-azure-swa.yml` -- CI/CD workflow for app/API deployment to Azure

## Tasks & Acceptance

**Execution:**
- [x] `api/package.json` -- add Azure Functions + Cosmos + validation dependencies and scripts -- establishes deployable backend toolchain
- [x] `api/host.json`, `api/tsconfig.json` -- add runtime and compile config -- enables local/run/build parity for Azure
- [x] `api/src/types/contracts.ts` -- define versioned JSON contracts (`SeasonDoc`, `MatchNightDoc`, `BuildDoc`, `UserDoc`) and shared primitives -- creates single source of truth for document shape
- [x] `api/src/types/api.ts` -- define API DTOs and typed error envelope -- standardizes transport contracts
- [x] `api/src/db/cosmos.ts` -- implement Cosmos client and container access by team partition -- centralizes data access configuration
- [x] `api/src/db/repositories/matchNightRepository.ts` -- implement create/get methods with contract-safe serialization -- isolates persistence logic
- [x] `api/src/middleware/http.ts` -- implement typed success/error response utilities -- keeps function handlers consistent
- [x] `api/src/middleware/authGuard.ts` -- implement minimal role/team gate abstraction -- enforces write/read boundary
- [x] `api/src/functions/health/get.ts` -- add health endpoint -- supports Azure smoke checks
- [x] `api/src/functions/matchNights/create.ts` -- implement create route with schema validation and repository write -- delivers first contract-backed write path
- [x] `api/src/functions/matchNights/getById.ts` -- implement read route with partition-safe lookup -- delivers first contract-backed read path
- [x] `app/src/types/contracts.ts` -- expose frontend-compatible contract types -- prepares typed frontend migration without rewiring UI yet
- [x] `app/src/api/client.ts` -- implement typed request wrappers to Azure Functions endpoints -- ensures UI events send stable payloads through one transport layer
- [x] `app/src/hooks/useMatchNightApi.ts` and integrating UI component(s) -- wire click actions to create/read handlers through the API client -- connects local UI interactions to cloud backend flows
- [x] `staticwebapp.config.json` -- configure route fallback, /api routing, and auth-related headers -- enables unified Azure host behavior
- [x] `.github/workflows/deploy-azure-swa.yml` -- add deployment workflow for app and functions -- establishes repeatable cloud release path
- [x] `api/src/functions/matchNights/create.test.ts`, `api/src/functions/matchNights/getById.test.ts`, `api/src/types/contracts.test.ts` -- add unit tests for matrix edge cases -- verifies schema and error handling correctness

**Acceptance Criteria:**
- Given backend dependencies and configs are installed, when running backend build/test scripts, then the API project compiles and tests pass.
- Given a valid TL-scoped create request, when posting a match night payload, then the API persists a contract-valid document in Cosmos and returns 201 with stable identifiers.
- Given an invalid create payload, when posting to create endpoint, then the API returns 400 with field-level validation errors and performs no write.
- Given a valid id/team lookup for a missing document, when calling the read endpoint, then the API returns 404 with typed error envelope.
- Given frontend imports shared contracts, when compiling the app, then contract types resolve without runtime dependency on backend-only modules.
- Given a user triggers save/load actions in the UI, when click handlers execute, then requests are sent to Azure Functions through typed client/hook layers and return mapped success/error states.
- Given the main branch receives changes, when CI executes deployment workflow, then app and API deploy to Azure Static Web Apps with backend routes available under /api.

## Spec Change Log

## Design Notes

Contracts are defined in backend first and mirrored to frontend as compatible type aliases to avoid accidental UI/backend drift while the app is still using local fixtures. Repository layer boundaries keep function handlers thin and make Cosmos behavior testable with mocks.

Validation should be schema-driven (for example Zod) at endpoint boundaries; internal code should only operate on validated types. This prevents invalid nested drop-slot structures from reaching Cosmos writes.

## Verification

**Commands:**
- `cd api && npm install` -- expected: dependencies install without peer/runtime conflicts
- `cd api && npm run build` -- expected: TypeScript emits with zero errors
- `cd api && npm test` -- expected: create/read/contract tests pass including invalid payload and not-found cases
- `cd api && npm run start` -- expected: local function host starts and health endpoint responds 200
- `cd app && npm run build` -- expected: frontend compiles with imported contracts
- local UI integration check -- expected: deck save/load actions call API client and show success/error feedback without console-level type/runtime errors

## Suggested Review Order

**Backend contract boundary**

- Contract-first schema blocks invalid writes at API edge.
  [contracts.ts:35](../../api/src/types/contracts.ts#L35)

- DTO envelope adds machine-readable error codes for clients.
  [api.ts:3](../../api/src/types/api.ts#L3)

**Security and request identity**

- Missing or invalid auth headers now fail closed.
  [authGuard.ts:11](../../api/src/middleware/authGuard.ts#L11)

- Create endpoint enforces role/team checks before persistence.
  [create.ts:7](../../api/src/functions/matchNights/create.ts#L7)

- Read endpoint enforces partition/team access symmetry.
  [getById.ts:6](../../api/src/functions/matchNights/getById.ts#L6)

**Persistence and function surface**

- Repository isolates Cosmos writes/reads from handlers.
  [matchNightRepository.ts:4](../../api/src/db/repositories/matchNightRepository.ts#L4)

- Central Cosmos client/container access keeps config consistent.
  [cosmos.ts:11](../../api/src/db/cosmos.ts#L11)

- Health route gives minimal deployment smoke signal.
  [get.ts:4](../../api/src/functions/health/get.ts#L4)

**Frontend API wiring**

- Typed client hardens transport and non-JSON failure handling.
  [client.ts:5](../../app/src/api/client.ts#L5)

- Hook exposes save/load state for click-driven UI flows.
  [useMatchNightApi.ts:5](../../app/src/hooks/useMatchNightApi.ts#L5)

- Deck UI now triggers Save/Load actions through backend API.
  [DeckBoard.tsx:165](../../app/src/components/DeckBoard.tsx#L165)

**Deployment and ops**

- SWA routing keeps API paths out of SPA fallback.
  [staticwebapp.config.json:2](../../staticwebapp.config.json#L2)

- GitHub Action deploys app+api to Azure Static Web Apps.
  [deploy-azure-swa.yml:1](../../.github/workflows/deploy-azure-swa.yml#L1)

**Tests and verification**

- Create endpoint tests include schema and partition mismatch edges.
  [create.test.ts:56](../../api/src/functions/matchNights/create.test.ts#L56)

- Read endpoint tests include auth-context and team mismatch guards.
  [getById.test.ts:11](../../api/src/functions/matchNights/getById.test.ts#L11)

- Contract tests verify valid/invalid payload acceptance.
  [contracts.test.ts:4](../../api/src/types/contracts.test.ts#L4)
