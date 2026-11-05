import { readFileSync } from 'node:fs';
import type { PoolConfig } from 'pg';

// Server-only PostgreSQL connection settings for the restricted runtime login.
//
// TRAINLIVE_DB_SSL controls transport security explicitly; sslmode/ssl* query
// parameters in DATABASE_URL_APP are stripped because node-postgres lets the
// parsed URL silently override an explicit `ssl` option.
//   verify-full (default for non-loopback hosts): TLS + CA + hostname check
//   require: TLS without certificate verification (avoid; temporary only)
//   disable: plaintext; ONLY for a private network (e.g. Hostinger compose `db`)
// Loopback hosts (localhost/127.0.0.1/::1) default to `disable` for local dev/CI.
// TRAINLIVE_DB_CA_CERT may hold a PEM bundle, or TRAINLIVE_DB_CA_CERT_FILE a path,
// when the provider's CA is not in the system trust store.

export type SslMode = 'verify-full' | 'require' | 'disable';
const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const SSL_PARAMS = ['sslmode', 'ssl', 'sslcert', 'sslkey', 'sslrootcert', 'sslnegotiation', 'uselibpqcompat'];

function intEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${name} must be an integer ${min}-${max}`);
  return n;
}

export function resolveSslMode(host: string, explicit = process.env.TRAINLIVE_DB_SSL): SslMode {
  if (explicit) {
    if (explicit !== 'verify-full' && explicit !== 'require' && explicit !== 'disable')
      throw new Error('TRAINLIVE_DB_SSL must be verify-full, require or disable');
    return explicit;
  }
  return LOOPBACK.has(host.toLowerCase()) ? 'disable' : 'verify-full';
}

function caBundle(): string | undefined {
  const inline = process.env.TRAINLIVE_DB_CA_CERT?.trim();
  if (inline) return inline.replace(/\\n/g, '\n');
  const file = process.env.TRAINLIVE_DB_CA_CERT_FILE;
  return file ? readFileSync(file, 'utf8') : undefined;
}

export function runtimePoolConfig(connectionString = process.env.DATABASE_URL_APP): PoolConfig {
  if (!connectionString) throw new Error('DATABASE_URL_APP is not configured');
  let url: URL;
  try { url = new URL(connectionString); } catch { throw new Error('DATABASE_URL_APP is not a valid URL'); }
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:')
    throw new Error('DATABASE_URL_APP must use the postgresql:// scheme');
  for (const p of SSL_PARAMS) url.searchParams.delete(p);

  const mode = resolveSslMode(url.hostname);
  const ssl = mode === 'disable' ? false
    : mode === 'require' ? { rejectUnauthorized: false }
    : { rejectUnauthorized: true, ca: caBundle() };

  // Serverless functions each hold their own pool: keep it small so many
  // concurrent instances do not exhaust the database's connection limit.
  // Use the provider's pooled (PgBouncer transaction-mode) endpoint on Vercel;
  // SET LOCAL ROLE and set_config(...,true) are transaction-scoped and safe there.
  const serverless = Boolean(process.env.VERCEL);
  return {
    connectionString: url.toString(),
    ssl,
    max: intEnv('TRAINLIVE_DB_POOL_MAX', serverless ? 3 : 10, 1, 50),
    idleTimeoutMillis: serverless ? 10000 : 30000,
    connectionTimeoutMillis: intEnv('TRAINLIVE_DB_CONNECT_TIMEOUT_MS', 5000, 500, 30000),
    statement_timeout: 8000,
    query_timeout: 10000,
    application_name: 'trainlive-web',
  };
}
