// External magnets (skills/render-external-lead-magnet.md, WIP): the CLIENT's tool builds the
// deliverable through its API. The model compiles the recipe's request template for one fixture;
// the service injects the credential (the model never sees it), pins the call to the integration's
// host + endpoint, and reads the deliverable URL from the response (never constructs it).
import { loadSkill, structured, S } from '../llm.js';
import { isHttpUrl } from '../contract.js';
import type { ExternalCallResult, ExternalRequestSpec, Fixture, Payload, ResolvedInputs } from '../types.js';

const SCHEMA = S.obj({
  missing_required_inputs: S.arr(S.str),
  method: S.enm('GET', 'POST', 'PUT', 'PATCH'),
  path: S.str,
  query: S.arr(S.obj({ name: S.str, value: S.str })),
  headers: S.arr(S.obj({ name: S.str, value: S.str })),
  body_json: S.nstr,
  auth_location: S.enm('header', 'query', 'bearer'),
  auth_name: S.str,
  test_mode_applied: S.bool,
  response_url_field: S.str,
  response_required_fields: S.arr(S.obj({ path: S.str, array_length: S.nint })),
  url_suffix: S.nstr,
});

const SYSTEM = `You compile ONE API request for an external lead magnet, for ONE prospect, by executing the recipe (recipe.skill_md).
Return the request spec as JSON. The service sends it, injects the credential and reads the response.
- method/path: exactly the endpoint the recipe names (path only, starting with "/", no host).
- query/headers/body_json: built from the recipe's request template. body_json is the JSON body as a string, or null.
  Every value must come from the prospect's real data, the resolved inputs or play_constants. Never invent data.
- NEVER put a credential, API key or token placeholder anywhere. auth_location/auth_name say where the service injects it
  (header name, query parameter name, or "bearer" for an Authorization Bearer header), per the recipe or integration.
- Test mode: when "mode" is "preview" and the integration has a test mode, apply it exactly as the recipe or test_mode
  describes and set test_mode_applied true. Otherwise false.
- response_url_field: dot path of the response field holding the deliverable URL (e.g. "url" or "data.link").
- response_required_fields: every field the recipe says the response must carry; array_length when it fixes a count.
- url_suffix: anything the recipe appends to the returned URL (e.g. "?titleId=1"), or null.
- If a REQUIRED input is missing, list its key in missing_required_inputs.
- No em dashes or en dashes in any text value.

=== CRAFT RULES (service skill bundle) ===
${loadSkill('render-external-lead-magnet.md')}`;

const pathGet = (obj: unknown, p: string): unknown =>
  p.split('.').filter(Boolean).reduce<unknown>((o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k]), obj);
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function scrub(s: unknown, secret: string): string {
  return String(s ?? '').split(secret).join('[redacted]').slice(0, 300);
}

async function resolves(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(10_000) });
    await res.body?.cancel();
    return res.status < 400;
  } catch {
    return false;
  }
}

export interface CompileRequestArgs {
  payload: Payload;
  fixture: Fixture;
  resolved: ResolvedInputs;
  mode: 'preview' | 'production';
}

export async function compileRequest({ payload, fixture, resolved, mode }: CompileRequestArgs): Promise<ExternalRequestSpec> {
  const { recipe, magnet } = payload;
  const { credential, ...integration } = magnet.integration!;
  void credential;
  const user = [
    '# Recipe (recipe.skill_md)', recipe.skill_md, '',
    '# Mode', mode, '',
    '# Integration (credential withheld)', JSON.stringify(integration), '',
    '# Play constants', JSON.stringify(recipe.play_constants ?? {}), '',
    '# Prospect', JSON.stringify({ first_name: fixture.first_name, full_name: fixture.full_name, company: fixture.company }), '',
    '# Resolved inputs', JSON.stringify(resolved.values), '',
    '# All raw inputs', JSON.stringify(fixture.inputs ?? {}),
  ].join('\n');
  return structured<ExternalRequestSpec>({ system: SYSTEM, user, name: 'external_request', schema: SCHEMA });
}

export interface CallExternalArgs {
  payload: Payload;
  spec: ExternalRequestSpec;
  mode: 'preview' | 'production';
}

// Returns { status, url, checks, notes, failure_reason, artifactMayExist, authFailed }.
export async function callExternal({ payload, spec, mode }: CallExternalArgs): Promise<ExternalCallResult> {
  const integ = payload.magnet.integration!;
  const secret = integ.credential;
  const retries = payload.recipe.failure_policy?.retries ?? 2;
  const notes: string[] = [];
  const fail = (reason: string, extra: Partial<ExternalCallResult> = {}): ExternalCallResult => ({
    status: 'failed',
    url: null,
    checks: {},
    notes,
    failure_reason: scrub(reason, secret),
    artifactMayExist: false,
    authFailed: false,
    ...extra,
  });

  if (integ.endpoint_path && spec.path !== integ.endpoint_path) {
    return fail(`recipe request path ${spec.path} does not match integration endpoint_path ${integ.endpoint_path}`);
  }
  const base = new URL(integ.base_url);
  const target = new URL(spec.path.replace(/^\/*/, '/'), base);
  if (target.origin !== base.origin) return fail('request path escapes the integration base_url');

  const headers: Record<string, string> = { Accept: 'application/json' };
  const forbidden = new Set(['authorization', 'cookie', 'host', (integ.auth_header ?? spec.auth_name ?? '').toLowerCase()]);
  for (const h of spec.headers) if (!forbidden.has(h.name.toLowerCase())) headers[h.name] = h.value;
  for (const q of spec.query) if (q.name !== spec.auth_name) target.searchParams.set(q.name, q.value);

  if (integ.auth_kind === 'bearer' || spec.auth_location === 'bearer') headers.Authorization = `Bearer ${secret}`;
  else if (integ.auth_header) headers[integ.auth_header] = secret;
  else if (spec.auth_location === 'query') target.searchParams.set(spec.auth_name, secret);
  else headers[spec.auth_name] = secret;

  let body: string | undefined;
  if (spec.body_json !== null && spec.method !== 'GET') {
    try {
      body = JSON.stringify(JSON.parse(spec.body_json));
    } catch {
      return fail('compiled body_json is not valid JSON');
    }
    headers['Content-Type'] = 'application/json';
  }
  if (mode === 'preview' && integ.test_mode?.available && !spec.test_mode_applied) {
    notes.push('integration has a test mode but the recipe compile did not apply it');
  }

  // Error policy: 400 = fix the body (no retry) · 401/403 = stop, key problem · 408/429/5xx = backoff retry.
  // A timeout may still have created the artifact, so it is never retried. Never retry after a 200.
  let res: Response;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetch(target, { method: spec.method, headers, body, signal: AbortSignal.timeout(60_000) });
    } catch (e) {
      if (e instanceof Error && e.name === 'TimeoutError') return fail('client API timed out; an artifact may exist, not retried', { artifactMayExist: true });
      if (attempt < retries) {
        await sleep(1000 * 3 ** attempt);
        continue;
      }
      return fail(`client API unreachable: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (([408, 429].includes(res.status) || res.status >= 500) && attempt < retries) {
      await res.body?.cancel();
      await sleep(1000 * 3 ** attempt);
      continue;
    }
    break;
  }

  const text = await res.text();
  if (res.status === 401 || res.status === 403) {
    return fail(`client API rejected the credential (HTTP ${res.status}); stop and surface to the operator`, { authFailed: true });
  }
  if (!res.ok) return fail(`client API HTTP ${res.status}: ${text}`);

  // From here on a real artifact may exist on the client's tool.
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return fail(`client API returned non-JSON (HTTP ${res.status})`, { artifactMayExist: true });
  }
  const missing = spec.response_required_fields.filter((f) => {
    const v = pathGet(json, f.path);
    if (v === undefined || v === null || v === '') return true;
    return f.array_length !== null && (!Array.isArray(v) || v.length !== f.array_length);
  });
  const rawUrl = pathGet(json, spec.response_url_field);
  const url = isHttpUrl(rawUrl) ? rawUrl + (spec.url_suffix ?? '') : null;
  const checks: Record<string, boolean> = {
    http_status_ok: true,
    response_shape_ok: missing.length === 0,
    url_present: Boolean(url),
    url_from_api: true,
    test_mode_applied: mode !== 'preview' || !integ.test_mode?.available || spec.test_mode_applied,
    url_resolves: url ? await resolves(url) : false,
  };
  if (missing.length) notes.push(`response missing: ${missing.map((f) => f.path).join(', ')}`);
  if (!url) return { ...fail(`no deliverable URL at response field "${spec.response_url_field}"`, { artifactMayExist: true }), checks };
  if (!checks.url_resolves) return { ...fail('deliverable URL does not resolve', { artifactMayExist: true }), url, checks };
  return { status: 'produced', url, checks, notes, failure_reason: null, artifactMayExist: true, authFailed: false };
}
