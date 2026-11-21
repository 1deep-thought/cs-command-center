# Project Overview: Internal Customer Success Platform
An internal Customer Success (CS) workspace that unifies structured CRM data (HubSpot), unstructured call transcripts (Gong), product telemetry/logins, and semantic chat history (WisdomAI) to generate account health diagnostics, Executive Value Stories, and Quarterly Business Reviews (QBRs).

## Tech Stack & Architecture
- **Frontend:** Next.js (App Router), TypeScript, Tailwind CSS, deployed on Vercel.
- **Backend / AI Orchestration:** Python 3.11+ (FastAPI / Vercel Serverless Functions), `uv` for dependency management, Pydantic v2 for strict schema validation.
- **Data Warehouse:** Google BigQuery (`google-cloud-bigquery`).
- **AI / LLM Layer:** Structured JSON/Pydantic extraction for call/chat synthesis and streaming responses for long-form QBR/value story generation.

---

## Agent Council Routing Rules
Before designing, building, or reviewing features, automatically delegate to the specialized subagents in `.claude/agents/` based on the task domain:

1. **Product Strategy, CS Workflows & Copy (`@cs-operator`)**
   - **Invoke when:** Defining account health scoring formulas, designing QBR structures, writing LLM system prompts for Value Stories, or deciding which metrics matter to CSMs.
   - **Goal:** Ensure every feature drives renewal/expansion outcomes and eliminates vanity metrics.

2. **UI, Layout & Data Visualization (`@product-designer`)**
   - **Invoke when:** Creating or styling Next.js pages, React components, tables, badges, sparklines, or loading states.
   - **Goal:** Enforce high-density, low-latency, Linear-inspired UI with semantic color restraint and zero clutter.

3. **BigQuery SQL, Data Joins & AI Grounding (`@data-architect`)**
   - **Invoke when:** Writing SQL queries, resolving `account_id` across HubSpot/Gong/Telemetry/WisdomAI, handling null/new-account edge cases, or structuring LLM context payloads.
   - **Goal:** Guarantee single-source-of-truth metric definitions, partition-filtered BigQuery queries, and citation-backed AI outputs.

4. **System Architecture, API Contracts & Code Review (`@tech-lead`)**
   - **Invoke when:** Setting up project structure, writing Python endpoints, defining Pydantic/TypeScript interfaces, optimizing Vercel timeouts, or reviewing completed features before commit.
   - **Goal:** Keep the codebase lean, strictly typed, fast, and free of credential leaks.

### Multi-Agent Council Protocol
When starting a major feature (e.g., a new dashboard view or AI generator):
1. Consult `@cs-operator` and `@data-architect` first to lock the business logic, metrics, and data sources.
2. Have `@product-designer` define the component layout and states.
3. Have `@tech-lead` enforce the Pydantic/TypeScript contract and review the final code.

---

## Non-Negotiable Engineering Guardrails
- **BigQuery Hygiene:** Never run `SELECT *` on event/telemetry tables. Always filter on partition columns and cluster keys (`account_id`), and perform aggregations in SQL rather than Python memory.
- **Zero Hallucination Policy:** Every AI-generated insight, quote, or ROI claim in a QBR or Value Story must include a traceable source reference (e.g., Gong call date, telemetry timeframe, or chat log timestamp).
- **Schema Parity:** Any change to a Python Pydantic response model in `/api` must be mirrored immediately in the corresponding TypeScript type definitions in `/src/types`.
- **Secrets & Auth:** Never hardcode GCP service account credentials, HubSpot API keys, or LLM keys. Always load from environment variables and verify `.env*` files remain gitignored.
- **Serverless Performance:** Keep Vercel Python API execution under 10 seconds for standard data fetches; use streaming endpoints for long-form LLM generation.

## Common Commands
- **Frontend Dev:** `npm run dev`
- **Python Environment:** `uv sync` / `uv run pytest`
- **Type Check & Lint:** `npm run lint && npx tsc --noEmit`

