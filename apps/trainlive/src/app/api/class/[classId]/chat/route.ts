import {NextResponse} from 'next/server';
import {z} from 'zod';
import {guardClass,privateError,requireSameOrigin} from '@/lib/api';
import {transaction} from '@/lib/db';

export const runtime='nodejs';
const input=z.object({messageId:z.string().uuid(),action:z.enum(['read_aloud','hide','unhide'])}).strict();

export async function GET(_req:Request,{params}:{params:Promise<{classId:string}>}){
  const {classId}=await params;
  const auth=await guardClass(classId,'staff');
  if(auth.response)return auth.response;
  const s=auth.session!;
  if(s.kind!=='staff')return NextResponse.json({error:'forbidden'},{status:403});
  try{
    const messages=await transaction({classId:s.classId,staffId:s.staffId},async db=>
      (await db.query(
        "SELECT m.id,m.body,m.hidden,m.read_aloud,m.created_at,p.display_name FROM trainlive.chat_message m JOIN trainlive.participant p ON p.class_id=m.class_id AND p.id=m.participant_id WHERE m.class_id=$1 ORDER BY m.created_at DESC LIMIT 100",
        [s.classId])).rows);
    return NextResponse.json({classId:s.classId,messages},{headers:{'Cache-Control':'private, no-store'}});
  }catch(e){return privateError(e)}
}

export async function POST(req:Request,{params}:{params:Promise<{classId:string}>}){
  const denied=requireSameOrigin(req);if(denied)return denied;
 const {classId}=await params;
  const auth=await guardClass(classId,'staff');
  if(auth.response)return auth.response;
  const s=auth.session!;
  if(s.kind!=='staff')return NextResponse.json({error:'forbidden'},{status:403});
  const parsed=input.safeParse(await req.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:'invalid chat moderation request'},{status:400});
  try{
    const out=await transaction({classId:s.classId,staffId:s.staffId},async db=>{
      const {messageId,action}=parsed.data;
      if(action==='read_aloud')return (await db.query(
        "SELECT trainlive.read_chat($1) AS result",[messageId])).rows[0]?.result;
      const updated=(await db.query<{id:string}>(
        "UPDATE trainlive.chat_message SET hidden=$1 WHERE class_id=$2 AND id=$3 RETURNING id",
        [action==='hide',s.classId,messageId])).rows[0];
      if(!updated)throw Object.assign(new Error('not authorized'),{code:'42501'});
      await db.query(
        "INSERT INTO trainlive.audit_log(actor_id,actor_role,class_id,action,target) VALUES($1,'staff',$2,$3,$4)",
        [s.staffId,s.classId,'chat.'+action,messageId]);
      return {messageId,action};
    });
    return NextResponse.json(out,{headers:{'Cache-Control':'no-store'}});
  }catch(e){return privateError(e)}
}
