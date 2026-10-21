// EHE API 1.6.0. Verified user, live session and server-side staff permissions.
// The service role is used only here, never in browser code.
const BASE = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PUBLIC_KEY = 'sb_publishable_9GswqXbnlKKnKyo-2QGwbQ_LOnCHJR0';
const ORIGINS = new Set(['https://joyyang010-ai.github.io','http://localhost:4173','http://127.0.0.1:4173']);
const LANGS=['Mandarin','Cantonese','Toishanese','English','Spanish','Other'];
const STAFF_ACTIONS=['snapshot','save_event','save_shift','booking_status','new_participant','enroll_participant','participant_checkin','void_attendance','save_participant','save_volunteer','record_attendance','diary','review_submission','correct_service','participant_archive_info','participant_archive_request','participant_archive_review','participant_archive','participant_restore','participant_delete'];
class ApiError extends Error { constructor(public code:string, public status=400){super(code);} }
async function rpc(name:string,body:Record<string,unknown>={}) {
 const r=await fetch(BASE+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:SERVICE,Authorization:'Bearer '+SERVICE,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 const v=await r.json(); if(!r.ok) { const known=/^(FORBIDDEN|CONFLICT_REFRESH|FULL|OVERLAP|WAITLIST_ORDER|BOOKED_SHIFT_LOCKED|CAPACITY_BELOW_BOOKINGS|SHIFT_UNAVAILABLE|SHIFT_ENDED|INVALID_INPUT|INVALID_TIME|INVALID_LANGUAGES|SUPPORT_REQUIRED|DUTY_REQUIRED|CONTACT_STAFF_TO_CANCEL|SERVICE_ALREADY_STARTED|EVENT_HAS_SHIFTS|DIARY_NOT_APPLICABLE|NO_CONFIRMED_BOOKING|REASON_REQUIRED|NOT_FOUND|INVALID_STATUS|REQUEST_REUSED|EVENT_REQUIRED|USE_ATTENDANCE_BACKFILL|ALREADY_RECORDED|EVENT_HAS_RECORDS|PARTICIPANT_ARCHIVED|HAS_RELATED_RECORDS|AMBIGUOUS_OPEN_VISIT|VISIT_CONTEXT_MISMATCH|NO_OPEN_CHECKIN|EVENT_NOT_TODAY)$/; throw new ApiError(known.test(v.message)?v.message:'DATABASE_ERROR',v.message==='FORBIDDEN'?403:409); } return v;
}
async function hash(s:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(SERVICE+s)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function limit(key:string,n:number){if(!await rpc('ehe_rate_limit',{p_key:await hash(key),p_limit:n}))throw new ApiError('RATE_LIMIT',429);}
async function identity(req:Request) {
 const token=req.headers.get('Authorization')?.replace(/^Bearer /,''); if(!token)throw new ApiError('SIGN_IN_REQUIRED',401);
 const r=await fetch(BASE+'/auth/v1/user',{headers:{apikey:PUBLIC_KEY,Authorization:'Bearer '+token},signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw new ApiError('SIGN_IN_REQUIRED',401);
 const u=await r.json(); if(!u.id||!u.email||!u.email_confirmed_at||u.is_anonymous)throw new ApiError('VERIFIED_EMAIL_REQUIRED',403);
 let claim; try{let t=token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');claim=JSON.parse(atob(t.padEnd(Math.ceil(t.length/4)*4,'=')));}catch{throw new ApiError('SIGN_IN_REQUIRED',401);}
 if(!claim.session_id||!await rpc('ehe_session_valid',{p_user:u.id,p_session:claim.session_id}))throw new ApiError('SIGN_IN_REQUIRED',401);
 return {id:u.id,email:u.email.trim().toLowerCase()};
}
async function readBody(req:Request) {const reader=req.body?.getReader();if(!reader)throw new ApiError('INVALID_INPUT');let total=0;const chunks:Uint8Array[]=[];while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>32768){await reader.cancel();throw new ApiError('PAYLOAD_TOO_LARGE',413);}chunks.push(value);}const all=new Uint8Array(total);let p=0;for(const c of chunks){all.set(c,p);p+=c.length;}try{return JSON.parse(new TextDecoder().decode(all));}catch{throw new ApiError('INVALID_INPUT');}}
function text(x:unknown,max:number){if(typeof x!=='string'||x.length>max)throw new ApiError('INVALID_INPUT');return x.trim();}
function choices(x:unknown,allowed:string[]){if(x===undefined)return [];if(!Array.isArray(x)||x.length>allowed.length||x.some(y=>typeof y!=='string'||!allowed.includes(y)))throw new ApiError('INVALID_INPUT');return [...new Set(x)];}
Deno.serve(async req=>{
 const origin=req.headers.get('Origin')||'';
 const headers:Record<string,string>={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'};
 if(ORIGINS.has(origin)){headers['Access-Control-Allow-Origin']=origin;headers['Access-Control-Allow-Headers']='authorization, apikey, content-type, x-client-info';headers['Access-Control-Allow-Methods']='GET, POST, OPTIONS';}
 const send=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers});
 if(req.method==='OPTIONS')return new Response(null,{status:ORIGINS.has(origin)?204:403,headers});
 try{
  if(origin&&!ORIGINS.has(origin))throw new ApiError('ORIGIN_NOT_ALLOWED',403);
  const ip=req.headers.get('x-real-ip')||req.headers.get('cf-connecting-ip')||req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown';
  const route=new URLSearchParams(new globalThis.URL(req.url).search).get('route')||'catalog';
  if(route==='catalog'&&req.method==='GET'){await limit('catalog:'+ip,300);return send(await rpc('ehe_catalog'));}
  if(req.headers.get('apikey')!==PUBLIC_KEY)throw new ApiError('API_KEY_REQUIRED',401);
  if(req.method!=='POST'||!req.headers.get('Content-Type')?.includes('application/json'))throw new ApiError('METHOD_NOT_ALLOWED',405);
  await limit('api:'+ip,180);
  const b=await readBody(req);if(!b||typeof b!=='object'||Array.isArray(b))throw new ApiError('INVALID_INPUT');
  if(route==='submit'){
   if(b.website)throw new ApiError('INVALID_INPUT');
   const name=text(b.name,120).normalize('NFKC'),email=text(b.email,254).toLowerCase(),shift=text(b.shift_id,100),kind=text(b.kind,12),id=text(b.request_id,36);
   if(!name||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)||!['signup','in','out'].includes(kind)||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw new ApiError('INVALID_INPUT');
   await limit('email:'+email+':'+kind,12);
   const d=b.data||{};if(typeof d!=='object'||Array.isArray(d))throw new ApiError('INVALID_INPUT');
   let data:Record<string,unknown>={};
   // Legacy check-in links use the same immediate time-recording path.
   if(kind==='in'||kind==='out'){
    const result=await rpc('ehe_record_volunteer_visit',{p_request:id,p_kind:kind,p_shift:shift,p_name:name,p_email:email,p_data:d});
    if(result.recorded!==true||!['checked_in','checked_out','already_checked_in','already_checked_out'].includes(result.status))throw new ApiError('INVALID_RESPONSE',503);
    return send({...result,status:'received',visit_status:result.status,recorded:true,requires_review:false});
   }
   if(kind==='signup'){data={languages:choices(d.languages,LANGS),language_other:text(d.language_other||'',120)};}
   const result=await rpc('ehe_submit',{p_request:id,p_kind:kind,p_shift:shift,p_name:name,p_email:email,p_data:data});
   return send({status:result.status,booking_id:result.booking_id||undefined,request_id:id});
  }
  if(route==='staff'||route==='self'){
   const u=await identity(req);const action=text(b.action,40);const data=b.data||{};if(typeof data!=='object'||Array.isArray(data))throw new ApiError('INVALID_INPUT');
   if(route==='staff'&&!STAFF_ACTIONS.includes(action))throw new ApiError('INVALID_INPUT');
   if(route==='self'&&!['list','cancel'].includes(action))throw new ApiError('INVALID_INPUT');
   return send(await rpc(route==='staff'?'ehe_staff_apply':'ehe_self_command',{p_actor:u.id,p_email:u.email,p_action:action,p_data:data}));
  }
  throw new ApiError('NOT_FOUND',404);
 }catch(e){return send({error:e instanceof ApiError?e.code:'SERVICE_UNAVAILABLE'},e instanceof ApiError?e.status:503);}
});

