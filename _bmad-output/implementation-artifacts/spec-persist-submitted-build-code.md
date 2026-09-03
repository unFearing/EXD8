---
title: 'Persist Submitted Build Code'
type: 'bugfix'
created: '2026-09-03'
status: 'done'
baseline_commit: '656581f5fba4af52cb52bfec8095f2cd6f26a0f1'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** NAV-Alpha parsing can successfully extract the MWO export code but stores it under `buildCodes.export`. Single submission filters that key from the editable field, bulk submission loses it at API normalization, and persisted builds therefore provide no code for Repository or Deck views.

**Approach:** Store every parser-extracted MWO export string under the established `buildCodes.default` key. Preserve named user-maintained code pairs and leave the NAV-Alpha URL token as parser metadata only.

## Boundaries & Constraints

**Always:** Use the existing `Record<string, string>` contract. Preserve parser source precedence, merging the selected code as `default` without dropping other draft entries. Keep API write normalization, Repository rendering, and Deck preference behavior unchanged because they already enforce and consume `default` correctly.

**Ask First:** Any persisted schema change, reinterpretation of the NAV-Alpha URL token as an MWO export code, database backfill, or change to user-authored named build codes.

**Never:** Create or retain `buildCodes.export`; save the inferred mech variant under `default`; alter Deck rows or Repository editing to compensate for malformed parser output; modify unrelated mech identity resolution.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Public NAV-Alpha export | Public build data computes a valid MWO code | Draft contains `buildCodes.default` with that code and no `export` | Later lower-priority sources do not overwrite it |
| Rendered/API/HTML fallback | Higher-priority source has no code and a fallback extracts one | Extracted code is stored as `default` | Preserve source precedence and existing parse warnings |
| No export code | All extraction sources fail or return no valid code | Draft has no `default` code | Existing manual-entry warning is emitted |
| Submitted draft | Single or bulk submission receives parser output | API persists `buildCodes.default` | Existing normalization removes only invalid/legacy keys |
| Deck selection | Persisted build contains `default` | Deck copies and displays that code | Empty only when the stored build truly has no valid code |

</frozen-after-approval>

## Code Map

- `api/src/functions/mechs/parseBuild.ts` -- extracts export codes through public, rendered, authenticated API, and HTML paths and creates the draft.
- `api/tests/unit/functions/mechs/parseBuild.test.ts` -- parser regression tests, including the currently failing rendered Magshot/default assertion.
- `app/src/components/AddBuildDialog.tsx` -- confirms single and bulk submissions forward valid `default` entries through existing flows.
- `api/src/db/repositories/mechRepository.ts` -- confirms write normalization preserves `default` and intentionally rejects `export`.
- `app/src/components/DeckBoard.tsx` -- confirms Deck already prefers persisted `default` codes.

## Tasks & Acceptance

**Execution:**
- [x] `api/src/functions/mechs/parseBuild.ts` -- replace all parser-generated `export` entries with `default` and make the missing-code warning inspect `default`.
- [x] `api/tests/unit/functions/mechs/parseBuild.test.ts` -- cover successful fallback extraction, absence of `export`, source precedence, and warning behavior without network dependencies.

**Acceptance Criteria:**
- Given any parser extraction path returns a valid MWO export code, when the draft is returned and submitted, then the persisted build contains that exact value at `buildCodes.default` and no `export` key.
- Given a persisted build has `buildCodes.default`, when it is selected on the Deck view, then the existing Deck flow displays that value as the build code.
- Given no source yields a valid MWO export code, when parsing completes, then the manual-entry warning remains present and no URL token or variant is misrepresented as the default code.

## Spec Change Log

## Verification

**Commands:**
- `cd api && npm test -- --run tests/unit/functions/mechs/parseBuild.test.ts` -- expected: parser tests pass, including the rendered default-code regression.
- `cd api && npm test -- --run tests/unit/db/repositories/mechRepository.test.ts` -- expected: write normalization continues preserving `default` and custom keys while removing `export`.
- `cd api && npm run build` -- expected: API TypeScript build succeeds.
- `cd app && npm run build` -- expected: unchanged frontend consumers still compile against the existing contract.

## Suggested Review Order

**Parser contract**

- Extracted MWO codes now use the persisted `default` key.
	[`parseBuild.ts:1112`](../../api/src/functions/mechs/parseBuild.ts#L1112)

- Code-only API payloads are scanned before loadout identity checks.
	[`parseBuild.ts:808`](../../api/src/functions/mechs/parseBuild.ts#L808)

**Fallback precedence**

- Missing codes independently trigger rendered, API, and HTML recovery.
	[`parseBuild.ts:1130`](../../api/src/functions/mechs/parseBuild.ts#L1130)

- Lower-priority API recovery preserves higher-priority loadout data.
	[`parseBuild.ts:1164`](../../api/src/functions/mechs/parseBuild.ts#L1164)

- HTML fallback cannot overwrite a code found by an earlier source.
	[`parseBuild.ts:1196`](../../api/src/functions/mechs/parseBuild.ts#L1196)

**Regression coverage**

- HTML extraction persists `default` without the legacy key.
	[`parseBuild.test.ts:107`](../../api/tests/unit/functions/mechs/parseBuild.test.ts#L107)

- Code-only API fallback works after rendered loadout extraction.
	[`parseBuild.test.ts:162`](../../api/tests/unit/functions/mechs/parseBuild.test.ts#L162)

- Missing-code behavior still emits the manual-entry warning.
	[`parseBuild.test.ts:195`](../../api/tests/unit/functions/mechs/parseBuild.test.ts#L195)
