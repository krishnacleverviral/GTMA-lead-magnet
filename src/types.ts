import type { z } from 'zod';
import type { BuildPayload } from './contract.js';

export type Payload = z.infer<typeof BuildPayload>;
export type Fixture = Payload['fixtures'][number];
export type Endpoint = 'build-previews' | 'produce';

export interface ManifestEntry {
  key: string;
  source?: string | null;
  required: boolean;
  fallback?: unknown;
}

export interface ResolvedInputs {
  values: Record<string, unknown>;
  missingRequired: string[];
  usedFallback: string[];
}

export interface Colors {
  fromClient: boolean;
  accent: string;
  accent2: string;
  ink: string;
  mut: string;
  line: string;
  bg: string;
}

export interface CtaInfo {
  href: string;
  poc: string | null;
  fallbackUsed: boolean;
}

export type LogoResult =
  | { ok: true; source: string; dataUri: string; hasTransparency: boolean }
  | { ok: false; reason: string; source?: null };

export type ContentBlock =
  | { type: 'section'; heading: string; intro: string | null }
  | { type: 'paragraph'; text: string }
  | { type: 'stats'; items: { value: string; label: string }[] }
  | { type: 'bars'; heading: string | null; scale: 'percent' | 'relative'; items: { label: string; value: number; display: string }[] }
  | { type: 'cards'; items: { title: string; body: string }[] }
  | { type: 'list'; style: 'bullet' | 'check' | 'number'; items: string[] }
  | { type: 'table'; columns: string[]; rows: string[][] }
  | { type: 'score'; label: string; value: number; max: number; verdict: string }
  | { type: 'callout'; text: string };

export interface PageContent {
  missing_required_inputs: string[];
  page_title: string;
  topbar_label: string;
  headline: string;
  subheadline: string;
  blocks: ContentBlock[];
  proof_heading: string;
  proofpoint_indexes: number[];
  fallback_claims: { title: string; body: string }[];
  fallback_claims_source: string | null;
  closing_heading: string;
  closing_body: string;
  footer_note: string;
}

export interface ExternalRequestSpec {
  missing_required_inputs: string[];
  method: 'GET' | 'POST' | 'PUT' | 'PATCH';
  path: string;
  query: { name: string; value: string }[];
  headers: { name: string; value: string }[];
  body_json: string | null;
  auth_location: 'header' | 'query' | 'bearer';
  auth_name: string;
  test_mode_applied: boolean;
  response_url_field: string;
  response_required_fields: { path: string; array_length: number | null }[];
  url_suffix: string | null;
}

export interface ExternalCallResult {
  status: 'produced' | 'failed';
  url: string | null;
  checks: Record<string, boolean>;
  notes: string[];
  failure_reason: string | null;
  artifactMayExist: boolean;
  authFailed: boolean;
}

export interface FixtureResult {
  person_id: string;
  lead_list_id: string | null;
  status: 'produced' | 'failed';
  url: string | null;
  latency_ms: number;
  checks: Record<string, boolean>;
  failure_reason: string | null;
  notes: string[];
  cached?: boolean;
}

export interface BuildResponse {
  lead_magnet_id: string;
  runtime_id: string | null;
  runtime_version: number | null;
  results: FixtureResult[];
}

export interface StoredResult {
  dedupeKey: string;
  endpoint: Endpoint;
  kind: 'custom' | 'external';
  leadMagnetId: string;
  runtimeId: string | null;
  runtimeVersion: number | null;
  gtmPlayId: string | null;
  personId: string;
  replyId: string | null;
  status: 'produced' | 'failed';
  token: string | null;
  url: string | null;
  html: string | null;
  result: FixtureResult;
}
