import { NextResponse } from 'next/server';
export const runtime='nodejs';
export async function GET() {
 const configured=Boolean(process.env.DATABASE_URL_APP&&process.env.TRAINLIVE_JWT_SECRET);
 return NextResponse.json({service:'trainlive',status:configured?'configured':'setup_required',build:'phase2-mvp'},
  {status:configured?200:503,headers:{'Cache-Control':'no-store'}});
}
