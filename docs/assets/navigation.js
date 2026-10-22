'use strict';
// A copied link must match the visible screen. URL parameters never grant access.
function updatePortalAddress(page){const u=new URL(location.href);if(u.hash)return;if(u.pathname.endsWith('/volunteer.html')&&page!=='onsite')u.pathname=u.pathname.replace(/volunteer\.html$/,'');u.search='';u.searchParams.set('portal',page);if(page==='staff')u.searchParams.set('tab',S.tab||'learners');if(page==='onsite'){u.searchParams.set('action',S.kind==='out'?'out':'in');if(S.shift)u.searchParams.set('shift',S.shift);}if(S.lang==='zh')u.searchParams.set('lang','zh');if(u.href!==location.href)history.replaceState(null,'',u.pathname+u.search);}
function resetVolunteerIdentity(){S.name='';S.email='';const f=document.getElementById('onsiteForm');if(f)f.reset();}
const navBeforeV16=nav;nav=async function(page){resetVolunteerIdentity();return navBeforeV16(page);};
const signupBeforeV16=openSignup;openSignup=function(id){resetVolunteerIdentity();return signupBeforeV16(id);};
const chromeBeforeV16=chrome;chrome=function(){chromeBeforeV16();updatePortalAddress(S.page);};
document.addEventListener('click',ev=>{const b=ev.target.closest('[data-action="kind-in"],[data-action="kind-out"]');if(!b)return;ev.preventDefault();ev.stopImmediatePropagation();if(S.busy)return;if($('#quickVisitForm')){switchVisitKind(b.dataset.action==='kind-out'?'out':'in');return;}resetVolunteerIdentity();S.kind=b.dataset.action==='kind-out'?'out':'in';render();},true);
window.addEventListener('pageshow',ev=>{if(ev.persisted){resetVolunteerIdentity();if(S.page==='onsite')refresh();}});
