import { spawnSync } from 'node:child_process';

function normalizeSupabaseBase(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('SUPABASE_URL must be a valid absolute URL');
  }
  if (url.protocol !== 'https:') throw new Error('SUPABASE_URL must use https');
  url.search = '';
  url.hash = '';
  url.pathname = url.pathname
    .replace(/\/(?:rest|auth)\/v1\/?$/i, '')
    .replace(/\/+$/, '');
  return url.toString().replace(/\/+$/, '');
}

const env = { ...process.env };
env.SUPABASE_URL = normalizeSupabaseBase(env.SUPABASE_URL);
if (env.SUPABASE_URL) {
  console.log(`Render build: normalized Supabase base host ${new URL(env.SUPABASE_URL).host}`);
}

const result = spawnSync('bash', ['scripts/render-build.sh'], {
  stdio: 'inherit',
  env,
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
