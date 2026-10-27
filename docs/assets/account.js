'use strict';
// Supabase Auth owns passwords and email verification. No privileged keys or roles are stored here.
// Recovery credentials live in memory only, are verified by Auth, and are removed from the address.
(()=>{
 const C=window.EHE_CONFIG,host=document.getElementById('accountMain');
 const params=new URLSearchParams(location.search),fragment=new URLSearchParams(location.hash.slice(1));
 const ROOT=new URL('./',location.href),CALLBACK=new URL('account.html',ROOT).href;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let mode=['forgot','create','request','resend'].includes(params.get('mode'))?params.get('mode'):'forgot',busy=false,recoveryToken='',verifiedEmail='';
 const callbackType=fragment.get('type')||params.get('type')||'',callbackToken=fragment.get('access_token')||'',tokenHash=params.get('token_hash')||'',callbackError=fragment.get('error')||params.get('error');
 // Drop tokens, emails and unrecognized redirect parameters before rendering or making requests.
 history.replaceState(null,'',location.pathname+'?mode='+mode);
 const field=(key,label,type='text',options='')=>`<div class="field"><label for="account-${key}">${label}</label><input id="account-${key}" name="${key}" type="${type}" ${options} required>${type==='password'?`<button type="button" class="passwordShow" data-show="account-${key}" aria-pressed="false">Show password</button>`:''}</div>`;
 const emailField=()=>field('email','Email','email','maxlength="254" autocomplete="email" autocapitalize="none" spellcheck="false"');
 const passwordFields=()=>field('password','New portal password','password','minlength="12" maxlength="128" autocomplete="new-password"')+field('confirm','Confirm new password','password','minlength="12" maxlength="128" autocomplete="new-password"')+'<p class="accountFine">Use at least 12 characters. Do not use your Gmail password.</p>';
 const requestFields=()=>field('name','Full name','text','maxlength="120" autocomplete="name"')+emailField()+`<div class="field"><label for="account-role">Access requested</label><select id="account-role" name="role"><option value="checkin">Participant check-in staff</option><option value="admin">Portal administrator</option></select></div><div class="field"><label for="account-reason">Your team / reason for access</label><textarea id="account-reason" name="reason" minlength="2" maxlength="1500" required></textarea></div>`;
 function notice(){return C.accountEmailReady===true?'':'<p class="accountNotice">Email delivery is not yet verified for this portal. Reset and verification emails require the site owner to finish the email-service setup. Existing password sign-in is unaffected.</p>';}
 function render(){
  const headings={forgot:'Forgot password?',create:'Create staff account',request:'Request staff access',resend:'Resend verification email',update:'Choose a new password',done:'Account updated',verified:'Email verified'};
  const intros={forgot:'Request a secure reset link for your existing EHE portal account.',create:'Create your own login, verify your email, then wait for the owner to approve your role. Creating an account does not grant admin access.',request:'Already have an account? Request the access you need. Only the portal owner can approve it.',resend:'Request a fresh confirmation link for an account you have already registered.',update:'Set a new password for '+verifiedEmail+'. Your current portal permissions will stay unchanged.',verified:'Email verification does not grant administrator access. Sign in after the portal owner has approved and activated your request.',done:'Your password was changed. Sign in with your new password.'};
  let body='';
  if(mode==='forgot'||mode==='resend')body=emailField();
  if(mode==='create')body=requestFields()+passwordFields();
  if(mode==='request')body=requestFields();
  if(mode==='update')body=passwordFields();
  const submits={forgot:'Send reset link',create:'Create account & request access',request:'Submit access request',resend:'Resend verification',update:'Save new password'};
  host.innerHTML=`<nav class="accountNav" aria-label="Account options"><a href="./?portal=staff">Sign in</a><a href="?mode=forgot">Forgot password</a><a href="?mode=create">Create account</a></nav><h1>${headings[mode]||'Account'}</h1><p class="accountIntro">${esc(intros[mode]||'')}</p>${['forgot','create','resend'].includes(mode)?notice():''}<section class="accountPanel">${body?`<form id="accountForm" autocomplete="on">${body}<div class="accountHoneypot" aria-hidden="true"><label>Leave blank<input name="website" tabindex="-1" autocomplete="off"></label></div><p id="accountError" class="accountError" role="alert" tabindex="-1"></p><button type="submit" class="btn primary">${submits[mode]}</button></form>`:'<p id="accountError" class="accountError" role="alert"></p>'}<p id="accountStatus" class="accountStatus" role="status" aria-live="polite"></p>${mode==='create'?'<p class="accountFine">Already registered? Use Forgot password instead of creating another account.</p>':''}<div class="accountHelpLinks"><a href="./?portal=staff">Back to sign in</a>${['create','verified','request'].includes(mode)?'<a href="?mode=request">Request access for an existing account</a>':''}${['create','verified','resend'].includes(mode)?'<a href="?mode=resend">Resend verification</a>':''}</div></section>`;
 }
 function message(e){const code=e.code||'',status=e.status;
  if(code==='PASSWORD_MISMATCH')return 'The passwords do not match. Please try again.';
  if(code==='PASSWORD_LENGTH')return 'Choose a password of 12 to 128 characters.';
  if(code==='INVALID_INPUT')return 'Check the required fields and enter a valid email address.';
  if(code==='EMAIL_VERIFICATION_DISABLED')return 'Email verification is disabled in this project. Contact the owner before creating a staff account.';
  if(code==='NETWORK_ERROR')return 'The connection failed. The action is not confirmed. Please try again.';
  if(['email_address_not_authorized','email_address_not_allowed','unexpected_failure','SMTP_ERROR'].includes(code))return 'The email service could not send this message. Ask the site owner to configure or check Supabase email delivery. No email delivery is confirmed.';
  if(status===429||/rate_limit/i.test(code))return 'Too many requests. Please wait a few minutes before trying again.';
  if(['signup_disabled','email_provider_disabled','over_email_send_rate_limit'].includes(code))return 'Account email actions are unavailable or limited. Please contact the site owner.';
  if(['weak_password','same_password','reauthentication_needed','reauthentication_not_valid','password_security_check_failed'].includes(code))return code==='same_password'?'Please choose a different password.':'The password update was not accepted. Use a strong new password or request a fresh reset link.';
  if(['otp_expired','bad_jwt','session_not_found','LINK_INVALID'].includes(code)||status===401)return 'This link has expired or is invalid. Request a fresh link using Forgot password.';
  if(['user_already_exists','email_exists','user_already_registered'].includes(code))return 'Use Sign in or Forgot password for an existing account.';
  return 'The request could not be completed. Please try again or contact the site owner. No change is confirmed.';
 }
 const fail=code=>Object.assign(new Error(code),{code});
 async function call(path,method='GET',body,token){
  let response;try{response=await fetch(C.url+path,{method,cache:'no-store',referrerPolicy:'no-referrer',headers:{apikey:C.key,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});}catch{throw fail('NETWORK_ERROR');}
  const raw=await response.text();let data={};try{data=raw?JSON.parse(raw):{};}catch{throw fail('INVALID_RESPONSE');}
  if(!response.ok)throw Object.assign(new Error('Account request failed'),{code:data.error_code||data.code||data.error||'REQUEST_FAILED',status:response.status});
  return data;
 }
 function credentials(form){const password=String(form.get('password')||'');if(password.length<12||password.length>128)throw fail('PASSWORD_LENGTH');if(password!==form.get('confirm'))throw fail('PASSWORD_MISMATCH');return password;}
 function identity(form){const email=String(form.get('email')||'').trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+[.][^\s@]+$/.test(email)||email.length>254)throw fail('INVALID_INPUT');return email;}
 async function apply(form,email){const name=String(form.get('name')||'').trim(),reason=String(form.get('reason')||'').trim(),role=form.get('role');if(!name||reason.length<2||!['admin','checkin'].includes(role))throw fail('INVALID_INPUT');const result=await call('/functions/v1/ehe-access?route=apply','POST',{name,email,reason,requested_role:role,website:''});if(result.received!==true)throw fail('INVALID_RESPONSE');}
 function status(text){document.getElementById('accountStatus').textContent=text;}
 document.addEventListener('click',e=>{const b=e.target.closest('[data-show]');if(!b)return;const input=document.getElementById(b.dataset.show),visible=input.type==='password';input.type=visible?'text':'password';b.textContent=visible?'Hide password':'Show password';b.setAttribute('aria-pressed',String(visible));});
 document.addEventListener('submit',async e=>{
  if(e.target.id!=='accountForm')return;e.preventDefault();if(busy||!e.target.reportValidity())return;
  const form=e.target,values=new FormData(form),button=form.querySelector('[type="submit"]');if(values.get('website'))return;
  busy=true;button.disabled=true;document.getElementById('accountError').textContent='';status('');
  try{
   if(mode==='forgot'){await call('/auth/v1/recover?redirect_to='+encodeURIComponent(CALLBACK),'POST',{email:identity(values)});status('Request accepted. If this email has an eligible account, a reset link will arrive. Check your inbox and spam. This message does not confirm email delivery.');}
   else if(mode==='resend'){await call('/auth/v1/resend?redirect_to='+encodeURIComponent(CALLBACK),'POST',{email:identity(values),type:'signup'});status('Request accepted. Check for a verification email if this account is eligible. No administrator access is granted by this step.');}
   else if(mode==='request'){await apply(values,identity(values));form.reset();status('Access request received. The portal owner must approve your role and your email must be verified before you can use the portal.');}
   else if(mode==='create'){
    const email=identity(values),password=credentials(values);const settings=await call('/auth/v1/settings');
    if(settings.mailer_autoconfirm===true)throw fail('EMAIL_VERIFICATION_DISABLED');
    await call('/auth/v1/signup?redirect_to='+encodeURIComponent(CALLBACK),'POST',{email,password,data:{full_name:String(values.get('name')||'').trim()}});
    form.querySelectorAll('input[type="password"],input[name="password"],input[name="confirm"]').forEach(x=>x.value='');
    try{await apply(values,email);}catch(error){mode='request';render();status('Registration was accepted, but the access request was not confirmed. Verify your email, then submit the access request here. Do not create another account.');throw error;}
    form.reset();status('Registration and access request accepted. If eligible, check your email to verify your address. The portal owner must also approve and activate your role. An existing account may not receive a new signup email; use Forgot password instead.');
   }
   else if(mode==='update'){
    if(!recoveryToken)throw fail('LINK_INVALID');const password=credentials(values);
    await call('/auth/v1/user','PUT',{password},recoveryToken);
    let signedOut=true;try{await call('/auth/v1/logout?scope=global','POST',{},recoveryToken);}catch{signedOut=false;}
    recoveryToken='';try{sessionStorage.removeItem('ehe.auth');}catch{}mode='done';render();
    status(signedOut?'Password updated. Other sessions were signed out. Use your new password to sign in.':'Password updated. Signing out other sessions could not be confirmed; contact the owner to review active sessions.');
   }
  }catch(error){const box=document.getElementById('accountError');box.textContent=message(error);box.focus();}
  finally{busy=false;if(button.isConnected)button.disabled=false;}
 });
 async function callback(){
  if(callbackError)throw fail('LINK_INVALID');
  if(!callbackToken&&!tokenHash)return;
  if(!['recovery','signup','invite'].includes(callbackType))throw fail('LINK_INVALID');
  let token=callbackToken;
  if(tokenHash){const exchange=await call('/auth/v1/verify','POST',{type:callbackType,token_hash:tokenHash});token=exchange.access_token;}
  if(!token||token.length>12000)throw fail('LINK_INVALID');
  const user=await call('/auth/v1/user','GET',undefined,token);
  if(!user.id||!user.email||!user.email_confirmed_at||user.is_anonymous)throw fail('LINK_INVALID');
  verifiedEmail=user.email;
  if(callbackType==='signup'){mode='verified';try{await call('/auth/v1/logout?scope=local','POST',{},token);}catch{}render();}
  else{recoveryToken=token;mode='update';render();}
 }
 render();if(callbackToken||tokenHash||callbackError){host.innerHTML='<p role="status">Checking your secure link...</p>';callback().catch(error=>{mode='forgot';recoveryToken='';render();document.getElementById('accountError').textContent=message(error);});}
 window.addEventListener('pagehide',()=>{recoveryToken='';});
})();
