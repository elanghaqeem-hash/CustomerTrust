import {NextRequest,NextResponse} from 'next/server';
import {transaction} from '@/lib/db';
import {privateError} from '@/lib/api';
export const runtime='nodejs';
export const dynamic='force-dynamic';
// Public pre-join response is restricted to safe display metadata for a joinable
// class. It never returns tenant IDs, memberships, learners or course data.
type Brand={clientName:string;trainingTitle:string;logoUrl:string|null;primaryColor:string|null};
const empty={clientName:null,trainingTitle:null,logoUrl:null,primaryColor:null};
export async function GET(req:NextRequest){
 const code=(req.nextUrl.searchParams.get('code')||'').trim().toUpperCase();
 if(!/^[A-HJ-NP-Z2-9]{6}$/.test(code))
  return NextResponse.json(empty,{headers:{'Cache-Control':'no-store'}});
 try{
  const row=await transaction(null,async db=>
   (await db.query<Brand>(
    'SELECT client_name AS "clientName",training_title AS "trainingTitle",logo_url AS "logoUrl",primary_color AS "primaryColor" FROM trainlive.public_class_branding_v2($1)',
    [code])).rows[0]);
  return NextResponse.json(row||empty,{headers:{'Cache-Control':'no-store'}});
 }catch(e){return privateError(e)}
}
