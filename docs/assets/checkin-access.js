'use strict';
// Limited check-in desk UI. Authorization and field filtering are enforced by the API.
const isCheckinDesk=()=>S.data?.role==='checkin';
const deskToday=()=>selectedEvent()?.event_date===nyDate();
const unrestrictedRefresh=refresh;
refresh=async function(){
 if(S.page!=='staff'||!session)return unrestrictedRefresh();
 const seq=++refreshSeq;
 try{
  const data=await api('staff',{action:'snapshot',data:{event_id:S.event||null}},true);
  if(seq!==refreshSeq||S.page!=='staff'||!session)return false;
  S.data=data;
  if(data.active_event_id)S.event=data.active_event_id;
  else if(!data.events.some(e=>e.id===S.event))S.event=data.events.find(e=>e.event_date>=nyDate())?.id||data.events.at(-1)?.id||'';
  if(isCheckinDesk())S.tab='learners';
  S.lastSync=new Date();connection(true);render();return true;
 }catch(e){
  if(seq!==refreshSeq||S.page!=='staff'||e.code==='STALE_SESSION')return false;
  S.data=null;S.own=null;connection(false,errorText(e));
  if(e.code==='SIGN_IN_REQUIRED')storeSession(null);
  render();return false;
 }
};
const fullChrome=chrome;
chrome=function(){
 fullChrome();const desk=isCheckinDesk()&&S.page==='staff';document.body.classList.toggle('checkinDesk',desk);
 if(desk){$('#sectionNav').innerHTML=`<div class="staffNav deskNav"><span class="deskBadge">${t('簽到工作站','Check-in desk')}</span><span>${t('僅限學員報到與日記收件','Learner arrivals and diary receipt only')}</span></div>`;$('#mobileNav').innerHTML='';}
};
const fullStaffPage=staffPage;
staffPage=function(){
 if(!isCheckinDesk())return fullStaffPage();
 return heading(t('學員簽到','Learner check-in'),t('先選活動，再搜尋學員。新學員與 Walk-in 分開登記。','Choose an event, then find a learner. Register newcomers separately from returning walk-ins.'))+(S.event?learnerPage():empty(t('目前沒有可選活動。','No events are available.')));
};
const fullLearnerPage=learnerPage;
learnerPage=function(){
 if(!isCheckinDesk())return fullLearnerPage();
 const list=S.data.enrollments.filter(r=>r.event_id===S.event),ids=new Set(list.map(r=>r.id));
 const checked=S.data.attendance.filter(a=>ids.has(a.enrollment_id)&&!a.voided&&a.status==='checked_in').length;
 return `<div class="stats deskStats">${stat(t('本場學員','Learners'),list.length)}${stat(t('已簽到','Checked in'),checked)}${stat(t('尚未簽到','Not checked in'),list.length-checked)}</div>`+
 (deskToday()?`<div class="actions">${btn(t('新學員報名','New learner'),'new-person','','primary')}${btn('Walk-in','walkin','','soft')}</div>`:`<p class="subtleBox">${t('目前不是本場活動日期，只供查看；活動當日可簽到及勾選日記。補登或更正請交由管理員處理。','This event is not today. View only; arrivals and diary receipt open on the event date. Ask an administrator for backfills or corrections.')}</p>`)+
 `<section class="panel"><div class="controls"><div class="field"><label for="learnerSearch">${t('搜尋姓名或編號','Find a learner')}</label><input id="learnerSearch" type="search" value="${esc(S.q)}" autocomplete="off"></div><div class="field"><label for="categoryFilter">${t('學員類別','Learner category')}</label><select id="categoryFilter">${[['all','全部學員','All learners'],['new','今日新學員','New to EHE today'],['walkin','Walk-in','Walk-in']].map(([k,z,e])=>`<option value="${k}" ${S.category===k?'selected':''}>${t(z,e)}</option>`).join('')}</select></div><div class="field"><label for="attendanceFilter">${t('簽到狀態','Attendance')}</label><select id="attendanceFilter">${[['all','全部','All'],['waiting','未簽到','Not checked in'],['checked','已簽到','Checked in']].map(([k,z,e])=>`<option value="${k}" ${S.attendance===k?'selected':''}>${t(z,e)}</option>`).join('')}</select></div></div><div id="learnerRows"></div></section>`;
};
const fullLearnerRows=learnerRows;
learnerRows=function(){
 if(!isCheckinDesk())return fullLearnerRows();const host=$('#learnerRows');if(!host)return;
 const e=selectedEvent(),today=nyDate(),editable=deskToday();
 const rows=S.data.enrollments.filter(r=>r.event_id===S.event).filter(r=>{const p=person(r.person_id),a=S.data.attendance.find(a=>a.enrollment_id===r.id&&!a.voided);return p&&[p.name,p.alias,p.id].join(' ').toLowerCase().includes(S.q.toLowerCase())&&(S.category==='all'||S.category==='new'&&p.joined_on===today||S.category==='walkin'&&r.entry_method==='walk_in')&&(S.attendance==='all'||S.attendance==='checked'&&a?.status==='checked_in'||S.attendance==='waiting'&&a?.status!=='checked_in');});
 host.innerHTML=rows.length?rows.map(r=>{const p=person(r.person_id),a=S.data.attendance.find(a=>a.enrollment_id===r.id&&!a.voided),d=S.data.diaries.find(d=>d.enrollment_id===r.id);return `<article class="learnerEntry"><div class="personRow"><div><h2 class="personName">${esc(p.name)}</h2><p class="personAlias">${esc([p.alias,p.id].filter(Boolean).join(' · '))}</p>${r.entry_method==='walk_in'?'<span class="pill amber">Walk-in</span>':''}${p.joined_on===today?'<span class="pill">'+t('今日新學員','New today')+'</span>':''}</div><div class="personActions">${a?pill(a.status):editable?btn(t('簽到','Check in'),'learner-in',r.id,'primary'):pill('—')}</div></div>${e?.event_type==='course'?`<div class="diaryChecks">${[['health','提交健康日記','Health diary received',e.diary_health],['bp','提交血壓日記','BP diary received',e.diary_bp]].filter(x=>x[3]).map(([k,z,en])=>`<label><input type="checkbox" data-diary="${k}" data-id="${r.id}" ${d?.[k+'_received']?'checked':''} ${editable?'':'disabled'}><span>${t(z,en)}</span></label>`).join('')}</div>`:''}</article>`;}).join(''):empty(t('沒有符合的學員。','No matching learners.'));
};
const fullEditPerson=editPerson;
editPerson=function(id){
 if(!isCheckinDesk())return fullEditPerson(id);
 if(id||!deskToday())return;
 modal(t('新學員快速報名','Register a new learner'),field('name',t('姓名','Name'),'','text',true,120)+field('alias',t('英文／其他姓名（選填）','Alternate name (optional)'),'','text',false,120)+select('preferred_language',t('偏好語言（選填）','Preferred language (optional)'),[['','—'],...languages.map(x=>[x[0],t(x[1],x[2])])],'')+check('checkin',t('本人已到場，新增並簽到','Person is present: register and check in'),true),'deskNewForm',t('確認新增','Register'));
};
const fullWalkin=walkin;
walkin=function(){
 if(!isCheckinDesk())return fullWalkin();if(!deskToday())return;
 modal('Walk-in',`<p class="helpText">${t('已有 EHE 檔案但未報名本場？搜尋並核對本人，不重複建檔。','Already has an EHE profile? Search and confirm the person instead of creating a duplicate.')}</p><form id="deskSearchForm"><div class="deskSearchRow">${field('query',t('姓名或學員編號（至少兩字）','Name or learner ID (at least 2 characters)'),'','search',true,80)}<button class="btn primary" type="submit">${t('搜尋','Search')}</button></div></form><div id="deskResults" aria-live="polite"></div>`);
};
let deskSearchSeq=0;
document.addEventListener('submit',ev=>{
 const form=ev.target,id=form.getAttribute?.('id');if(!['deskSearchForm','deskNewForm'].includes(id))return;
 ev.preventDefault();ev.stopImmediatePropagation();if(S.busy||!isCheckinDesk())return;
 run(async()=>{
  const fd=new FormData(form),f=Object.fromEntries(fd);
  if(id==='deskSearchForm'){
   const q=f.query.trim();if(q.length<2){$('#deskResults').textContent=t('請至少輸入兩個字。','Enter at least two characters.');return;}
   const seq=++deskSearchSeq,event=S.event,data=await api('staff',{action:'snapshot',data:{lookup:q,event_id:event}},true);
   if(seq!==deskSearchSeq||event!==S.event||!form.isConnected)return;
   $('#deskResults').innerHTML=data.matches.length?data.matches.map(p=>`<div class="personRow"><div><strong>${esc(p.name)}</strong><p class="personAlias">${esc([p.alias,p.id].filter(Boolean).join(' · '))}</p></div><button class="btn primary" data-desk-person="${esc(p.id)}">${t('加入並簽到','Add & check in')}</button></div>`).join(''):empty(t('沒有找到。新學員請使用「新學員報名」。','No match. Use New learner for a first-time participant.'));
  }else{
   const found=await api('staff',{action:'snapshot',data:{lookup:f.name.trim(),event_id:S.event}},true);
   const norm=x=>String(x||'').normalize('NFKC').trim().toLowerCase();
   const same=(found.matches||[]).filter(p=>[p.name,p.alias].some(n=>norm(n)===norm(f.name)));
   if(same.length&&!confirm(t('已有同名學員：','Matching learner: ')+same.map(p=>p.name+' ('+p.id+')').join(', ')+t('\n確定為不同的新學員才繼續；否則按取消，使用 Walk-in。','\nContinue only for a different new person. Otherwise cancel and use Walk-in.')))return;
   await command('new_participant',{name:f.name.trim(),alias:f.alias.trim(),preferred_language:f.preferred_language,event_id:S.event,checkin:fd.has('checkin'),allow_same_name:!!same.length});
  }
 },form.querySelector('button[type="submit"]'));
},true);
document.addEventListener('click',ev=>{
 const b=ev.target.closest('[data-desk-person]');if(!b)return;ev.preventDefault();ev.stopImmediatePropagation();if(S.busy||!isCheckinDesk()||!deskToday())return;
 if(!confirm(t('確認本人已到場，加入本場並簽到？','Confirm this person is present, add to this event and check in?')))return;
 run(()=>command('enroll_participant',{person_id:b.dataset.deskPerson,event_id:S.event,entry_method:'walk_in',checkin:true}),b);
},true);
document.addEventListener('change',ev=>{
 const el=ev.target;if(!isCheckinDesk()||el.id!=='activeEvent')return;
 ev.stopImmediatePropagation();if(S.busy){el.value=S.event;return;}
 S.event=el.value;S.q='';S.category='all';S.attendance='all';deskSearchSeq++;
 S.data.people=[];S.data.enrollments=[];S.data.attendance=[];S.data.diaries=[];learnerRows();
 run(()=>refresh(),el);
},true);
// In case a cached/fast response completed before this deferred module loaded.
if(S.data)render();
