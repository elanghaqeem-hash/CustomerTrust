import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {discover,matchesPublicOrigin,staffOIDCConfig} from '@/lib/staff-oidc';

export const runtime='nodejs';
export const dynamic='force-dynamic';

// Public, read-only readiness check. Never return issuer, client ID, secrets,
// identity information, or internal exception messages.
type CheckStatus='provider_reachable'|'configuration_required'|'provider_unreachable'|'origin_mismatch';
let cached:{at:number;status:'provider_reachable'|'provider_unreachable'}|null=null;
const TTL_MS=60_000;

function answer(status:CheckStatus,code:number){
 return NextResponse.json({status},{status:code,headers:{'Cache-Control':'no-store'}});
}

export async function GET(req:NextRequest){
 const classId=req.nextUrl.searchParams.get('classId');
 if(!classId||!z.string().uuid().safeParse(classId).success)
  return NextResponse.json({status:'invalid_class'}, {status:400,headers:{'Cache-Control':'no-store'}});
 const config=staffOIDCConfig();
 if(!config)return answer('configuration_required',503);
 if(!matchesPublicOrigin(req,config.origin))return answer('origin_mismatch',400);
 if(cached&&Date.now()-cached.at<TTL_MS)
  return answer(cached.status,cached.status==='provider_reachable'?200:503);
 try{
  await discover(config);
  cached={at:Date.now(),status:'provider_reachable'};
  return answer('provider_reachable',200);
 }catch{
  cached={at:Date.now(),status:'provider_unreachable'};
  console.warn('trainlive.staff.oidc_check_failed', {stage:'provider_discovery'});
  return answer('provider_unreachable',503);
 }
}
