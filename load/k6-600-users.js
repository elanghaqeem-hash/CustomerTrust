// Usage (STAGING ONLY): CLASS_CODES_JSON='["CODE01",...]' BASE_URL=https://preview.example k6 run load/k6-600-users.js
// Prepare 24 disposable classes, capacity=25 each; no real participant or customer records.
import http from 'k6/http';
import {check} from 'k6';
import exec from 'k6/execution';

export const options={
  scenarios:{participants:{executor:'per-vu-iterations',vus:600,iterations:1,maxDuration:'12m'}},
  thresholds:{http_req_failed:['rate<0.01'],http_req_duration:['p(95)<1500'],checks:['rate>0.99']}
};
const url=__ENV.BASE_URL||'';
const codes=JSON.parse(__ENV.CLASS_CODES_JSON||'[]');
if(!/^https:\/\//.test(url)||codes.length!==24||codes.some(c=>typeof c!=='string'||c.length!==6)){
  throw Error('Staging BASE_URL HTTPS and exactly 24 six-character CLASS_CODES_JSON values required.');
}
export default function(){
  const vu=exec.vu.idInTest;
  const code=codes[Math.floor((vu-1)/25)];
  const health=http.get(url+'/api/health',{tags:{kind:'health'}});
  check(health,{'ready 200':r=>r.status===200});
  const join=http.post(url+'/api/join',JSON.stringify({
    code,displayName:'PERF-'+String(vu).padStart(4,'0'),unit:'SYNTHETIC-LOAD',email:'',consent:true
  }),{headers:{'Content-Type':'application/json'},tags:{kind:'join'}});
  check(join,{'joined 200':r=>r.status===200});
  if(join.status!==200)return;
  const c=join.json('classId');
  const items=http.get(url+'/api/class/'+c+'/items',{tags:{kind:'items'}});
  check(items,{'items 200':r=>r.status===200});
  const heartbeat=http.post(url+'/api/class/'+c+'/heartbeat',null,{tags:{kind:'heartbeat'}});
  check(heartbeat,{'heartbeat 200':r=>r.status===200});
  const leaderboard=http.get(url+'/api/class/'+c+'/leaderboard',{tags:{kind:'leaderboard'}});
  check(leaderboard,{'leaderboard 200':r=>r.status===200});
}
