'use strict';
// Read-only comparison of saved participant check-ins. Identity is never inferred or merged.
const sessionAttendanceAllowed=()=>!!session&&!!S.data&&['admin','staff'].includes(S.data.role);
const sessionAttendanceNorm=v=>String(v||'').normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g,' ');
const sessionAttendanceOptions=()=>[...(S.data?.events||[])].sort((a,b)=>a.event_date.localeCompare(b.event_date)||a.id.localeCompare(b.id));
function sessionAttendanceSelection(){
 const events=sessionAttendanceOptions();
 if(!S.compareInitialized){
  const courses=events.filter(e=>e.event_type==='course'),current=selectedEvent();
  let pool=courses.filter(e=>current?.cycle_code&&e.cycle_code===current.cycle_code);
  if(pool.length<2){const cycle=courses.find(e=>courses.filter(x=>x.cycle_code===e.cycle_code).length>=2)?.cycle_code;pool=cycle?courses.filter(e=>e.cycle_code===cycle):events;}
  if(!events.some(e=>e.id===S.compareA))S.compareA=pool[0]?.id||'';
  if(!events.some(e=>e.id===S.compareB))S.compareB=pool.find(e=>e.id!==S.compareA)?.id||'';
  S.compareInitialized=events.length>0;
 }
 return {events,a:events.find(e=>e.id===S.compareA),b:events.find(e=>e.id===S.compareB)};
}
function sessionAttendanceModel(data,aId,bId){
 const people=new Map((data.people||[]).filter(p=>p.kind==='participant').map(p=>[p.id,p]));
 const enrollments=(data.enrollments||[]).filter(r=>r.event_id===aId||r.event_id===bId);
 const records=new Map();
 for(const r of enrollments){if(!records.has(r.person_id))records.set(r.person_id,{person:people.get(r.person_id)||{id:r.person_id,name:'Profile unavailable'},a:[],b:[]});records.get(r.person_id)[r.event_id===aId?'a':'b'].push(r);}
 const byEnrollment=new Map();for(const r of data.attendance||[]){if(r.voided)continue;if(!byEnrollment.has(r.enrollment_id))byEnrollment.set(r.enrollment_id,[]);byEnrollment.get(r.enrollment_id).push(r);}
 function state(regs){const at=regs.flatMap(r=>byEnrollment.get(r.id)||[]),arrivals=at.filter(r=>r.status==='checked_in').sort((x,y)=>(x.checked_in_at||'').localeCompare(y.checked_in_at||''));
  return arrivals.length?{status:'checked_in',at:arrivals[0].checked_in_at}:at.some(r=>r.status==='absent')?{status:'absent'}:at.some(r=>r.status==='no_show')?{status:'no_show'}:{status:regs.length?'unrecorded':'not_enrolled'};
 }
 const rows=[...records.values()].map(r=>{const a=state(r.a),b=state(r.b);return {person:r.person,a,b,total:Number(a.status==='checked_in')+Number(b.status==='checked_in'),possible:false};});
 const groups=new Map();for(const r of rows){const key=sessionAttendanceNorm(r.person.name);if(!key)continue;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}
 const possible=[...groups.values()].filter(group=>group.length>1);for(const group of possible)for(const row of group)row.possible=true;
 rows.sort((x,y)=>String(x.person.name).localeCompare(String(y.person.name),S.lang==='zh'?'zh-Hant':'en')||x.person.id.localeCompare(y.person.id));
 return {rows,possible,first:rows.filter(r=>r.a.status==='checked_in').length,second:rows.filter(r=>r.b.status==='checked_in').length,both:rows.filter(r=>r.total===2).length,either:rows.filter(r=>r.total>0).length};
}
function sessionAttendanceStateHTML(state){const labels={checked_in:t('已簽到','Checked in'),absent:t('已記錄缺席','Recorded absent'),no_show:t('已記錄未到場','Recorded no-show'),unrecorded:t('沒有簽到紀錄','No check-in recorded'),not_enrolled:t('不在本場名單','Not on this roster')};
 return `<span class="comparisonStatus ${state.status==='checked_in'?'isPresent':'isUnknown'}">${state.status==='checked_in'?'\u2713 ':''}${labels[state.status]}</span>${state.status==='checked_in'?`<small>${state.at?esc(stamp(state.at)):t('未記錄時間','Time not recorded')}</small>`:''}`;
}
function sessionAttendanceResults(){
 if(!sessionAttendanceAllowed())return '';
 const {a,b}=sessionAttendanceSelection();if(!a||!b)return empty(t('請選擇兩個場次。','Select two sessions.'));if(a.id===b.id)return `<p class="subtleBox" role="alert">${t('請選擇兩個不同場次。','Choose two different sessions to compare.')}</p>`;
 const model=sessionAttendanceModel(S.data,a.id,b.id),q=sessionAttendanceNorm(S.compareQuery),filter=S.compareFilter||'both';
 const rows=model.rows.filter(r=>(filter==='all'||filter==='both'&&r.total===2||filter==='one'&&r.total===1||filter==='any'&&r.total>0||filter==='none'&&r.total===0||filter==='review'&&r.possible)&&sessionAttendanceNorm([r.person.name,r.person.alias,r.person.id].join(' ')).includes(q));
 const metrics=[['first',t('場次 A 已簽到','Session A checked in'),model.first],['second',t('場次 B 已簽到','Session B checked in'),model.second],['both',t('兩場都出席','Attended both'),model.both],['either',t('至少出席一場','Attended either'),model.either]];
 const review=model.possible.length?`<details class="comparisonReview"><summary>${t('可能重複的姓名，待核對','Possible duplicate names to review')} (${model.possible.length})</summary><p>${t('不同編號保持分開。即使姓名相同，也不會自動合併或算成兩場都出席。','Different participant IDs stay separate. Identical names are not automatically merged or counted as attending both.')}</p>${model.possible.map(group=>`<section><h3>${esc(group[0].person.name)}</h3>${group.map(r=>`<p><strong>${esc(r.person.id)}</strong> \u00b7 ${esc(a.event_date)}: ${r.a.status==='checked_in'?t('已簽到','Checked in'):t('沒有簽到紀錄','No recorded check-in')} \u00b7 ${esc(b.event_date)}: ${r.b.status==='checked_in'?t('已簽到','Checked in'):t('沒有簽到紀錄','No recorded check-in')}</p>`).join('')}</section>`).join('')}</details>`:'';
 return `<div class="comparisonMetrics">${metrics.map(([key,label,value])=>`<div><span>${label}</span><strong data-comparison-metric="${key}">${value}</strong></div>`).join('')}</div><p class="comparisonNotes">${t('依學員編號計算；只計入有效的已簽到紀錄。未記錄不代表缺席，報名不代表出席。','Matched by participant ID, using valid checked-in records only. No record is not absence; registration is not attendance.')}</p><p class="comparisonCount" role="status" aria-live="polite">${t('顯示','Showing')} ${rows.length} ${t('筆學員檔案','participant records')} \u00b7 ${t('時間以紐約時區顯示','Times in New York')} \u00b7 ${t('最後更新','Last refreshed')}: ${S.lastSync?esc(stamp(S.lastSync)):'\u2014'}</p><div class="comparisonTableWrap" tabindex="0" role="region" aria-label="${t('兩場出席比較名單','Two-session attendance comparison')}"><table class="comparisonTable"><thead><tr><th scope="col">${t('學員','Participant')}</th><th scope="col">${t('場次 A','Session A')}<small>${esc(a.event_date)}</small></th><th scope="col">${t('場次 B','Session B')}<small>${esc(b.event_date)}</small></th><th scope="col">${t('出席場數','Sessions')}</th></tr></thead><tbody>${rows.map(r=>`<tr data-comparison-id="${esc(r.person.id)}" class="${r.total===2?'bothAttended':''}"><th scope="row"><strong>${esc(r.person.name)}</strong><small>${esc(r.person.id)}</small>${r.person.alias?`<small>${esc(r.person.alias)}</small>`:''}${r.person.archived_at?`<span class="pill gray">${t('已封存，保留歷史','Archived; history retained')}</span>`:''}${r.possible?`<small class="comparisonFlag">${t('相同姓名，不同編號：待核對','Same name, different IDs: review')}</small>`:''}</th><td>${sessionAttendanceStateHTML(r.a)}</td><td>${sessionAttendanceStateHTML(r.b)}</td><td class="comparisonTotal">${r.total} / 2</td></tr>`).join('')}</tbody></table></div>${rows.length?'':empty(t('沒有符合的紀錄。請調整篩選或搜尋。','No records match. Adjust the filter or search.'))}${review}`;
}
function sessionAttendancePage(){
 if(!session)return loginView(true);if(!S.data)return empty(t('讀取中…','Loading…'));
 if(!sessionAttendanceAllowed())return empty(t('需要完整工作人員權限，請聯絡管理員。','Full staff access is required. Please contact your administrator.'));
 const {events}=sessionAttendanceSelection(),selectSession=(id,label,value)=>`<div class="field"><label for="${id}">${label}</label><select id="${id}"><option value="">${t('選擇場次','Choose a session')}</option>${events.map(e=>`<option value="${esc(e.id)}" ${e.id===value?'selected':''}>${esc(e.event_date+' \u00b7 '+name(e))}</option>`).join('')}</select></div>`;
 return `<header class="comparisonHeading"><div class="eyebrow">ENJOY HEALTHY EATING</div><h1>${t('跨場次出席','Session attendance')}</h1><p>${t('查看誰出席了兩場活動；本頁只讀取資料，不更動出席紀錄。','See who attended both sessions. This view never changes attendance records.')}</p></header><section class="panel comparisonPanel"><div class="comparisonSelectors">${selectSession('compareSessionA',t('場次 A','Session A'),S.compareA)}${selectSession('compareSessionB',t('場次 B','Session B'),S.compareB)}</div><div class="comparisonControls"><div class="field"><label for="compareFilter">${t('出席篩選','Attendance filter')}</label><select id="compareFilter">${[['both','兩場都出席','Attended both sessions'],['one','只出席一場','Attended one session'],['any','至少出席一場','Attended either session'],['all','全部名單','All roster records'],['none','兩場都沒有簽到紀錄','No recorded check-in in either'],['review','可能重複姓名','Possible duplicate names']].map(([value,zh,en])=>`<option value="${value}" ${(S.compareFilter||'both')===value?'selected':''}>${t(zh,en)}</option>`).join('')}</select></div><div class="field"><label for="compareSearch">${t('搜尋姓名、別名或編號','Search name, alias or ID')}</label><input type="search" id="compareSearch" value="${esc(S.compareQuery||'')}" autocomplete="off" maxlength="120"></div><button type="button" class="btn soft" data-action="refresh">${t('更新資料','Refresh data')}</button></div><div id="sessionAttendanceResults">${sessionAttendanceResults()}</div></section>`;
}
const beforeSessionAttendancePage=staffPage;
staffPage=function(){return S.tab==='attendance'?sessionAttendancePage():beforeSessionAttendancePage();};
const beforeSessionAttendanceChrome=chrome;
chrome=function(){beforeSessionAttendanceChrome();if(!sessionAttendanceAllowed()||S.page!=='staff')return;if(S.tab==='attendance'){sessionAttendanceSelection();updatePortalAddress('staff');}const nav=$('#sectionNav .secondaryWorkflowNav');if(nav){const button=document.createElement('button');button.type='button';button.dataset.tab='attendance';button.textContent=t('跨場次出席','Session attendance');button.className=S.tab==='attendance'?'active':'';button.setAttribute('aria-current',S.tab==='attendance'?'page':'false');const directory=nav.querySelector('[data-tab="directory"]');directory?directory.after(button):nav.prepend(button);}};
const beforeSessionAttendanceAddress=updatePortalAddress;
updatePortalAddress=function(page){beforeSessionAttendanceAddress(page);if(page!=='staff'||S.tab!=='attendance'||location.hash)return;const u=new URL(location.href);if(S.compareA)u.searchParams.set('session_a',S.compareA);if(S.compareB)u.searchParams.set('session_b',S.compareB);u.searchParams.set('filter',S.compareFilter||'both');history.replaceState(null,'',u.pathname+u.search);};
document.addEventListener('change',ev=>{const el=ev.target;if(!sessionAttendanceAllowed()||S.tab!=='attendance'||!['compareSessionA','compareSessionB','compareFilter'].includes(el.id))return;if(S.busy)return;if(el.id==='compareSessionA')S.compareA=el.value;else if(el.id==='compareSessionB')S.compareB=el.value;else S.compareFilter=el.value;$('#sessionAttendanceResults').innerHTML=sessionAttendanceResults();updatePortalAddress('staff');});
document.addEventListener('input',ev=>{if(ev.target.id!=='compareSearch'||!sessionAttendanceAllowed())return;S.compareQuery=ev.target.value;$('#sessionAttendanceResults').innerHTML=sessionAttendanceResults();});
setInterval(()=>{if(S.page==='staff'&&S.tab==='attendance'&&sessionAttendanceAllowed()&&!S.busy&&!$('#modal').open&&document.visibilityState==='visible'&&!document.activeElement?.matches('input,select,textarea'))refresh();},20000);
// The original query is captured before legacy navigation normalizes the address.
if(entryQuery.get('tab')==='attendance'&&S.page==='staff'){S.tab='attendance';S.compareA=entryQuery.get('session_a')||'';S.compareB=entryQuery.get('session_b')||'';const filter=entryQuery.get('filter');S.compareFilter=['both','one','any','all','none','review'].includes(filter)?filter:'both';}
if(S.page==='staff')render();
