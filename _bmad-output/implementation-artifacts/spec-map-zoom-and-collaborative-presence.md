---
title: 'Map Zoom and Collaborative Presence'
type: 'feature'
created: '2026-08-14'
status: 'done'
baseline_commit: 'b60711ec5c641a3d30bbeb1cc134e1dcd13642ab'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The map opens too large for the desired workflow, and teammates cannot tell who else is viewing the shared sheet, whether they are active, or which area currently has their attention.

**Approach:** Set map zoom and reset zoom to `0.6`. Add authenticated, team-scoped collaborative presence using the existing Azure Functions and Cosmos stack, rendered as compact Discord avatars in every top navbar with active/idle state, current view, and a privacy-safe named click focus.

## Boundaries & Constraints

**Always:** Preserve existing skill-tree edits; keep all layouts width-safe at 320px; derive user ID, username, role, and avatar from the signed Discord session; allow both TL and Pilot presence; scope reads and writes by team; use explicit `data-presence-focus` labels; treat server-side `expiresAt` filtering as authoritative; degrade silently when presence requests fail so core editing remains usable.

**Ask First:** Adding a realtime service or new Cosmos container; changing presence timing beyond the planned 20-second heartbeat, 10-second list refresh, 60-second idle threshold, and 90-second logical expiry; exposing additional user activity details.

**Never:** Capture input values, arbitrary element text, pointer coordinates, or keystrokes; trust client-supplied identity/avatar; make presence a prerequisite for loading or editing; depend on Cosmos TTL being enabled; introduce horizontal viewport scrolling.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Active viewer | Authenticated user on a main route | Avatar appears with active state, current view, and latest explicit focus label | N/A |
| Idle/hidden viewer | No interaction for 60 seconds or document hidden | Viewer remains visible as idle until logical expiry | Send best-effort idle heartbeat; ignore network failure |
| Expired viewer | Heartbeat older than 90 seconds | Viewer is omitted from team presence results | Repository filters by server time even without Cosmos TTL |
| Presence unavailable | API/network/Cosmos failure | Main view and controls continue normally; stale presence is cleared | No blocking alert or retry storm |
| Unlabelled/private click | Click lacks `data-presence-focus` or occurs in form content | Existing named focus remains unchanged | Do not inspect or transmit text/value/coordinates |

</frozen-after-approval>

## Code Map

- `app/src/components/DeckBoard.tsx` -- owns map zoom state/reset and one navbar insertion point.
- `app/src/App.tsx` -- authenticated route owner and single presence lifecycle boundary.
- `app/src/components/PresenceWidget.tsx` -- new compact avatar/status display shared by all navbars.
- `app/src/hooks/usePresence.tsx` -- new heartbeat, polling, idle/visibility, route, and labelled-focus state.
- `app/src/api/client.ts`, `app/src/types/contracts.ts` -- typed presence API client and frontend contract.
- `api/src/types/contracts.ts` -- Zod input/document/output schemas and inferred types.
- `api/src/middleware/authGuard.ts` -- trusted session identity/avatar context.
- `api/src/db/repositories/presenceRepository.ts` -- team-partitioned upsert/list and authoritative expiry filtering in the existing Decks container.
- `api/src/functions/presence/` and `api/src/index.ts` -- authenticated GET and PUT endpoints plus registration.
- `tests/e2e/responsive-overview.spec.ts`, `api/tests/unit/` -- browser behavior, privacy, authorization, expiry, and contract coverage.

## Tasks & Acceptance

**Execution:**
- [x] `app/src/components/DeckBoard.tsx` -- change initial and reset map zoom from `0.8` to `0.6` and retain the existing slider minimum.
- [x] `api/src/types/contracts.ts`, `app/src/types/contracts.ts` -- define bounded presence update and response contracts for view, route, status, and optional named focus.
- [x] `api/src/middleware/authGuard.ts`, `api/src/db/repositories/presenceRepository.ts` -- expose trusted avatar metadata and persist `presence` documents using `comp: presence:<teamId>`, deterministic per-user IDs, logical expiry, and optional TTL cleanup.
- [x] `api/src/functions/presence/`, `api/src/index.ts` -- add Pilot/TL-readable `GET /api/presence` and `PUT /api/presence/me`; ignore any client identity fields.
- [x] `app/src/api/client.ts`, `app/src/hooks/usePresence.tsx`, `app/src/App.tsx` -- add non-blocking polling/heartbeat lifecycle, route tracking, idle/visibility handling, explicit labelled click capture, and cleanup.
- [x] `app/src/components/PresenceWidget.tsx`, `app/src/components/{DeckBoard,RepositoryView,OverviewView}.tsx` -- render compact Discord avatars in each sticky navbar with active/idle indicator and tooltip details; label safe high-level controls/regions for focus reporting.
- [x] `api/tests/unit/`, `tests/e2e/responsive-overview.spec.ts` -- cover server-owned identity, Pilot access, team isolation, expiry, active/idle/view/focus display, failed presence API degradation, and 320px overflow safety.

**Acceptance Criteria:**
- Given a map is opened or reset, when its viewer is rendered, then zoom is `0.6`.
- Given two authenticated teammates heartbeat within the expiry window, when either navbar refreshes, then both avatars appear and expose active/idle, current view, and latest safe named focus.
- Given a user navigates among Drop Decks, Repository, and Overview or clicks a labelled high-level area, when the next heartbeat completes, then teammates receive the updated view/focus without receiving arbitrary text, values, coordinates, or keystrokes.
- Given presence is unavailable or stale, when a user loads or edits any view, then the core workflow remains functional and expired viewers disappear.
- Given any supported viewport from 320px upward, when presence avatars render in the sticky navbar, then controls remain usable with no horizontal document overflow.

## Spec Change Log

- Review completed 2026-08-14: hardened production team scope, malformed-record filtering, request parsing, query privacy, heartbeat coalescing, idle/input/page-exit handling, and direct zoom/privacy coverage. No intent or specification changes were required.

## Design Notes

Use polling because the repository has no SignalR, WebSocket, SSE, SWR, or React Query infrastructure. Store presence in the existing Decks container using its `comp` convention; `expiresAt` determines visibility, while an item `ttl` may be written only as opportunistic cleanup. Render a bounded avatar group with overflow count on narrow screens. Discord avatar URLs are derived from the trusted user ID/avatar hash, with initials fallback.

## Verification

**Commands:**
- `npm --prefix api test` -- expected: all API contract, repository, auth, and handler tests pass.
- `npm --prefix api run build` -- expected: TypeScript build succeeds.
- `npm --prefix app run build` -- expected: TypeScript and Vite build succeed.
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:5175 npx playwright test tests/e2e/responsive-overview.spec.ts --reporter=line` -- expected: presence, sticky navbar, and responsive tests pass.
- `git diff --check` -- expected: no whitespace errors.

## Suggested Review Order

**Lifecycle**

- App-level ownership keeps one presence lifecycle alive across route changes.
	[`App.tsx:84`](../../../app/src/App.tsx#L84)

- Polling, heartbeat coalescing, idle detection, and privacy-safe focus live together.
	[`usePresence.tsx:16`](../../../app/src/hooks/usePresence.tsx#L16)

**Trust And Storage**

- Handlers authenticate first and pin production presence to the configured team.
	[`index.ts:7`](../../../api/src/functions/presence/index.ts#L7)

- Deterministic documents use logical expiry and reject malformed persisted records.
	[`presenceRepository.ts:12`](../../../api/src/db/repositories/presenceRepository.ts#L12)

- Bounded schemas constrain every client-controlled presence field.
	[`contracts.ts:312`](../../../api/src/types/contracts.ts#L312)

**Interface**

- Responsive avatar grouping conveys active, idle, view, role, and named focus.
	[`PresenceWidget.tsx:23`](../../../app/src/components/PresenceWidget.tsx#L23)

- Each sticky navbar mounts the same bounded presence widget.
	[`DeckBoard.tsx:1737`](../../../app/src/components/DeckBoard.tsx#L1737)

- Maproom initial and reset zoom now share the `0.6` default.
	[`DeckBoard.tsx:707`](../../../app/src/components/DeckBoard.tsx#L707)

**Verification**

- Browser coverage proves status display, zoom, query privacy, and responsive safety.
	[`responsive-overview.spec.ts:219`](../../../tests/e2e/responsive-overview.spec.ts#L219)

- Repository tests prove trusted identity, expiry, and malformed-row omission.
	[`presenceRepository.test.ts:28`](../../../api/tests/unit/db/repositories/presenceRepository.test.ts#L28)