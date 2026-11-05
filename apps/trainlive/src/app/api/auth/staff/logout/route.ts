import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {sessionCookie} from '@/lib/auth';
export const runtime='nodejs';
export async function POST(req:NextRequest){
 const origin=req.headers.get('origin');
 if(origin&&origin!==req.nextUrl.origin)return NextResponse.json({error:'Origin tidak sesuai'},{status:403});
 const data=await req.json().catch(()=>null);
 const classId=z.string().uuid().safeParse(data?.classId);
 if(!classId.success)return NextResponse.json({error:'classId tidak valid'},{status:400});
 const res=NextResponse.json({ok:true},{headers:{'Cache-Control':'no-store'}});
 res.cookies.set(sessionCookie(classId.data),'',{httpOnly:true,secure:req.nextUrl.protocol==='https:',
  sameSite:'lax',path:'/',maxAge:0});
 return res;
}
