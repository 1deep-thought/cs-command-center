# CS Command Center

Internal Customer Success workspace. See `CLAUDE.md` for architecture and guardrails,
and `docs/specs/health-renewals.md` for the Health & Renewals business spec.

## Layout

```
src/app/                 Next.js App Router (UI)
src/components/renewals/ Dashboard components
src/types/               TypeScript mirrors of the Pydantic contract
src/lib/api.ts           Server-only fetcher for the Python API
api/index.py             FastAPI app (Vercel Python function, mounted at /api/py)
api/_lib/                models · scoring · renewals · queries (BigQuery) · mock
tests/                   pytest
```

## Run locally

```bash
npm install
uv sync
npm run dev:api   # FastAPI on :8000
npm run dev       # Next.js on :3000
```

Without `GOOGLE_APPLICATION_CREDENTIALS_JSON` the API serves deterministic **mock data**
(the UI shows a "Mock data" tag). To use BigQuery, copy `.env.example` to `.env.local`
(for the API, export the vars in the shell running uvicorn) and set the service-account
JSON plus `BQ_DATASET`.

## Checks

```bash
npm run lint && npx tsc --noEmit
uv run pytest
```
