import postgres from 'postgres';
import { config } from './config.js';
import type { FixtureResult, StoredResult } from './types.js';

// The service's OWN storage, isolated in schema magnet_service. It never reads or writes GTMA tables.
export const sql = postgres(config.databaseUrl, { max: 5, idle_timeout: 20, onnotice: () => {} });

export async function ensureSchema(): Promise<void> {
  await sql`create schema if not exists magnet_service`;
  await sql`
    create table if not exists magnet_service.results (
      dedupe_key      text primary key,
      endpoint        text not null,
      kind            text not null,
      lead_magnet_id  text not null,
      runtime_id      text,
      runtime_version integer,
      gtm_play_id     text,
      person_id       text not null,
      reply_id        text,
      status          text not null check (status in ('produced', 'failed')),
      token           text unique,
      url             text,
      html            text,
      result          jsonb not null,
      created_at      timestamptz not null default now(),
      updated_at      timestamptz not null default now()
    )`;
  await sql`
    create table if not exists magnet_service.logo_cache (
      domain           text primary key,
      ok               boolean not null,
      png              bytea,
      has_transparency boolean,
      source           text,
      reason           text,
      checked_at       timestamptz not null default now(),
      check (ok = (png is not null))
    )`;
}

interface ResultRow {
  status: 'produced' | 'failed';
  kind: 'custom' | 'external';
  result: FixtureResult;
}

export async function findResult(dedupeKey: string): Promise<ResultRow | null> {
  const [row] = await sql<ResultRow[]>`select status, kind, result from magnet_service.results where dedupe_key = ${dedupeKey}`;
  return row ?? null;
}

export async function saveResult(r: StoredResult): Promise<void> {
  await sql`
    insert into magnet_service.results
      (dedupe_key, endpoint, kind, lead_magnet_id, runtime_id, runtime_version, gtm_play_id,
       person_id, reply_id, status, token, url, html, result)
    values
      (${r.dedupeKey}, ${r.endpoint}, ${r.kind}, ${r.leadMagnetId}, ${r.runtimeId}, ${r.runtimeVersion},
       ${r.gtmPlayId}, ${r.personId}, ${r.replyId}, ${r.status}, ${r.token}, ${r.url}, ${r.html},
       ${sql.json(r.result as unknown as postgres.JSONValue)})
    on conflict (dedupe_key) do update set
      status = excluded.status, token = excluded.token, url = excluded.url, html = excluded.html,
      result = excluded.result, updated_at = now()`;
}

export async function updateResult(dedupeKey: string, status: 'produced' | 'failed', result: FixtureResult): Promise<void> {
  await sql`update magnet_service.results set status = ${status}, result = ${sql.json(result as unknown as postgres.JSONValue)}, updated_at = now()
            where dedupe_key = ${dedupeKey}`;
}

export async function pageByToken(token: string): Promise<string | null> {
  const [row] = await sql<{ html: string }[]>`select html from magnet_service.results where token = ${token} and html is not null`;
  return row?.html ?? null;
}

interface LogoCacheRow {
  ok: boolean;
  png: Buffer | null;
  has_transparency: boolean | null;
  source: string | null;
  reason: string | null;
}

export async function cachedLogo(domain: string): Promise<LogoCacheRow | null> {
  const [row] = await sql<LogoCacheRow[]>`
    select ok, png, has_transparency, source, reason from magnet_service.logo_cache
    where domain = ${domain}
      and checked_at > now() - (case when ok then interval '30 days' else interval '7 days' end)`;
  return row ?? null;
}

export interface LogoToCache {
  ok: boolean;
  png?: Buffer | null;
  hasTransparency?: boolean | null;
  source?: string | null;
  reason?: string | null;
}

export async function cacheLogo(domain: string, r: LogoToCache): Promise<void> {
  await sql`
    insert into magnet_service.logo_cache (domain, ok, png, has_transparency, source, reason)
    values (${domain}, ${r.ok}, ${r.png ?? null}, ${r.hasTransparency ?? null}, ${r.source ?? null}, ${r.reason ?? null})
    on conflict (domain) do update set ok = excluded.ok, png = excluded.png,
      has_transparency = excluded.has_transparency, source = excluded.source,
      reason = excluded.reason, checked_at = now()`;
}
