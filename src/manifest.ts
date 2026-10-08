// The input manifest: which keys the recipe needs, which are required, and their fallbacks.
// Taken from recipe.input_manifest when GTMA sends it, else parsed from the "## Input manifest"
// table in skill_md. A missing REQUIRED value fails that fixture deterministically, never the LLM's call.
import type { Fixture, ManifestEntry, ResolvedInputs } from './types.js';

const EMPTY_FALLBACK = /^(|-|—|–|none|n\/a)$/i;

export function parseManifestTable(skillMd: string): ManifestEntry[] | null {
  const lines = skillMd.split(/\r?\n/);
  const start = lines.findIndex((l) => /^#{1,6}\s*input manifest/i.test(l.trim()));
  if (start === -1) return null;

  const rows: ManifestEntry[] = [];
  let header: string[] | null = null;
  for (const line of lines.slice(start + 1)) {
    const t = line.trim();
    if (/^#{1,6}\s/.test(t)) break;
    if (!t.startsWith('|')) {
      if (header && rows.length) break;
      continue;
    }
    const cells = t.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
    if (!header) {
      header = cells.map((c) => c.toLowerCase());
      continue;
    }
    const get = (name: string): string | undefined => {
      const i = header!.indexOf(name);
      return i === -1 ? undefined : cells[i];
    };
    const key = (get('key') ?? cells[0] ?? '').replace(/`/g, '');
    if (!key) continue;
    const required = get('required');
    const fallback = get('fallback');
    rows.push({
      key,
      source: get('source') ?? null,
      required: required === undefined ? true : /^(yes|y|true|required)$/i.test(required),
      fallback: fallback === undefined || EMPTY_FALLBACK.test(fallback) ? null : fallback,
    });
  }
  return rows.length ? rows : null;
}

const ALIASES: Record<string, [string | null, string]> = {
  company_domain: ['company', 'primary_domain'],
  company_primary_domain: ['company', 'primary_domain'],
  company_name: ['company', 'company_name'],
  company_industry: ['company', 'industry'],
  company_employee_count: ['company', 'employee_count'],
  company_employees_on_linkedin: ['company', 'employee_count'],
  person_full_name: [null, 'full_name'],
  person_first_name: [null, 'first_name'],
};

export function isPresent(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim() !== '' && !/^(unknown|null|undefined|none)$/i.test(v.trim());
  if (typeof v === 'number') return Number.isFinite(v);
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.values(v).some(isPresent);
  return true;
}

export function lookup(key: string, fixture: Fixture, playConstants: Record<string, unknown>): unknown {
  const inputs = fixture.inputs as Record<string, unknown>;
  const company = fixture.company as Record<string, unknown>;
  const fixtureRecord = fixture as unknown as Record<string, unknown>;
  const candidates: unknown[] = [inputs?.[key], playConstants?.[key]];
  const alias = ALIASES[key];
  if (alias) candidates.push(alias[0] ? (fixtureRecord[alias[0]] as Record<string, unknown> | undefined)?.[alias[1]] : fixtureRecord[alias[1]]);
  if (key.startsWith('company_')) candidates.push(company?.[key.slice('company_'.length)]);
  if (key.startsWith('person_')) candidates.push(fixtureRecord[key.slice('person_'.length)]);
  return candidates.find(isPresent);
}

export function resolveInputs(manifest: ManifestEntry[] | null | undefined, fixture: Fixture, playConstants: Record<string, unknown>): ResolvedInputs {
  const values: Record<string, unknown> = {};
  const missingRequired: string[] = [];
  const usedFallback: string[] = [];
  for (const entry of manifest ?? []) {
    const v = lookup(entry.key, fixture, playConstants);
    if (isPresent(v)) values[entry.key] = v;
    else if (entry.required) missingRequired.push(entry.key);
    else if (entry.fallback !== null && entry.fallback !== undefined) {
      values[entry.key] = entry.fallback;
      usedFallback.push(entry.key);
    }
  }
  return { values, missingRequired, usedFallback };
}
