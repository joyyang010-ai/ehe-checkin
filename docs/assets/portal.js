'use strict';
staffOverview=function(){
 const n=participantSessionStats(),visits=normalizedVisitRows().filter(r=>r.event_id===S.event),active=visits.filter(r=>r.state==='active').length,complete=visits.filter(r=>r.state==='completed').length;
 const e=selectedEvent(),today=e?.event_date===p0Today();
 return `<section class="deskWelcome"><div><span class="eyebrow">${t('活動工作區','EVENT WORKSPACE')}</span><h2>${esc(name(e))}</h2><p>${esc(e?.event_date||'')} · ${esc(e?.location||t('地點待確認','Location to be confirmed'))}</p></div><span class="pill ${today?'':'gray'}">${today?t('今日活動','Today’s event'):t('所選活動','Selected event')}</span></section><div class="stats overviewStats">${stat(t('學員已簽到','Participants checked in'),n.checked+' / '+n.registered,t('本場報名含現場新增','Includes on-site registrations'))}${stat(t('尚未簽到','Still expected'),n.remaining,t('未簽到不等於缺席','Not checked in does not mean absent'))}${stat(t('志工服務中','Volunteers on site'),active,t('依實際服務紀錄','Based on recorded check-ins'))}${stat(t('志工已完成服務','Completed volunteer visits'),complete,t('依實際簽退紀錄','Based on recorded check-outs'))}</div><div class="workspaceGrid"><section class="panel workspaceAction"><span class="workspaceNumber">01 / ${t('學員','PARTICIPANTS')}</span><h2>${t('迎接每一位學員','Welcome every participant')}</h2><p>${t('搜尋本場名單、確認到場，並分開記錄日記收件。','Find participants, confirm arrivals and record diary receipt separately.')}</p><button type="button" class="btn primary" data-tab="learners">${t('開啟學員簽到','Open participant check-in')} →</button><button type="button" class="btn soft" data-tab="directory">${t('查看學員總名單','Browse all participants')}</button></section><section class="panel workspaceAction"><span class="workspaceNumber">02 / ${t('志工','VOLUNTEERS')}</span><h2>${t('掌握現場服務情況','Keep service running smoothly')}</h2><p>${t('查看服務中的志工、已完成的時間，以及待補活動的紀錄。','Review active visits, completed time and visits that need an event assigned.')}</p><button type="button" class="btn primary" data-tab="service">${t('查看志工出席與時數','Open volunteer attendance')} →</button><a class="btn soft" href="./volunteer.html${S.lang==='zh'?'?lang=zh':''}" target="_blank" rel="noopener">${t('開啟志工自行簽到','Open volunteer self-check-in')} ↗</a></section></div><p class="overviewNote">${t('以上統計僅限所選活動。報名、出席與日記收件分開記錄。','Counts cover the selected event. Registration, attendance and diary receipt are separate records.')}</p>`;
};
// Presentation helpers reuse existing filters and never issue attendance writes.
function participantFilterTools(){
 const host=$('#learnerRows');if(!host||!S.data)return;
 let bar=$('#participantQuickFilters');
 if(!bar){bar=document.createElement('div');bar.id='participantQuickFilters';bar.className='participantQuickFilters';host.before(bar);}
 const n=participantSessionStats(),shown=host.querySelectorAll('[data-enrollment]').length;
 bar.innerHTML=`<div class="filterChips" aria-label="${t('快速篩選出席','Quick attendance filters')}">${[['all',t('全部','All'),n.registered],['waiting',t('未簽到','Expected'),n.remaining],['checked',t('已簽到','Checked in'),n.checked]].map(([key,title,count])=>`<button type="button" class="filterChip" data-attendance-filter="${key}" aria-pressed="${S.attendance===key}">${title} <span>${count}</span></button>`).join('')}</div><p class="resultCount" role="status">${t('顯示 ','Showing ')}${shown}${t(' 位學員',shown===1?' participant':' participants')}</p>${S.q||S.category!=='all'||S.attendance!=='all'?`<button type="button" class="btn soft clearFilters" data-clear-participant>${t('清除篩選','Clear filters')}</button>`:''}`;
}
const portalLearnerRows=learnerRows;
learnerRows=function(){portalLearnerRows();participantFilterTools();};
function enhancePortal(){
 document.body.dataset.portal=S.page;
 for(const b of $$('[data-nav],[data-tab]')){const active=b.dataset.nav?S.page===b.dataset.nav:S.tab===b.dataset.tab;b.setAttribute('aria-current',active?'page':'false');}
 for(const b of $$('[data-lang]'))b.setAttribute('aria-pressed',String(S.lang===b.dataset.lang));
 for(const b of $$('[data-action="kind-in"],[data-action="kind-out"]'))b.setAttribute('aria-pressed',String(b.dataset.action==='kind-'+S.kind));
 const form=$('#quickVisitForm');
 if(form){
  form.querySelector('[name="event_id"]').required=S.kind==='in';
  const title=document.createElement('div');title.className='visitFormTitle';title.innerHTML=`<span class="visitModeIcon" aria-hidden="true">${S.kind==='out'?'↗':'↘'}</span><div><h2>${S.kind==='out'?t('謝謝今天的付出','Thank you for your time'):t('歡迎，準備開始吧','Welcome. Let’s get started.')}</h2><p>${S.kind==='out'?t('離開前，記錄你的簽退時間。','Record your checkout before you leave.'):t('到場後，記錄你的簽到時間。','Record your check-in when you arrive.')}</p></div>`;form.prepend(title);
  form.querySelector('[name="email"]').inputMode='email';
 }
 const password=$('#passwordForm [name="password"]');
 if(password){password.autocomplete='current-password';$('#passwordForm [name="email"]').autocomplete='username';const toggle=document.createElement('button');toggle.type='button';toggle.className='passwordToggle';toggle.dataset.passwordToggle='';toggle.setAttribute('aria-pressed','false');toggle.textContent=t('顯示密碼','Show password');password.after(toggle);}
 participantFilterTools();
}
const portalRender=render;
render=function(){portalRender();enhancePortal();};
document.addEventListener('click',event=>{
 const b=event.target.closest('[data-attendance-filter],[data-clear-participant],[data-password-toggle]');if(!b||S.busy)return;
 if(b.hasAttribute('data-password-toggle')){const input=$('#passwordForm [name="password"]'),shown=input.type==='password';input.type=shown?'text':'password';b.setAttribute('aria-pressed',String(shown));b.textContent=shown?t('隱藏密碼','Hide password'):t('顯示密碼','Show password');return;}
 if(b.hasAttribute('data-clear-participant')){S.q='';S.category='all';S.attendance='all';p0PhoneMatches=null;p0LookupEpoch++;clearTimeout(p0LookupTimer);$('#learnerSearch').value='';$('#categoryFilter').value='all';const status=$('#p0SearchStatus');if(status)status.textContent='';}else S.attendance=b.dataset.attendanceFilter;
 $('#attendanceFilter').value=S.attendance;learnerRows();const target=b.hasAttribute('data-clear-participant')?$('#learnerSearch'):$(`[data-attendance-filter="${S.attendance}"]`);target?.focus({preventScroll:true});
});
render();

// Keep attendance current without interrupting an open editor or search.
setInterval(()=>{if(S.page==='staff'&&S.data&&!isCheckinDesk()&&['bookings','service'].includes(S.tab)&&!S.busy&&!$('#modal').open&&document.visibilityState==='visible'&&!document.activeElement?.matches('input,select,textarea'))refresh();},20000);
