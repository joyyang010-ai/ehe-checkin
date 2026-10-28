'use strict';
// Task-first presentation. Existing write APIs, identity checks and permissions remain authoritative.
const uxVolunteerTabs=new Set(['service','bookings','profiles','shifts']);
let uxPushNext=false,uxRestoring=false;
if(!S.visitScope)S.visitScope='event';
function uxFragment(html){const t=document.createElement('template');t.innerHTML=html;return t.content;}
function uxHTML(fragment){const d=document.createElement('div');d.append(fragment);return d.innerHTML;}
function uxButton(tab,zh,en,active=S.tab===tab){return `<button type="button" data-tab="${tab}" class="${active?'active':''}" aria-current="${active?'page':'false'}">${t(zh,en)}</button>`;}
function uxMore(label,cls=''){const d=document.createElement('details');d.className='uxMore '+cls;const s=document.createElement('summary');s.textContent=label;d.append(s);return d;}
const uxPreviousChrome=chrome;
chrome=function(){
 uxPreviousChrome();if(S.page!=='staff'||!S.data)return;
 const host=$('#sectionNav'),existing=host.querySelector('.secondaryWorkflowNav');
 if(!isCheckinDesk()){
  const directory=existing?.querySelector('[data-tab="directory"]'),attendance=existing?.querySelector('[data-tab="attendance"]'),archive=existing?.querySelector('[data-archive-tab="archive"]'),access=existing?.querySelector('[data-tab="access"]');
  const wrap=document.createElement('div');wrap.className='workflowNav uxNav';
  const primary=document.createElement('div');primary.className='uxPrimary';primary.setAttribute('aria-label',t('工作區','Workspaces'));
  primary.innerHTML=uxButton('learners','學員簽到','Participant check-in')+uxButton('service','志工','Volunteers',uxVolunteerTabs.has(S.tab))+uxButton('overview','總覽','Overview');wrap.append(primary);
  const more=uxMore(t('更多工具','More tools'),'uxNavigationMore');
  const secondary=document.createElement('div');secondary.className='secondaryWorkflowNav uxSecondary';
  for(const button of [directory,attendance,archive,access])if(button)secondary.append(button);
  secondary.insertAdjacentHTML('beforeend',uxButton('events','活動設定','Events'));
  more.append(secondary);more.open=['directory','attendance','archive','access','events'].includes(S.tab);wrap.append(more);host.replaceChildren(wrap);
  if(uxVolunteerTabs.has(S.tab)){const sub=document.createElement('nav');sub.className='uxVolunteerNav';sub.setAttribute('aria-label',t('志工工作區','Volunteer workspace'));sub.innerHTML=uxButton('service','出席與時數','Attendance')+uxButton('bookings','報名','Bookings')+uxButton('profiles','個人檔案','Profiles')+uxButton('shifts','班次','Shifts');wrap.append(sub);}
 }
 const admin=$('#topbar [data-action="staff-login"]');if(admin)admin.hidden=true;
 const brand=$('#topbar .volBrand small');if(brand)brand.textContent=t('工作人員工作區','STAFF WORKSPACE');
};
const uxPreviousStats=participantStatsHTML;
participantStatsHTML=function(){const f=uxFragment(uxPreviousStats());f.querySelector('h2')?.remove();const section=f.querySelector('.p0Session');section.classList.add('uxCompactStats');const info=uxMore(t('統計與更新說明','How counts work'),'uxCountHelp');for(const e of [...section.querySelectorAll('.p0StatsNote,.p0Sync')])info.append(e);section.append(info);return uxHTML(f);};
// One entry point; both master search and the final same-name safeguard stay enforced.
const uxPreviousLearnerPage=learnerPage;
learnerPage=function(){
 const f=uxFragment(uxPreviousLearnerPage()),add=f.querySelector('[data-action="new-person"]');
 if(add){add.textContent=t('尋找／新增學員','Find / add participant');add.classList.remove('primary');add.classList.add('soft');}
 f.querySelector('[data-action="walkin"]')?.remove();
 const controls=f.querySelector('.p0Controls'),search=controls?.querySelector('#learnerSearch')?.closest('.field');
 if(search){controls.classList.add('uxParticipantControls');const advanced=uxMore(t('更多篩選','More filters'),'uxParticipantFilters');const group=document.createElement('div');group.className='uxFilterGrid';for(const e of [...controls.children])if(e!==search)group.append(e);advanced.append(group);advanced.open=S.category!=='all';controls.append(advanced);
  const helper=document.createElement('div');helper.className='uxMasterPrompt';helper.innerHTML=`<span>${t('本場名單找不到？','Not on this session roster?')}</span><button type="button" class="btn soft" data-ux-master>${t('搜尋全部學員','Search all participants')}</button>`;controls.after(helper);
 }
 const toolbar=f.querySelector('.actions');if(toolbar&&controls){controls.before(toolbar);}
 return uxHTML(f);
};
const uxPreviousOpenSearch=p0OpenSearch;
p0OpenSearch=function(){
 const query=String(S.tab==='directory'?S.directoryQuery||'':S.q||'').trim();uxPreviousOpenSearch();
 const form=$('#p0MasterSearch');if(!form)return;
 const note=document.createElement('p');note.className='uxDuplicateStep';note.textContent=t('步驟 1：先核對既有檔案，避免重複建檔。','Step 1: Check existing profiles before creating a new one.');form.before(note);
 form.elements.query.value=query;if(query)setTimeout(()=>{if(form.isConnected&&!S.busy)form.requestSubmit();},0);
};
walkin=p0OpenSearch;
const uxPreviousEditPerson=editPerson;
editPerson=function(id){return id?uxPreviousEditPerson(id):p0OpenSearch();};
const uxPreviousOpenNew=p0OpenNew;
p0OpenNew=function(){uxPreviousOpenNew();const form=$('#p0NewParticipant');if(form){const p=document.createElement('p');p.className='uxDuplicateStep';p.textContent=t('步驟 2：確認為新學員；儲存前會再次檢查重複資料。','Step 2: Create only for a new person. Duplicate checks run again before saving.');form.querySelector('.modalBody').prepend(p);}};
const uxPreviousResults=p0ResultsHTML;
p0ResultsHTML=function(matches){const f=uxFragment(uxPreviousResults(matches));for(const b of f.querySelectorAll('[data-p0-use]')){const p=matches.find(x=>x.id===b.dataset.p0Use);if(!b.disabled)b.textContent=p0IsToday()?t('使用既有學員並簽到','Use existing participant & check in'):t('使用既有學員報名','Use existing participant');if(p?.archived_at){b.disabled=true;b.textContent=t('已封存：請管理員核對','Archived: ask an administrator');}}return uxHTML(f);};
function uxParticipantActions(){for(const row of $$('#learnerRows [data-participant]')){const a=row.querySelector('.personActions');if(!a||a.querySelector('.uxRowMore'))continue;const extras=[...a.children].filter(el=>el.matches('[data-action="edit-person"],[data-action="void-attendance"],.archiveRowActions'));if(extras.length){const d=uxMore(t('更多','More'),'uxRowMore');for(const el of extras)d.append(el);a.append(d);}}}
const uxPreviousRows=learnerRows;
learnerRows=function(){uxPreviousRows();uxParticipantActions();};
// Bookings no longer repeats attendance.
staffBookings=function(){return `<section class="panel uxBookings"><h2>${t('預先報名','Advance bookings')}</h2><p>${t('以上方所選活動為範圍。報名不等於出席。','For the selected event above. A booking is not attendance.')}</p>${advanceBookingsHTML()}</section>`;};
const uxPreviousService=staffService;
staffService=function(){
 if(!S.visitScope)S.visitScope='event';const f=uxFragment(uxPreviousService()),scope=f.querySelector('#visitScope')?.closest('.field'),stats=f.querySelector('.visitStats');
 if(scope&&stats){const block=document.createElement('section');block.className='uxScope';block.append(scope);const p=document.createElement('p');p.textContent=S.visitScope==='all'?t('下方統計與名單包含所有活動。','The totals and roster below include all events.'):S.visitScope==='unassigned'?t('只顯示待補活動的服務紀錄。','Showing visits that need an event assigned.'):t('下方統計與名單僅限上方所選活動。','The totals and roster below cover only the selected event above.');block.append(p);stats.before(block);}
 const agreements=f.querySelector('.volunteerAgreements');if(agreements){const d=uxMore(t('聲明與同意書','Waiver & agreements'));agreements.before(d);d.append(agreements);}
 if(S.visitScope!=='event')f.querySelector('.missingVolunteerTimes')?.remove();
 return uxHTML(f);
};
// Essential fields and save action precede optional questions. Consent remains separate.
const uxPreviousOnsite=onsitePage;
onsitePage=function(){
 const f=uxFragment(uxPreviousOnsite()),form=f.querySelector('#quickVisitForm');if(!form)return uxHTML(f);
 const event=form.elements.event_id,events=visitEvents();event.required=false;
 const explicit=entryQuery.get('event');if(!event.value&&explicit&&events.some(e=>e.id===explicit)&&S.kind==='in')event.value=explicit;
 for(const option of event.options)option.toggleAttribute('selected',option.value===event.value);
 const first=event.querySelector('option[value=""]');if(first)first.textContent=S.kind==='in'?t('活動未列出／稍後補充','Event not listed / assign later'):t('自動尋找未結束的簽到','Match my open check-in');
 const label=form.querySelector('label[for="f-event_id"]');if(label)label.textContent=t('服務活動（選填）','Event (optional)');
 const detail=event.closest('details'),body=detail?.querySelector('.visitOptionalBody');if(detail)detail.querySelector('summary').textContent=t('活動與職位（選填）','Event and role (optional)');
 if(body){for(const p of [...body.querySelectorAll(':scope > .helpText')])p.remove();const p=document.createElement('p');p.className='helpText';p.textContent=t('活動未列出仍可簽到；時間會保留，由工作人員稍後補充活動。','Event not listed? Your time can still be recorded; staff can assign the event later.');body.append(p);}
 if(event.value){const s=entryQuery.get('shift')||'';const sf=form.querySelector('#visitShiftField');if(sf)sf.innerHTML=visitShiftField(event.value,s);}
 const button=form.querySelector('.visitSubmit'),error=form.querySelector('#quickVisitError');
 if(detail&&button){const block=document.createElement('div');block.className='uxSubmitBlock';block.append(error,button);const note=document.createElement('p');note.className='helpText';note.textContent=t('看到成功訊息才代表時間已儲存。','Wait for the saved-time confirmation before leaving.');block.append(note);detail.after(block);}
 const agreements=form.querySelector('.volunteerAgreements');if(agreements){const d=uxMore(t('聲明與同意書（簽到不代表簽署）','Waiver & agreements (check-in is not consent)'));agreements.before(d);d.append(agreements);}
 return uxHTML(f);
};
submitQuickVisit=async function(form){
 if(S.busy||!form.reportValidity())return;const fd=new FormData(form),f=Object.fromEntries(fd),kind=form.dataset.kind;
 const data=kind==='in'?{needs_support:f.needs_support==='yes',support_details:f.support_details||'',unassigned_event:!f.event_id}:{duties:fd.getAll('duties'),observations:fd.getAll('observations'),duty_other:f.duty_other||'',observation_other:f.observation_other||'',specific_observations:f.specific_observations||'',went_well:f.went_well||'',improvements:f.improvements||''};
 const payload={kind,name:f.name.trim(),email:f.email.trim().toLowerCase(),event_id:f.event_id||null,shift_id:f.shift_id||null,role:f.role||null,data,website:f.website||''};
 const request_id=visitIdFor(form,payload),button=form.querySelector('[type="submit"]');S.busy=true;button.disabled=true;$('#quickVisitError').textContent='';
 try{const result=await visitRequest('visit',{...payload,request_id});if(result.recorded!==true||!['checked_in','checked_out','already_checked_in','already_checked_out'].includes(result.status))throw Object.assign(new Error('INVALID_RESPONSE'),{code:'INVALID_RESPONSE'});form.reset();S.name='';S.email='';render();visitReceipt(result);}
 catch(e){const el=$('#quickVisitError');if(el){el.textContent=errorText(e);el.tabIndex=-1;el.focus();}else toast(errorText(e));}
 finally{S.busy=false;if(button.isConnected)button.disabled=false;}
};
const uxPreviousManage=managePage;
managePage=function(){if(session||C.emailEnabled)return uxPreviousManage();return heading(t('報名協助','Booking help'),t('線上自助更改尚未開放','Online booking changes are not yet available'))+`<section class="panel uxBookingHelp"><p>${t('請將姓名、報名電郵、活動及班次提供給帶領人員，說明要更改或取消。','Contact your coordinator with your name, signup email, event and shift, and say what you need changed or cancelled.')}</p><label for="uxBookingMessage">${t('可複製的訊息範本','Message template to copy')}</label><textarea id="uxBookingMessage" readonly rows="5">${t('姓名：\n報名電郵：\n活動／日期：\n班次：\n更改或取消需求：','Name:\nSignup email:\nEvent / date:\nShift:\nChange or cancellation requested:')}</textarea><div class="actions"><button type="button" class="btn soft" data-ux-copy>${t('複製訊息','Copy message')}</button><button type="button" class="btn soft" data-nav="shifts">${t('查看班次','View shifts')}</button>${btn(t('簽到／簽退','Check in / out'),'onsite','','primary')}</div><p class="helpText">${t('複製不會送出訊息或取消報名。簽到簽退不需登入。','Copying does not send a message or cancel a booking. Check-in and checkout do not require sign-in.')}</p></section>`;};
// Context only: URLs never contain search terms, names, emails or authentication material.
updatePortalAddress=function(page){if(location.hash)return;const u=new URL(location.href);if(u.pathname.endsWith('/volunteer.html')&&page!=='onsite')u.pathname=u.pathname.replace(/volunteer\.html$/,'');u.search='';u.searchParams.set('portal',page);if(S.lang==='zh')u.searchParams.set('lang','zh');if(page==='staff'){u.searchParams.set('tab',S.tab||'learners');if(S.event)u.searchParams.set('event',S.event);if(S.tab==='service'){u.searchParams.set('scope',S.visitScope||'event');u.searchParams.set('status',S.visitStatus||'all');}if(S.tab==='learners'){u.searchParams.set('category',S.category||'all');u.searchParams.set('attendance',S.attendance||'all');}if(S.tab==='attendance'){if(S.compareA)u.searchParams.set('session_a',S.compareA);if(S.compareB)u.searchParams.set('session_b',S.compareB);u.searchParams.set('filter',S.compareFilter||'both');}}if(page==='onsite'){u.searchParams.set('action',S.kind==='out'?'out':'in');if(S.shift)u.searchParams.set('shift',S.shift);if(entryQuery.get('event'))u.searchParams.set('event',entryQuery.get('event'));}if(u.href!==location.href){history[uxPushNext&&!uxRestoring?'pushState':'replaceState'](null,'',u.pathname+u.search);uxPushNext=false;}};
window.addEventListener('click',ev=>{if(S.busy)return;const b=ev.target.closest('button');if(b&&(b.matches('[data-tab],[data-nav],[data-archive-tab],[data-program-event],[data-visit-scope],[data-workspace-filter]')||['onsite','staff-login'].includes(b.dataset.action)))uxPushNext=true;},true);
window.addEventListener('change',ev=>{if(!S.busy&&['activeEvent','visitScope','visitStatus','compareSessionA','compareSessionB','compareFilter','categoryFilter','attendanceFilter'].includes(ev.target.id))uxPushNext=true;},true);
window.addEventListener('popstate',async()=>{uxRestoring=true;uxPushNext=false;close();const q=new URLSearchParams(location.search);for(const k of ['event','shift']){if(q.has(k))entryQuery.set(k,q.get(k));else entryQuery.delete(k);}S.shift=q.get('shift')||'';S.page=location.pathname.endsWith('/volunteer.html')?'onsite':['staff','shifts','manage','onsite'].includes(q.get('portal'))?q.get('portal'):'shifts';S.tab=['learners','service','bookings','profiles','shifts','overview','events','directory','attendance','archive','access'].includes(q.get('tab'))?q.get('tab'):'learners';S.event=q.get('event')||'';S.lang=q.get('lang')==='zh'?'zh':'en';S.kind=q.get('action')==='out'?'out':'in';S.q='';S.visitQuery='';S.visitScope=['event','all','unassigned'].includes(q.get('scope'))?q.get('scope'):'event';S.visitStatus=['all','attention','active','completed','missing_checkout','walkin'].includes(q.get('status'))?q.get('status'):'all';S.category=['all','new','walkin','incomplete','archived'].includes(q.get('category'))?q.get('category'):'all';S.attendance=['all','waiting','checked'].includes(q.get('attendance'))?q.get('attendance'):'all';S.compareA=q.get('session_a')||'';S.compareB=q.get('session_b')||'';S.compareFilter=['all','both','one','any','none','review'].includes(q.get('filter'))?q.get('filter'):'both';S.compareInitialized=false;p0PhoneMatches=null;p0LookupEpoch++;S.data=null;try{await refresh();}finally{uxRestoring=false;}});
document.addEventListener('click',async ev=>{const b=ev.target.closest('[data-ux-master],[data-ux-copy]');if(!b||S.busy)return;ev.preventDefault();if(b.hasAttribute('data-ux-master')){p0OpenSearch();return;}const el=$('#uxBookingMessage');try{await navigator.clipboard.writeText(el.value);toast(t('已複製；請自行傳送給帶領人員。','Copied. Send it to your coordinator.'));}catch{el.focus();el.select();toast(t('請複製已選取的訊息。','Copy the selected message.'));}});
function uxPolish(){
 document.body.dataset.workspace=S.page==='staff'?S.tab:'';document.body.classList.toggle('staffLive',S.page==='staff'&&!!S.data);
 const event=$('#app .pageTitle .eventControl');if(event&&(['directory','profiles','access','archive'].includes(S.tab)||S.tab==='service'&&S.visitScope!=='event'))event.hidden=true;
 const title=$('#app .pageTitle h1');if(title&&S.page==='staff'&&S.data&&uxVolunteerTabs.has(S.tab))title.textContent=S.tab==='service'?t('志工出席與時數','Volunteer attendance'):S.tab==='bookings'?t('志工報名','Volunteer bookings'):S.tab==='profiles'?t('志工檔案','Volunteer profiles'):t('志工班次','Volunteer shifts');
 const form=$('#quickVisitForm');if(form)form.elements.event_id.required=false;
 for(const a of $$('a[href*="account.html"]')){const u=new URL(a.href);if(S.lang==='zh')u.searchParams.set('lang','zh');a.href=u.href;if(a.textContent==='Forgot password?')a.textContent=t('忘記密碼？','Forgot password?');if(a.textContent==='Create staff account')a.textContent=t('建立工作人員帳號','Create staff account');}
 uxParticipantActions();
}
const uxPreviousRender=render;render=function(){uxPreviousRender();uxPolish();};
document.addEventListener('change',ev=>{if(['categoryFilter','attendanceFilter'].includes(ev.target.id))updatePortalAddress(S.page);});
render();
