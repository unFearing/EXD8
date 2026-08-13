---
title: 'Enforce frontend authentication gate'
type: 'bugfix'
created: '2026-08-12'
status: 'done'
baseline_commit: '7039cd8d2dd7bbb121672c2b39982d3d746bb745'
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Protected application views can mount before the server validates a cached Discord identity, and the development bypass can grant a fake TL identity without a valid signed session. This exposes application UI and starts protected data requests before authentication is established.

**Approach:** Treat `/api/auth/me` as the sole frontend authority for access. Render only the authentication splash while validation is pending or unsuccessful, mount routes only after a successful server response, and remove the frontend runtime identity/header bypass.

## Boundaries & Constraints

**Always:** Keep the signed HTTP-only cookie as the authentication mechanism; preserve the requested protected URL through sign-in; show a useful error for 401, 403, invalid callback state, and network/server failures; prevent protected page components and their data hooks from mounting until authentication succeeds; retain TL/Pilot authorization behavior after authentication.

**Ask First:** Any change to the backend cookie/session contract, Discord OAuth scopes, role mapping, or Azure Static Web Apps route policy.

**Never:** Trust `localStorage` as proof of authentication; grant a fake user or TL role from a Vite environment flag; send client-authored role/user headers; redirect an unauthenticated protected URL to a public replica of the application; remove test coverage by relying on the bypass.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Pending validation | App starts with or without a cached display user | Auth splash/loading state only; no protected route or protected API request | Continue waiting for `/api/auth/me` |
| Valid session | `/api/auth/me` returns a normalized TL or Pilot | Mount the requested route and load its data | N/A |
| Missing session | `/api/auth/me` returns 401 | Sign-in screen only; protected APIs are not requested | Display authentication-required guidance |
| Denied member | `/api/auth/me` returns 403 | Sign-in/error screen only; protected APIs are not requested | Explain that Discord membership/role is not authorized |
| Validation failure | `/api/auth/me` fails or returns invalid data | Sign-in/error screen only; cached identity cannot unlock routes | Display a retryable validation error |

</frozen-after-approval>

## Code Map

- `app/src/App.tsx` -- owns the top-level authentication gate and protected route mounting.
- `app/src/hooks/useDiscordAuth.ts` -- validates the signed session and maps auth outcomes to UI state.
- `app/src/api/client.ts` -- currently emits development-only user and role headers.
- `app/src/components/AuthSplash.tsx` -- renders pending, sign-in, and authentication error states.
- `tests/e2e/responsive-overview.spec.ts` -- existing authenticated API fixture and responsive browser coverage.
- `tests/e2e/auth-gate.spec.ts` -- focused unauthenticated route and request-suppression coverage.

## Tasks & Acceptance

**Execution:**
- [x] `app/src/App.tsx` -- make auth states mutually exclusive and return the splash before protected routes can mount.
- [x] `app/src/hooks/useDiscordAuth.ts` -- stop treating cached user data as authorization or an offline fallback; retain specific failure messages.
- [x] `app/src/api/client.ts` -- remove Vite-controlled fake identity and role headers.
- [x] `app/src/components/AuthSplash.tsx` -- ensure pending validation remains visible even when stale cached display data exists.
- [x] `tests/e2e/auth-gate.spec.ts` -- verify each protected URL is hidden and protected API requests are absent for pending, 401, 403, and failed validation states.

**Acceptance Criteria:**
- Given any protected URL and no server-validated session, when the app starts, then only the authentication experience is visible and no protected page request is issued.
- Given stale `discord_user` data and a rejected or failed `/api/auth/me`, when validation completes, then the cached identity does not unlock the app.
- Given a successful `/api/auth/me`, when validation completes, then the originally requested route mounts with the returned TL or Pilot identity.
- Given any Vite environment configuration, when API requests are made, then the browser does not fabricate user ID or role headers.

## Spec Change Log

## Verification

**Commands:**
- `npm --prefix app run build` -- expected: TypeScript and Vite production build pass.
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:5175 npx playwright test tests/e2e/auth-gate.spec.ts tests/e2e/responsive-overview.spec.ts` -- expected: auth boundary and existing responsive authenticated views pass.
- `git diff --check` -- expected: no whitespace errors.

## Suggested Review Order

**Authentication Boundary**

- Protected routes never mount until the signed session validates.
  [`App.tsx:91`](../../app/src/App.tsx#L91)

- Session validation rejects stale cache, malformed identities, and unauthorized responses.
  [`useDiscordAuth.ts:58`](../../app/src/hooks/useDiscordAuth.ts#L58)

- OAuth return paths are constrained to safe same-origin application URLs.
  [`useDiscordAuth.ts:35`](../../app/src/hooks/useDiscordAuth.ts#L35)

- Retry revalidates the cookie without granting temporary access.
  [`useDiscordAuth.ts:281`](../../app/src/hooks/useDiscordAuth.ts#L281)

- API requests no longer fabricate browser-controlled identities or roles.
  [`client.ts:20`](../../app/src/api/client.ts#L20)

**Responsive Visual System**

- Theme-level square geometry also reaches portal-rendered dialogs.
  [`App.tsx:53`](../../app/src/App.tsx#L53)

- Desktop Deck actions stay single-row while narrow layouts wrap intentionally.
  [`DeckBoard.tsx:1689`](../../app/src/components/DeckBoard.tsx#L1689)

- Overview receives the same square control and surface treatment.
  [`OverviewView.tsx:534`](../../app/src/components/OverviewView.tsx#L534)

- Repository uses the common standalone action-control layout.
  [`RepositoryView.tsx:628`](../../app/src/components/RepositoryView.tsx#L628)

**Shared Selection**

- TL-only endpoint persists Overview selection without replacing quickslots.
  [`updateQuickslotOverviewSelection.ts:7`](../../api/src/functions/matchNights/updateQuickslotOverviewSelection.ts#L7)

**Verification**

- Auth cases cover pending, rejected, callback, retry, and header boundaries.
  [`auth-gate.spec.ts:45`](../../tests/e2e/auth-gate.spec.ts#L45)

- Existing responsive and shared-selection behavior remains covered.
  [`responsive-overview.spec.ts:69`](../../tests/e2e/responsive-overview.spec.ts#L69)
