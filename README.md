# EXD8

EXD8 is an MWO team operations workspace with:
- A React + Vite frontend in `app/`
- An Azure Functions API in `api/`
- Foam knowledge content in `foam_docs/` and `mwo_docs/`
- BMAD planning/implementation artifacts in `_bmad/`, `.agents/skills/`, and `_bmad-output/`

Primary architecture document:
- `_bmad-output/planning-artifacts/architecture.md`

## BMAD Skills (Activated)

This repository already includes BMAD skills and customization sources.

- Skill catalog and workflow metadata: `_bmad/`
- Copilot skill payloads used in this repo: `.agents/skills/`
- Generated planning/implementation artifacts: `_bmad-output/`

No additional install step is required after clone. In Copilot Chat, call skills directly by name (for example: `use bmad-quick-dev` or `run bmad-code-review`).

## Clean Clone + Run

Prerequisites:
- Node.js 20+
- npm 10+
- Azure Functions Core Tools v4 (for local API runtime)

Install dependencies:

```bash
cd api && npm ci
cd ../app && npm ci
```

Run frontend + local API together:

```bash
bash dev-local.sh
```

Run frontend only against remote API:

```bash
USE_REMOTE_API=1 bash dev-local.sh
```

## Repository Organization

### Configuration Layout

Most config files are location-sensitive and must stay where their toolchain expects them.

- Root deployment/runtime config:
  - `staticwebapp.config.json`
  - `dev-local.sh`
  - `.gitignore`
- API config:
  - `api/host.json`
  - `api/tsconfig.json`
  - `api/local.settings.json` (local only, gitignored)
  - `api/package.json`
- App config:
  - `app/vite.config.ts`
  - `app/tsconfig*.json`
  - `app/eslint.config.js`
  - `app/package.json`
- BMAD config:
  - `_bmad/config.toml`
  - `_bmad/config.user.toml`
  - `_bmad/custom/config.toml`

### Test Layout

Tests are grouped by scope:
- API unit tests: `api/tests/unit/**`
- API cross-cutting regression tests: `api/tests/regression/**`

## Lockfile Policy

`package-lock.json` files should remain committed for both `api/` and `app/`.

Reason: reproducible installs and clean clone parity (`npm ci`) in local dev and CI.

Do not add lockfiles to `.gitignore`.
