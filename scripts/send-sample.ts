// Plays GTMA's part: sends the dev kit's REAL sample payload (5 DataMagnet fixture leads) with the
// example recipe injected, prints the per-fixture results, and saves the full response to out/.
//
//   npm run sample                       5 previews (build-previews)
//   npm run sample -- --fixtures 2       only the first 2 fixtures (cheaper)
//   npm run sample -- --produce          reply-time production for fixture 1 (produce)
//   npm run sample -- --key abc          reuse an idempotency key (second run should return cached results)
//   npm run sample -- --no-booking       drop booking_url/POC to exercise the CTA fallback flag
//   npm run sample -- --missing-input    remove a required input from fixture 1 (it must fail)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { BuildResponse } from '../src/types.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const kit = path.join(here, '..', '..', 'magnet_service_dev_kit');
const args = process.argv.slice(2);
const flag = (name: string): boolean => args.includes(name);
const opt = (name: string): string | undefined => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);

const payload = JSON.parse(fs.readFileSync(path.join(kit, 'sample-payload-build-previews.json'), 'utf8'));
payload.recipe.skill_md = fs.readFileSync(path.join(kit, 'example-recipe-custom.md'), 'utf8');
payload.runtime_id = '00000000-0000-4000-8000-000000000001';
payload.idempotency_key = opt('--key') ?? crypto.randomUUID();
payload.magnet.hosted_base_url = null;

const n = Number(opt('--fixtures') ?? payload.fixtures.length);
payload.fixtures = payload.fixtures.slice(0, n);

const endpoint = flag('--produce') ? 'produce' : 'build-previews';
if (endpoint === 'produce') {
  payload.fixtures = [{ ...payload.fixtures[0], reply_id: '424242' }];
}
if (flag('--no-booking')) {
  payload.client.booking_url = null;
  payload.client.booking_poc_name = null;
}
if (flag('--missing-input')) {
  delete payload.fixtures[0].inputs.company_dept_distribution;
}

const base = process.env.SERVICE_URL ?? `http://localhost:${process.env.PORT ?? 8080}`;
console.log(`POST ${base}/magnet/${endpoint}  fixtures=${payload.fixtures.length}  idempotency_key=${payload.idempotency_key}`);
const t0 = Date.now();
const res = await fetch(`${base}/magnet/${endpoint}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SERVICE_API_KEY}` },
  body: JSON.stringify(payload),
});
const body = await res.json();
console.log(`HTTP ${res.status} in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
if (!res.ok) {
  console.log(JSON.stringify(body, null, 2));
  process.exit(1);
}

const result = body as BuildResponse;
const names: Record<string, string> = Object.fromEntries(
  payload.fixtures.map((f: { person_id: string; full_name: string; company: { company_name: string } }) => [f.person_id, `${f.full_name} @ ${f.company.company_name}`]),
);
for (const r of result.results) {
  const failed = Object.entries(r.checks).filter(([k, v]) => (k === 'cta_fallback_used' ? v : v === false)).map(([k]) => k);
  const total = Object.keys(r.checks).length;
  console.log(`${r.status === 'produced' ? 'OK  ' : 'FAIL'} ${names[r.person_id]}${r.cached ? '  (cached)' : ''}`);
  console.log(`     url: ${r.url ?? '-'}   ${(r.latency_ms / 1000).toFixed(1)}s   checks ${total - failed.length}/${total}${failed.length ? '  flagged: ' + failed.join(', ') : ''}`);
  if (r.failure_reason) console.log(`     failure: ${r.failure_reason}`);
  for (const note of r.notes ?? []) console.log(`     note: ${note}`);
}

fs.mkdirSync(path.join(here, '..', 'out'), { recursive: true });
const outFile = path.join(here, '..', 'out', 'last-response.json');
fs.writeFileSync(outFile, JSON.stringify(body, null, 2));
console.log(`\nfull response: ${outFile}`);
