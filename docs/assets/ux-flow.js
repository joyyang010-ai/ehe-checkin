'use strict';
// v1.18: task-first presentation. Existing write APIs, identity checks and permissions stay authoritative.
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
  const primary=document.createElement('div');primary.className='uxPrimary';primary.setAttribute('aria-label',t('\u5de5\u4f5c\u5340','Workspaces'));
  primary.innerHTML=uxButton('learners','\u5b78\u54e1\u7c3d\u5230','Participant check-in')+uxButton('service','\u5fd7\u5de5','Volunteers',uxVolunteerTabs.has(S.tab))+uxButton('overview','\u7e3d\u89bd','Overview');wrap.append(primary);
  const more=uxMore(t('\u66f4\u591a\u5de5\u5177','More tools'),'uxNavigationMore');
  const secondary=document.createElement('div');secondary.className='secondaryWorkflowNav uxSecondary';
  for(const button of [directory,attendance,archive,access])if(button)secondary.append(button);
  secondary.insertAdjacentHTML('beforeend',uxButton('events','\u6d3b\u52d5\u8a2d\u5b9a','Events'));
  more.append(secondary);more.open=['directory','attendance','archive','access','events'].includes(S.tab);wrap.append(more);host.replaceChildren(wrap);
  if(uxVolunteerTabs.has(S.tab)){const sub=document.createElement('nav');sub.className='uxVolunteerNav';sub.setAttribute('aria-label',t('\u5fd7\u5de5\u5de5\u4f5c\u5340','Volunteer workspace'));sub.innerHTML=uxButton('service','\u51fa\u5e2d\u8207\u6642\u6578','Attendance')+uxButton('bookings','\u5831\u540d','Bookings')+uxButton('profiles','\u500b\u4eba\u6a94\u6848','Profiles')+uxButton('shifts','\u73ed\u6b21','Shifts');wrap.append(sub);}
 }
 const admin=$('#topbar [data-action="staff-login"]');if(admin)admin.hidden=true;
 const brand=$('#topbar .volBrand small');if(brand)brand.textContent=t('\u5de5\u4f5c\u4eba\u54e1\u5de5\u4f5c\u5340','STAFF WORKSPACE');
};
// Compact metrics retain the same IDs and calculation used by the existing acceptance tests.
const uxPreviousStats=participantStatsHTML;
participantStatsHTML=function(){const f=uxFragment(uxPreviousStats());f.querySelector('h2')?.remove();const section=f.querySelector('.p0Session');section.classList.add('uxCompactStats');const info=uxMore(t('\u7d71\u8a08\u8207\u66f4\u65b0\u8aaa\u660e','How counts work'),'uxCountHelp');for(const e of [...section.querySelectorAll('.p0StatsNote,.p0Sync')])info.append(e);section.append(info);return uxHTML(f);};
// One entry point, with master search and final same-name protection still enforced.
const uxPreviousLearnerPage=learnerPage;
learnerPage=function(){
 const f=uxFragment(uxPreviousLearnerPage()),add=f.querySelector('[data-action="new-person"]');
 if(add){add.textContent=t('\u5c0b\u627e\uff0f\u65b0\u589e\u5b78\u54e1','Find / add participant');add.classList.remove('primary');add.classList.add('soft');}
 f.querySelector('[data-action="walkin"]')?.remove();
 const controls=f.querySelector('.p0Controls'),search=controls?.querySelector('#learnerSearch')?.closest('.field');
 if(search){controls.classList.add('uxParticipantControls');const advanced=uxMore(t('\u66f4\u591a\u7be9\u9078','More filters'),'uxParticipantFilters');const group=document.createElement('div');group.className='uxFilterGrid';for(const e of [...controls.children])if(e!==search)group.append(e);advanced.append(group);advanced.open=S.category!=='all';controls.append(advanced);
  const helper=document.createElement('div');helper.className='uxMasterPrompt';helper.innerHTML=`<span>${t('\u672c\u5834\u540d\u55ae\u627e\u4e0d\u5230\uff1f','Not on this session roster?')}</span><button type="button" class="btn soft" data-ux-master>${t('\u641c\u5c0b\u5168\u90e8\u5b78\u54e1','Search all participants')}</button>`;controls.after(helper);
 }
 const toolbar=f.querySelector('.actions');if(toolbar&&controls){controls.before(toolbar);}
 return uxHTML(f);
};
const uxPreviousOpenSearch=p0OpenSearch;
p0OpenSearch=function(){
 const query=String(S.tab==='directory'?S.directoryQuery||'':S.q||'').trim();uxPreviousOpenSearch();
 const form=$('#p0MasterSearch');if(!form)return;
 const note=document.createElement('p');note.className='uxDuplicateStep';note.textContent=t('\u6b65\u9a5f 1\uff1a\u5148\u6838\u5c0d\u65e2\u6709\u6a94\u6848\uff0c\u907f\u514d\u91cd\u8907\u5efa\u6a94\u3002','Step 1: Check existing profiles before creating a new one.');form.before(note);
 form.elements.query.value=query;if(query)setTimeout(()=>{if(form.isConnected&&!S.busy)form.requestSubmit();},0);
};
walkin=p0OpenSearch;
const uxPreviousEditPerson=editPerson;
editPerson=function(id){return id?uxPreviousEditPerson(id):p0OpenSearch();};
const uxPreviousOpenNew=p0OpenNew;
p0OpenNew=function(){uxPreviousOpenNew();const form=$('#p0NewParticipant');if(form){const p=document.createElement('p');p.className='uxDuplicateStep';p.textContent=t('\u6b65\u9a5f 2\uff1a\u78ba\u8a8d\u70ba\u65b0\u5b78\u54e1\uff1b\u5132\u5b58\u524d\u6703\u518d\u6b21\u6aa2\u67e5\u91cd\u8907\u8cc7\u6599\u3002','Step 2: Create only for a new person. Duplicate checks run again before saving.');form.querySelector('.modalBody').prepend(p);}};
const uxPreviousResults=p0ResultsHTML;
p0ResultsHTML=function(matches){const f=uxFragment(uxPreviousResults(matches));for(const b of f.querySelectorAll('[data-p0-use]')){const p=matches.find(x=>x.id===b.dataset.p0Use);if(!b.disabled)b.textContent=p0IsToday()?t('\u4f7f\u7528\u65e2\u6709\u5b78\u54e1\u4e26\u7c3d\u5230','Use existing participant & check in'):t('\u4f7f\u7528\u65e2\u6709\u5b78\u54e1\u5831\u540d','Use existing participant');if(p?.archived_at){b.disabled=true;b.textContent=t('\u5df2\u5c01\u5b58\uff1a\u8acb\u7ba1\u7406\u54e1\u6838\u5c0d','Archived: ask an administrator');}}return uxHTML(f);};
function uxParticipantActions(){for(const row of $$('#learnerRows [data-participant]')){const a=row.querySelector('.personActions');if(!a||a.querySelector('.uxRowMore'))continue;const extras=[...a.children].filter(el=>el.matches('[data-action="edit-person"],[data-action="void-attendance"],.archiveRowActions'));if(extras.length){const d=uxMore(t('\u66f4\u591a','More'),'uxRowMore');for(const el of extras)d.append(el);a.append(d);}}}
const uxPreviousRows=learnerRows;
learnerRows=function(){uxPreviousRows();uxParticipantActions();};
// Bookings no longer embeds the attendance workspace a second time.
staffBookings=function(){return `<section class="panel uxBookings"><h2>${t('\u9810\u5148\u5831\u540d','Advance bookings')}</h2><p>${t('\u4ee5\u4e0a\u65b9\u6240\u9078\u6d3b\u52d5\u70ba\u7bc4\u570d\u3002\u5831\u540d\u4e0d\u7b49\u65bc\u51fa\u5e2d\u3002','For the selected event above. A booking is not attendance.')}</p>${advanceBookingsHTML()}</section>`;};
const uxPreviousService=staffService;
staffService=function(){
 if(!S.visitScope)S.visitScope='event';const f=uxFragment(uxPreviousService()),scope=f.querySelector('#visitScope')?.closest('.field'),stats=f.querySelector('.visitStats');
 if(scope&&stats){const block=document.createElement('section');block.className='uxScope';block.append(scope);const p=document.createElement('p');p.textContent=S.visitScope==='all'?t('\u4e0b\u65b9\u7d71\u8a08\u8207\u540d\u55ae\u5305\u542b\u6240\u6709\u6d3b\u52d5\u3002','The totals and roster below include all events.'):S.visitScope==='unassigned'?t('\u53ea\u986f\u793a\u5f85\u88dc\u6d3b\u52d5\u7684\u670d\u52d9\u7d00\u9304\u3002','Showing visits that need an event assigned.'):t('\u4e0b\u65b9\u7d71\u8a08\u8207\u540d\u55ae\u50c5\u9650\u4e0a\u65b9\u6240\u9078\u6d3b\u52d5\u3002','The totals and roster below cover only the selected event above.');block.append(p);stats.before(block);}
 const agreements=f.querySelector('.volunteerAgreements');if(agreements){const d=uxMore(t('\u8072\u660e\u8207\u540c\u610f\u66f8','Waiver & agreements'));agreements.before(d);d.append(agreements);}
 if(S.visitScope!=='event')f.querySelector('.missingVolunteerTimes')?.remove();
 return uxHTML(f);
};
// The submission CTA follows identity and event. Additional questions remain in the same form.
const uxPreviousOnsite=onsitePage;
onsitePage=function(){
 const f=uxFragment(uxPreviousOnsite()),form=f.querySelector('#quickVisitForm');if(!form)return uxHTML(f);
 const event=form.elements.event_id,events=visitEvents();event.required=false;
 const explicit=entryQuery.get('event');if(!event.value&&explicit&&events.some(e=>e.id===explicit)&&S.kind==='in')event.value=explicit;
 for(const option of event.options)option.toggleAttribute('selected',option.value===event.value);
 const first=event.querySelector('option[value=""]');if(first)first.textContent=S.kind==='in'?t('\u6d3b\u52d5\u672a\u5217\u51fa\uff0f\u7a0d\u5f8c\u88dc\u5145','Event not listed / assign later'):t('\u81ea\u52d5\u5c0b\u627e\u672a\u7d50\u675f\u7684\u7c3d\u5230','Match my open check-in');
 const label=form.querySelector('label[for="f-event_id"]');if(label)label.textContent=t('\u670d\u52d9\u6d3b\u52d5\uff08\u9078\u586b\uff09','Event (optional)');
 const detail=event.closest('details'),body=detail?.querySelector('.visitOptionalBody');if(detail){detail.querySelector('summary').textContent=t('\u6d3b\u52d5\u8207\u8077\u4f4d\uff08\u9078\u586b\uff09','Event and role (optional)');}
 if(body){for(const p of [...body.querySelectorAll(':scope > .helpText')])p.remove();const p=document.createElement('p');p.className='helpText';p.textContent=t('\u6d3b\u52d5\u672a\u5217\u51fa\u4ecd\u53ef\u7c3d\u5230\uff1b\u6642\u9593\u6703\u4fdd\u7559\uff0c\u7531\u5de5\u4f5c\u4eba\u54e1\u7a0d\u5f8c\u88dc\u5145\u6d3b\u52d5\u3002','Event not listed? Your time can still be recorded; staff can assign the event later.');body.append(p);}
 if(event.value){const s=entryQuery.get('shift')||'';const sf=form.querySelector('#visitShiftField');if(sf)sf.innerHTML=visitShiftField(event.value,s);}
 const button=form.querySelector('.visitSubmit'),error=form.querySelector('#quickVisitError');
 if(detail&&button){const block=document.createElement('div');block.className='uxSubmitBlock';block.append(error,button);const note=document.createElement('p');note.className='helpText';note.textContent=t('\u770b\u5230\u6210\u529f\u8a0a\u606f\u624d\u4ee3\u8868\u6642\u9593\u5df2\u5132\u5b58\u3002','Wait for the saved-time confirmation before leaving.');block.append(note);detail.after(block);}
 const agreements=form.querySelector('.volunteerAgreements');if(agreements){const d=uxMore(t('\u8072\u660e\u8207\u540c\u610f\u66f8\uff08\u7c3d\u5230\u4e0d\u4ee3\u8868\u7c3d\u7f72\uff09','Waiver & agreements (check-in is not consent)'));agreements.before(d);d.append(agreements);}
 return uxHTML(f);
};
// Uses the existing idempotency key and validated endpoint. Optional-event data never grants privileges.
submitQuickVisit=async function(form){
 if(S.busy||!form.reportValidity())return;const fd=new FormData(form),f=Object.fromEntries(fd),kind=form.dataset.kind;
 const data=kind==='in'?{needs_support:f.needs_support==='yes',support_details:f.support_details||'',unassigned_event:!f.event_id}:{duties:fd.getAll('duties'),observations:fd.getAll('observations'),duty_other:f.duty_other||'',observation_other:f.observation_other||'',specific_observations:f.specific_observations||'',went_well:f.went_well||'',improvements:f.improvements||''};
 const payload={kind,name:f.name.trim(),email:f.email.trim().toLowerCase(),event_id:f.event_id||null,shift_id:f.shift_id||null,role:f.role||null,data,website:f.website||''};
 const request_id=visitIdFor(form,payload),button=form.querySelector('[type="submit"]');S.busy=true;button.disabled=true;$('#quickVisitError').textContent='';
 try{const result=await visitRequest('visit',{...payload,request_id});if(result.recorded!==true||!['checked_in','checked_out','already_checked_in','already_checked_out'].includes(result.status))throw Object.assign(new Error('INVALID_RESPONSE'),{code:'INVALID_RESPONSE'});form.reset();S.name='';S.email='';render();visitReceipt(result);}
 catch(e){const el=$('#quickVisitError');if(el){el.textContent=errorText(e);el.tabIndex=-1;el.focus();}else toast(errorText(e));}
 finally{S.busy=false;if(button.isConnected)button.disabled=false;}
};
// Do not offer a disabled email-only booking-management form as a usable workflow.
const uxPreviousManage=managePage;
managePage=function(){if(session||C.emailEnabled)return uxPreviousManage();return heading(t('\u5831\u540d\u5354\u52a9','Booking help'),t('\u7dda\u4e0a\u81ea\u52a9\u66f4\u6539\u5c1a\u672a\u958b\u653e','Online booking changes are not yet available'))+`<section class="panel uxBookingHelp"><p>${t('\u8acb\u5c07\u59d3\u540d\u3001\u5831\u540d\u96fb\u90f5\u3001\u6d3b\u52d5\u53ca\u73ed\u6b21\u63d0\u4f9b\u7d66\u5e36\u9818\u4eba\u54e1\uff0c\u8aaa\u660e\u8981\u66f4\u6539\u6216\u53d6\u6d88\u3002','Contact your coordinator with your name, signup email, event and shift, and say what you need changed or cancelled.')}</p><label for="uxBookingMessage">${t('\u53ef\u8907\u88fd\u7684\u8a0a\u606f\u7bc4\u672c','Message template to copy')}</label><textarea id="uxBookingMessage" readonly rows="5">${t('\u59d3\u540d\uff1a\n\u5831\u540d\u96fb\u90f5\uff1a\n\u6d3b\u52d5\uff0f\u65e5\u671f\uff1a\n\u73ed\u6b21\uff1a\n\u66f4\u6539\u6216\u53d6\u6d88\u9700\u6c42\uff1a','Name:\nSignup email:\nEvent / date:\nShift:\nChange or cancellation requested:')}</textarea><div class="actions"><button type="button" class="btn soft" data-ux-copy>${t('\u8907\u88fd\u8a0a\u606f','Copy message')}</button>${btn(t('\u67e5\u770b\u73ed\u6b21','View shifts'),'ux-shifts','','soft')}${btn(t('\u7c3d\u5230\uff0f\u7c3d\u9000','Check in / out'),'onsite','','primary')}</div><p class="helpText">${t('\u8907\u88fd\u4e0d\u6703\u9001\u51fa\u8a0a\u606f\u6216\u53d6\u6d88\u5831\u540d\u3002\u7c3d\u5230\u7c3d\u9000\u4e0d\u9700\u767b\u5165\u3002','Copying does not send a message or cancel a booking. Check-in and checkout do not require sign-in.')}</p></section>`;};
// URLs contain context only, never search terms, names, emails or authentication material.
updatePortalAddress=function(page){if(location.hash)return;const u=new URL(location.href);if(u.pathname.endsWith('/volunteer.html')&&page!=='onsite')u.pathname=u.pathname.replace(/volunteer\.html$/,'');u.search='';u.searchParams.set('portal',page);if(S.lang==='zh')u.searchParams.set('lang','zh');if(page==='staff'){u.searchParams.set('tab',S.tab||'learners');if(S.event)u.searchParams.set('event',S.event);if(S.tab==='service'){u.searchParams.set('scope',S.visitScope||'event');u.searchParams.set('status',S.visitStatus||'all');}if(S.tab==='learners'){u.searchParams.set('category',S.category||'all');u.searchParams.set('attendance',S.attendance||'all');}if(S.tab==='attendance'){if(S.compareA)u.searchParams.set('session_a',S.compareA);if(S.compareB)u.searchParams.set('session_b',S.compareB);u.searchParams.set('filter',S.compareFilter||'both');}}if(page==='onsite'){u.searchParams.set('action',S.kind==='out'?'out':'in');if(S.shift)u.searchParams.set('shift',S.shift);if(entryQuery.get('event'))u.searchParams.set('event',entryQuery.get('event'));}if(u.href!==location.href){history[uxPushNext&&!uxRestoring?'pushState':'replaceState'](null,'',u.pathname+u.search);uxPushNext=false;}};
window.addEventListener('click',ev=>{if(S.busy)return;const b=ev.target.closest('button');if(b&&(b.matches('[data-tab],[data-nav],[data-archive-tab],[data-program-event],[data-visit-scope],[data-workspace-filter]')||['onsite','staff-login'].includes(b.dataset.action)))uxPushNext=true;},true);
window.addEventListener('change',ev=>{if(!S.busy&&['activeEvent','visitScope','visitStatus','compareSessionA','compareSessionB','compareFilter','categoryFilter','attendanceFilter'].includes(ev.target.id))uxPushNext=true;},true);
window.addEventListener('popstate',async()=>{uxRestoring=true;uxPushNext=false;close();const q=new URLSearchParams(location.search);S.page=location.pathname.endsWith('/volunteer.html')?'onsite':['staff','shifts','manage','onsite'].includes(q.get('portal'))?q.get('portal'):'shifts';S.tab=['learners','service','bookings','profiles','shifts','overview','events','directory','attendance','archive','access'].includes(q.get('tab'))?q.get('tab'):'learners';S.event=q.get('event')||'';S.lang=q.get('lang')==='zh'?'zh':'en';S.kind=q.get('action')==='out'?'out':'in';S.q='';S.visitQuery='';S.visitScope=['event','all','unassigned'].includes(q.get('scope'))?q.get('scope'):'event';S.visitStatus=['all','attention','active','completed','missing_checkout','walkin'].includes(q.get('status'))?q.get('status'):'all';S.category=['all','new','walkin','incomplete','archived'].includes(q.get('category'))?q.get('category'):'all';S.attendance=['all','waiting','checked'].includes(q.get('attendance'))?q.get('attendance'):'all';S.compareA=q.get('session_a')||'';S.compareB=q.get('session_b')||'';S.compareFilter=['all','both','one','any','none','review'].includes(q.get('filter'))?q.get('filter'):'both';S.compareInitialized=false;p0PhoneMatches=null;p0LookupEpoch++;S.data=null;try{await refresh();}finally{uxRestoring=false;}});
document.addEventListener('click',async ev=>{const b=ev.target.closest('[data-ux-master],[data-ux-copy],[data-action="ux-shifts"]');if(!b||S.busy)return;ev.preventDefault();if(b.hasAttribute('data-ux-master')){p0OpenSearch();return;}if(b.hasAttribute('data-ux-copy')){const el=$('#uxBookingMessage');try{await navigator.clipboard.writeText(el.value);toast(t('\u5df2\u8907\u88fd\uff1b\u8acb\u81ea\u884c\u50b3\u9001\u7d66\u5e36\u9818\u4eba\u54e1\u3002','Copied. Send it to your coordinator.'));}catch{el.focus();el.select();toast(t('\u8acb\u8907\u88fd\u5df2\u9078\u53d6\u7684\u8a0a\u606f\u3002','Copy the selected message.'));}return;}uxPushNext=true;run(()=>nav('shifts'),b);});
function uxPolish(){
 document.body.dataset.workspace=S.page==='staff'?S.tab:'';
 const event=$('#app .pageTitle .eventControl');if(event&&(['directory','profiles','access','archive'].includes(S.tab)||S.tab==='service'&&S.visitScope!=='event'))event.hidden=true;
 const title=$('#app .pageTitle h1');if(title&&S.page==='staff'&&S.data&&uxVolunteerTabs.has(S.tab))title.textContent=S.tab==='service'?t('\u5fd7\u5de5\u51fa\u5e2d\u8207\u6642\u6578','Volunteer attendance'):S.tab==='bookings'?t('\u5fd7\u5de5\u5831\u540d','Volunteer bookings'):S.tab==='profiles'?t('\u5fd7\u5de5\u6a94\u6848','Volunteer profiles'):t('\u5fd7\u5de5\u73ed\u6b21','Volunteer shifts');
 const form=$('#quickVisitForm');if(form)form.elements.event_id.required=false;
 for(const a of $$('a[href*="account.html"]')){const u=new URL(a.href);if(S.lang==='zh')u.searchParams.set('lang','zh');a.href=u.href;if(a.textContent==='Forgot password?')a.textContent=t('\u5fd8\u8a18\u5bc6\u78bc\uff1f','Forgot password?');if(a.textContent==='Create staff account')a.textContent=t('\u5efa\u7acb\u5de5\u4f5c\u4eba\u54e1\u5e33\u865f','Create staff account');}
 uxParticipantActions();
}
const uxPreviousRender=render;render=function(){uxPreviousRender();uxPolish();};
document.addEventListener('change',ev=>{if(['categoryFilter','attendanceFilter'].includes(ev.target.id))updatePortalAddress(S.page);});
render();
