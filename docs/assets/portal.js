'use strict';
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
