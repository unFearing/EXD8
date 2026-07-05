# Configuration Map

This folder is the central index for configuration locations in EXD8.

Some files cannot be moved because tooling requires fixed paths.

## Root-Level (Path-Sensitive)

- `/.gitignore`
- `/staticwebapp.config.json`
- `/dev-local.sh`

## App Configuration

- `/app/package.json`
- `/app/tsconfig.json`
- `/app/tsconfig.app.json`
- `/app/tsconfig.node.json`
- `/app/vite.config.ts`
- `/app/eslint.config.js`
- `/app/.gitignore`

## API Configuration

- `/api/package.json`
- `/api/tsconfig.json`
- `/api/host.json`
- `/api/local.settings.json` (local secret-bearing config, gitignored)

## BMAD Configuration

- `/_bmad/config.toml`
- `/_bmad/config.user.toml`
- `/_bmad/custom/config.toml`
- `/_bmad/custom/config.user.toml` (user-local)

## VS Code Workspace Configuration

- `/.vscode/settings.json`
- `/.vscode/tasks.json`
- `/.vscode/extensions.json`
- `/.vscode/keybindings.json`

## Lockfiles

Keep lockfiles committed:
- `/api/package-lock.json`
- `/app/package-lock.json`

Rationale: deterministic installs from a clean clone using `npm ci`.
