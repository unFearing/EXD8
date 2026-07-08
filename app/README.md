# EXD8 Frontend (`app`)

React + TypeScript + Vite frontend for EXD8.

## Scripts

```bash
npm run dev
npm run build
npm run lint
npm run preview
```

## Local API Integration

When developing with the local Azure Functions API, start from repository root:

```bash
bash dev-local.sh
```

When using the deployed API instead of local API:

```bash
USE_REMOTE_API=1 bash dev-local.sh
```

## Notes

- The canonical project-level setup guide is in the repository root `README.md`.
- API client helpers are in `src/api/client.ts`.
- Shared UI components are in `src/components/`.

## Known Benign Console Messages

The following messages are commonly seen in local development and are usually not app defects:

- `[vite] connecting...` / `[vite] connected.`
	- Expected Vite dev server lifecycle messages.

- `Download the React DevTools for a better development experience`
	- Informational hint from React dev build.

- `TypeError ... h1-check.js ... detectStore ...`
	- Typically injected by a browser extension/content script, not this codebase.
	- Verify in an incognito window with extensions disabled.

- `React Router Future Flag Warning` (`v7_startTransition`, `v7_relativeSplatPath`)
	- These are intentionally enabled in `src/App.tsx`.
	- If warnings reappear, ensure local changes are up to date.

- `downloadable font ... Rajdhani ... Glyph bbox was incorrect; adjusting`
	- Browser/font rendering metadata warning; typically harmless.

Treat messages as actionable when they include app source paths (for example `src/components/...`) and break runtime behavior.
