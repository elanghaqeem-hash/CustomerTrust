import { NextResponse } from 'next/server';
import { transaction } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function readyConfiguration():boolean {
  return Boolean(process.env.DATABASE_URL_APP && (process.env.TRAINLIVE_JWT_SECRET?.length ?? 0) >= 32);
}

// This endpoint is a readiness probe, not merely a check for env var presence.
// Do not disclose connection strings, SQL errors or user data to unauthenticated callers.
export async function GET() {
  const headers = {'Cache-Control':'no-store'};
  if (!readyConfiguration()) {
    return NextResponse.json({service:'trainlive', status:'setup_required', ready:false}, {status:503,headers});
  }
  try {
    const valid = await transaction(null, async db => {
      const result = await db.query<{ready:boolean}>(`
        SELECT (
          to_regclass('trainlive.class_session') IS NOT NULL
          AND to_regclass('trainlive.class_item') IS NOT NULL
          AND to_regclass('trainlive.participant') IS NOT NULL
          AND to_regprocedure('trainlive.claim_class()') IS NOT NULL
          AND to_regprocedure('trainlive.allow_join_attempt(text)') IS NOT NULL
        ) AS ready`
      );
      return result.rows[0]?.ready === true;
    });
    return NextResponse.json(
      {service:'trainlive',status:valid?'ready':'migration_required',ready:valid},
      {status:valid?200:503,headers}
    );
  } catch {
    return NextResponse.json({service:'trainlive',status:'unavailable',ready:false}, {status:503,headers});
  }
}
