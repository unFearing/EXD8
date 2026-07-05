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
