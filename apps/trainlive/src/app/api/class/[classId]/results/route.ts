import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guardClass,privateError } from '@/lib/api';
import { transaction } from '@/lib/db';
export const runtime='nodejs';
export async function GET(req:Request,{params}:{params:Promise<{classId:string}>}){
 const {classId}=await params;
 const auth=await guardClass(classId,'staff');if(auth.response)return auth.response;
 const s=auth.session!;if(s.kind!=='staff')return NextResponse.json({error:'forbidden'},{status:403});
 const itemId=new URL(req.url).searchParams.get('itemId');
 if(!z.string().uuid().safeParse(itemId).success)return NextResponse.json({error:'itemId required'},{status:400});
 try{
  const rows=await transaction({classId:s.classId,staffId:s.staffId},async db=>{
   const item=(await db.query('SELECT id,state,payload FROM trainlive.class_item WHERE class_id=$1 AND id=$2',[s.classId,itemId])).rows[0];
   if(!item)throw Object.assign(new Error('Not in class'),{code:'42501'});
   // single_choice stores {choice}, multi_choice (polls) stores {choices:[…]}.
   // Count each selected letter; 'answered' counts respondents, not selections.
   const counts=(await db.query(
    "SELECT x.choice,count(*)::int count FROM trainlive.response r CROSS JOIN LATERAL (SELECT r.answer_json->>'choice' WHERE r.answer_json ? 'choice' UNION ALL SELECT jsonb_array_elements_text(r.answer_json->'choices') WHERE jsonb_typeof(r.answer_json->'choices')='array') x(choice) WHERE r.class_id=$1 AND r.class_item_id=$2 GROUP BY 1 ORDER BY 1",
    [s.classId,itemId])).rows;
   const answered=(await db.query(
    'SELECT count(*)::int n FROM trainlive.response WHERE class_id=$1 AND class_item_id=$2',[s.classId,itemId])).rows[0].n;
   const total=(await db.query(
    'SELECT count(*)::int total FROM trainlive.participant WHERE class_id=$1',[s.classId])).rows[0].total;
   return {itemId,state:item.state,answered,
    joined:total,counts};
  });
  return NextResponse.json(rows,{headers:{'Cache-Control':'no-store'}});
 }catch(e){return privateError(e)}
}
