import {NextRequest,NextResponse} from 'next/server';
import {transaction} from '@/lib/db';
import {privateError} from '@/lib/api';
export const runtime='nodejs';
export const dynamic='force-dynamic';

// The public endpoint only returns generic labels or a joinable class's
// two harmless branding fields. It never exposes class IDs or private data.
export async function GET(req:NextRequest){
 const code=(req.nextUrl.searchParams.get('code')||'').trim().toUpperCase();
 if(!/^[A-HJ-NP-Z2-9]{6}$/.test(code))
  return NextResponse.json({clientName:null,trainingTitle:null},
   {headers:{'Cache-Control':'no-store'}});
 try{
  const row=await transaction(null,async db=>
   (await db.query<{clientName:string;trainingTitle:string}>(
    'SELECT client_name AS "clientName",training_title AS "trainingTitle" FROM trainlive.public_class_branding($1)',
    [code])).rows[0]);
  return NextResponse.json(row||{clientName:null,trainingTitle:null},
   {headers:{'Cache-Control':'no-store'}});
 }catch(e){return privateError(e)}
}
