# Deploy — Obsidian Protocol

Production deploy target: **Vercel** (fully client-side Next.js app; no server env vars required).

## Prerequisites

- Node 20+
- [Vercel CLI](https://vercel.com/docs/cli) (`npm i -g vercel`) or GitHub integration

## Preview deploy

```bash
npm ci
npm run typecheck
npm test
npm run build
npx vercel
```

## Production deploy

```bash
npx vercel --prod
```

Configuration lives in [`vercel.json`](../vercel.json) (`framework: nextjs`, `buildCommand: npm run build`).

## CI

GitHub Actions runs on push/PR to `master` or `main`:

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`

## Manual demo smoke (before sharing URL)

1. Load **Blackspire Arcology** from examples
2. Place a block → undo
3. Open Artifact Library → stamp a prefab
4. Named save → refresh → vault intact
5. Export vault → import round-trip

## E2E (optional)

```bash
npx playwright install chromium
npm run test:e2e
```
