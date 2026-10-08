# Magnet service skill bundle — ships WITH the Render service (2026-10-07)

These files are the Lead Magnet service's own knowledge. The service has no GTMA database
access and no memory: per request it receives the payload (docs/magnet-service-contract.md)
and executes the payload's `recipe.skill_md` AGAINST these bundled skills. Split of brains:

| Side | Skills | Job |
|---|---|---|
| **GTMA** (window agent + backend) | discover-gtm-play, lead-magnet-brainstorm, the window contract, launch-play, run-lead-magnet (orchestration), enrich-play-lead-list | decide WHAT the magnet is, author the per-magnet recipe, resolve all values, judge + QA + approve, own every DB write |
| **Service** (this bundle) | design-custom-lead-magnet.md, render-external-lead-magnet.md, fetch_logo.py (+ README) | know HOW to build: turn recipe + values into hosted HTML (or a client-API deliverable) and return URLs + check results |

The per-magnet `skill_md` is the PARAMETERIZATION (this magnet's structure, logic, wording);
this bundle is the CRAFT (the always-rules every magnet obeys). A design-rule change updates
this bundle once; a magnet change only touches its recipe.
