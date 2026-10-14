'use strict';
// Resolve the requested audience before app.js performs its first render.
const entryQuery=new URLSearchParams(location.search);
const entryPortal=location.pathname.endsWith('/volunteer.html')?'onsite':entryQuery.get('portal');
S.lang=entryQuery.get('lang')==='zh'?'zh':'en';
S.page=['staff','manage','onsite','shifts'].includes(entryPortal)?entryPortal:'shifts';
S.tab=['learners','directory','service','shifts','overview','events','bookings','profiles','reviews','archive'].includes(entryQuery.get('tab'))?entryQuery.get('tab'):'learners';
S.kind=entryQuery.get('action')==='out'?'out':'in';S.shift=entryQuery.get('shift')||'';S.name='';S.email='';S.catalogLoaded=false;S.catalogError='';S.serverOffset=0;
const entryApi=api;
api=async function(route,body,secure=false){try{const result=await entryApi(route,body,secure);if(route==='catalog'){S.catalogLoaded=true;S.catalogError='';const clock=Date.parse(result.server_time);if(Number.isFinite(clock))S.serverOffset=clock-Date.now();}if(route==='submit'){S.name='';S.email='';}return result;}catch(e){if(route==='catalog')S.catalogError=errorText(e);throw e;}};
