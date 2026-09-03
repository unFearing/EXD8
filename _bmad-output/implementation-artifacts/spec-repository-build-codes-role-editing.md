---
title: 'Repository Build Codes and Role Editing'
type: 'bugfix'
created: '2026-09-02'
status: 'done'
baseline_commit: '78fdc5d'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** In Repository Editing mode, Build Codes cannot be updated reliably because the controlled textarea reparses and reformats its value on every keystroke, discarding incomplete `key: value` input while the user is typing. Role is also a free-text field even though the application already exposes a canonical runtime list of mech roles.

**Approach:** Preserve each Build Codes textarea as raw draft text throughout editing and parse it only when saving. Load role options through the existing mech-role configuration endpoint and render Role as a dropdown in Repository Editing mode.

## Boundaries & Constraints

**Always:** Use `getMechRoles()` as the runtime source of role options, consistent with Add Build and Deck views. Preserve arbitrary named build-code keys and the existing `key: value` persistence format. Keep the editor width-safe at mobile and desktop sizes. Retain a build's current role as a selectable value if it is absent from the configured list, so legacy records remain editable.

**Ask First:** Any API contract change, authorization change, replacement of the role configuration source, or decision to reject malformed build-code lines rather than continuing the current ignore-on-save behavior.

**Never:** Hard-code a duplicate role list in RepositoryView, alter unrelated MechSelector work, change view-mode code rendering, or remove valid custom build-code pairs.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Build-code typing | User types `asym left` before adding `: CODE` | Raw partial text remains visible and editable; completed lines survive until save | Malformed or incomplete lines are ignored when saving, matching current parser behavior |
| Multiple codes | Existing and new `key: value` lines | Every valid non-`export` pair is included in the update payload | Blank keys, blank values, and `export` remain excluded |
| Configured role | Runtime endpoint returns canonical roles | Role control is a dropdown populated from those roles | Existing current role is included if not returned by configuration |
| Role load failure | Role request rejects | Repository remains usable and current role remains selectable | Show no new blocking page error for an auxiliary option-list failure |

</frozen-after-approval>

## Code Map

- `app/src/components/RepositoryView.tsx` -- owns Repo card editing state, Build Codes textarea, Role control, and save payload construction.
- `app/src/api/client.ts` -- provides the existing `getMechRoles()` runtime configuration loader.
- `tests/e2e/responsive-overview.spec.ts` -- mocks Repository APIs and covers full build editing and update payloads.

## Tasks & Acceptance

**Execution:**
- [x] `app/src/components/RepositoryView.tsx` -- store raw Build Codes drafts by build ID, parse them at save time, load canonical role options, and replace the edit-mode Role text field with a MUI dropdown.
- [x] `tests/e2e/responsive-overview.spec.ts` -- return representative configured roles and extend Repository editing coverage for partial Build Codes typing, persisted named code pairs, dropdown role selection, and the outgoing save payload.

**Acceptance Criteria:**
- Given a TL in Repository Editing mode, when they type or replace a Build Codes line, then intermediate text does not disappear and valid completed pairs are sent when Save Build is selected.
- Given configured mech roles, when a TL edits a repository build, then Role is a dropdown and selecting an option updates the saved role.
- Given an existing role missing from current configuration, when the editor opens, then that role remains displayed and selectable.
- Given view mode or a non-TL user, when Repository renders, then existing read-only behavior and authorization remain unchanged.

## Spec Change Log

## Design Notes

Use separate raw UI state for Build Codes because `Record<string, string>` cannot represent incomplete user input. Conversion to the persisted record belongs at the save boundary, where normalization and malformed-line filtering already occur.

## Verification

**Commands:**
- `npx playwright test tests/e2e/responsive-overview.spec.ts --grep "Repository prioritizes suggested builds and supports complete build editing"` from the repository root -- expected: focused Repository editing regression passes.
- `cd app && npm run build` -- expected: TypeScript and Vite production build succeeds.

## Suggested Review Order

**Build Codes editing**

- Raw textarea state preserves incomplete input until the save boundary.
	[RepositoryView.tsx:1143](../../app/src/components/RepositoryView.tsx#L1143)

- Save-time parsing converts completed lines to the persisted record.
	[RepositoryView.tsx:310](../../app/src/components/RepositoryView.tsx#L310)

**Role dropdown**

- Existing runtime configuration supplies canonical role options.
	[RepositoryView.tsx:163](../../app/src/components/RepositoryView.tsx#L163)

- Current legacy roles join configured options in the edit control.
	[RepositoryView.tsx:911](../../app/src/components/RepositoryView.tsx#L911)

- Responsive MUI select replaces unrestricted role text entry.
	[RepositoryView.tsx:973](../../app/src/components/RepositoryView.tsx#L973)

**Regression coverage**

- Focused test verifies partial typing, role selection, and save payload.
	[responsive-overview.spec.ts:397](../../tests/e2e/responsive-overview.spec.ts#L397)
