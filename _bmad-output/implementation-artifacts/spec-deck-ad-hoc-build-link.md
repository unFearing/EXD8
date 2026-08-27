---
title: 'Deck Ad-Hoc Build Link Input'
type: 'feature'
created: '2026-08-25'
status: 'done'
baseline_commit: '4365af33819c15b25463eef1e8ded629c6b3bcb3'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Editable deck rows can select repository builds but provide no discoverable place to paste an ad-hoc build link. Ad-hoc builds are common and should be usable without first creating a repository entry.

**Approach:** Make the existing editable Build control accept a pasted or dropped supported build URL. Parse it through the existing build parser and populate that row's mech/build details, export code, and skill code while keeping the compact deck layout unchanged.

## Boundaries & Constraints

**Always:** Reuse `parseMechBuild`; preserve the row's slot, pilots, alternates, and lance; update only the targeted row; retain ordinary free-text Build editing for non-URL input; expose parsing progress and actionable errors; keep the deck width-safe at the existing 870px regression viewport.

**Ask First:** Any backend contract change, new supported link provider, or automatic repository creation.

**Never:** Save an ad-hoc parsed build to the Repository, add another deck-grid column, replace the existing repository build selector, or treat arbitrary pasted text as a URL.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Paste supported link | User pastes a NAV-Alpha or parser-supported build URL into an editable row's Build control | Parse and populate chassis, variant, build label, equipment, source URL, role, preferred export code, skill code, and tonnage in that row | N/A |
| Drop supported link | User drops URL text onto an editable row's Build control | Same behavior as paste | N/A |
| Ordinary build text | User types or pastes text that is not an absolute HTTP(S) URL | Preserve existing free-text/autocomplete behavior; do not call parser | N/A |
| Parser failure | Parser rejects or cannot fetch the URL | Preserve the previous row values and show an actionable deck error | Only the targeted Build control leaves its loading state |
| Missing parsed code | Parsed result has no usable export or skill code | Populate available fields and leave the corresponding existing manual code input available | Parser warnings are non-fatal |

</frozen-after-approval>

## Code Map

- `app/src/components/DeckBoard.tsx` -- owns editable deck rows, build selection, row updates, code display, and deck errors.
- `app/src/api/client.ts` -- provides the existing `parseMechBuild(url)` client contract.
- `app/src/types/contracts.ts` -- defines `ParsedMechBuild` and `CreateMechInput` response fields.
- `tests/e2e/deck-board-regressions.spec.ts` -- existing mocked DeckBoard regression surface and viewport-width assertion.

## Tasks & Acceptance

**Execution:**
- [x] `app/src/components/DeckBoard.tsx` -- add URL paste/drop handling and row-scoped parsing state to the existing editable Build control; project parsed fields through the established row update path.
- [x] `tests/e2e/deck-board-regressions.spec.ts` -- mock build parsing and verify successful row population, unchanged neighboring data, parser failure behavior, ordinary text behavior, and width safety.

**Acceptance Criteria:**
- Given an editable deck row, when a supported link is pasted or dropped into Build, then the row visibly enters a parsing state and is populated without creating a repository build.
- Given a parsed ad-hoc build, when deck autosave runs, then its populated row fields are present in the existing deck payload and pilot/lance assignments are unchanged.
- Given view mode or a non-URL value, when the same gesture occurs, then no parsing request is made and existing interaction behavior remains intact.

## Spec Change Log

## Design Notes

URL interception belongs on the existing Build control so no new grid width is consumed. A row-scoped async key prevents one parse from disabling unrelated rows. Parsed `skillTreeCode` should be preferred over the legacy `skillCode` value because `skillCode` may contain the missing sentinel `pending`; export code selection should reuse `getPreferredBuildCode`.

## Verification

**Commands:**
- `cd app && npm run build` -- expected: TypeScript and Vite production build succeeds.
- `npx playwright test tests/e2e/deck-board-regressions.spec.ts` -- expected: ad-hoc link and existing DeckBoard regression cases pass.

## Suggested Review Order

**Interaction Entry Point**

- Existing Build control intercepts only absolute URL paste/drop gestures.
	[`DeckBoard.tsx:124`](../../app/src/components/DeckBoard.tsx#L124)

- Native drag lifecycle and visible parsing progress remain inside the compact cell.
	[`DeckBoard.tsx:263`](../../app/src/components/DeckBoard.tsx#L263)

**Parsed Row Projection**

- Existing parser output updates one ad-hoc row while preserving assignments.
	[`DeckBoard.tsx:1330`](../../app/src/components/DeckBoard.tsx#L1330)

- Row-scoped loading keys allow independent simultaneous parses.
	[`DeckBoard.tsx:2796`](../../app/src/components/DeckBoard.tsx#L2796)

**Regression Coverage**

- Gesture helper exercises paste, dragover, drop, and URI-list payloads.
	[`deck-board-regressions.spec.ts:53`](../../tests/e2e/deck-board-regressions.spec.ts#L53)

- Main flow verifies autosave projection, preserved assignments, and neighboring rows.
	[`deck-board-regressions.spec.ts:318`](../../tests/e2e/deck-board-regressions.spec.ts#L318)

- Boundary cases cover failures, concurrency, free text, and missing codes.
	[`deck-board-regressions.spec.ts:398`](../../tests/e2e/deck-board-regressions.spec.ts#L398)
