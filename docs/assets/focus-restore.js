'use strict';
// Restore focus to the triggering control (or page content) after modal dismissal.
// Never leave focus on the hidden skip link after a trigger was disabled during a request.
let lastModalTrigger=null,modalReturnFocus=null,modalRestoreTimer;
document.addEventListener('click',event=>{const target=event.target.closest?.('button,a');if(target&&!target.closest('#modal'))lastModalTrigger=target;},true);
const beforeFocusModal=modal;
modal=function(...args){const active=document.activeElement;if(active&&!active.closest?.('#modal'))modalReturnFocus=active.matches?.('button,a,input,select,textarea')&&!active.classList.contains('skip')?active:lastModalTrigger;return beforeFocusModal(...args);};
function restoreModalFocus(){clearTimeout(modalRestoreTimer);modalRestoreTimer=setTimeout(()=>{if($('#modal').open)return;const target=modalReturnFocus?.isConnected&&!modalReturnFocus.disabled?modalReturnFocus:$('#app');if(target)target.focus({preventScroll:true});},0);}
const beforeFocusClose=close;
close=function(){const wasOpen=$('#modal').open;beforeFocusClose();if(wasOpen)restoreModalFocus();};
$('#modal').addEventListener('close',restoreModalFocus);
