---
title: 'Direct URL Mech Resolution'
type: 'bugfix'
created: '2026-09-03'
status: 'done'
baseline_commit: '3024e6bf8e7c91be61768d9659e6c61faea38dda'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** NAV-Alpha imports can map a URL variant to the wrong chassis family when several families share an initial code. In particular, `MAD-BH2` must resolve to the 75T Marauder Bounty Hunter II, not the 85T Marauder IIC or 100T Marauder II.

**Approach:** Resolve the full variant token extracted from the submitted URL against the existing known-mech catalog, scoped by its chassis code, before running broader alias or prefix fallbacks. Reuse the centralized mech resolver and retain broader matching only when direct resolution returns no unique result.

## Boundaries & Constraints

**Always:** Treat an exact known chassis+variant result as authoritative for chassis, canonical variant, tech, tonnage, and weight class. Reuse `mechs_config.json` and the existing `mechsConfigCatalog` resolver rather than adding a new data source. Preserve support for known hero aliases and current fallback behavior for genuinely unknown variants. Distinguish 75T Marauder, 85T Marauder IIC, and 100T Marauder II despite their shared `MAD` prefix.

**Ask First:** Any change to persisted mech documents, bulk reparse operations, or removal of existing fallback behavior.

**Never:** Infer chassis from the shortest prefix when a unique full-variant catalog result exists; hard-code tonnage in the parser; modify frontend selector behavior; fix the unrelated pre-existing Magshot test failure as part of this change.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Marauder hero URL | URL token ends in `MAD-BH2` | Marauder, Bounty Hunter II, IS, 75T, Heavy | Use the existing alias table to bridge URL code to canonical hero name |
| Marauder II URL | URL token ends in `MAD-4A` | Marauder II, 100T, Assault | Exact full variant wins over shared `MAD` prefix |
| Marauder IIC URL | URL token ends in `MAD-IIC` | Marauder IIC, Clan, 85T, Assault | Exact full variant wins over other `MAD` families |
| Unknown URL variant | No unique catalog match | Existing parser fallback continues and emits its current warning when unmapped | Do not guess across ambiguous catalog candidates |

</frozen-after-approval>

## Code Map

- `api/src/functions/mechs/parseBuild.ts` -- extracts the URL variant and currently builds draft identity from a duplicate code/variant catalog.
- `api/src/data/mechsConfigCatalog.ts` -- existing canonical resolver with chassis-scoped, global, alias, and dynamic fallback stages.
- `api/tests/unit/functions/mechs/parseBuild.test.ts` -- focused handler regressions for URL-derived mech identity.
- `api/tests/unit/data/mechsConfigCatalog.test.ts` -- canonical and hero-alias resolver coverage.
- `app/public/mechs_config.json` -- existing runtime source of known chassis, variants, tech, and tonnage; no data duplication required.

## Tasks & Acceptance

**Execution:**
- [x] `api/src/data/mechsConfigCatalog.ts` -- recognize `MAD-BH2` as the URL shorthand for the 75T Marauder's canonical `BOUNTY HUNTER II` variant.
- [x] `api/src/functions/mechs/parseBuild.ts` -- consult the centralized chassis+full-variant resolver before the existing local fallback and use a unique result as the authoritative draft identity.
- [x] `api/tests/unit/data/mechsConfigCatalog.test.ts`, `api/tests/unit/functions/mechs/parseBuild.test.ts` -- cover all three `MAD` families and prove direct URL resolution precedes broad prefix fallback.

**Acceptance Criteria:**
- Given a submitted NAV-Alpha URL containing `MAD-BH2`, when it is parsed, then the draft is Marauder / Bounty Hunter II / IS / 75T / Heavy.
- Given `MAD-4A` or `MAD-IIC`, when either URL is parsed, then each remains assigned to its correct 100T IS or 85T Clan chassis family.
- Given a URL variant absent from the known catalog, when parsing proceeds, then the existing fallback path remains available rather than failing the import.

## Spec Change Log

## Design Notes

The URL provides the strongest identity token available before network enrichment. Pass its complete variant code into the existing resolver first; only a unique result may override fallback inference. This keeps matching precedence explicit: direct canonical/alias match, then existing wider search.

## Verification

**Commands:**
- `cd api && npm test -- --run tests/unit/data/mechsConfigCatalog.test.ts` -- expected: resolver tests pass.
- `cd api && npm test -- --run tests/unit/functions/mechs/parseBuild.test.ts --testNamePattern="Marauder"` -- expected: focused Marauder URL cases pass; excludes the unrelated existing Magshot failure.
- `cd api && npm run build` -- expected: API TypeScript build succeeds.

## Suggested Review Order

**Resolution precedence**

- Full URL variant resolution now precedes all legacy prefix inference.
	[parseBuild.ts:949](../../api/src/functions/mechs/parseBuild.ts#L949)

- Ambiguous shared prefixes remain importable without guessing a chassis family.
	[parseBuild.ts:954](../../api/src/functions/mechs/parseBuild.ts#L954)

**Canonical alias**

- Existing catalog aliases map MAD-BH2 to Bounty Hunter II.
	[mechsConfigCatalog.ts:51](../../api/src/data/mechsConfigCatalog.ts#L51)

**Regression coverage**

- Handler tests separate all three MAD families and fallback paths.
	[parseBuild.test.ts:6](../../api/tests/unit/functions/mechs/parseBuild.test.ts#L6)

- Resolver tests verify canonical chassis, variant, tech, tonnage, and class.
	[mechsConfigCatalog.test.ts:27](../../api/tests/unit/data/mechsConfigCatalog.test.ts#L27)
