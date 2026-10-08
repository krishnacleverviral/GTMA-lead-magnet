# Design a custom lead magnet page (service-side execution skill)

Input: the build payload — `recipe.skill_md` (this magnet's structure, logic, templates),
`client` (brand_colors, logo_url, booking_url, booking_poc_name, name, website),
`proofpoints`, one `fixture` (person + company facts + resolved `inputs`), `magnet`
(promise, hosting, hosted_base_url).
Output: one hosted HTML page per fixture + mechanical check results.

## The always-rules (rulings 38–45 — apply to EVERY page, recipe cannot override)
1. **Palette = the CLIENT's `brand_colors`** (payload values; never derive your own, never
   the prospect's colours).
2. **Prospect logo** via fetch_logo.py against `fixture.company.primary_domain`: own
   app icon → Google favicon → quality gate (≥96px, square-ish, real, not blank/default).
   **No pass = no logo** — hide the tile; the layout must look complete without it. Show in
   the 56px rounded white tile, 7px padding when the icon has transparency.
3. **CTA twice**: top-right button in a sticky bar + a closing CTA block — text
   "Book a call" / "Book a call with {booking_poc_name}", href `booking_url`. Missing
   booking values → use `client.website` and set `checks.cta_fallback_used = true`
   (GTMA flags it; never invent a link or a name).
4. **Case-study carousel** directly above the closing CTA, from `proofpoints` per the
   recipe's selection rule; empty → the recipe's labeled fallback claims.
5. **No em dashes anywhere.** Country/industry codes spelled out. person/people grammar.
6. **Every number and claim traces to a payload value** — nothing about the prospect is
   ever invented; a missing optional input uses its manifest fallback, a missing required
   input fails the build for that fixture.
7. Phone-width clean (no horizontal scroll), bars drawn to scale, `unknown` rows dropped.
8. Page footer: prepared-by line naming the client and the prospect.

## Mechanics
Render `recipe.skill_md`'s structure with the payload values → host at
`{hosted_base_url}/{token}` (ours, or the client subdomain when `hosting='client_domain'`)
→ run `output_contract.pre_send_checks` + the rule checks above → return
`{person_id, status, url, checks, latency_ms, failure_reason}`.
Pages carry `noindex`. Tokens are unguessable; files named by token, never by domain.
Reference implementation: the Data Magnet validation pages (magnet-test/previews/) and
build_custom_test.py — 12 checks, 5/5 green on real leads, 2026-10-06.
