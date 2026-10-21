'use strict';
// Admin-entered times use the existing authenticated, audited correction APIs.
function bookingVisit(b){
 const attached=S.data.service.find(l=>l.booking_id===b.id);if(attached)return attached;
 const p=person(b.person_id),e=eventFor(shift(b.shift_id));
 const matches=S.data.service.filter(l=>!l.booking_id&&l.visit_email===p?.email?.trim().toLowerCase()&&p0Normalize(l.visit_name)===p0Normalize(p?.name)&&nyDate(l.checked_in_at)===e?.event_date);
 return matches.length===1?matches[0]:null;
}
function missingVolunteerBookings(){const ids=eventShiftIds();return S.data.bookings.filter(b=>ids.has(b.shift_id)&&b.status==='confirmed'&&!bookingVisit(b));}
function adminTimeControls(){return `<div class="adminClockActions"><button type="button" class="btn soft" data-clock-now="in_local">${t('現在簽到','Clock in now')}</button><button type="button" class="btn soft" data-clock-now="out_local">${t('現在簽退','Clock out now')}</button></div><p class="helpText">${t('按鈕只填入目前時間；確認實際時間並儲存後才會記錄。漏簽請輸入實際到場／離開時間。','These buttons fill the current time. Review and save to record it. For a missed entry, enter the actual arrival or departure time.')}</p>`;}
function adminLocalEpoch(value){
 if(!value)return NaN;const normalized=value.length===16?value+':00':value,nominal=Date.parse(normalized+'Z');if(!Number.isFinite(nominal))return NaN;
 const candidates=[-12,12].map(h=>{const sample=nominal+h*3600000,offset=Date.parse(visitLocal(sample)+'Z')-sample;return nominal-offset;}).filter(ms=>visitLocal(ms)===normalized);
 return candidates.length?Math.max(...candidates):NaN;
}
function adminTimeValidation(f){
 const start=adminLocalEpoch(f.in_local),end=f.out_local?adminLocalEpoch(f.out_local):null,now=visitClock();
 if(!Number.isFinite(start)||end!==null&&!Number.isFinite(end)||start>now||end!==null&&(end>now||end<start))return t('請填寫有效的實際時間；簽退不可早於簽到，也不可填未來時間。','Enter valid actual times. Checkout cannot precede check-in, and future times are not allowed.');
 return '';
}
function updateAdminTimePreview(){const form=$('#visitCorrectionForm');if(!form)return;const f=Object.fromEntries(new FormData(form)),host=$('#adminTimePreview');if(!host)return;const problem=adminTimeValidation(f);host.textContent=problem||(!f.out_local?t('尚未簽退：完成簽退後才計算時數。','No checkout yet. Hours are calculated once checkout is recorded.'):t('服務時間：','Service time: ')+visitDuration((adminLocalEpoch(f.out_local)-adminLocalEpoch(f.in_local))/1000));host.classList.toggle('error',!!problem);}
function openAdminTimes({booking=null,record=null}={}){
 if(S.page!=='staff'||!S.data||isCheckinDesk())return;
 const p=booking?person(booking.person_id):null,existing=record?normalizedVisitRows().find(r=>r.record.id===record.id):null,evt=existing?.event_id||eventFor(shift(booking?.shift_id))?.id||S.event||'',isNew=!booking&&!record;
 const title=record?t('編輯志工時間','Edit volunteer times'):t('補登志工時間','Add volunteer times');
 modal(title,`${isNew?`<p class="subtleBox">${t('用於沒有預先報名且漏簽的志工。已有紀錄請關閉並使用「編輯時間」，避免重複。','For a volunteer who missed check-in without a booking. If a visit already exists, close this form and edit that record instead.')}</p><div class="formGrid">${field('name',t('志工姓名','Volunteer name'),'','text',true,120)}${field('email','Email','','email',true,254)}</div>${hidden('manual_new','true')}`:`<h3>${esc(existing?.name||p?.name)}</h3><p class="helpText">${esc(existing?.email||p?.email||'')}</p>`}${record?hidden('service_id',record.id)+hidden('version',record.version):booking?hidden('booking_id',booking.id)+hidden('version',0):''}<p class="helpText">${t('所有時間均為紐約時間。儲存須填寫原因；原始時間保留於稽核紀錄。','All times are New York time. A reason is required; original times are retained in the audit history.')}</p>${select('event_id',t('活動','Event'),[['',t('未指定活動','Unassigned event')],...S.data.events.map(e=>[e.id,e.event_date+' · '+name(e)])],evt)}${select('role',t('職位（選填）','Role (optional)'),visitRoleOptions(),record?.visit_role||'')}<div class="formGrid">${field('in_local',t('實際簽到','Actual check-in'),visitLocal(record?.checked_in_at),'datetime-local',true)}${field('out_local',t('實際簽退（尚在服務可留空）','Actual check-out (blank while active)'),visitLocal(record?.checked_out_at),'datetime-local')}</div>${adminTimeControls()}<p id="adminTimePreview" class="adminTimePreview" role="status" aria-live="polite"></p>${area('reason',t('補登／更正原因（必填）','Reason for adding / correcting times (required)'),' ',1000).replace('> </textarea>','></textarea>')}`,'visitCorrectionForm',t('儲存志工時間','Save volunteer times'));
 const form=$('#visitCorrectionForm');form.elements.reason.required=true;form.elements.reason.minLength=2;for(const input of form.querySelectorAll('[type="datetime-local"]'))input.step='1';
 if(booking||record?.booking_id){form.elements.event_id.disabled=true;form.elements.role.disabled=true;form.dataset.event=evt;form.dataset.role=record?.visit_role||'';}
 if(record)updateAdminTimePreview();
}
correctService=function(id){const b=S.data?.bookings.find(b=>b.id===id);if(b)openAdminTimes({booking:b,record:bookingVisit(b)});};
openVisitCorrection=function(id){const record=S.data?.service.find(l=>l.id===id);if(record)openAdminTimes({record});};
submitVisitCorrection=async function(form){
 if(S.busy||!form.reportValidity())return;const f=Object.fromEntries(new FormData(form)),problem=adminTimeValidation(f);if(problem){$('#formError').textContent=problem;return;}if((f.reason||'').trim().length<2){$('#formError').textContent=t('請填寫原因。','Enter a reason.');return;}
 const selectedDate=S.data.events.find(e=>e.id===(form.dataset.event||f.event_id))?.event_date;if(selectedDate&&f.in_local.slice(0,10)!==selectedDate){$('#formError').textContent=t('簽到日期必須與活動日期相同。','The check-in date must match the event date.');return;}
 const data={...f,event_id:form.dataset.event||f.event_id||'',role:form.dataset.role??f.role??'',version:Number(f.version||0)};
 if(f.manual_new)data.manual_new=true;
 const request_id=visitIdFor(form,data);
 await run(async()=>{
  if(f.booking_id){await api('staff',{action:'correct_service',data:{booking_id:f.booking_id,version:data.version,in_local:f.in_local,out_local:f.out_local,reason:f.reason,_request_id:request_id}},true);}
  else{const result=await visitRequest('correct',{data:{...data,request_id}},true);if(result.ok!==true)throw Object.assign(new Error('INVALID_RESPONSE'),{code:'INVALID_RESPONSE'});}
  close();if(f.manual_new){S.visitScope=data.event_id?'event':'unassigned';if(data.event_id)S.event=data.event_id;S.visitQuery='';S.visitStatus='all';}
  const refreshed=await refresh();toast(refreshed?t('志工時間已儲存，時數已更新。','Volunteer times saved. Hours updated.'):t('時間已儲存，但名單更新失敗；請重新整理。','Times saved, but refreshing failed. Refresh the list.'));
 },form.querySelector('[type="submit"]'));
};
staffBookings=function(){const ids=eventShiftIds(),list=S.data.bookings.filter(b=>ids.has(b.shift_id));return `<div class="actions">${btn(t('匯出報名','Export bookings'),'export-bookings')}</div><p class="helpText">${t('漏簽到或簽退？在志工旁按「補登時間」或「編輯時間」，輸入實際時間。','Missed check-in or checkout? Use Add times or Edit times beside a volunteer to enter the actual times.')}</p><section class="panel">${table([t('志工','Volunteer'),t('班次','Shift'),t('報名狀態','Booking status'),t('實際服務時間','Actual service'),t('操作','Actions')],list.map(b=>{const l=bookingVisit(b),s=shift(b.shift_id);return `<tr><td><strong>${esc(person(b.person_id)?.name)}</strong><small>${esc(person(b.person_id)?.email)}</small></td><td>${esc(label(roles,s?.duty))}<small>${s?time(s.starts_at):''}</small></td><td>${pill(b.status)}</td><td>${l?`${esc(visitDateTime(l.checked_in_at))}<br>${l.checked_out_at?esc(visitDateTime(l.checked_out_at)):`<span class="pill amber">${t('尚未簽退','No checkout')}</span>`}<small>${visitDuration(visitSeconds(l))}</small>`:t('尚無時間紀錄','No times recorded')}</td><td><div class="adminBookingActions">${b.status==='confirmed'||l?btn(l?t('編輯時間','Edit times'):t('補登時間','Add times'),'correct-service',b.id,'primary'):''}${['pending','waitlist'].includes(b.status)?btn(t('確認名額','Confirm place'),'approve',b.id):''}${b.status!=='cancelled'&&!l?btn(t('取消','Cancel'),'staff-cancel',b.id):''}</div></td></tr>`; }))}</section>`;};
const serviceBeforeAdminTimes=staffService;
staffService=function(){const missing=missingVolunteerBookings();return `<div class="actions"><button type="button" class="btn primary" data-add-volunteer-times>${t('補登沒有報名的志工時間','Add times without a booking')}</button></div>`+serviceBeforeAdminTimes()+(missing.length?`<section class="panel missingVolunteerTimes"><h2>${t('已確認報名但尚無時間紀錄','Confirmed bookings without time records')}</h2><p class="helpText">${t('僅在確認本人有提供服務後補登，不以班次時間推算出席。','Add actual times only after verifying service took place. A booking does not prove attendance.')}</p>${missing.map(b=>`<div class="personRow"><div><strong>${esc(person(b.person_id)?.name)}</strong><p>${esc(label(roles,shift(b.shift_id)?.duty))}</p></div>${btn(t('補登時間','Add times'),'correct-service',b.id,'primary')}</div>`).join('')}</section>`:'');};
document.addEventListener('click',event=>{const b=event.target.closest('[data-clock-now],[data-add-volunteer-times]');if(!b||S.busy||!S.data||S.page!=='staff'||isCheckinDesk())return;if(b.hasAttribute('data-add-volunteer-times')){openAdminTimes();return;}const form=$('#visitCorrectionForm');if(!form)return;form.elements[b.dataset.clockNow].value=visitLocal(visitClock());updateAdminTimePreview();});
document.addEventListener('input',event=>{if(event.target.matches('#visitCorrectionForm [type="datetime-local"]'))updateAdminTimePreview();});
if(S.page==='staff')render();
