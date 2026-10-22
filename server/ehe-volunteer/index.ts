// EHE v1.7.0: public, self-reported volunteer visits; no prior booking required.
// Staff corrections separately require verified Auth + a live session + a DB staff role.
const BASE=Deno.env.get('SUPABASE_URL')!;
const SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const KEY='sb_publishable_9GswqXbnlKKnKyo-2QGwbQ_LOnCHJR0';
const ORIGINS=new Set(['https://joyyang010-ai.github.io','http://localhost:4173','http://127.0.0.1:4173']);
class Failure extends Error {constructor(public code:string,public status=400){super(code);}}
const KNOWN=new Set(['INVALID_INPUT','EVENT_REQUIRED','REQUEST_REUSED','AMBIGUOUS_OPEN_VISIT','VISIT_CONTEXT_MISMATCH','NO_OPEN_CHECKIN','SHIFT_UNAVAILABLE','EVENT_NOT_TODAY','EVENT_DATE_MISMATCH','FORBIDDEN','NOT_FOUND','CONFLICT_REFRESH','INVALID_TIME','REASON_REQUIRED']);
async function rpc(name:string,data:Record<string,unknown>={}){
 const response=await fetch(BASE+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:SERVICE,Authorization:'Bearer '+SERVICE,'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(15000)});
 const result=await response.json();
 if(!response.ok){const code=KNOWN.has(result.message)?result.message:result.code==='22P02'?'INVALID_INPUT':'DATABASE_ERROR';throw new Failure(code,code==='FORBIDDEN'?403:409);}
 return result;
}
async function digest(value:string){const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(SERVICE+value)));return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');}
async function rate(value:string,max:number){if(!await rpc('ehe_rate_limit',{p_key:await digest('visit17:'+value),p_limit:max}))throw new Failure('RATE_LIMIT',429);}
function str(value:unknown,max:number,optional=false):string|null{if(optional&&(value===null||value===undefined||value===''))return null;if(typeof value!=='string'||value.length>max)throw new Failure('INVALID_INPUT');return value.trim();}
async function body(req:Request){const reader=req.body?.getReader();if(!reader)throw new Failure('INVALID_INPUT');let size=0;const chunks:Uint8Array[]=[];for(;;){const x=await reader.read();if(x.done)break;size+=x.value.length;if(size>(new URL(req.url).searchParams.get('route')==='bulk'?524288:32768)){await reader.cancel();throw new Failure('PAYLOAD_TOO_LARGE',413);}chunks.push(x.value);}const bytes=new Uint8Array(size);let pos=0;for(const c of chunks){bytes.set(c,pos);pos+=c.length;}try{const v=JSON.parse(new TextDecoder().decode(bytes));if(!v||typeof v!=='object'||Array.isArray(v))throw new Error();return v;}catch{throw new Failure('INVALID_INPUT');}}
async function identity(req:Request){const token=req.headers.get('Authorization')?.replace(/^Bearer /,'');if(!token)throw new Failure('SIGN_IN_REQUIRED',401);const response=await fetch(BASE+'/auth/v1/user',{headers:{apikey:KEY,Authorization:'Bearer '+token},signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Failure('SIGN_IN_REQUIRED',401);const u=await response.json();if(!u.id||!u.email||!u.email_confirmed_at||u.is_anonymous)throw new Failure('VERIFIED_EMAIL_REQUIRED',403);let claim;try{let value=token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');claim=JSON.parse(atob(value.padEnd(Math.ceil(value.length/4)*4,'=')));}catch{throw new Failure('SIGN_IN_REQUIRED',401);}if(!claim.session_id||!await rpc('ehe_session_valid',{p_user:u.id,p_session:claim.session_id}))throw new Failure('SIGN_IN_REQUIRED',401);return {id:u.id,email:u.email.trim().toLowerCase()};}
Deno.serve(async req=>{
 const origin=req.headers.get('Origin')||'';
 const headers:Record<string,string>={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'};
 if(ORIGINS.has(origin)){headers['Access-Control-Allow-Origin']=origin;headers['Access-Control-Allow-Headers']='authorization, apikey, content-type';headers['Access-Control-Allow-Methods']='POST, OPTIONS';}
 const send=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers});
 if(req.method==='OPTIONS')return new Response(null,{status:ORIGINS.has(origin)?204:403,headers});
 try{
  if(origin&&!ORIGINS.has(origin))throw new Failure('ORIGIN_NOT_ALLOWED',403);
  if(req.method!=='POST'||!req.headers.get('Content-Type')?.includes('application/json'))throw new Failure('METHOD_NOT_ALLOWED',405);
  if(req.headers.get('apikey')!==KEY)throw new Failure('API_KEY_REQUIRED',401);
  const ip=req.headers.get('x-real-ip')||req.headers.get('cf-connecting-ip')||req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown';
  await rate('ip:'+ip,180);
  const b=await body(req);const route=new URL(req.url).searchParams.get('route')||'visit';
  if(route==='correct'||route==='bulk'){
   const u=await identity(req);
   if(route==='bulk'){if(!Array.isArray(b.entries))throw new Failure('INVALID_INPUT');return send(await rpc('ehe_bulk_correct_volunteer_visits',{p_actor:u.id,p_email:u.email,p_entries:b.entries}));}
   if(!b.data||typeof b.data!=='object'||Array.isArray(b.data))throw new Failure('INVALID_INPUT');
   return send(await rpc('ehe_correct_volunteer_visit',{p_actor:u.id,p_email:u.email,p_data:b.data}));
  }
  if(route!=='visit')throw new Failure('NOT_FOUND',404);
  if(b.website)throw new Failure('INVALID_INPUT');
  const request=str(b.request_id,36)!,kind=str(b.kind,3)!,name=str(b.name,120)!.normalize('NFKC'),email=str(b.email,254)!.toLowerCase();
  if(!['in','out'].includes(kind)||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(request)||!name||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))throw new Failure('INVALID_INPUT');
  await rate('email:'+email+':'+kind,30);
  const data=b.data??{};if(typeof data!=='object'||Array.isArray(data)||data===null)throw new Failure('INVALID_INPUT');
  const r=await rpc('ehe_record_volunteer_visit',{p_request:request,p_kind:kind,p_name:name,p_email:email,p_event:str(b.event_id,100,true),p_shift:str(b.shift_id,100,true),p_role:str(b.role,40,true),p_data:data});
  if(r.recorded!==true||!['checked_in','checked_out','already_checked_in','already_checked_out'].includes(r.status))throw new Failure('INVALID_RESPONSE',503);
  return send({status:r.status,recorded:true,request_id:request,service_id:r.service_id,checked_in_at:r.checked_in_at,checked_out_at:r.checked_out_at,duration_seconds:r.duration_seconds,requires_review:false,server_time:r.server_time});
 }catch(e){return send({error:e instanceof Failure?e.code:'SERVICE_UNAVAILABLE',recorded:false},e instanceof Failure?e.status:503);}
});
