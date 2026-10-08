// The design shell for every custom page (design rules 38-45). Layout and CSS follow the
// reference build (GTMA/magnet-test/build_custom_test.py) that passed 12/12 checks on real leads.
import { isHttpUrl } from '../contract.js';
import { esc } from '../text.js';
import type { Colors, ContentBlock, CtaInfo, Fixture, LogoResult, PageContent, Payload } from '../types.js';

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const NEUTRAL = { accent: '#334155', ink: '#111827', mut: '#64748b', line: '#e2e8f0', bg: '#f8fafc' };

type ClientLike = Payload['client'];

// Rule 1: palette = the CLIENT's brand_colors. Only the accent must come from the client;
// supporting tones fall back to neutrals so the page always renders.
export function palette(brandColors: Record<string, string> = {}): Colors {
  const pick = (k: string): string | null => (HEX.test(brandColors[k] ?? '') ? brandColors[k]! : null);
  const accent = pick('accent') ?? pick('primary');
  return {
    fromClient: Boolean(accent),
    accent: accent ?? NEUTRAL.accent,
    accent2: pick('accent2') ?? pick('secondary') ?? accent ?? NEUTRAL.accent,
    ink: pick('ink') ?? pick('text') ?? NEUTRAL.ink,
    mut: pick('mut') ?? pick('muted') ?? NEUTRAL.mut,
    line: pick('line') ?? pick('border') ?? NEUTRAL.line,
    bg: pick('bg') ?? pick('background') ?? NEUTRAL.bg,
  };
}

// Rule 3: booking link + POC from the card; missing -> client website and FLAG it. Never invent.
export function cta(client: ClientLike): CtaInfo | null {
  if (isHttpUrl(client.booking_url)) {
    return { href: client.booking_url, poc: client.booking_poc_name?.trim() || null, fallbackUsed: false };
  }
  if (isHttpUrl(client.website)) return { href: client.website, poc: client.booking_poc_name?.trim() || null, fallbackUsed: true };
  return null;
}

const CSS = `
body{margin:0;font-family:-apple-system,"Segoe UI",Roboto,sans-serif;background:var(--bg);color:var(--ink);line-height:1.5;padding-bottom:56px}
*{box-sizing:border-box}
.wrap{max-width:760px;margin:0 auto;padding:0 16px}
.topbar{position:sticky;top:0;background:#fff;border-bottom:1px solid var(--line);z-index:5}
.topin{max-width:760px;margin:0 auto;padding:10px 16px;display:flex;align-items:center;gap:12px}
.plogo{flex:none;width:56px;height:56px;border-radius:14px;background:#fff;border:1px solid var(--line);overflow:hidden;display:grid;place-items:center}
.plogo img{width:100%;height:100%;object-fit:cover;display:block}
.plogo.pad img{object-fit:contain;padding:7px}
.topname{min-width:0}
.topname b{display:block;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.topname span{display:block;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--a);font-weight:700}
.cta-btn{margin-left:auto;flex:none;background:var(--a);color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:9px 16px;border-radius:999px;white-space:nowrap}
.cta-btn:hover{background:var(--a2)}
header{padding:34px 0 18px}
h1{font-size:30px;margin:6px 0 4px;line-height:1.15}
.sub{color:var(--mut);margin:0}
h2{font-size:19px;margin:30px 0 12px;border-left:4px solid var(--a);padding-left:10px}
.intro{color:var(--mut);margin:-4px 0 12px}
p.para{margin:10px 0}
.facts{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0}
.fact{background:#fff;border:1px solid var(--line);border-radius:8px;padding:8px 14px;font-size:14px}
.fact b{display:block;font-size:16px}
.bars h3{font-size:15px;margin:18px 0 6px}
.row{display:grid;grid-template-columns:200px 1fr 120px;gap:10px;align-items:center;margin:7px 0;font-size:14px}
.lbl{text-align:right;color:var(--mut)}
.track{background:#e9eef3;border-radius:4px;height:14px}
.fill{background:linear-gradient(90deg,var(--a),var(--a2));height:14px;border-radius:4px;min-width:2px}
.val{white-space:nowrap}
.sig{background:#fff;border:1px solid var(--line);border-left:4px solid var(--a);border-radius:8px;padding:12px 16px;margin:10px 0}
.sig h4{margin:0 0 4px}
.sig p{margin:0;color:var(--mut);font-size:14px}
ul.lst,ol.lst{padding-left:22px;margin:10px 0}
ul.lst.check{list-style:none;padding-left:0}
ul.lst.check li::before{content:"\\2713";color:var(--a);font-weight:700;margin-right:8px}
.tbl{overflow-x:auto;margin:12px 0}
table{border-collapse:collapse;width:100%;background:#fff;font-size:14px}
th,td{border:1px solid var(--line);padding:8px 10px;text-align:left}
th{background:var(--bg);color:var(--mut);font-weight:600}
.score{background:#fff;border:1px solid var(--line);border-radius:10px;padding:16px;margin:12px 0}
.score .num{font-size:28px;font-weight:800;color:var(--a)}
.score .num span{font-size:15px;color:var(--mut);font-weight:600}
.score .track{margin:8px 0}
.callout{background:#fff;border:1px solid var(--line);border-top:4px solid var(--a);border-radius:10px;padding:14px 16px;margin:14px 0}
.carousel{display:flex;gap:12px;overflow-x:auto;padding:4px 0 10px;scroll-snap-type:x mandatory}
.ccard{min-width:230px;max-width:280px;scroll-snap-align:start;background:#fff;border:1px solid var(--line);border-top:4px solid var(--a);border-radius:10px;padding:14px 16px}
.ccard h4{margin:0 0 4px;font-size:15px}
.ccard p{margin:0;font-size:13px;color:var(--mut)}
.src{font-size:11px;color:var(--mut);margin:2px 0 0}
.cta{background:var(--ink);color:#fff;border-radius:12px;padding:26px 24px;margin-top:26px;text-align:center}
.cta h3{margin:0 0 6px;font-size:22px}
.cta p{margin:0 0 14px;color:#cbd5e1;font-size:14px}
.cta a{display:inline-block;background:var(--a);color:#fff;text-decoration:none;font-weight:700;padding:12px 26px;border-radius:999px}
footer{color:var(--mut);font-size:12px;margin-top:28px}
@media(max-width:560px){.row{grid-template-columns:1fr;gap:2px}.lbl{text-align:left}h1{font-size:24px}.topname span{display:none}.cta-btn{padding:8px 12px;font-size:13px}}
`;

function bars(b: Extract<ContentBlock, { type: 'bars' }>): string {
  const max = Math.max(...b.items.map((i) => i.value), 0) || 1;
  const rows = b.items.map((i) => {
    const width = b.scale === 'percent' ? i.value : (i.value / max) * 100;
    const w = Math.max(0, Math.min(100, width)).toFixed(2);
    return `<div class="row"><div class="lbl">${esc(i.label)}</div><div class="track"><div class="fill" style="width:${w}%"></div></div><div class="val">${esc(i.display)}</div></div>`;
  });
  return `<div class="bars">${b.heading ? `<h3>${esc(b.heading)}</h3>` : ''}${rows.join('')}</div>`;
}

function renderBlock(b: ContentBlock): string {
  switch (b.type) {
    case 'section':
      return `<h2>${esc(b.heading)}</h2>${b.intro ? `<p class="intro">${esc(b.intro)}</p>` : ''}`;
    case 'paragraph':
      return `<p class="para">${esc(b.text)}</p>`;
    case 'stats':
      return `<div class="facts">${b.items.map((i) => `<div class="fact"><b>${esc(i.value)}</b>${esc(i.label)}</div>`).join('')}</div>`;
    case 'bars':
      return bars(b);
    case 'cards':
      return b.items.map((i) => `<div class="sig"><h4>${esc(i.title)}</h4><p>${esc(i.body)}</p></div>`).join('');
    case 'list': {
      const tag = b.style === 'number' ? 'ol' : 'ul';
      return `<${tag} class="lst ${b.style}">${b.items.map((i) => `<li>${esc(i)}</li>`).join('')}</${tag}>`;
    }
    case 'table':
      return `<div class="tbl"><table><thead><tr>${b.columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${b.rows
        .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`)
        .join('')}</tbody></table></div>`;
    case 'score': {
      const pct = b.max > 0 ? Math.max(0, Math.min(100, (b.value / b.max) * 100)).toFixed(2) : '0';
      return `<div class="score"><div>${esc(b.label)}</div><div class="num">${esc(b.value)} <span>/ ${esc(b.max)}</span></div><div class="track"><div class="fill" style="width:${pct}%"></div></div><div>${esc(b.verdict)}</div></div>`;
    }
    case 'callout':
      return `<div class="callout">${esc(b.text)}</div>`;
    default:
      return '';
  }
}

export interface CarouselResult {
  cards: { title: string; body: string }[];
  source: string | null;
}

// Rule 4: carousel from approved proofpoints; none -> the recipe's labeled fallback claims.
export function carouselCards(content: PageContent, proofpoints: Payload['proofpoints']): CarouselResult {
  if (proofpoints.length) {
    const idx = content.proofpoint_indexes.filter((i) => Number.isInteger(i) && i >= 0 && i < proofpoints.length);
    const chosen = idx.length ? [...new Set(idx)].map((i) => proofpoints[i]!) : proofpoints;
    return {
      cards: chosen.map((p) => ({ title: kindTitle(p.kind), body: p.statement })),
      source: null,
    };
  }
  return { cards: content.fallback_claims, source: content.fallback_claims_source };
}

function kindTitle(kind: string | null | undefined): string {
  const k = (kind ?? '').replace(/_/g, ' ').trim();
  return k ? k[0]!.toUpperCase() + k.slice(1) : 'Proof';
}

export interface RenderPageArgs {
  content: PageContent;
  payload: Payload;
  fixture: Fixture;
  logo: LogoResult;
  colors: Colors;
  ctaInfo: CtaInfo;
}

export interface RenderPageResult {
  html: string;
  carouselCount: number;
}

export function renderPage({ content, payload, fixture, logo, colors, ctaInfo }: RenderPageArgs): RenderPageResult {
  const { client, proofpoints } = payload;
  const companyName = (fixture.company as Record<string, unknown>)?.company_name as string | undefined ?? '';
  const logoHtml = logo.ok
    ? `<span class="plogo${logo.hasTransparency ? ' pad' : ''}"><img src="${logo.dataUri}" alt="${esc(companyName)} logo" width="56" height="56"></span>`
    : '';
  const carousel = carouselCards(content, proofpoints);
  const carouselHtml = carousel.cards.length
    ? `<h2>${esc(content.proof_heading)}</h2><div class="carousel">${carousel.cards
        .map((c) => `<div class="ccard"><h4>${esc(c.title)}</h4><p>${esc(c.body)}</p></div>`)
        .join('')}</div>${carousel.source ? `<p class="src">Source: ${esc(carousel.source)}</p>` : ''}`
    : '';
  const closingLabel = ctaInfo.poc ? `Book a call with ${ctaInfo.poc}` : 'Book a call';
  const prepared = [fixture.full_name, companyName].filter(Boolean).join(', ');
  const website = isHttpUrl(client.website) ? new URL(client.website).hostname.replace(/^www\./, '') : null;

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer">
<title>${esc(content.page_title)}</title>
<style>:root{--a:${colors.accent};--a2:${colors.accent2};--ink:${colors.ink};--mut:${colors.mut};--line:${colors.line};--bg:${colors.bg}}${CSS}</style>
</head><body>
<div class="topbar"><div class="topin">${logoHtml}<div class="topname"><span>${esc(content.topbar_label)}</span><b>${esc(companyName)}</b></div><a class="cta-btn" href="${esc(ctaInfo.href)}" rel="noopener">Book a call &rarr;</a></div></div>
<div class="wrap">
<header><h1>${esc(content.headline)}</h1><p class="sub">${esc(content.subheadline)}</p></header>
${content.blocks.map(renderBlock).join('\n')}
${carouselHtml}
<div class="cta"><h3>${esc(content.closing_heading)}</h3><p>${esc(content.closing_body)}</p><a href="${esc(ctaInfo.href)}" rel="noopener">${esc(closingLabel)} &rarr;</a></div>
<footer>Prepared by ${esc(client.client_name)}${website ? ` &middot; ${esc(website)}` : ''} for ${esc(prepared)}. ${esc(content.footer_note)}</footer>
</div></body></html>`;
  return { html, carouselCount: carousel.cards.length };
}
