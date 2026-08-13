---
title: 'Responsive mobile layout and shared Overview selection'
type: 'feature'
created: '2026-08-12'
status: 'in-progress'
baseline_commit: 'eeee5de976d48d4dea6a90e1bd526df70a111303'
context:
  - '_bmad-output/planning-artifacts/architecture.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The application is difficult to use on narrow screens, and Overview deck checkmarks exist only in component state, so each visitor sees an independent, temporary selection rather than the TL-curated match-night view.

**Approach:** Make the three authenticated views and dialogs responsive without page-level horizontal overflow. Store the TL's Overview deck selection alongside the existing `quickslots-default` server document, while offering an explicit browser-local override for users who want a personal all-decks, map, or deck subset.

## Boundaries & Constraints

**Always:** Reuse the existing Quickslot Cosmos document and authorization boundary. Shared selection writes require TL; Pilot remains read-only. Default to “TL selection” mode. Keep any unavoidable wide matrix scrolling inside its own labeled container, never on the page. Preserve desktop density and all existing deck/repository workflows.

**Ask First:** Any database migration that cannot remain backward-compatible; replacing the current navigation model; hiding existing fields or actions on mobile rather than adapting them.

**Never:** Store the shared selection only in `localStorage`; let Pilot write shared state; overwrite quickslot assignments while saving Overview selection; add a second server-side source of truth; introduce viewport-width font scaling.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|---------------------------|----------------|
| Shared default | Existing quickslot doc has selected deck IDs | All users initially see the TL-curated subset | Ignore deleted/unknown deck IDs |
| Legacy document | Selection field absent | Derive defaults from assigned quickslots and present them without requiring migration | TL's first change creates the field |
| TL update | TL checks/unchecks a deck in shared mode | Dedicated API update persists only selection IDs; other clients receive it on reload | Optimistically update, rollback and alert on failure |
| Pilot shared mode | Pilot views TL selection | Selection controls are read-only | Offer “Use my filters” toggle |
| Local override | User enables personal filters | Selection/map/all controls affect only that browser and may persist locally by user/team | Disabling override immediately restores server selection |
| Narrow viewport | 320–430px screen | Navigation, filters, cards, dialogs, and actions fit without page horizontal scrolling | Wide assignment matrix scrolls only within its container |

</frozen-after-approval>

## Code Map

- `app/src/components/OverviewView.tsx` -- shared/local selection state, controls, optimistic save, responsive matrix.
- `app/src/components/DeckBoard.tsx` -- dense editor and duplicated header requiring narrow-screen adaptation.
- `app/src/components/RepositoryView.tsx` -- filters, build rows, dialogs, and duplicated header.
- `app/src/App.tsx` -- shared application shell and view-mode ownership.
- `app/src/api/client.ts` -- typed selection update request.
- `app/src/types/contracts.ts` -- optional shared selection field.
- `api/src/types/contracts.ts` -- backward-compatible document and update schemas.
- `api/src/functions/matchNights/getQuickslots.ts` -- legacy default response.
- `api/src/functions/matchNights/upsertQuickslots.ts` -- preserve selection during slot saves.
- `api/src/db/repositories/matchNightRepository.ts` -- patch selection without replacing slots.
- `tests/e2e/` -- mobile viewport and shared/local behavior coverage.

## Tasks & Acceptance

**Execution:**
- [x] `api/src/types/contracts.ts`, `app/src/types/contracts.ts` -- add optional `overviewSelectedDeckIds` and a selection-only input contract.
- [x] `api/src/db/repositories/matchNightRepository.ts` -- preserve selection during quickslot upserts and add a selection-only update using the existing document.
- [x] `api/src/functions/matchNights/` -- expose a TL-only selection update route and add handler/repository tests for legacy docs, authorization, preservation, and invalid IDs.
- [x] `app/src/api/client.ts` -- add the typed selection update call.
- [x] `app/src/components/OverviewView.tsx` -- separate server selection from effective selection; add “Follow TL selection” / “Use my filters”; provide all, clear, and per-map local controls; save TL shared edits with rollback feedback.
- [x] `app/src/components/` and `app/src/App.tsx` -- extract/adapt shared navigation and replace fixed-width desktop assumptions with responsive stacks, grids, compact controls, and contained scrolling.
- [x] `tests/e2e/` -- cover 320px, 390px, 768px, and desktop widths plus TL shared persistence and Pilot/local override behavior.

**Acceptance Criteria:**
- Given a TL changes shared deck checkmarks, when Overview is reopened by another user, then the same valid deck subset is selected.
- Given a Pilot follows TL selection, when interacting with shared checkboxes, then no shared mutation is possible.
- Given any user enables personal filters, when selecting all decks or specific maps/decks, then only local effective selection changes; turning the toggle off restores TL selection.
- Given an existing quickslot assignment is saved, when Overview selection already exists, then that selection remains unchanged.
- Given each supported viewport, when navigating Deck Board, Repository, Overview, auth, and dialogs, then no content forces document-level horizontal scrolling and primary actions remain reachable.

## Spec Change Log

## Design Notes

Keep the wide pilot assignment matrix as a deliberate contained scroller with sticky identity columns. Consolidate the repeated AppBars into a responsive shell: desktop may retain tabs and inline actions; mobile should use compact icon actions and a menu/segmented view switch without changing routes. Local override storage should be namespaced by authenticated user and team, and must never be interpreted as server truth.

## Verification

**Commands:**
- `npm --prefix api test -- --run` -- all API tests pass.
- `npm --prefix api run build` -- API contracts and handlers compile.
- `npm --prefix app run build` -- frontend compiles and bundles.
- `npx playwright test` -- shared-selection and responsive viewport scenarios pass.
- `git diff --check` -- no whitespace errors.

**Manual checks:**
- Inspect at 320x568, 390x844, 768x1024, and desktop; confirm the document never scrolls horizontally and matrix scrolling stays contained.
