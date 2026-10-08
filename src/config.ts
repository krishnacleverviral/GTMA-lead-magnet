function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

const port = Number(process.env.PORT || 8080);

// RENDER_EXTERNAL_URL is set automatically by Render, so PUBLIC_BASE_URL only needs to be set
// explicitly for a custom domain. Logged at boot since a stray/stale PUBLIC_BASE_URL silently
// overrides it otherwise, and the only visible symptom is wrong URLs in build responses.
const publicBaseUrlSource = process.env.PUBLIC_BASE_URL ? 'PUBLIC_BASE_URL' : process.env.RENDER_EXTERNAL_URL ? 'RENDER_EXTERNAL_URL' : 'default';
const publicBaseUrl = (process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`).replace(/\/+$/, '');
console.log(`[config] publicBaseUrl = ${publicBaseUrl} (from ${publicBaseUrlSource})`);

export const config = {
  port,
  host: process.env.HOST || '0.0.0.0',
  databaseUrl: required('DATABASE_URL'),
  serviceApiKey: required('SERVICE_API_KEY'),
  publicBaseUrl,
  openaiApiKey: required('OPENAI_API_KEY'),
  model: process.env.MAGNET_MODEL || 'gpt-5.5',
  reasoningEffort: process.env.MAGNET_REASONING_EFFORT ?? 'low',
};
