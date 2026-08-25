---
title: 'Authenticated Deck Editing and Pilot Posting'
type: 'bugfix'
created: '2026-08-23'
status: 'done'
baseline_commit: 'd17a6f0'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Deck editing and all API writes currently share a TL-only permission, leaving authenticated Pilots stuck in Viewing mode and unable to save decks or post builds.

**Approach:** Separate authenticated-member contributions from TL administration across the UI and API. Permit mapped TL and Pilot users to edit/save decks, persist deck quickslots, and post new builds, while preserving TL-only destructive and administrative actions.

## Boundaries & Constraints

**Always:** Treat authenticated application members as users with a mapped `TL` or `Pilot` role. Keep deck deletion and build deletion TL-only in both UI and API. Keep existing build editing/reparsing, map configuration, overview selection, and backup operations TL-only. Preserve the responsive Firefox mode control and legacy mech/tonnage behavior already covered by regression tests.

**Ask First:** Any requirement to let Pilots edit existing repository builds, modify map configuration, manage shared overview selection, or run administrative backups.

**Never:** Implement authorization only in the frontend; broaden every existing `write` endpoint to Pilots; infer permissions from display text; remove server-side TL checks from destructive actions.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Pilot edits deck | Authenticated mapped Pilot toggles Viewing and changes a deck | Editing mode is enabled; deck and quickslot writes succeed | Existing validation/conflict errors remain visible |
| Pilot posts build | Authenticated mapped Pilot submits Add Build | New build is created and attributed to the Pilot | Existing schema/duplicate-link errors remain unchanged |
| Pilot attempts administration | Pilot calls build/deck delete, build update, or map/admin endpoint | Request remains forbidden and restricted controls stay hidden/disabled | API returns `403 FORBIDDEN` |
| TL uses application | Authenticated mapped TL edits and deletes | Existing contribution and administration behavior remains available | Existing error handling remains unchanged |
| Unauthenticated request | Missing or invalid signed session in production | No contribution or administration access | API returns existing auth error response |

</frozen-after-approval>

## Code Map

- `api/src/middleware/authGuard.ts` -- Central role authorization; must distinguish member contribution from TL administration.
- `api/src/functions/matchNights/upsertDeck.ts` -- Deck create/update contribution endpoint.
- `api/src/functions/matchNights/upsertQuickslots.ts` -- Deck workflow persistence required after deck creation/assignment.
- `api/src/functions/mechs/create.ts` -- Add Build posting endpoint.
- `app/src/components/DeckBoard.tsx` -- Deck mode gate, TL-only deletion, and TL-only maproom controls.
- `tests/e2e/deck-board-regressions.spec.ts` -- Firefox Pilot mode and legacy-row regression coverage.
- `api/tests/unit/middleware/authGuard.test.ts` -- Capability-level authorization coverage.
- `api/tests/unit/functions/matchNights/upsertDeck.test.ts` -- Pilot deck-write regression.
- `api/tests/unit/functions/mechs/create.test.ts` -- Pilot build-posting regression.

## Tasks & Acceptance

**Execution:**
- [x] `api/src/middleware/authGuard.ts` -- add a member contribution access level while preserving TL-only `write` behavior.
- [x] Deck, quickslot, and build-create handlers -- request member contribution access; leave all other mutation handlers unchanged.
- [x] `app/src/components/DeckBoard.tsx` -- make shared view mode available to authenticated members; keep delete and maproom administration tied to TL permission.
- [x] API unit tests -- prove Pilot contribution succeeds and Pilot administration remains forbidden.
- [x] `tests/e2e/deck-board-regressions.spec.ts` -- prove a Pilot can toggle into Editing in Firefox while retaining viewport, stale UUID, and tonnage checks.

**Acceptance Criteria:**
- Given an authenticated Pilot on the deck board, when they click Viewing, then the control changes to Editing and deck inputs become interactive.
- Given a Pilot deck autosave, when the API receives deck and quickslot writes, then both authorize the mapped Pilot.
- Given a Pilot using Add Build, when a valid build is submitted, then the API creates it.
- Given a Pilot, when they attempt a build/deck delete or another TL administration endpoint, then authorization remains denied.
- Given a TL, when they use existing edit, post, and delete workflows, then behavior remains unchanged.

## Spec Change Log

## Design Notes

Keep the existing `write` access meaning as TL administration and add a narrower member contribution capability. This minimizes accidental privilege expansion because unchanged handlers remain TL-only by default.

## Verification

**Commands:**
- `cd api && npm test -- --run tests/unit/middleware/authGuard.test.ts tests/unit/functions/matchNights/upsertDeck.test.ts tests/unit/functions/mechs/create.test.ts` -- focused authorization tests pass.
- `npx playwright test tests/e2e/deck-board-regressions.spec.ts --project=firefox` -- Pilot edit-mode and Firefox regressions pass.
- `cd api && npm run build` -- API TypeScript build passes.
- `cd app && npm run build` -- frontend production build passes.
- `git diff --check` -- no whitespace errors.

## Suggested Review Order

**Capability Boundary**

- Defines member contributions separately while preserving TL-only administrative writes.
	[`authGuard.ts:14`](../../api/src/middleware/authGuard.ts#L14)

- Applies contribution access only to deck persistence.
	[`upsertDeck.ts:15`](../../api/src/functions/matchNights/upsertDeck.ts#L15)

- Allows member quickslot persistence required by deck workflows.
	[`upsertQuickslots.ts:15`](../../api/src/functions/matchNights/upsertQuickslots.ts#L15)

- Allows Pilots to post new builds without granting existing-build administration.
	[`create.ts:15`](../../api/src/functions/mechs/create.ts#L15)

**Deck UI**

- Separates contribution mode from TL-only deletion capability.
	[`DeckBoard.tsx:703`](../../app/src/components/DeckBoard.tsx#L703)

- Keeps quickslot mutations inert while the shared mode is Viewing.
	[`DeckBoard.tsx:1411`](../../app/src/components/DeckBoard.tsx#L1411)

- Disables quickslot selection and dragging until Editing is active.
	[`DeckBoard.tsx:2159`](../../app/src/components/DeckBoard.tsx#L2159)

**Regression Coverage**

- Exercises Pilot mode, real deck and quickslot writes, Firefox layout, and legacy rows.
	[`deck-board-regressions.spec.ts:153`](../../tests/e2e/deck-board-regressions.spec.ts#L153)

- Proves Pilot deck upserts retain submitter attribution.
	[`upsertDeck.test.ts:47`](../../api/tests/unit/functions/matchNights/upsertDeck.test.ts#L47)

- Proves Pilot quickslot persistence is authorized.
	[`upsertQuickslots.test.ts:14`](../../api/tests/unit/functions/matchNights/upsertQuickslots.test.ts#L14)

- Proves Pilot build posting retains submitter attribution.
	[`create.test.ts:100`](../../api/tests/unit/functions/mechs/create.test.ts#L100)
