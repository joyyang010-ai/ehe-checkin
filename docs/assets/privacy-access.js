'use strict';
// v1.4: shared-device form privacy and owner-reviewed staff access.
// Applicant fields are never persisted. Staff login sessions remain independent.
function clearSharedIdentity(resetForm=false){
 S.name='';S.email='';
 if(resetForm)document.querySelectorAll('#signupForm,#onsiteForm,#accessApplicationForm').forEach(f=>{f.reset();f.querySelectorAll('[name="name"],[name="email"]').forEach(x=>{x.value='';x.defaultValue='';});delete f.dataset.request;delete f.dataset.fingerprint;});
}
const privacyIdentityFields=identityFields;
identityFields=function(withLanguages=false){
 clearSharedIdentity();const tpl=document.createElement('template');tpl.innerHTML=privacyIdentityFields(withLanguages);
 for(const key of ['name','email']){const input=tpl.content.querySelector('[name="'+key+'"]');if(!input)continue;const old=input.id;input.id='visitor-'+key;input.value='';input.defaultValue='';input.setAttribute('value','');input.setAttribute('autocomplete','off');input.setAttribute('data-lpignore','true');input.setAttribute('data-1p-ignore','');input.setAttribute('autocapitalize','none');input.setAttribute('spellcheck','false');const label=tpl.content.querySelector('label[for="'+old+'"]');if(label)label.htmlFor=input.id;}
 return tpl.innerHTML;
};
function prepareSharedForms(){
 document.querySelectorAll('#signupForm,#onsiteForm,#accessApplicationForm').forEach(f=>{
  f.setAttribute('autocomplete','off');
  f.querySelectorAll('[name="name"],[name="email"]').forEach(x=>{x.setAttribute('autocomplete','off');x.setAttribute('data-lpignore','true');x.setAttribute('data-1p-ignore','');});
  if(f.querySelector('[data-shared-clear]'))return;
  const bar=document.createElement('div');bar.className='sharedEntryBar';
  bar.innerHTML=`<span>${t('共用裝置：不記住上一位填寫者。','Shared device: previous visitor details are not remembered.')}</span><button type="button" class="btn soft" data-shared-clear>${t('清空，下一位','Clear for next person')}</button>`;
  (f.querySelector('.modalBody')||f).prepend(bar);
 });
 const newPerson=document.querySelector('#personForm');
 if(newPerson&&!newPerson.querySelector('[name="id"]')?.value){newPerson.autocomplete='off';newPerson.querySelectorAll('input:not([type="hidden"])').forEach(x=>x.autocomplete='off');}
}
const privacyApi=api;
api=async function(route,body,secure=false){const result=await privacyApi(route,body,secure);if(route==='submit'&&['signup','in','out'].includes(body?.kind))clearSharedIdentity(true);return result;};
const privacyClose=close;
close=function(){if(document.querySelector('#modal #signupForm'))clearSharedIdentity(true);privacyClose();};
const privacyModal=modal;
modal=function(...args){privacyModal(...args);prepareSharedForms();};
const privacyNav=nav;
nav=async function(page){clearSharedIdentity(true);return privacyNav(page);};
const privacyLoginView=loginView;
loginView=function(staff=false){clearSharedIdentity();const html=privacyLoginView(staff);return html+(staff?`<section class="panel accessIntro"><h2>${t('需要工作人員權限？','Need staff access?')}</h2><p>${t('使用自己的 email 申請，由網站負責人審核。不需要共用管理員帳號。','Apply with your own email for review by the site owner. Do not share an administrator account.')}</p><a class="btn soft" href="?portal=apply">${t('申請工作人員／管理員權限','Apply for staff / administrator access')}</a></section>`:'');};
const accessState={rows:null,loading:false,error:'',applied:false};
const accessRole=k=>k==='admin'?t('網站管理員','Site administrator'):t('學員簽到人員','Learner check-in staff');
const accessStatus=k=>({pending:t('待審核','Pending review'),approved:t('已核准，待建立／確認登入帳號','Approved; login setup pending'),activated:t('已啟用','Active'),rejected:t('未核准','Rejected'),revoked:t('已停用','Revoked')}[k]||k);
Object.assign(errors,{ACCOUNT_NOT_READY:['請先建立並確認此 email 的登入帳號，再按啟用。','Create and confirm the login account for this email before activating access.'],OWNER_PROTECTED:['負責人帳號不能在此變更。','The owner account cannot be changed here.'],ACCOUNT_CHANGED:['登入 email 已變更，請先核對帳號。','The login email changed. Review the account first.']});
async function accessAPI(route,payload,secure=false){const bearer=secure?await token():null,epoch=authEpoch;const result=await jsonFetch(C.url+'/functions/v1/ehe-access?route='+route,{method:'POST',cache:'no-store',headers:{apikey:C.key,'Content-Type':'application/json',...(bearer?{Authorization:'Bearer '+bearer}:{})},body:JSON.stringify(payload)});if(secure&&epoch!==authEpoch)throw new Error('STALE_SESSION');return result;}
function accessApplicationPage(){
 if(accessState.applied)return heading(t('申請已收到','Application received'))+`<section class="panel accessApplication"><h2>${t('請等候負責人審核','Please await the owner’s review')}</h2><p>${t('送出申請不會直接取得管理權限。負責人核准並完成登入帳號啟用後，才能登入工作區。','Submitting an application does not grant access. The owner must approve the request and complete login activation first.')}</p><p>${t('目前不會自動寄送通知。請與負責人確認審核結果；不要提供或共用密碼。','Automatic email notifications are not enabled. Contact the owner for the result; never send or share your password.')}</p><a class="btn primary" href="?portal=staff">${t('前往工作人員登入','Go to staff sign-in')}</a><button type="button" class="btn soft" data-access-new>${t('另一位提出申請','Another person’s application')}</button></section>`;
 return heading(t('申請工作人員／管理員權限','Apply for staff / administrator access'),t('每人使用自己的 email；權限由網站負責人決定。','Use your own email. The site owner decides the permissions.'))+`<section class="panel accessApplication"><form id="accessApplicationForm" autocomplete="off">${identityFields(false)}${select('requested_role',t('申請的工作權限','Requested access'),[['checkin',t('學員簽到人員：報到、Walk-in、日記收件','Check-in staff: attendance, walk-ins and diary receipt')],['admin',t('網站管理員：活動、志工、名單與紀錄管理','Site administrator: events, volunteers, rosters and records')]],'checkin')}${area('reason',t('工作內容／申請原因（必填）','Your responsibilities / reason (required)'),' ',1500).replace('> </textarea>','></textarea>')}<p class="helpText">${t('申請不會開放任何名單。核准前不能進入後台；新管理員也不能自行核准其他人的申請。','Applying does not expose any rosters. Access stays blocked until approved. New administrators cannot approve other applicants.')}</p><p id="accessApplicationError" class="error" role="alert"></p><button class="btn primary" type="submit">${t('送出申請','Submit application')}</button></form></section>`;
}
async function loadAccessRequests(){
 if(accessState.loading||!S.data?.can_manage_access)return;
 accessState.loading=true;accessState.error='';
 try{const data=await accessAPI('owner',{action:'list'},true);accessState.rows=data.requests||[];}catch(e){accessState.error=errorText(e);accessState.rows=null;}
 finally{accessState.loading=false;if(S.page==='staff'&&S.tab==='access')render();}
}
function accessOwnerPage(){
 const rows=accessState.rows||[];
 return heading(t('權限申請與審核','Access applications & review'),t('只有網站負責人可以核准、啟用或停用；新管理員不能代為審核。','Only the site owner may approve, activate or revoke access. Delegated administrators cannot approve requests.'))+`<section class="panel accessIntro"><div class="accessToolbar"><a class="btn soft" href="?portal=apply" target="_blank" rel="noopener">${t('開啟申請頁','Open application page')} ↗</a><button class="btn soft" data-access-refresh>${t('重新整理申請','Refresh applications')}</button></div><p>${t('既有且已確認的登入帳號，核准後即可取得所選權限。新 email 先核准，再於 Supabase 建立登入帳號，最後回到此頁按「啟用」。目前沒有自動寄信。','An existing confirmed login receives the selected role after approval. For a new email: approve, create its login in Supabase, then return here and activate. Email notifications are not automatic.')}</p></section>${accessState.error?`<p class="error" role="alert">${esc(accessState.error)}</p>`:''}${accessState.loading&&!accessState.rows?empty(t('讀取申請中…','Loading applications…')):!rows.length?empty(t('目前沒有權限申請。','No access applications yet.')):`<div class="accessReviewGrid">${rows.map(r=>`<article class="panel accessReviewCard"><div class="accessReviewHeading"><div><h2>${esc(r.name)}</h2><p class="accessEmail">${esc(r.email)}</p></div><span class="pill ${r.status==='pending'||r.status==='approved'?'amber':''}">${esc(accessStatus(r.status))}</span></div><dl class="accessDetails"><div><dt>${t('申請權限','Requested role')}</dt><dd>${esc(accessRole(r.requested_role))}</dd></div>${r.granted_role?`<div><dt>${t('核准權限','Granted role')}</dt><dd>${esc(accessRole(r.granted_role))}</dd></div>`:''}<div><dt>${t('申請時間','Applied')}</dt><dd>${esc(stamp(r.created_at))}</dd></div></dl><p class="accessReason">${esc(r.reason)}</p>${r.review_note?`<p class="helpText">${esc(r.review_note)}</p>`:''}${r.status==='approved'&&!r.account_ready?`<div class="accessSetup"><p>${t('仍需建立／確認登入帳號，尚無後台存取權。','The login account still needs setup / confirmation. No access has been granted yet.')}</p><a href="https://supabase.com/dashboard/project/dcfyhkjecchogrdatgcg/auth/users" target="_blank" rel="noopener noreferrer">${t('開啟 Supabase 使用者管理','Open Supabase user management')} ↗</a><p class="helpText">${t('Add user → Create new user；使用上方 email。完成後重新整理本頁，再按「啟用」。不要把密碼貼到聊天或網站說明。','Add user → Create new user using the email above. Then refresh this page and activate. Do not paste passwords into chat or website notes.')}</p></div>`:''}<div class="accessToolbar">${r.status==='pending'?`<button class="btn primary" data-access-review="approve" data-id="${r.id}">${t('審核','Review')}</button><button class="btn soft" data-access-review="reject" data-id="${r.id}">${t('不核准','Reject')}</button>`:''}${r.status==='approved'?`<button class="btn primary" data-access-review="activate" data-id="${r.id}" ${!r.account_ready?'disabled':''}>${t('啟用已核准帳號','Activate approved account')}</button>`:''}${['approved','activated'].includes(r.status)?`<button class="btn danger" data-access-review="revoke" data-id="${r.id}">${t('停用權限','Revoke access')}</button>`:''}</div></article>`).join('')}</div>`;
}
function openAccessReview(action,id){const r=accessState.rows?.find(x=>x.id===id);if(!r)return;const approving=action==='approve';const title=approving?t('審核權限申請','Review application'):action==='activate'?t('啟用帳號','Activate account'):action==='reject'?t('不核准申請','Reject request'):t('停用權限','Revoke access');modal(title,hidden('request_id',r.id)+hidden('version',r.version)+hidden('operation',action)+`<h3>${esc(r.name)}</h3><p>${esc(r.email)}</p><p>${t('申請：','Requested: ')}${esc(accessRole(r.requested_role))}</p>`+(approving?select('role',t('由你指定實際權限','Choose the actual permissions'),[['checkin',t('學員簽到人員（受限）','Restricted check-in staff')],['admin',t('網站管理員（可管理名單、志工、活動與匯出）','Site administrator (rosters, volunteers, events and exports)')]],'checkin'):'')+`<p class="helpText">${approving?t('請核對本人及工作需求。網站管理員可查看個人資料，但無法審核其他人的申請。沒有登入帳號時會先停在「已核准，待啟用」。','Verify the person and responsibilities. Administrators can view personal records but cannot approve access. A missing login remains Approved, awaiting activation.'):action==='revoke'?t('停用後將拒絕此帳號後續後台操作，不會刪除既有出席紀錄。','Further staff requests will be denied. Existing attendance records will not be deleted.') : ''}</p>`+area('note',t('審核備註（選填）','Review note (optional)'),'','1000'),'accessReviewForm',approving?t('確認核准','Confirm approval'):title);}
const accessStaffPage=staffPage;
staffPage=function(){if(S.tab!=='access')return accessStaffPage();if(!session)return loginView(true);if(!S.data)return empty(t('讀取中…','Loading…'));if(!S.data.can_manage_access)return empty(t('只有網站負責人可以審核權限。','Only the site owner may review access.'));return accessOwnerPage();};
const accessChrome=chrome;
chrome=function(){accessChrome();if(S.page==='staff'&&S.data?.can_manage_access){const nav=document.querySelector('.secondaryWorkflowNav');if(nav&&!nav.querySelector('[data-tab="access"]'))nav.insertAdjacentHTML('beforeend',`<button type="button" data-tab="access" class="${S.tab==='access'?'active':''}">${t('權限申請／審核','Access requests')}</button>`);}};
const privacyRender=render;
render=function(){if(S.page==='apply'){chrome();$('#sectionNav').innerHTML='';$('#mobileNav').innerHTML='';$('#app').innerHTML=accessApplicationPage();}else privacyRender();prepareSharedForms();if(S.page==='staff'&&S.tab==='access'&&S.data?.can_manage_access&&!accessState.rows&&!accessState.loading&&!accessState.error)void loadAccessRequests();};
const accessLogout=logout;
logout=async function(){accessState.rows=null;accessState.error='';clearSharedIdentity(true);return accessLogout();};
document.addEventListener('submit',event=>{
 const form=event.target;if(!(form instanceof HTMLFormElement))return;const id=form.getAttribute('id');if(!['accessApplicationForm','accessReviewForm'].includes(id))return;
 event.preventDefault();event.stopImmediatePropagation();if(S.busy)return;
 const data=Object.fromEntries(new FormData(form)),button=form.querySelector('[type="submit"]');
 run(async()=>{
  try{
   if(id==='accessApplicationForm'){
    if(!data.reason?.trim()||data.reason.trim().length<2)throw Object.assign(new Error('REASON_REQUIRED'),{code:'REASON_REQUIRED'});
    await accessAPI('apply',{name:data.name.trim(),email:data.email.trim().toLowerCase(),reason:data.reason.trim(),requested_role:data.requested_role,website:data.website||''});clearSharedIdentity(true);accessState.applied=true;render();return;
   }
   if(!S.data?.can_manage_access)throw Object.assign(new Error('FORBIDDEN'),{code:'FORBIDDEN'});
   const result=await accessAPI('owner',{action:data.operation,data:{id:data.request_id,version:Number(data.version),role:data.role,note:data.note||''}},true);
   close();await loadAccessRequests();toast(result.status==='approved'?t('已核准，仍需建立／確認登入帳號。','Approved; login setup / confirmation is still required.'):t('權限設定已更新。','Access settings updated.'));
  }catch(e){const box=form.querySelector('#accessApplicationError,#formError');if(box)box.textContent=errorText(e);else throw e;}
 },button);
},true);
document.addEventListener('click',event=>{
 const el=event.target.closest('button');if(!el||S.busy)return;
 if(el.hasAttribute('data-shared-clear')){event.preventDefault();event.stopImmediatePropagation();clearSharedIdentity(true);const input=el.closest('form')?.querySelector('[name="name"]');input?.focus();return;}
 if(['kind-in','kind-out'].includes(el.dataset.action)){clearSharedIdentity(true);}
 if(el.dataset.tab==='access'){accessState.error='';accessState.rows=null;}
 if(el.hasAttribute('data-access-new')){event.preventDefault();event.stopImmediatePropagation();accessState.applied=false;clearSharedIdentity(true);render();return;}
 if(el.hasAttribute('data-access-refresh')){event.preventDefault();event.stopImmediatePropagation();void loadAccessRequests();return;}
 if(el.dataset.accessReview){event.preventDefault();event.stopImmediatePropagation();openAccessReview(el.dataset.accessReview,el.dataset.id);}
},true);
window.addEventListener('pagehide',()=>clearSharedIdentity(true));
window.addEventListener('pageshow',event=>{if(event.persisted){clearSharedIdentity(true);if(['onsite','shifts','apply'].includes(S.page))render();}});
function applyAccessPortal(){const p=new URLSearchParams(location.search);if(p.get('portal')==='apply'){S.page='apply';S.data=null;render();}else if(p.get('portal')==='staff'&&p.get('tab')==='access'){S.page='staff';S.tab='access';render();}}
clearSharedIdentity();
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',applyAccessPortal,{once:true});else applyAccessPortal();
