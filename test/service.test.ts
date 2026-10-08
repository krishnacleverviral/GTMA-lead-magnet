import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import type { PageContent, LogoResult } from '../src/types.js';

// logo.ts pulls in db.ts -> config.ts; the postgres client is lazy, so dummy values are enough.
process.env.DATABASE_URL ||= 'postgres://u:p@localhost:5432/x';
process.env.SERVICE_API_KEY ||= 'test';
process.env.OPENAI_API_KEY ||= 'test';

const { parseManifestTable, resolveInputs } = await import('../src/manifest.js');
const { noDashes, spellCode } = await import('../src/text.js');
const { untracedNumbers, runCustomChecks } = await import('../src/custom/checks.js');
const { renderPage, palette, cta } = await import('../src/custom/render.js');
const { validate, candidates, normalizeDomain } = await import('../src/logo.js');
const { BuildPayload } = await import('../src/contract.js');

const kit = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'magnet_service_dev_kit');
const recipe = fs.readFileSync(path.join(kit, 'example-recipe-custom.md'), 'utf8');
const sample = JSON.parse(fs.readFileSync(path.join(kit, 'sample-payload-build-previews.json'), 'utf8'));
sample.recipe.skill_md = recipe;
const payload = BuildPayload.parse({ ...sample, idempotency_key: 'k' });
const fixture = payload.fixtures[0]!;

test('manifest is parsed from the recipe table', () => {
  const m = parseManifestTable(recipe)!;
  assert.deepEqual(m.map((e) => e.key), [
    'company_domain', 'company_name', 'company_industry', 'company_employee_count',
    'company_dept_distribution', 'company_country_distribution', 'person_full_name',
  ]);
  assert.ok(m.every((e) => e.required && e.fallback === null));
});

test('inputs resolve from fixture inputs and company facts; a missing required one is reported', () => {
  const m = parseManifestTable(recipe)!;
  const ok = resolveInputs(m, fixture, {});
  assert.deepEqual(ok.missingRequired, []);
  assert.equal(ok.values.company_domain, 'datastax.com');
  assert.equal(ok.values.company_employee_count, 375);

  const broken = { ...fixture, inputs: { ...fixture.inputs, company_dept_distribution: { distribution: [] } } };
  assert.deepEqual(resolveInputs(m, broken, {}).missingRequired, ['company_dept_distribution']);
});

test('optional inputs use the manifest fallback', () => {
  const r = resolveInputs([{ key: 'title_choice', required: false, fallback: '1' }], fixture, {});
  assert.deepEqual(r.values, { title_choice: '1' });
  assert.deepEqual(r.usedFallback, ['title_choice']);
});

test('dashes are removed and codes spelled out', () => {
  assert.equal(noDashes('Growth — fast'), 'Growth, fast');
  assert.equal(noDashes('10–20 people'), '10 to 20 people');
  assert.equal(spellCode('GB'), 'United Kingdom');
  assert.equal(spellCode('Engineering'), 'Engineering');
});

test('numbers must trace to payload values (rounding allowed)', () => {
  const sources = { fixture };
  assert.deepEqual(untracedNumbers({ t: 'IT is 38.6% (107 people) of 277' }, sources), []);
  assert.deepEqual(untracedNumbers({ t: 'grew 999 roles' }, sources), [999]);
});

const content: PageContent = {
  missing_required_inputs: [],
  page_title: 'Signal map for DataStax',
  topbar_label: 'Data Magnet signal map prepared for',
  headline: 'Prepared for Ryan at DataStax',
  subheadline: 'People-growth signals worth tracking at DataStax.',
  blocks: [
    { type: 'stats', items: [{ value: '375', label: 'people on LinkedIn' }] },
    { type: 'section', heading: 'By country', intro: null },
    { type: 'bars', heading: null, scale: 'percent', items: [{ label: 'United States', value: 61.01, display: '169 (61.01%)' }] },
    { type: 'cards', items: [{ title: 'Net adds in Information Technology', body: '107 people, 38.63%.' }] },
  ],
  proof_heading: 'Why teams pick Data Magnet',
  proofpoint_indexes: [],
  fallback_claims: [{ title: 'Real-time', body: 'Profiles fetched live.' }],
  fallback_claims_source: 'datamagnet.co',
  closing_heading: 'Want this map live?',
  closing_body: 'Book time with Mayank.',
  footer_note: 'Data: live LinkedIn headcount snapshot.',
};

function renderAndCheck({
  client = payload.client,
  logo = { ok: false, reason: 'test' } as LogoResult,
  c = content,
}: { client?: typeof payload.client; logo?: LogoResult; c?: PageContent } = {}) {
  const p = { ...payload, client };
  const colors = palette(client.brand_colors);
  const ctaInfo = cta(client)!;
  const resolved = resolveInputs(parseManifestTable(recipe), fixture, {});
  const { html, carouselCount } = renderPage({ content: c, payload: p, fixture, logo, colors, ctaInfo });
  return { html, ...runCustomChecks({ html, content: c, payload: p, fixture, resolved, logo, colors, ctaInfo, carouselCount }) };
}

test('a well-formed page passes every always-rule check', () => {
  const { checks, notes, html } = renderAndCheck();
  const failing = Object.entries(checks).filter(([k, v]) => (k === 'cta_fallback_used' ? v : !v));
  assert.deepEqual(failing, [], notes.join('\n'));
  assert.ok(html.includes('#16a34a'));
  assert.ok(!html.includes('class="plogo'), 'no logo -> tile hidden');
});

test('a passing logo is shown in the tile', () => {
  const { checks, html } = renderAndCheck({ logo: { ok: true, source: 'site_icon', dataUri: 'data:image/png;base64,AAAA', hasTransparency: true } });
  assert.ok(html.includes('class="plogo pad"'));
  assert.equal(checks.logo_gate_respected, true);
});

test('missing booking link falls back to the client website and is flagged', () => {
  const { checks } = renderAndCheck({ client: { ...payload.client, booking_url: null, booking_poc_name: null } });
  assert.equal(checks.cta_fallback_used, true);
  assert.equal(checks.poc_named_in_cta, false);
  assert.equal(checks.cta_top_and_bottom, true);
});

test('invented numbers and raw codes are caught', () => {
  const bad: PageContent = {
    ...content,
    blocks: [
      { type: 'bars', heading: null, scale: 'relative', items: [{ label: 'GB', value: 23, display: '23' }] },
      { type: 'paragraph', text: 'They will hire 4321 people.' },
    ],
  };
  const { checks } = renderAndCheck({ c: bad });
  assert.equal(checks.codes_spelled_out, false);
  assert.equal(checks.numbers_traceable, false);
});

test('model text is escaped, never injected as HTML', () => {
  const evil: PageContent = { ...content, headline: '<script>alert(1)</script>' };
  const { html } = renderAndCheck({ c: evil });
  assert.ok(!html.includes('<script>'));
});

const png = (w: number, h: number, flat = false): Promise<Buffer> =>
  sharp({ create: { width: w, height: h, channels: 4, background: { r: 20, g: 120, b: 60, alpha: 1 } } })
    .composite(flat ? [] : [{ input: Buffer.from(`<svg width="${w}" height="${h}"><circle cx="${w / 2}" cy="${h / 2}" r="${w / 4}" fill="white"/></svg>`), top: 0, left: 0 }])
    .png()
    .toBuffer();

test('logo quality gate', async () => {
  assert.equal((await validate(await png(128, 128))).ok, true);
  const tooSmall = await validate(await png(48, 48));
  assert.match(tooSmall.ok ? '' : tooSmall.reason, /too small/);
  const notSquare = await validate(await png(200, 100));
  assert.match(notSquare.ok ? '' : notSquare.reason, /not square/);
  const blank = await validate(await png(128, 128, true));
  assert.match(blank.ok ? '' : blank.reason, /blank/);
  const notImage = await validate(Buffer.from('<html>nope</html>'));
  assert.equal(notImage.ok ? '' : notImage.reason, 'not an image');
});

test('icon candidates prefer apple-touch-icon, then large icons, then the root fallback', () => {
  const html = '<link rel="icon" href="/fav16.png" sizes="16x16"><link rel="icon" href="/big.png" sizes="192x192"><link rel="apple-touch-icon" href="/apple.png">';
  assert.deepEqual(candidates(html, 'https://acme.com/'), ['https://acme.com/apple.png', 'https://acme.com/big.png', 'https://acme.com/apple-touch-icon.png']);
  assert.equal(normalizeDomain('https://www.Acme.com/about'), 'acme.com');
  assert.equal(normalizeDomain('localhost'), null);
});
