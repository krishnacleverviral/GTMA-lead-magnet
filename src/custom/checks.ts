// Mechanical checks for a custom page. Booleans: true = pass, except cta_fallback_used,
// which is a flag (true = the booking link was missing and the client website was used).
import { countryName, esc, visibleText } from '../text.js';
import type { Colors, CtaInfo, Fixture, LogoResult, PageContent, Payload, ResolvedInputs } from '../types.js';

const NUM = /\d[\d,]*(?:\.\d+)?/g;

function collectNumbers(value: unknown, out: Set<number> = new Set()): Set<number> {
  if (typeof value === 'number' && Number.isFinite(value)) out.add(value);
  else if (typeof value === 'string') for (const m of value.match(NUM) ?? []) out.add(Number(m.replace(/,/g, '')));
  else if (Array.isArray(value)) value.forEach((v) => collectNumbers(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => collectNumbers(v, out));
  return out;
}

function decimals(n: number): number {
  const s = String(n);
  return s.includes('.') ? s.split('.')[1]!.length : 0;
}

// Rule 6: every number on the page traces to a payload value (rounding allowed, new figures not).
export function untracedNumbers(content: unknown, sources: unknown): number[] {
  const known = [...collectNumbers(sources)];
  const used = collectNumbers(content);
  return [...used].filter((n) => {
    const d = decimals(n);
    return !known.some((p) => p === n || Number(p.toFixed(d)) === n);
  });
}

export function placeholderHits(text: string): string[] {
  const patterns = [/\{\{|\}\}|\{%|%\}/, /\bundefined\b/, /\bNaN\b/, /\[object Object\]/, /\bnull\b/, / None /, /<[a-z_][a-z0-9_ ]{0,30}>/i, /\b(TODO|TBD|lorem ipsum)\b/i];
  return patterns.filter((p) => p.test(text)).map(String);
}

function dataLabels(content: PageContent): unknown[] {
  const labels: unknown[] = [];
  for (const b of content.blocks) {
    if (b.type === 'bars') labels.push(...b.items.map((i) => i.label));
    if (b.type === 'table') labels.push(...b.rows.flat());
    if (b.type === 'stats') labels.push(...b.items.map((i) => i.value));
  }
  return labels;
}

export interface RunChecksArgs {
  html: string;
  content: PageContent;
  payload: Payload;
  fixture: Fixture;
  resolved: ResolvedInputs;
  logo: LogoResult;
  colors: Colors;
  ctaInfo: CtaInfo;
  carouselCount: number;
}

export interface RunChecksResult {
  checks: Record<string, boolean>;
  notes: string[];
  untraced: number[];
}

export function runCustomChecks({ html, content, payload, fixture, resolved, logo, colors, ctaInfo, carouselCount }: RunChecksArgs): RunChecksResult {
  const text = visibleText(html);
  const companyName = (fixture.company as Record<string, unknown>)?.company_name as string | undefined ?? '';
  const notes: string[] = [];

  const untraced = untracedNumbers(content, {
    fixture,
    client: payload.client,
    play_constants: payload.recipe.play_constants,
    proofpoints: payload.proofpoints,
    magnet: { promise: payload.magnet.promise, description: payload.magnet.description },
    skill_md: payload.recipe.skill_md,
  });
  if (untraced.length) notes.push(`numbers not found in the payload: ${untraced.join(', ')}`);

  const placeholders = placeholderHits(text);
  if (placeholders.length) notes.push(`placeholder-like text: ${placeholders.join(' ')}`);

  const rawCodes = dataLabels(content).filter((l) => countryName(String(l).trim()));
  if (rawCodes.length) notes.push(`raw codes in data labels: ${rawCodes.join(', ')}`);

  const hrefCount = html.split(`href="${esc(ctaInfo.href)}"`).length - 1;
  const hasLogoTile = html.includes('class="plogo');

  const checks: Record<string, boolean> = {
    inputs_present: resolved.missingRequired.length === 0,
    no_placeholders: placeholders.length === 0,
    prospect_named: Boolean(companyName) && text.includes(companyName) && (!fixture.first_name || text.includes(fixture.first_name)),
    client_named: text.includes(payload.client.client_name),
    client_brand_colors: colors.fromClient && html.includes(colors.accent),
    logo_gate_respected: logo.ok ? hasLogoTile : !hasLogoTile,
    no_em_dashes: !/[–—]/.test(text),
    cta_top_and_bottom: hrefCount >= 2 && (text.match(/Book a call/g) ?? []).length >= 2,
    poc_named_in_cta: Boolean(ctaInfo.poc) && text.includes(`Book a call with ${ctaInfo.poc}`),
    cta_fallback_used: ctaInfo.fallbackUsed,
    carousel_present: carouselCount > 0,
    no_unknown_text: !/\bunknown\b/i.test(text),
    codes_spelled_out: rawCodes.length === 0,
    numbers_traceable: untraced.length === 0,
    noindex: /<meta name="robots" content="noindex/.test(html),
  };

  if (!checks.client_brand_colors) notes.push('client.brand_colors has no valid accent hex; neutral palette used');
  if (!checks.poc_named_in_cta) notes.push('client.booking_poc_name missing; closing CTA has no contact name');
  if (ctaInfo.fallbackUsed) notes.push('client.booking_url missing or invalid; CTA links to client.website');
  if (!checks.carousel_present) notes.push('no approved proofpoints and no fallback claims in the recipe; carousel omitted');
  if (!logo.ok) notes.push(`no prospect logo (${logo.reason}); tile hidden`);
  return { checks, notes, untraced };
}
