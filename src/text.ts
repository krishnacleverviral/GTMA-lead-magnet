const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

export function esc(s: unknown): string {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Design rule 5: no em or en dashes anywhere. Ranges become "to", asides become commas.
export function noDashes<T>(s: T): T {
  if (typeof s !== 'string') return s;
  return s
    .replace(/(\d)\s*[–—]\s*(\d)/g, '$1 to $2')
    .replace(/\s*[–—]\s*/g, ', ')
    .replace(/,\s*,/g, ',') as unknown as T;
}

export function countryName(code: unknown): string | null {
  if (typeof code !== 'string' || !/^[A-Z]{2}$/.test(code)) return null;
  try {
    const name = regionNames.of(code);
    return name && name !== code ? name : null;
  } catch {
    return null;
  }
}

// Data labels only: a bare ISO country code is spelled out. Prose is the model's job.
export function spellCode(label: string): string {
  return countryName(typeof label === 'string' ? label.trim() : label) ?? label;
}

export function isUnknownLabel(label: unknown): boolean {
  return typeof label === 'string' && /^(unknown|n\/a|none|null|undefined|-)?$/i.test(label.trim());
}

export function visibleText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export function deepMapStrings<T>(value: T, fn: (s: string) => string): T {
  if (typeof value === 'string') return fn(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => deepMapStrings(v, fn)) as unknown as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, deepMapStrings(v, fn)])) as unknown as T;
  }
  return value;
}
