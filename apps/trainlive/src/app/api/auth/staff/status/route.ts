import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {readSession} from '@/lib/auth';
import {staffOIDCConfig} from '@/lib/staff-oidc';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 const classId=req.nextUrl.searchParams.get('classId')||'';
 if(!z.string().uuid().safeParse(classId).success)
  return NextResponse.json({error:'invalid classId'},{status:400});
 const s=await readSession(classId);
 return NextResponse.json({
  configured:Boolean(staffOIDCConfig()),authenticated:s?.kind==='staff',
  manualAllowed:process.env.VERCEL_ENV!=='production'
 },{headers:{'Cache-Control':'no-store'}});
}
