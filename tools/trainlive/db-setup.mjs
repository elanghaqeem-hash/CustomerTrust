#!/usr/bin/env node
// TrainLive database setup runner (no psql required). Run from a trusted
// operator machine or CI job, never from the web app.
//
//   node tools/trainlive/db-setup.mjs status
//   node tools/trainlive/db-setup.mjs migrate [--baseline-through=012]
//   node tools/trainlive/db-setup.mjs runtime-role [--rotate]
//   node tools/trainlive/db-setup.mjs verify
//
// DATABASE_URL_ADMIN   migration-owner login, DIRECT (non-pooled) endpoint
// DATABASE_URL_APP     restricted runtime login (verify only)
// TRAINLIVE_APP_DB_PASSWORD  runtime-role password (runtime-role only, >=24 chars)
// TRAINLIVE_APP_DB_USER      runtime login name (default trainlive_web)
// TRAINLIVE_DB_SSL           verify-full | require | disable (see apps/trainlive/src/lib/db-config.ts)
// TRAINLIVE_DB_CA_CERT / TRAINLIVE_DB_CA_CERT_FILE  optional provider CA (PEM)
//
// Secrets are never printed. Applied migrations are tracked in
// trainlive_meta.schema_migration with a SHA-256 to detect edited files.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(here, '../../db/migrations');
const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const SSL_PARAMS = ['sslmode', 'ssl', 'sslcert', 'sslkey', 'sslrootcert', 'sslnegotiation', 'uselibpqcompat'];

function fail(msg) { console.error('ERROR:', msg); process.exit(1); }

function clientConfig(name) {
  const raw = process.env[name];
  if (!raw) fail(`${name} is required`);
  let url;
  try { url = new URL(raw); } catch { fail(`${name} is not a valid URL`); }
  for (const p of SSL_PARAMS) url.searchParams.delete(p);
  const explicit = process.env.TRAINLIVE_DB_SSL;
  if (explicit && !['verify-full', 'require', 'disable'].includes(explicit))
    fail('TRAINLIVE_DB_SSL must be verify-full, require or disable');
  const mode = explicit || (LOOPBACK.has(url.hostname.toLowerCase()) ? 'disable' : 'verify-full');
  const ca = process.env.TRAINLIVE_DB_CA_CERT?.trim().replace(/\\n/g, '\n') ||
    (process.env.TRAINLIVE_DB_CA_CERT_FILE ? fs.readFileSync(process.env.TRAINLIVE_DB_CA_CERT_FILE, 'utf8') : undefined);
  const ssl = mode === 'disable' ? false : mode === 'require' ? { rejectUnauthorized: false } : { rejectUnauthorized: true, ca };
  return { cfg: { connectionString: url.toString(), ssl, connectionTimeoutMillis: 10000, application_name: 'trainlive-db-setup' }, mode, host: url.hostname };
}

async function connect(name) {
  const { cfg, mode, host } = clientConfig(name);
  const db = new pg.Client(cfg);
  try { await db.connect(); }
  catch (e) { fail(`cannot connect with ${name} (host ${host}, tls ${mode}): ${e.code || e.message}`); }
  console.info(`connected ${name} host=${host} tls=${mode}`);
  return db;
}

function migrationFiles() {
  return fs.readdirSync(migrationsDir).filter(f => /^\d{3}_[a-z0-9_]+\.sql$/.test(f)).sort()
    .map(f => {
      const sql = fs.readFileSync(resolve(migrationsDir, f), 'utf8');
      return { file: f, num: f.slice(0, 3), sql, sha: crypto.createHash('sha256').update(sql).digest('hex') };
    });
}

async function ensureMeta(db) {
  await db.query(`CREATE SCHEMA IF NOT EXISTS trainlive_meta;
    REVOKE ALL ON SCHEMA trainlive_meta FROM PUBLIC;
    CREATE TABLE IF NOT EXISTS trainlive_meta.schema_migration(
      filename text PRIMARY KEY, sha256 text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now(), baseline boolean NOT NULL DEFAULT false)`);
  const rows = (await db.query('SELECT filename, sha256 FROM trainlive_meta.schema_migration')).rows;
  return new Map(rows.map(r => [r.filename, r.sha256]));
}

async function status(db) {
  const applied = await ensureMeta(db);
  let pending = 0;
  for (const m of migrationFiles()) {
    const sha = applied.get(m.file);
    const state = !sha ? 'PENDING' : sha === m.sha ? 'applied' : 'CHANGED-AFTER-APPLY';
    if (state !== 'applied') pending++;
    console.info(`${state.padEnd(20)} ${m.file}`);
  }
  return pending;
}

async function migrate(db, baselineThrough) {
  const applied = await ensureMeta(db);
  const files = migrationFiles();
  const core = (await db.query("SELECT to_regclass('trainlive.class_session') IS NOT NULL AS present")).rows[0].present;
  if (core && applied.size === 0 && !baselineThrough)
    fail('schema trainlive already exists but no tracking rows. If it was migrated manually, rerun with --baseline-through=NNN (last applied file number).');
  for (const m of files) {
    const sha = applied.get(m.file);
    if (sha) {
      if (sha !== m.sha) fail(`${m.file} changed after it was applied; create a new migration instead`);
      continue;
    }
    if (baselineThrough && m.num <= baselineThrough) {
      await db.query('INSERT INTO trainlive_meta.schema_migration(filename,sha256,baseline) VALUES($1,$2,true)', [m.file, m.sha]);
      console.info(`baseline ${m.file}`);
      continue;
    }
    // Each migration file owns its BEGIN/COMMIT; stop at the first error.
    try { await db.query(m.sql); }
    catch (e) { await db.query('ROLLBACK').catch(() => {}); fail(`${m.file} failed: ${e.message}`); }
    await db.query('INSERT INTO trainlive_meta.schema_migration(filename,sha256) VALUES($1,$2)', [m.file, m.sha]);
    console.info(`applied  ${m.file}`);
  }
  console.info('migrations up to date');
}

async function runtimeRole(db, rotate) {
  const user = process.env.TRAINLIVE_APP_DB_USER || 'trainlive_web';
  if (!/^[a-z_][a-z0-9_]{2,62}$/.test(user) || user === 'trainlive_app') fail('invalid TRAINLIVE_APP_DB_USER');
  const pw = process.env.TRAINLIVE_APP_DB_PASSWORD || '';
  if (pw.length < 24) fail('TRAINLIVE_APP_DB_PASSWORD must be set (>= 24 chars, e.g. openssl rand -hex 32)');
  const exists = (await db.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [user])).rowCount > 0;
  if (exists && !rotate) console.info(`role ${user} exists (use --rotate to reset its password)`);
  else {
    const sql = (await db.query(
      exists ? "SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L', $1::text, $2::text) AS s"
             : "SELECT format('CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS', $1::text, $2::text) AS s",
      [user, pw])).rows[0].s;
    await db.query(sql);
    console.info(`${exists ? 'rotated password for' : 'created'} role ${user}`);
  }
  await db.query(`GRANT trainlive_app TO ${pg.escapeIdentifier(user)}`);
  console.info(`granted trainlive_app to ${user}. Build DATABASE_URL_APP for this login privately; never commit it.`);
}

async function verify() {
  const db = await connect('DATABASE_URL_APP');
  try {
    await db.query('BEGIN');
    await db.query('SET LOCAL ROLE trainlive_app');
    const r = (await db.query('SELECT trainlive.production_preflight() AS r')).rows[0].r;
    await db.query('COMMIT');
    console.info(JSON.stringify(r));
    if (!r.ready) fail('preflight not ready (see flags above; DATABASE-DEPLOYMENT-PLAYBOOK.md explains each)');
    console.info('runtime connection verified: ready');
  } catch (e) {
    await db.query('ROLLBACK').catch(() => {});
    fail(`runtime verification failed: ${e.message}`);
  } finally { await db.end(); }
}

const [cmd, ...args] = process.argv.slice(2);
const baseline = args.find(a => a.startsWith('--baseline-through='))?.split('=')[1];
if (baseline && !/^\d{3}$/.test(baseline)) fail('--baseline-through expects a 3-digit migration number');
if (cmd === 'verify') await verify();
else if (['status', 'migrate', 'runtime-role'].includes(cmd)) {
  const db = await connect('DATABASE_URL_ADMIN');
  try {
    if (cmd === 'status') process.exitCode = (await status(db)) ? 2 : 0;
    else if (cmd === 'migrate') await migrate(db, baseline);
    else await runtimeRole(db, args.includes('--rotate'));
  } finally { await db.end(); }
} else {
  console.info('usage: db-setup.mjs status | migrate [--baseline-through=NNN] | runtime-role [--rotate] | verify');
  process.exit(cmd ? 1 : 0);
}
