// TypeScript port of the fetch_logo kit (skills/fetch-logo-README.md). Routes, in order:
//   1. the site's own app icon (<link rel="apple-touch-icon"> or any declared icon >= 96px, then /apple-touch-icon.png)
//   2. Google's favicon service at 256px
// Every file goes through the quality gate. No pass = no logo: the page hides the tile.
import crypto from 'node:crypto';
import net from 'node:net';
import sharp from 'sharp';
import { cachedLogo, cacheLogo } from './db.js';
import type { LogoResult } from './types.js';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128 Safari/537.36';
const HEADERS = {
  'User-Agent': UA,
  Accept: 'text/html,application/xhtml+xml,image/*,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};
export const MIN_SIDE = 96;
const MAX_BYTES = 2_000_000;
const EMBED_SIDE = 112; // shown at 56px, 2x for retina
const GOOGLE_FAVICON = (d: string) => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(d)}&sz=256`;
// sha256 of default icons website builders serve when the owner set none (extend as found)
const DEFAULT_ICON_HASHES = new Set<string>();

export function normalizeDomain(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const d = raw.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[/?#].*$/, '').replace(/^www\./, '');
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(d) ? d : null;
}

// The prospect's homepage decides which icon URLs we fetch, so refuse anything that is not a
// public hostname (IP literals, localhost, internal suffixes).
function isPublicUrl(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host)) return false;
  return !/(^localhost$|\.local$|\.internal$|\.localhost$)/i.test(host) && host.includes('.');
}

interface FetchedBytes {
  status: number;
  ctype: string;
  data: Buffer;
  finalUrl: string;
}

async function get(url: string, limit = MAX_BYTES + 1, timeoutMs = 15000): Promise<FetchedBytes> {
  let current = url;
  for (let hop = 0; hop < 6; hop++) {
    if (!isPublicUrl(current)) throw new Error('blocked url');
    const res = await fetch(current, { headers: HEADERS, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
    const loc = res.headers.get('location');
    if ([301, 302, 303, 307, 308].includes(res.status) && loc) {
      await res.body?.cancel();
      current = new URL(loc, current).toString();
      continue;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    if (res.body) {
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        const buf = Buffer.from(chunk);
        chunks.push(buf);
        size += buf.length;
        if (size >= limit) break;
      }
    }
    return { status: res.status, ctype: res.headers.get('content-type') || '', data: Buffer.concat(chunks), finalUrl: current };
  }
  throw new Error('too many redirects');
}

export function candidates(html: string, base: string): string[] {
  const out: [number, number, string][] = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = (tag.match(/rel=["']([^"']+)/i)?.[1] ?? '').toLowerCase();
    const href = tag.match(/href=["']([^"']+)/i)?.[1];
    if (!href || !rel.includes('icon')) continue;
    const sizes = tag.match(/sizes=["']([^"']+)/i)?.[1] ?? '';
    const side = Math.max(0, ...[...sizes.matchAll(/(\d+)x\d+/g)].map((m) => Number(m[1])));
    const rank = rel.includes('apple-touch-icon') ? 0 : side >= MIN_SIDE ? 1 : 9;
    if (rank < 9) {
      try {
        out.push([rank, -side, new URL(href.trim(), base).toString()]);
      } catch {
        /* bad href */
      }
    }
  }
  out.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const urls = out.map((x) => x[2]);
  urls.push(new URL('/apple-touch-icon.png', base).toString());
  return [...new Set(urls)];
}

// ICO containers: pull the largest embedded PNG (sharp cannot decode ICO itself).
function largestPngFromIco(buf: Buffer): Buffer | null {
  if (buf.length < 6 || buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1) return null;
  const count = buf.readUInt16LE(4);
  let best: { w: number; data: Buffer } | null = null;
  for (let i = 0; i < count; i++) {
    const o = 6 + i * 16;
    if (o + 16 > buf.length) break;
    const w = buf[o] || 256;
    const size = buf.readUInt32LE(o + 8);
    const offset = buf.readUInt32LE(o + 12);
    const data = buf.subarray(offset, offset + size);
    const isPng = data.length > 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    if (isPng && (!best || w > best.w)) best = { w, data };
  }
  return best?.data ?? null;
}

interface PixelStats {
  opaqueRatio: number;
  maxStd: number;
  hasTransparency: boolean;
}

async function pixelStats(buf: Buffer): Promise<PixelStats> {
  const { data, info } = await sharp(buf)
    .resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const n = info.width * info.height;
  const sum = [0, 0, 0, 0];
  const sq = [0, 0, 0, 0];
  let opaqueish = 0;
  let hasTransparency = false;
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 4; c++) {
      sum[c]! += data[i + c]!;
      sq[c]! += data[i + c]! * data[i + c]!;
    }
    if (data[i + 3]! > 16) opaqueish++;
    if (data[i + 3]! < 250) hasTransparency = true;
  }
  const maxStd = Math.max(...sum.map((s, c) => Math.sqrt(Math.max(0, sq[c]! / n - (s / n) ** 2))));
  return { opaqueRatio: opaqueish / n, maxStd, hasTransparency };
}

export interface ValidationInfo {
  format?: string;
  width?: number;
  height?: number;
  has_transparency?: boolean;
}

export type ValidationResult =
  | { ok: true; reason: string; info: ValidationInfo; image: Buffer }
  | { ok: false; reason: string; info?: ValidationInfo };

// Returns { ok, reason, info, image } where image is decodable bytes for sharp.
export async function validate(data: Buffer, ctype = ''): Promise<ValidationResult> {
  if (data.length > MAX_BYTES) return { ok: false, reason: 'too large' };
  if (DEFAULT_ICON_HASHES.has(crypto.createHash('sha256').update(data).digest('hex'))) {
    return { ok: false, reason: 'website-builder default icon' };
  }
  const head = data.subarray(0, 400).toString('latin1').trimStart().toLowerCase();
  if (head.includes('<svg') || ctype.startsWith('image/svg')) {
    if (!data.subarray(0, 4000).toString('latin1').toLowerCase().includes('<svg')) return { ok: false, reason: 'bad svg' };
    try {
      const stats = await pixelStats(data);
      return { ok: true, reason: 'svg', info: { format: 'svg', has_transparency: stats.hasTransparency }, image: data };
    } catch {
      return { ok: false, reason: 'bad svg' };
    }
  }

  let image = data;
  const fromIco = largestPngFromIco(data);
  if (fromIco) image = fromIco;
  let meta;
  try {
    meta = await sharp(image).metadata();
  } catch {
    return { ok: false, reason: 'not an image' };
  }
  const w = meta.width;
  const h = meta.height;
  if (!w || !h) return { ok: false, reason: 'not an image' };
  const info: ValidationInfo = { format: fromIco ? 'ico' : meta.format, width: w, height: h };
  if (Math.min(w, h) < MIN_SIDE) return { ok: false, reason: `too small (${w}x${h})`, info };
  if (w / h < 0.8 || w / h > 1.25) return { ok: false, reason: `not square (${w}x${h})`, info };

  const stats = await pixelStats(image);
  if (stats.opaqueRatio < 0.03) return { ok: false, reason: 'almost fully transparent', info };
  // blank = one flat colour AND flat transparency; a one-colour logo on transparency still varies in alpha
  if (stats.maxStd < 3) return { ok: false, reason: 'blank (one flat colour)', info };
  info.has_transparency = stats.hasTransparency;
  return { ok: true, reason: 'ok', info, image };
}

type TriedResult = (ValidationResult & { url: string }) | null;

async function tryUrl(url: string, tried: string[]): Promise<TriedResult> {
  let res: FetchedBytes;
  try {
    res = await get(url);
  } catch (e) {
    tried.push(`download failed (${e instanceof Error ? e.message : String(e)})`);
    return null;
  }
  if (res.status !== 200) {
    tried.push(`HTTP ${res.status}`);
    return null;
  }
  const v = await validate(res.data, res.ctype);
  if (!v.ok) {
    tried.push(v.reason);
    return null;
  }
  return { url, ...v };
}

async function toPng(image: Buffer): Promise<Buffer> {
  // Re-encoding also strips anything active an SVG might carry.
  return sharp(image, { density: 300 }).resize(EMBED_SIDE, EMBED_SIDE, { fit: 'inside' }).png().toBuffer();
}

interface FetchLogoResult {
  ok: boolean;
  source: string | null;
  reason?: string;
  info?: ValidationInfo;
  image?: Buffer;
}

export async function fetchLogo(domain: string): Promise<FetchLogoResult> {
  const tried: string[] = [];
  try {
    const home = await get(`https://${domain}/`, 3_000_000);
    const html = home.data.toString('utf8');
    for (const url of candidates(html, home.finalUrl)) {
      const hit = await tryUrl(url, tried);
      if (hit) return { ok: true, source: 'site_icon', info: hit.info, image: (hit as { ok: true; image: Buffer }).image };
    }
  } catch (e) {
    tried.push(`homepage failed (${e instanceof Error ? e.message : String(e)})`);
  }
  const hit = await tryUrl(GOOGLE_FAVICON(domain), tried);
  if (hit) return { ok: true, source: 'google_favicon', info: hit.info, image: (hit as { ok: true; image: Buffer }).image };
  return { ok: false, source: null, reason: tried.join('; ') || 'no icon found' };
}

// Cached: a found logo is reused 30 days, a miss is retried after 7.
export async function getLogo(rawDomain: unknown): Promise<LogoResult> {
  const domain = normalizeDomain(rawDomain);
  if (!domain) return { ok: false, reason: 'no valid domain' };
  const cached = await cachedLogo(domain);
  if (cached) {
    return cached.ok
      ? { ok: true, source: cached.source ?? '', dataUri: `data:image/png;base64,${cached.png!.toString('base64')}`, hasTransparency: Boolean(cached.has_transparency) }
      : { ok: false, reason: cached.reason ?? 'cached miss' };
  }
  const r = await fetchLogo(domain);
  if (!r.ok || !r.image) {
    await cacheLogo(domain, { ok: false, reason: r.reason ?? 'no icon found' });
    return { ok: false, reason: r.reason ?? 'no icon found' };
  }
  const png = await toPng(r.image);
  const hasTransparency = Boolean(r.info?.has_transparency);
  await cacheLogo(domain, { ok: true, png, hasTransparency, source: r.source, reason: r.reason ?? null });
  return { ok: true, source: r.source ?? '', dataUri: `data:image/png;base64,${png.toString('base64')}`, hasTransparency };
}
