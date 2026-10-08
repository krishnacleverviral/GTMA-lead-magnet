# Render an external lead magnet (service-side execution skill) — WIP

Input: the build payload with `magnet.kind = 'external'` and `magnet.integration`
(base_url, auth_kind, credential — resolved by GTMA, used in-flight, never stored,
endpoint_path, test_mode) + the fixture's resolved `inputs` + `recipe.play_constants`.
Output: the deliverable link per fixture + check results.

## Rules
1. Build the request from the recipe's request template: manifest keys + play_constants →
   API parameters. Use test_mode for previews when the API has one.
2. NEVER construct deliverable URLs manually — use the URL the API returns (vendor rule),
   plus any recipe-defined suffix (e.g. `?titleId=N`).
3. Checks: HTTP status · response shape per the recipe (e.g. storyId + 3 titles + url) ·
   the link resolves · latency within `output_contract.expected_turnaround_minutes`.
4. Error policy per the recipe (e.g. 400 fix body · 401/403 stop and report · 408/5xx
   backoff, max per `failure_policy.retries`). One POST may create a REAL artifact on the
   client's tool: no blind retries after a 200.
Reference: NewsEngine contract in magnet-test/runtime-skill-external-v1-draft.md (WIP —
live test staged, not yet run).
