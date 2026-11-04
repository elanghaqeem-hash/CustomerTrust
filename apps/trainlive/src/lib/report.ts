import { transaction } from '@/lib/db';
export type ParticipantReport={
 participant_id:string;display_name:string;unit:string;email:string|null;
 joined_at:string;last_seen_at:string;pre_score:number|null;post_score:number|null;
 heartbeat_count:number;quiz_points:number
};
export type QuizStat={item_key:string;title:string|null;answered:number;correct:number;correct_pct:number|null};
type Staff={classId:string;staffId:string};
export async function classReport(staff:Staff) {
 return transaction(staff,async db=>{
  const {rows:participants}=await db.query<ParticipantReport>(
  "WITH test_scores AS ("+
  " SELECT r.participant_id,i.item_key,"+
  " ROUND(100.0*SUM(CASE WHEN r.answer_json->'answers'->>(q.ordinality-1)::int=q.question->>'correct' THEN 1 ELSE 0 END)/NULLIF(COUNT(*),0),0)::int score"+
  " FROM trainlive.class_item i"+
  " JOIN trainlive.response r ON r.class_id=i.class_id AND r.class_item_id=i.id"+
  " CROSS JOIN LATERAL jsonb_array_elements(i.payload->'questions') WITH ORDINALITY AS q(question,ordinality)"+
  " WHERE i.class_id=$1 AND i.item_key IN ('PRE','POST')"+
  " GROUP BY r.participant_id,i.item_key"+
  "), pivot_scores AS ("+
  " SELECT participant_id,MAX(score) FILTER(WHERE item_key='PRE') pre_score,"+
  " MAX(score) FILTER(WHERE item_key='POST') post_score FROM test_scores GROUP BY participant_id"+
  "), points AS ("+
  " SELECT participant_id,SUM(points)::int points FROM trainlive.point_ledger WHERE class_id=$1 GROUP BY participant_id"+
  "), attended AS ("+
  " SELECT participant_id,COUNT(*) FILTER(WHERE event='heartbeat')::int heartbeats"+
  " FROM trainlive.attendance_log WHERE class_id=$1 GROUP BY participant_id"+
  ")"+
  " SELECT p.id participant_id,p.display_name,p.unit,p.email,p.joined_at,p.last_seen_at,"+
  " v.pre_score,v.post_score,COALESCE(a.heartbeats,0) heartbeat_count,COALESCE(t.points,0) quiz_points"+
  " FROM trainlive.participant p LEFT JOIN pivot_scores v ON v.participant_id=p.id"+
  " LEFT JOIN attended a ON a.participant_id=p.id LEFT JOIN points t ON t.participant_id=p.id"+
  " WHERE p.class_id=$1 ORDER BY p.joined_at,p.id",
  [staff.classId]);
  const {rows:quizzes}=await db.query<QuizStat>(
   "SELECT i.item_key,i.payload->>'title' title,count(r.id)::int answered,"+
   " count(r.id) FILTER(WHERE r.is_correct IS TRUE)::int correct,"+
   " ROUND(100.0*count(r.id) FILTER(WHERE r.is_correct IS TRUE)/NULLIF(count(r.id),0),1)::float8 correct_pct"+
   " FROM trainlive.class_item i LEFT JOIN trainlive.response r"+
   " ON r.class_id=i.class_id AND r.class_item_id=i.id"+
   " WHERE i.class_id=$1 AND i.type='single_choice' GROUP BY i.id,i.item_key,i.payload,i.order_no ORDER BY i.order_no",
   [staff.classId]);
  const joined=participants.length,completedPost=participants.filter(p=>p.post_score!==null);
  const paired=participants.filter(p=>p.pre_score!==null&&p.post_score!==null);
  const mean=(xs:number[])=>xs.length?Math.round(xs.reduce((a,b)=>a+b,0)/xs.length*10)/10:null;
  const passPost=completedPost.filter(p=>(p.post_score||0)>=75).length;
  const passRate=joined?Math.round(1000*passPost/joined)/10:0;
  const pairedGain=mean(paired.map(p=>(p.post_score||0)-(p.pre_score||0)));
  const summary={
   participants:joined,pre_submitted:participants.filter(p=>p.pre_score!==null).length,
   post_submitted:completedPost.length,post_pass_75:passPost,
   post_pass_pct_of_enrolled:passRate,
   pre_mean:mean(participants.filter(p=>p.pre_score!==null).map(p=>p.pre_score!)),
   post_mean:mean(completedPost.map(p=>p.post_score!)),
   paired_mean_gain:pairedGain,
   target_post_met:joined>0&&passRate>=80,
   target_gain_met:pairedGain!==null&&pairedGain>=20,
   target_definitions:'post >=75 among all joined participants; gain = paired pre/post respondents only',
   attendance_note:'heartbeat_count approximates active minutes (heartbeat sent once per minute while tab is visible)'
  };
  return {classId:staff.classId,summary,participants,quizzes};
 });
}
