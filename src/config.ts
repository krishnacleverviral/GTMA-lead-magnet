function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

const port = Number(process.env.PORT || 8080);

export const config = {
  port,
  host: process.env.HOST || '0.0.0.0',
  databaseUrl: required('DATABASE_URL'),
  serviceApiKey: required('SERVICE_API_KEY'),
  // RENDER_EXTERNAL_URL is set automatically by Render, so PUBLIC_BASE_URL is only needed for a custom domain.
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`).replace(/\/+$/, ''),
  openaiApiKey: required('OPENAI_API_KEY'),
  model: process.env.MAGNET_MODEL || 'gpt-5.5',
  reasoningEffort: process.env.MAGNET_REASONING_EFFORT ?? 'low',
};
