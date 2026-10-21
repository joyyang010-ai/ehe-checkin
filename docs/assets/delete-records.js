'use strict';
function recordDeleteButton(type,id,restore=false){return `<button type="button" class="btn ${restore?'soft':'danger'}" data-record-type="${type}" data-record-id="${esc(id)}" data-record-operation="${restore?'restore':'delete'}">${restore?t('還原','Restore'):t('刪除','Delete')}</button>`;}
function deletedRecordList(type){
 if(S.data?.role!=='admin')return '';
 const rows=type==='service'?(S.data.deleted_service||[]):S.data.shifts.filter(s=>s.deleted_at&&s.event_id===S.event);
 if(!rows.length)return '';
 return `<details class="panel"><summary>${type==='service'?t('已刪除的出席紀錄','Deleted attendance entries'):t('已刪除的班次','Deleted shifts')} (${rows.length})</summary>${rows.map(r=>`<div class="personRow"><div><strong>${esc(type==='service'?r.visit_name:shiftDetails(r).title)}</strong><p>${esc(type==='service'?visitDateTime(r.checked_in_at):stamp(r.starts_at))}</p></div>${recordDeleteButton(type,r.id,true)}</div>`).join('')}</details>`;
}
const serviceBeforeDelete=staffService;
staffService=function(){return serviceBeforeDelete()+deletedRecordList('service');};
const shiftsBeforeDelete=staffShifts;
staffShifts=function(){return shiftsBeforeDelete()+deletedRecordList('shift');};
function openRecordRemoval(type,id,operation){
 if(S.data?.role!=='admin'||!['service','shift'].includes(type)||!['delete','restore'].includes(operation))return;
 const r=(type==='service'?(operation==='restore'?S.data.deleted_service:S.data.service):S.data.shifts)?.find(r=>r.id===id);if(!r)return;
 const restore=operation==='restore',title=restore?t('還原紀錄','Restore record'):type==='service'?t('刪除錯誤出席紀錄','Delete incorrect attendance entry'):t('刪除班次','Delete shift');
 modal(title,`<h3>${esc(type==='service'?(r.visit_name||person(S.data.bookings.find(b=>b.id===r.booking_id)?.person_id)?.name):shiftDetails(r).title)}</h3><p>${esc(type==='service'?visitDateTime(r.checked_in_at):stamp(r.starts_at))}</p><p class="subtleBox">${type==='service'?(restore?t('還原後重新計入出席及時數。','Restoring includes this entry in attendance and hours again.'):t('此筆將從出席、時數及匯出中移除，可在已刪除紀錄中還原。原始時間與歷史保留。','This entry will be removed from attendance, hours and exports. You can restore it from Deleted attendance entries. Original times and history are kept.')):(restore?t('班次將還原為未發布，請確認內容後再發布。','The shift will return as unpublished. Review it before publishing.'):t('此班次將停止公開報名並從班次列表移除。現有報名及出席時間保留，可在已刪除班次中還原。','This shift will close for public signup and leave the shift list. Existing bookings and attendance are kept. You can restore it from Deleted shifts.'))}</p>${hidden('id',id)}${hidden('target_type',type)}${hidden('operation',operation)}${hidden('version',type==='service'?r.version:r.updated_at)}${area('reason',t('原因（必填）','Reason (required)'),' ',1000).replace('> </textarea>','></textarea>')}`,'recordRemovalForm',restore?t('還原','Restore'):t('刪除紀錄','Delete record'));
 const reason=$('#recordRemovalForm').elements.reason;reason.required=true;reason.minLength=2;
}
document.addEventListener('click',event=>{const b=event.target.closest('[data-record-operation]');if(!b)return;event.preventDefault();event.stopImmediatePropagation();if(!S.busy)openRecordRemoval(b.dataset.recordType,b.dataset.recordId,b.dataset.recordOperation);},true);
document.addEventListener('submit',event=>{
 const form=event.target;if(form.id!=='recordRemovalForm')return;event.preventDefault();event.stopImmediatePropagation();if(S.busy||S.data?.role!=='admin'||!form.reportValidity())return;
 const data=Object.fromEntries(new FormData(form));data.reason=data.reason.trim();if(data.reason.length<2){$('#formError').textContent=t('請填寫原因。','Enter a reason.');return;}if(data.target_type==='service')data.version=Number(data.version);
 const request_id=visitIdFor(form,data);
 run(async()=>{const result=await visitRequest('correct',{data:{...data,request_id}},true);if(result.ok!==true)throw Object.assign(new Error('INVALID_RESPONSE'),{code:'INVALID_RESPONSE'});close();const updated=await refresh();toast(updated?t('已儲存。','Saved.'):t('已儲存，請重新整理名單。','Saved. Refresh the list.'));},form.querySelector('[type="submit"]'));
},true);
if(S.page==='staff')render();
