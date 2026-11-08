import {NextResponse} from 'next/server';
import {tenantSessionCookie} from '@/lib/auth';
import {requireSameOrigin} from '@/lib/api';
import {z} from 'zod';
import {LMS_ENABLED} from '@/lib/lms-flags';
export const runtime='nodejs';
export async function POST(req:Request,{params}:{params:Promise<{tenantId:string}>}){
 if(!LMS_ENABLED)return NextResponse.json({error:'not_found'},{status:404});
 const denied=requireSameOrigin(req);if(denied)return denied;
 const {tenantId}=await params;
 if(!z.string().uuid().safeParse(tenantId).success)return NextResponse.json({error:'invalid tenant id'},{status:400});
 const res=NextResponse.json({success:true});
 res.cookies.set(tenantSessionCookie(tenantId),'',{
  httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:0
 });
 res.headers.set('Cache-Control','no-store');
 return res;
}
