// Executes recipe.skill_md for ONE fixture: the model writes the page CONTENT as typed blocks.
// The HTML shell (palette, logo tile, CTAs, carousel, footer) is rendered by code in render.ts,
// so the always-rules never depend on the model.
import { loadSkill, structured, S, type JsonSchema } from '../llm.js';
import { deepMapStrings, isUnknownLabel, noDashes, spellCode } from '../text.js';
import type { Payload, Fixture, ResolvedInputs, PageContent, ContentBlock } from '../types.js';

const block = (type: string, props: Record<string, JsonSchema>) => S.obj({ type: S.enm(type), ...props });

const BLOCKS: JsonSchema[] = [
  block('section', { heading: S.str, intro: S.nstr }),
  block('paragraph', { text: S.str }),
  block('stats', { items: S.arr(S.obj({ value: S.str, label: S.str })) }),
  block('bars', {
    heading: S.nstr,
    scale: S.enm('percent', 'relative'),
    items: S.arr(S.obj({ label: S.str, value: S.num, display: S.str })),
  }),
  block('cards', { items: S.arr(S.obj({ title: S.str, body: S.str })) }),
  block('list', { style: S.enm('bullet', 'check', 'number'), items: S.arr(S.str) }),
  block('table', { columns: S.arr(S.str), rows: S.arr(S.arr(S.str)) }),
  block('score', { label: S.str, value: S.num, max: S.num, verdict: S.str }),
  block('callout', { text: S.str }),
];

const SCHEMA = S.obj({
  missing_required_inputs: S.arr(S.str),
  page_title: S.str,
  topbar_label: S.str,
  headline: S.str,
  subheadline: S.str,
  blocks: S.arr({ anyOf: BLOCKS }),
  proof_heading: S.str,
  proofpoint_indexes: S.arr(S.int),
  fallback_claims: S.arr(S.obj({ title: S.str, body: S.str })),
  fallback_claims_source: S.nstr,
  closing_heading: S.str,
  closing_body: S.str,
  footer_note: S.str,
});

const SYSTEM = `You are the content engine of the Lead Magnet render service.
You execute ONE magnet recipe (recipe.skill_md) for ONE prospect and return the page CONTENT as JSON.
The service renders that content inside a fixed design shell. The shell already provides, and you must NOT write:
the palette (always the CLIENT's brand colours), the prospect logo tile, the sticky top bar with the "Book a call" button,
the case-study carousel cards, the closing "Book a call" button, and the prepared-by footer line.

How to treat the recipe:
- Follow its structure, logic, wording and selection rules for the page body.
- Skip recipe steps the service performs itself: brand or colour pulls, logo fetching, hosting, URL tokens, pre-send checks.
- The craft rules below win over the recipe whenever they conflict.

Content rules (hard):
1. Every number and every claim about the prospect must come from the provided data. You may round a value
   (38.63 to 38.6 or 39) but never compute, estimate or invent new figures, dates, rankings or facts.
2. If a REQUIRED input is missing or empty, list its key in missing_required_inputs and keep everything else minimal.
3. Never use em dashes or en dashes. Use commas, colons or the word "to".
4. Spell out every country code, industry code and abbreviation from the data (US becomes United States).
5. Drop any row or item whose label is unknown, empty or "Other" only when the recipe says so; always drop "unknown" rows
   silently. Never mention in the page text that rows were dropped, filtered or are unknown, and never use the word
   "unknown" anywhere: just present the clean data with no narration of how it was cleaned.
6. Grammar: 1 person, 2 people. Address the prospect by first name where the recipe does.
7. Refer to the booking contact only by name, never by a gendered pronoun. Never invent a link, name, title or URL.
8. No placeholders, no template syntax, no markdown, no HTML. Plain text in every string.

Blocks you can use (pick what the recipe's structure needs, in page order):
- section {heading, intro}: starts a titled section.
- paragraph {text}
- stats {items:[{value,label}]}: a row of fact tiles.
- bars {heading, scale, items:[{label,value,display}]}: a bar chart. scale "percent" means value is 0 to 100 and is the bar width;
  "relative" means bars are drawn against the largest value. display is the right-hand text, e.g. "107 (38.63%)".
- cards {items:[{title,body}]}: signal, insight or recommendation cards.
- list {style,items}
- table {columns,rows}
- score {label,value,max,verdict}
- callout {text}

Carousel (sits directly above the closing CTA):
- If proofpoints are provided, put the indexes of those to show in proofpoint_indexes, per the recipe's selection rule
  (empty array means show all of them). Leave fallback_claims empty.
- If no proofpoints are provided, fill fallback_claims ONLY with claims stated in the recipe, the magnet description or
  the client info, and name where they come from in fallback_claims_source. If there are none, leave it empty.
proof_heading is the carousel heading (e.g. "Why teams pick <client>").

Fields:
- page_title: the browser tab title. topbar_label: a short uppercase-style label shown above the prospect's company
  name in the top bar (e.g. "<Client> signal map prepared for"). headline / subheadline: the page header.
- closing_heading / closing_body: the closing CTA block copy, inviting a call with the booking contact.
- footer_note: one short line naming the data source of the page, from the recipe.

=== CRAFT RULES (service skill bundle) ===
${loadSkill('design-custom-lead-magnet.md')}`;

function userMessage({ payload, fixture, resolved }: { payload: Payload; fixture: Fixture; resolved: ResolvedInputs }): string {
  const { recipe, magnet, client, proofpoints } = payload;
  return [
    '# Recipe (recipe.skill_md)',
    recipe.skill_md,
    '',
    '# Play constants',
    JSON.stringify(recipe.play_constants ?? {}),
    '',
    '# Magnet',
    JSON.stringify({ name: magnet.name ?? null, promise: magnet.promise, description: magnet.description }),
    '',
    '# Client (the page is prepared BY this client)',
    JSON.stringify({ client_name: client.client_name, website: client.website, booking_poc_name: client.booking_poc_name ?? null }),
    '',
    '# Approved proofpoints (index: statement)',
    proofpoints.length ? proofpoints.map((p, i) => `${i}: [${p.kind ?? 'proof'}] ${p.statement}`).join('\n') : '(none)',
    '',
    '# Prospect',
    JSON.stringify({ first_name: fixture.first_name, full_name: fixture.full_name, company: fixture.company }),
    '',
    '# Resolved inputs (manifest key: value)',
    JSON.stringify(resolved.values),
    resolved.usedFallback.length ? `Fallback values used for: ${resolved.usedFallback.join(', ')}` : '',
    '',
    '# All raw inputs on the fixture',
    JSON.stringify(fixture.inputs ?? {}),
  ].join('\n');
}

function clean(content: PageContent): PageContent {
  const c = deepMapStrings(content, noDashes);
  c.blocks = c.blocks
    .map((b: ContentBlock): ContentBlock => {
      if (b.type === 'bars') {
        return { ...b, items: b.items.filter((i) => !isUnknownLabel(i.label) && Number.isFinite(i.value)).map((i) => ({ ...i, label: spellCode(i.label) })) };
      }
      if (b.type === 'table') {
        return { ...b, rows: b.rows.filter((r) => !isUnknownLabel(r[0])).map((r) => r.map(spellCode)) };
      }
      if (b.type === 'stats') return { ...b, items: b.items.filter((i) => !isUnknownLabel(i.value)) };
      return b;
    })
    .filter((b): boolean => {
      if ('items' in b && Array.isArray(b.items) && b.items.length === 0) return false;
      if (b.type === 'table' && b.rows.length === 0) return false;
      return true;
    });
  return c;
}

export async function writeContent({ payload, fixture, resolved }: { payload: Payload; fixture: Fixture; resolved: ResolvedInputs }): Promise<PageContent> {
  const raw = await structured<PageContent>({
    system: SYSTEM,
    user: userMessage({ payload, fixture, resolved }),
    name: 'magnet_page_content',
    schema: SCHEMA,
  });
  return clean(raw);
}
