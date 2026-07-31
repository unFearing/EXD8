---
title: 'Repository Named Build Code Variants'
type: 'feature'
created: '2026-07-31'
status: 'in-progress'
baseline_commit: '34ea819bc97f346ce55024bba0694ee5222da3fd'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Repository builds currently expose duplicate `default` and `export` code values, and the Add Build parser preserves `export` as a separate concept. Builds also lack a short user-defined name, while viewing multiple named code variants is harder to copy than necessary.

**Approach:** Treat `default` as the parser-generated code key, let users add arbitrary named code pairs such as `asym right` and `asym left`, and remove the legacy `export` key at API write boundaries and from existing Cosmos documents. Add an optional short build name, display it in Repository cards, show code values as plain selectable text in View mode, and keep key/value editing in Edit mode.

## Boundaries & Constraints

**Always:** Preserve the existing `Record<string, string>` build-code contract so arbitrary user keys remain supported. Keep the optional name short and backward-compatible for documents that do not have it. Preserve all user-provided non-`export` code pairs. Keep layouts width-safe on mobile and desktop.

**Ask First:** Any schema-version bump, destructive replacement of a non-duplicate legacy value, or change to build authorization.

**Never:** Retain or create a `buildCodes.export` key; collapse distinct user-entered code values; repurpose the imported long description as the short name; modify unrelated Overview work.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Parsed build | NAV-Alpha parser extracts a code | Draft contains `buildCodes.default` and no `export` | Existing parse warning remains useful when no code is found |
| Named variants | `default`, `asym right`, and `asym left` pairs | All three keys and distinct values save and remain editable | Ignore malformed blank key/value lines in text input |
| Repository view | Build has one or several code pairs | Each raw code is selectable and easy to copy; labels do not prefix the copied code | Empty state is shown when no code exists |
| Legacy cleanup | Cosmos document contains `export` | Migration removes `export`, retaining `default` and all custom pairs | Dry-run by default; writes only with `--apply` |
| Optional name | Name is blank or omitted | Build remains valid and displays its normal variant title | Trim whitespace before persistence |

</frozen-after-approval>

## Code Map

- `api/src/functions/mechs/parseBuild.ts` -- creates parser-generated build codes and extraction warnings.
- `api/src/db/repositories/mechRepository.ts` -- creates/updates Cosmos mech documents and enforces persisted normalization.
- `api/src/types/contracts.ts` -- API validation and inferred mech input/document types.
- `api/src/scripts/removeExportBuildCodes.ts` -- one-time dry-run/apply cleanup for existing Cosmos documents.
- `app/src/components/AddBuildDialog.tsx` -- parsed/manual build form and arbitrary key/value code input.
- `app/src/components/RepositoryView.tsx` -- Repository card title, view-mode copy surface, and edit-mode fields.
- `app/src/types/contracts.ts` -- frontend mech document/input types.

## Tasks & Acceptance

**Execution:**
- [ ] `api/src/types/contracts.ts`, `app/src/types/contracts.ts` -- add an optional trimmed short build name without breaking legacy documents.
- [ ] `api/src/functions/mechs/parseBuild.ts`, `api/src/db/repositories/mechRepository.ts` -- emit `default` from parsing and normalize all writes to remove `export` while preserving custom pairs.
- [ ] `app/src/components/AddBuildDialog.tsx` -- remove the dedicated export field/merge flow, add optional name, and submit parsed/custom key-value codes directly.
- [ ] `app/src/components/RepositoryView.tsx` -- display/edit the short name and render labels separately from selectable raw code values in View mode.
- [ ] `api/src/scripts/removeExportBuildCodes.ts`, `api/package.json` -- provide and run dry-run/apply database cleanup using existing Cosmos script conventions.
- [ ] Relevant API tests -- cover default parser output and write normalization edge cases.

**Acceptance Criteria:**
- Given a newly parsed or manually saved build, when it is persisted, then `buildCodes` contains no `export` key.
- Given a user adds named code pairs, when the build is saved and reopened in Edit mode, then every valid custom pair can be adjusted.
- Given a user opens Repository View mode, when they select a code, then the raw value can be copied without a `Default:` or other key prefix.
- Given a short build name, when Repository loads the build, then the name is visible with the variant; unnamed legacy builds still render normally.
- Given the cleanup command runs with `--apply`, when it completes, then existing Cosmos mech documents no longer contain `buildCodes.export`.

## Spec Change Log

## Verification

**Commands:**
- `cd api && npm test` -- focused and existing API tests pass.
- `cd api && npm run build` -- API TypeScript compiles and assets copy.
- `cd app && npm run build` -- frontend TypeScript and Vite build succeed.
- `cd api && npm run migrate:remove-export-codes -- --apply` -- existing Cosmos documents are updated and the summary reports no failures.
