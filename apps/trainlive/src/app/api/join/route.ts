import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { transaction } from '@/lib/db';
import { signParticipant,sessionCookie } from '@/lib/auth';
import { privateError } from '@/lib/api';
export const runtime='nodejs';
const input=z.object({
 code:z.string().trim().min(6).max(6),
 displayName:z.string().trim().min(2).max(100),
 unit:z.string().trim().min(2).max(100),
 email:z.union([z.string().email(),z.literal('')]).optional(),
 consent:z.literal(true)
}).strict();
export async function POST(req:NextRequest) {
 const parsed=input.safeParse(await req.json().catch(()=>null));
 if(!parsed.success) return NextResponse.json({error:'Lengkapi data dan persetujuan peserta.'},{status:400});
 try {
  const data=parsed.data;
  const row=await transaction(null,async db=>(await db.query<{class_id:string;participant_id:string}>(
   'SELECT * FROM trainlive.join_class($1,$2,$3,$4,$5)',
   [data.code.toUpperCase(),data.displayName,data.unit,data.email||null,true]
  )).rows[0]);
  if(!row) return NextResponse.json({error:'Kode kelas tidak tersedia.'},{status:403});
  const token=await signParticipant(row.class_id,row.participant_id);
  const res=NextResponse.json({classId:row.class_id,participantId:row.participant_id});
  res.cookies.set(sessionCookie(row.class_id),token,{
   httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:72*3600
  });
  return res;
 }catch(err){ return privateError(err); }
}
