import fs from 'node:fs';
import path from 'node:path';
import OpenAI from 'openai';
import { config } from './config.js';

const openai = new OpenAI({ apiKey: config.openaiApiKey, timeout: 120_000, maxRetries: 1 });

// skills/ is a static asset sibling of src/, not compiled TS, so it never lives under dist/.
// Resolved from the project root (process.cwd()), which every npm script here sets by running
// from the magnet_service/ directory, both in dev (tsx src/server.ts) and prod (node dist/src/server.js).
const skillsDir = path.join(process.cwd(), 'skills');
export const loadSkill = (name: string): string => fs.readFileSync(path.join(skillsDir, name), 'utf8');

// JSON Schema node shape, as built by the S.* helpers below. Loose on purpose: it describes a
// JSON Schema document, not the TypeScript type it produces (that's the caller's generic <T>).
export type JsonSchema = Record<string, unknown>;

export interface StructuredArgs {
  system: string;
  user: string;
  name: string;
  schema: JsonSchema;
}

export async function structured<T>({ system, user, name, schema }: StructuredArgs): Promise<T> {
  const res = await openai.chat.completions.create({
    model: config.model,
    ...(config.reasoningEffort ? { reasoning_effort: config.reasoningEffort as 'low' | 'medium' | 'high' } : {}),
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    response_format: { type: 'json_schema', json_schema: { name, strict: true, schema } },
  });
  const msg = res.choices[0]?.message;
  if (msg?.refusal) throw new Error(`model refused: ${msg.refusal}`);
  if (!msg?.content) throw new Error(`empty model response (finish_reason ${res.choices[0]?.finish_reason})`);
  return JSON.parse(msg.content) as T;
}

// Strict structured-output schema helpers: every property required, no extras.
export const S = {
  str: { type: 'string' } as JsonSchema,
  num: { type: 'number' } as JsonSchema,
  int: { type: 'integer' } as JsonSchema,
  bool: { type: 'boolean' } as JsonSchema,
  nstr: { type: ['string', 'null'] } as JsonSchema,
  nint: { type: ['integer', 'null'] } as JsonSchema,
  arr: (items: JsonSchema): JsonSchema => ({ type: 'array', items }),
  enm: (...values: string[]): JsonSchema => ({ type: 'string', enum: values }),
  obj: (properties: Record<string, JsonSchema>): JsonSchema => ({
    type: 'object',
    additionalProperties: false,
    properties,
    required: Object.keys(properties),
  }),
};
