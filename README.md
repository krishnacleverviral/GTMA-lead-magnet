# Lead Magnet Render Service

Stateless backend for GTMA. One payload in (recipe + client brand/CTA + proofpoints + fixtures with
resolved input values), hosted pages or client-API deliverables out, with mechanical check results.
Contract: `../magnet_service_dev_kit/magnet-service-contract.md`. Craft rules: `skills/`.

The service never touches GTMA tables. Its database holds only its own schema `magnet_service`
(hosted pages, idempotency records, the 30-day logo cache), created automatically on boot.

`server.ts` raises Node's per-address connect window from 250ms to 2s. Node 20+ abandons each IP
after 250ms, which is shorter than the ~300ms round trip from the dev machine to Neon's us-east-2, so without
it every DB connection fails with `ETIMEDOUT` whenever latency creeps over 250ms.

## Run

TypeScript throughout (`src/`, `scripts/`, `test/`). `npm run dev`/`test`/`sample` run the `.ts`
sources directly via `tsx`; `npm start` type-checks and compiles to `dist/` first, then runs the
compiled output (what Render does).

```
npm install
# fill OPENAI_API_KEY in .env
npm run dev          # http://localhost:8080, --watch, runs src/server.ts directly
npm test             # unit tests (tsx), no network or LLM
npm run typecheck    # tsc --noEmit
npm run build        # tsc -> dist/
npm start            # build + run the compiled dist/src/server.js
npm run sample       # sends the dev kit's real 5-fixture payload, like GTMA would
```

`npm run sample` flags: `--fixtures 2` · `--produce` · `--key <k>` (reuse an idempotency key) ·
`--no-booking` (CTA fallback) · `--missing-input` (required input removed, must fail).

## Endpoints

| Route | Auth | What |
|---|---|---|
| `POST /magnet/build-previews` | `Authorization: Bearer $SERVICE_API_KEY` | 1 to 10 fixtures (GTMA sends 5) |
| `POST /magnet/produce` | same | exactly 1 fixture, reply time |
| `GET /{token}` | public, unguessable | the hosted page (`noindex`, no scripts) |
| `GET /health` | public | DB ping |

Add `callback_url` to the payload to get `202` immediately and the response POSTed there later,
signed with `X-Magnet-Signature: sha256=HMAC(body, SERVICE_API_KEY)`.

**Idempotency:** the same `idempotency_key` (per magnet, person, reply) returns the stored result
without rebuilding, and an external magnet is never POSTed twice. A new key builds fresh, which is
how GTMA asks for a rebuild after a change request or a failed QA.

**Extensions to the contract** (all optional): `recipe.input_manifest` (otherwise parsed from the
recipe's `## Input manifest` table), `recipe.failure_policy.retries`, `magnet.integration.auth_header`,
`callback_url`. Each result also carries `lead_list_id`, `notes` (why a check failed) and `cached`.

## Checks (custom)

`inputs_present · no_placeholders · prospect_named · client_named · client_brand_colors ·
logo_gate_respected · no_em_dashes · cta_top_and_bottom · poc_named_in_cta · carousel_present ·
no_unknown_text · codes_spelled_out · numbers_traceable · noindex · url_resolves · within_turnaround`.
All are pass-when-true except `cta_fallback_used`, which is a flag (true = booking link missing).
`status: failed` means there is no usable deliverable (missing input, generation error, URL dead);
every other check is reported for GTMA to judge.

## Deploy (Render)

Web service, root directory `magnet_service/`, build `npm install && npm run build`, start
`node dist/src/server.js`, env vars as in `.env.example`, with `PUBLIC_BASE_URL` set to the
service's public URL. For `hosting='client_domain'`, the client's CNAME points at this service
and GTMA sends that subdomain as `hosted_base_url`. The process must start with its cwd at
`magnet_service/` (every script here already runs that way) since `skills/` is a static folder
read at runtime, not something `tsc` compiles into `dist/`.
