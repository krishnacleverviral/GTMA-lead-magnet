import crypto from 'node:crypto';
import net from 'node:net';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { config } from './config.js';
import { BuildPayload } from './contract.js';
import { ensureSchema, pageByToken, sql } from './db.js';
import { runBuild } from './build.js';
import type { BuildResponse, Endpoint } from './types.js';

// Node's default 250ms per-address connect window is shorter than the ~300ms round trip to Neon us-east-2.
net.setDefaultAutoSelectFamilyAttemptTimeout(2000);

const app = Fastify({
  bodyLimit: 5 * 1024 * 1024,
  logger: { redact: ['req.headers.authorization'] },
});

const keyBuf = Buffer.from(config.serviceApiKey);
function authorized(header: unknown): boolean {
  const given = Buffer.from(String(header ?? '').replace(/^Bearer\s+/i, ''));
  return given.length === keyBuf.length && crypto.timingSafeEqual(given, keyBuf);
}

const sign = (body: string): string => `sha256=${crypto.createHmac('sha256', config.serviceApiKey).update(body).digest('hex')}`;

async function postCallback(url: string, response: BuildResponse, log: FastifyRequest['log']): Promise<void> {
  const body = JSON.stringify(response);
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Magnet-Signature': sign(body) },
        body,
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) return;
      log.warn({ status: res.status }, 'callback rejected');
    } catch (e) {
      log.warn({ err: e instanceof Error ? e.message : String(e) }, 'callback failed');
    }
    await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
  }
  log.error('callback gave up after 4 attempts');
}

function buildRoute(endpoint: Endpoint) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!authorized(req.headers.authorization)) return reply.code(401).send({ error: 'unauthorized' });
    const parsed = BuildPayload.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid payload', issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
    }
    const payload = parsed.data;
    if (endpoint === 'produce' && payload.fixtures.length !== 1) {
      return reply.code(400).send({ error: 'produce takes exactly one fixture' });
    }
    if (payload.callback_url) {
      runBuild(payload, endpoint)
        .then((res) => postCallback(payload.callback_url!, res, req.log))
        .catch((e: Error) => req.log.error({ err: e.message }, 'async build failed'));
      return reply.code(202).send({ accepted: true, lead_magnet_id: payload.lead_magnet_id, runtime_id: payload.runtime_id ?? null });
    }
    return runBuild(payload, endpoint);
  };
}

app.post('/magnet/build-previews', buildRoute('build-previews'));
app.post('/magnet/produce', buildRoute('produce'));

app.get('/health', async () => {
  await sql`select 1`;
  return { ok: true };
});

// Hosted pages: {hosted_base_url}/{token}. Unguessable token, noindex, no scripts allowed.
app.get('/:token', async (req: FastifyRequest<{ Params: { token: string } }>, reply: FastifyReply) => {
  const { token } = req.params;
  const html = /^[A-Za-z0-9_-]{22}$/.test(token) ? await pageByToken(token) : null;
  reply.header('X-Robots-Tag', 'noindex, nofollow').header('Referrer-Policy', 'no-referrer');
  if (!html) return reply.code(404).type('text/plain').send('Not found');
  return reply
    .header('Content-Security-Policy', "default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'")
    .header('X-Content-Type-Options', 'nosniff')
    .header('Cache-Control', 'private, max-age=300')
    .type('text/html; charset=utf-8')
    .send(html);
});

await ensureSchema();
await app.listen({ port: config.port, host: config.host });
