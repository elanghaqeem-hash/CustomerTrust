import {NextResponse} from 'next/server';
import {tenantSessionCookie} from '@/lib/auth';
import {guardTenant,requireSameOrigin} from '@/lib/api';
import {LMS_ENABLED} from '@/lib/lms-flags';
export const runtime='nodejs';
export async function POST(req:Request,{params}:{params:Promise<{tenantId:string}>}){
 if(!LMS_ENABLED)return NextResponse.json({error:'not_found'},{status:404});
 const denied=requireSameOrigin(req);if(denied)return denied;
 const {tenantId}=await params;const auth=await guardTenant(tenantId);
 if(auth.response)return auth.response;
 const res=NextResponse.json({success:true});
 res.cookies.set(tenantSessionCookie(tenantId),'',{
  httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:0
 });
 res.headers.set('Cache-Control','no-store');
 return res;
}
