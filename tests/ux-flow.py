"""UX regression: synthetic identities only; intercept every Supabase request, never write production data."""
import json, functools, threading, os
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'ux-report';OUT.mkdir(exist_ok=True)
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args): pass
server=ThreadingHTTPServer(('127.0.0.1',4173),functools.partial(Quiet,directory=str(ROOT/'docs')))
threading.Thread(target=server.serve_forever,daemon=True).start()
BASE='http://127.0.0.1:4173/'
API='https://dcfyhkjecchogrdatgcg.supabase.co'
results=[]
def fixture(role):
 events=[dict(id='QA-1',event_date='2026-10-28',name_en='Synthetic Class 3',name_zh='QA Class 3',event_type='course',cycle_code='QA',published=True,location='Synthetic test venue',diary_health=True,diary_bp=True),dict(id='QA-2',event_date='2026-10-21',name_en='Synthetic Class 2',event_type='course',cycle_code='QA',published=True,location='Synthetic venue')]
 people=[dict(id='EHE-9001',kind='participant',name='Example Participant',alias='Sample Alias',profile_status='reviewed',joined_on='2026-01-01',archived_at=None),dict(id='EHE-9002',kind='participant',name='Existing Outside Roster',alias='',profile_status='reviewed',joined_on='2026-01-01',archived_at=None),dict(id='VOL-QA',kind='volunteer',name='Example Volunteer',email='volunteer@example.invalid',languages=[])]
 return dict(role=role,can_manage_access=role=='admin',events=events,people=people,enrollments=[dict(id='REG-1',person_id='EHE-9001',event_id='QA-1',entry_method='returning_registration'),dict(id='REG-2',person_id='EHE-9001',event_id='QA-2',entry_method='returning_registration')],attendance=[],shifts=[],bookings=[],service=[],diaries=[],reviews=[],archive_requests=[],roster_import_review=[],deleted_service=[],server_time='2026-10-28T16:00:00Z')
def suite(browser,engine,width,role='admin'):
 ctx=browser.new_context(viewport={'width':width,'height':900});page=ctx.new_page();page.set_default_timeout(6000)
 state={'data':fixture(role),'lookup_fail':False,'visit_fail':False,'account_error':False,'visit_record':None};calls=[];errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 def route(r):
  q=r.request
  try:body=q.post_data_json or {}
  except:body={}
  calls.append({'url':q.url,'method':q.method,'body':body})
  data={};status=200
  if q.method=='OPTIONS':r.fulfill(status=204,headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'apikey,authorization,content-type','Access-Control-Allow-Methods':'GET,POST,PUT,OPTIONS'});return
  if '/token?' in q.url:data={'access_token':'mock-session','refresh_token':'mock-refresh','expires_at':4102444800,'user':{'id':'mock-user','email':'staff@example.invalid'}}
  elif '/settings' in q.url:data={'mailer_autoconfirm':False,'disable_signup':False,'external':{'email':True}}
  elif '/user' in q.url:data={'id':'mock-user','email':'staff@example.invalid','email_confirmed_at':'2026-10-27T00:00:00Z'}
  elif '/recover' in q.url:
   if state['account_error']:status=403;data={'code':'email_address_not_authorized'}
  elif '/signup' in q.url:data={'id':'pending-user','email':'qa@example.invalid'}
  elif 'route=apply' in q.url:data={'received':True}
  elif 'route=owner' in q.url:data={'requests':[]}
  elif 'route=catalog' in q.url:data={'events':state['data']['events'],'shifts':[],'server_time':'2026-10-28T16:00:00Z'}
  elif 'ehe-volunteer' in q.url:
   if state['visit_fail']:status=503;data={'error':'SERVICE_UNAVAILABLE','recorded':False}
   else:
    if not state['visit_record']:state['visit_record']={'service_id':'synthetic-visit','checked_in_at':'2026-10-28T16:00:00Z'}
    data={**state['visit_record'],'recorded':True,'status':'checked_out' if body.get('kind')=='out' else 'checked_in','request_id':body.get('request_id'),'requires_review':False}
    if body.get('kind')=='out':data.update(checked_out_at='2026-10-28T18:00:00Z',duration_seconds=7200)
  elif 'route=staff' in q.url:
   act=body.get('action');d=body.get('data') or {}
   if act=='snapshot' and 'lookup' in d:
    if state['lookup_fail']:status=503;data={'error':'SERVICE_UNAVAILABLE'}
    else:data={'matches':[p for p in state['data']['people'] if p['kind']=='participant' and d['lookup'].lower() in (p['name']+' '+p.get('alias','')+' '+p['id']).lower()]}
   elif act=='enroll_participant':
    pid=d['person_id'];eid=d['event_id'];reg=next((x for x in state['data']['enrollments'] if x['person_id']==pid and x['event_id']==eid),None)
    if not reg:reg={'id':'REG-WALKIN','person_id':pid,'event_id':eid,'entry_method':'walk_in'};state['data']['enrollments'].append(reg)
    if d.get('checkin'):state['data']['attendance'].append(dict(id='ATT-WALKIN',enrollment_id=reg['id'],status='checked_in',voided=False,checked_in_at='2026-10-28T16:00:00Z'))
    data={'person_id':pid}
   elif act=='participant_checkin':
    state['data']['attendance'].append(dict(id='ATT-1',enrollment_id=d['enrollment_id'],status='checked_in',voided=False,checked_in_at='2026-10-28T16:00:00Z'));data={'status':'checked_in'}
   else:data=state['data']
  else:data={'events':[],'shifts':[],'server_time':'2026-10-28T16:00:00Z'}
  r.fulfill(status=status,content_type='application/json',headers={'Access-Control-Allow-Origin':'*'},body=json.dumps(data))
 ctx.route(API+'/**',route)
 def mark(test):results.append({'engine':engine,'width':width,'role':role,'test':test,'passed':True})
 def overflow():assert page.evaluate('() => document.documentElement.scrollWidth <= innerWidth+2')
 page.goto(BASE+'?portal=staff&tab=learners&event=QA-1',wait_until='networkidle')
 page.locator('#passwordForm [name=email]').fill('staff@example.invalid');page.locator('#passwordForm [name=password]').fill('SyntheticPassword123!');page.locator('#passwordForm [type=submit]').click()
 expect(page.locator('#learnerSearch')).to_be_visible();expect(page.locator('#activeEvent')).to_have_value('QA-1');overflow();mark('Direct event URL retained after sign-in; participant controls fit viewport')
 assert page.locator('[data-action=walkin]').count()==0
 page.screenshot(path=str(OUT/f'{engine}-{width}-{role}-participants.png'),full_page=True)
 page.locator('#learnerSearch').fill('Existing Outside');page.locator('[data-ux-master]').click()
 expect(page.locator('#p0MasterSearch [name=query]')).to_have_value('Existing Outside')
 expect(page.locator('[data-p0-use="EHE-9002"]')).to_be_visible();mark('Master search carries current query and offers existing participant first')
 page.on('dialog',lambda d:d.accept());page.locator('[data-p0-use="EHE-9002"]').click();expect(page.locator('#modal')).not_to_be_visible()
 assert any(x['body'].get('action')=='enroll_participant' and x['body']['data'].get('person_id')=='EHE-9002' for x in calls)
 assert not any(x['body'].get('action')=='new_participant' for x in calls);mark('Walk-in uses stable existing ID, without a duplicate profile')
 page.locator('#learnerSearch').fill('Example Participant');page.locator('[data-ux-master]').click();expect(page.locator('[data-p0-new]')).to_be_visible();page.locator('[data-p0-new]').click();page.locator('#p0NewParticipant [type=submit]').click()
 expect(page.locator('#p0DuplicateNotice [name=allow_same_name]')).to_be_visible();assert not any(x['body'].get('action')=='new_participant' for x in calls);mark('Final duplicate check blocks same-name creation until explicit different-person confirmation')
 page.locator('#modal [data-action=close]').last.click()
 state['lookup_fail']=True;page.locator('#learnerSearch').fill('No match');page.locator('[data-ux-master]').click();expect(page.locator('#formError')).not_to_be_empty();assert page.locator('[data-p0-new]').count()==0;page.locator('#modal [data-action=close]').last.click();state['lookup_fail']=False;mark('Lookup failure cannot bypass duplicate checking')
 if role!='checkin':
  page.locator('.uxPrimary [data-tab=service]').click();expect(page.locator('#visitScope')).to_have_value('event');expect(page.locator('#activeEvent')).to_be_visible();assert page.locator('.uxVolunteerNav [data-tab=bookings]').count()==1
  page.locator('#visitScope').select_option('all');expect(page.locator('#activeEvent')).not_to_be_visible();expect(page.locator('.uxScope')).to_contain_text('all events');assert 'scope=all' in page.url;mark('Volunteer totals and roster share one explicit scope')
  page.screenshot(path=str(OUT/f'{engine}-{width}-volunteers.png'),full_page=True);overflow()
  page.locator('.uxVolunteerNav [data-tab=bookings]').click();expect(page.locator('.uxBookings')).to_be_visible();assert page.locator('.visitStats').count()==0;mark('Bookings is separate from attendance')
  page.go_back(wait_until='networkidle');expect(page.locator('#visitScope')).to_have_value('all');page.go_back(wait_until='networkidle');expect(page.locator('#visitScope')).to_have_value('event');mark('Browser Back restores view and scope')
 else:
  assert page.locator('[data-tab=service]').count()==0;mark('Desk account never receives admin or volunteer navigation')
 page.goto(BASE+'volunteer.html?event=QA-1',wait_until='networkidle');expect(page.locator('#quickVisitForm')).to_be_visible();expect(page.locator('#quickVisitForm [name=event_id]')).to_have_value('QA-1');overflow()
 page.locator('#quickVisitForm [name=event_id]').select_option('');assert not page.locator('#quickVisitForm [name=event_id]').evaluate('(el)=>el.required')
 page.locator('#quickVisitForm [name=name]').fill('Synthetic Volunteer');page.locator('#quickVisitForm [name=email]').fill('qa@example.invalid')
 assert page.locator('.visitSubmit').bounding_box()['y'] < page.locator('details:has(.volunteerAgreements)').bounding_box()['y']
 page.screenshot(path=str(OUT/f'{engine}-{width}-checkin.png'),full_page=True)
 state['visit_fail']=True;page.locator('.visitSubmit').click();expect(page.locator('#quickVisitError')).not_to_be_empty();expect(page.locator('#quickVisitForm [name=name]')).to_have_value('Synthetic Volunteer');assert page.locator('.visitReceiptSuccess').count()==0
 first_request=[x['body']['request_id'] for x in calls if 'ehe-volunteer' in x['url']][-1];state['visit_fail']=False;page.locator('.visitSubmit').click();expect(page.locator('.visitReceiptSuccess')).to_be_visible()
 last=[x['body'] for x in calls if 'ehe-volunteer' in x['url']][-1];assert last['request_id']==first_request;assert last['event_id'] is None and last['data']['unassigned_event'] is True
 mark('Unlisted event supported; failed save retains input, retry keeps same request ID, success requires recorded response')
 page.locator('#modal [data-action=close]').last.click();expect(page.locator('#quickVisitForm [name=name]')).to_have_value('');mark('Shared-device identity clears after successful submission')
 page.locator('[data-action=kind-out]').click();page.locator('#quickVisitForm [name=name]').fill('Synthetic Volunteer');page.locator('#quickVisitForm [name=email]').fill('qa@example.invalid');page.locator('.visitSubmit').click();expect(page.locator('.visitReceiptTimes')).to_contain_text('2h 00m');page.locator('#modal [data-action=close]').last.click();mark('Checkout records server timestamps and duration without review')
 ctx.clear_cookies();page.evaluate('()=>sessionStorage.clear()');page.goto(BASE+'?portal=manage',wait_until='networkidle');expect(page.locator('.uxBookingHelp')).to_be_visible();assert page.locator('#emailForm').count()==0;mark('Unavailable booking email flow replaced by coordinator-help actions')
 page.goto(BASE+'account.html?mode=forgot&lang=zh',wait_until='networkidle');expect(page.locator('html')).to_have_attribute('lang','zh');expect(page.locator('#account-email')).to_be_visible();page.locator('[data-account-language=en]').click();expect(page.locator('h1')).to_have_text('Forgot password?');overflow()
 page.locator('#account-email').fill('qa@example.invalid');page.locator('#accountForm [type=submit]').click();expect(page.locator('#accountStatus')).to_contain_text('Request accepted');expect(page.locator('#accountForm [type=submit]')).to_be_disabled();expect(page.locator('[data-cooldown]')).to_be_visible();mark('Bilingual account pages preserve inputs; email resend cooldown prevents repeated clicks')
 page.screenshot(path=str(OUT/f'{engine}-{width}-account.png'),full_page=True)
 assert not errors,errors;mark('No JavaScript errors')
 ctx.close()
try:
 with sync_playwright() as p:
  engine=os.getenv('EHE_ENGINE','chromium');args={}
  if os.getenv('EHE_SYSTEM_CHROMIUM')=='1':args={'executable_path':'/usr/bin/chromium','args':['--no-sandbox']}
  b=getattr(p,engine).launch(**args)
  for width in (390,768,1440):suite(b,engine,width)
  suite(b,engine,390,'checkin');b.close()
finally:
 (OUT/'results.json').write_text(json.dumps(results,indent=2))
 server.shutdown()
print(json.dumps({'passed':len(results),'production_writes':False,'real_email_test':False}))
