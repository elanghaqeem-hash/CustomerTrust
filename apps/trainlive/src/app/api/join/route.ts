import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createHmac } from 'node:crypto';
import { transaction } from '@/lib/db';
import { signParticipant,sessionCookie } from '@/lib/auth';
import { privateError,requireSameOrigin } from '@/lib/api';
export const runtime='nodejs';
const input=z.object({
 code:z.string().trim().min(6).max(6),
 displayName:z.string().trim().min(2).max(100),
 unit:z.string().trim().min(2).max(100),
 email:z.union([z.string().email(),z.literal('')]).optional(),
 consent:z.literal(true)
}).strict();
export async function POST(req:NextRequest) {
 const denied=requireSameOrigin(req);if(denied)return denied;
 const parsed=input.safeParse(await req.json().catch(()=>null));
 if(!parsed.success) return NextResponse.json({error:'Lengkapi data dan persetujuan peserta.'},{status:400});
 try {
  const data=parsed.data;
  // Database-backed throttling works across serverless instances. Allow staff behind
  // the same bank NAT to join a 25-person class without blocking legitimate users.
  // The source IP is hashed; it is never stored as plaintext in the database.
  // On Vercel, x-vercel-forwarded-for is the platform-provided client IP
  // and takes precedence over proxy-supplied x-forwarded-for.
  const forwarded=req.headers.get('x-vercel-forwarded-for')||
    req.headers.get('x-forwarded-for');
  const clientIp=(forwarded?.split(',')[0]||req.headers.get('x-real-ip')||'unidentified').trim();
  const key=createHmac('sha256',process.env.TRAINLIVE_JWT_SECRET||'')
    .update('join-ip:'+clientIp).digest('hex');
  const allowed=await transaction(null,async db=>
    (await db.query<{allowed:boolean}>('SELECT trainlive.allow_join_attempt($1) AS allowed',[key])).rows[0]?.allowed);
  if(!allowed)return NextResponse.json({error:'Terlalu banyak percobaan bergabung. Coba lagi beberapa menit kemudian.'},
    {status:429,headers:{'Retry-After':'600','Cache-Control':'no-store'}});
  const row=await transaction(null,async db=>(await db.query<{class_id:string;participant_id:string}>(
   'SELECT * FROM trainlive.join_class($1,$2,$3,$4,$5)',
   [data.code.toUpperCase(),data.displayName,data.unit,data.email||null,true]
  )).rows[0]);
  if(!row) return NextResponse.json({error:'Kode kelas tidak tersedia.'},{status:403});
  const token=await signParticipant(row.class_id,row.participant_id);
  const res=NextResponse.json({classId:row.class_id,participantId:row.participant_id});
  res.cookies.set(sessionCookie(row.class_id),token,{
   httpOnly:true,secure:req.nextUrl.protocol==='https:',sameSite:'lax',path:'/',maxAge:72*3600
  });
  return res;
 }catch(err){ return privateError(err); }
}
