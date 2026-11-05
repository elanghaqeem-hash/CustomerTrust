import { NextResponse } from 'next/server';
import { transaction } from '@/lib/db';
import { staffOIDCConfig } from '@/lib/staff-oidc';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function readyConfiguration():boolean {
  return Boolean(process.env.DATABASE_URL_APP && (process.env.TRAINLIVE_JWT_SECRET?.length ?? 0) >= 32 &&
    (process.env.VERCEL_ENV!=='production' || staffOIDCConfig()));
}

// This endpoint is a readiness probe, not merely a check for env var presence.
// Do not disclose connection strings, SQL errors or user data to unauthenticated callers.
export async function GET() {
  const headers = {'Cache-Control':'no-store'};
  if (!readyConfiguration()) {
    return NextResponse.json({service:'trainlive', status:'setup_required', ready:false}, {status:503,headers});
  }
  try {
    const checks = await transaction(null, async db => {
      const result = await db.query<{
        result:{ready:boolean;runtime_role_ok:boolean;rls_ok:boolean;seed_ok:boolean;schema_ok:boolean};
        multiclass_limiter_ready:boolean
      }>(`SELECT trainlive.production_preflight() AS result,
                to_regprocedure('trainlive.allow_join_attempt(text,text)') IS NOT NULL
                  AS multiclass_limiter_ready`);
      const row=result.rows[0];
      if(!row)return undefined;
      return {
        ...row.result,
        ready:row.result.ready&&row.multiclass_limiter_ready,
        schema_ok:row.result.schema_ok&&row.multiclass_limiter_ready
      };
    });
    // Do not expose role names, SQL errors, database URLs or participant data.
    const status=checks?.ready?'ready':
      !checks?.runtime_role_ok?'unsafe_runtime_role':
      !checks?.rls_ok?'rls_required':
      !checks?.seed_ok?'seed_required':'migration_required';
    return NextResponse.json({service:'trainlive',status,ready:status==='ready'},
      {status:status==='ready'?200:503,headers});
  } catch {
    return NextResponse.json({service:'trainlive',status:'unavailable',ready:false}, {status:503,headers});
  }
}
