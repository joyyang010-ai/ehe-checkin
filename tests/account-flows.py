"""Synthetic account UI tests: no live passwords, email sends, or production writes."""
import json, os, threading, functools
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright, expect
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'account-report'; OUT.mkdir(exist_ok=True)
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass
server = ThreadingHTTPServer(('127.0.0.1', 4173), functools.partial(Quiet, directory=str(ROOT/'docs')))
threading.Thread(target=server.serve_forever, daemon=True).start()
results=[]
BASE='http://127.0.0.1:4173/'
API='https://dcfyhkjecchogrdatgcg.supabase.co'

def fixture():
    return dict(role='admin', can_manage_access=True, events=[], people=[], enrollments=[], attendance=[], shifts=[], bookings=[], service=[], diaries=[], reviews=[], archive_requests=[],roster_import_review=[], deleted_service=[],server_time='2026-10-27T00:00:00Z')

def suite(browser, engine, width):
    context=browser.new_context(viewport={'width':width,'height':950});page=context.new_page();page.set_default_timeout(10000)
    calls=[];errors=[];state={'recover_error':False,'invalid_link':False,'api_fail':False,'can_manage':True,'apply_fail':False}
    page.on('pageerror',lambda e:errors.append(str(e)))
    def route(r):
        q=r.request
        try: body=q.post_data_json or {}
        except: body={}
        calls.append({'url':q.url,'method':q.method,'body':body,'auth':q.headers.get('authorization','')})
        status=200;data={}
        if q.method=='OPTIONS':
            r.fulfill(status=204,headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,PUT,OPTIONS','Access-Control-Allow-Headers':'apikey,content-type,authorization'});return
        if '/settings' in q.url: data={'mailer_autoconfirm':False,'disable_signup':False,'external':{'email':True}}
        elif '/recover' in q.url and state['recover_error']: status=403;data={'code':'email_address_not_authorized'}
        elif '/token?' in q.url: data={'access_token':'mock-session','refresh_token':'mock-refresh','expires_at':4102444800,'user':{'id':'mock-user','email':'qa@example.invalid'}}
        elif '/user' in q.url and q.method=='GET':
            if state['invalid_link']: status=401;data={'code':'bad_jwt'}
            else: data={'id':'mock-user','email':'qa@example.invalid','email_confirmed_at':'2026-10-27T00:00:00Z'}
        elif '/user' in q.url and q.method=='PUT':
            if state['api_fail']: status=500;data={'code':'server_error'}
            else:data={'id':'mock-user'}
        elif '/signup' in q.url: data={'id':'pending-user','email':'qa@example.invalid'}
        elif '/ehe-access?route=apply' in q.url:
            if state['apply_fail']:status=503;data={'error':'SERVICE_UNAVAILABLE'}
            else:data={'received':True}
        elif '/ehe-access?route=owner' in q.url:
            if not state['can_manage']:status=403;data={'error':'FORBIDDEN'}
            elif body.get('action')=='list':data={'requests':[{'id':'request-1','version':1,'name':'Synthetic Applicant','email':'qa@example.invalid','requested_role':'admin','status':'pending','reason':'Event team','account_ready':True}]}
            else:data={'status':'activated','activated':True,'role':'admin'}
        elif 'route=staff' in q.url:
            data=fixture();data['can_manage_access']=state['can_manage']
        else:data={'events':[],'shifts':[],'server_time':'2026-10-27T00:00:00Z'}
        r.fulfill(status=status,content_type='application/json',headers={'Access-Control-Allow-Origin':'*'},body=json.dumps(data))
    context.route(API+'/**',route)
    def mark(name): results.append({'engine':engine,'width':width,'test':name,'passed':True})
    def no_overflow(): assert page.evaluate('() => document.documentElement.scrollWidth <= innerWidth + 2')
    def submit(): page.locator('#accountForm [type=submit]').click()
    def has_status(text): expect(page.locator('#accountStatus')).to_contain_text(text)
    def has_error(text): expect(page.locator('#accountError')).to_contain_text(text)
    def fill_request():
        page.locator('[name=name]').fill('Synthetic Applicant');page.locator('[name=email]').fill('QA@example.invalid');page.locator('[name=role]').select_option('admin');page.locator('[name=reason]').fill('Event team')
    def fill_passwords(second='LongSyntheticPassword123!'):
        page.locator('[name=password]').fill('LongSyntheticPassword123!');page.locator('[name=confirm]').fill(second)
    page.goto(BASE+'?portal=staff',wait_until='networkidle')
    expect(page.locator('a[href="./account.html?mode=forgot"]')).to_have_count(1)
    expect(page.locator('a[href="./account.html?mode=create"]')).to_have_count(1)
    expect(page.locator('[data-tab=access]')).to_have_count(0)
    mark('Logged-out portal exposes account help, not roster or owner review')
    page.locator('a[href="./account.html?mode=forgot"]').click();page.wait_for_selector('#accountForm');no_overflow()
    page.screenshot(path=str(OUT/f'{engine}-{width}-forgot.png'),full_page=True)
    page.locator('[name=email]').fill('QA@example.invalid');submit();has_status('Request accepted')
    req=[x for x in calls if '/recover?' in x['url']][-1];assert req['body']=={'email':'qa@example.invalid'};assert 'account.html' in req['url'];mark('Password reset sends normalized email and fixed same-origin callback')
    state['recover_error']=True;submit();has_error('email service');expect(page.locator('#accountStatus')).to_be_empty();mark('SMTP rejection is an error, never false success');state['recover_error']=False
    page.goto(BASE+'account.html?mode=create');fill_request();fill_passwords('MismatchPassword123!');submit();has_error('do not match');assert not any('/signup?' in x['url'] for x in calls);mark('Mismatched passwords never reach Auth')
    fill_passwords();submit();has_status('Registration and access request accepted')
    signup=[x for x in calls if '/signup?' in x['url']][-1];assert set(signup['body'])=={'email','password','data'};assert signup['body']['data']=={'full_name':'Synthetic Applicant'}
    apply=[x for x in calls if 'route=apply' in x['url']][-1];assert apply['body']['requested_role']=='admin';assert 'password' not in apply['body'];assert not any('route=owner' in x['url'] for x in calls);assert page.evaluate('() => sessionStorage.getItem("ehe.auth")') is None
    no_overflow();page.screenshot(path=str(OUT/f'{engine}-{width}-create.png'),full_page=True);mark('Signup verifies email and requests access without granting a role or storing a password')
    state['apply_fail']=True;page.goto(BASE+'account.html?mode=create');fill_request();fill_passwords();submit();has_status('access request was not confirmed');expect(page.locator('[name=password]')).to_have_count(0);mark('Partial signup gives an access-request retry rather than duplicate registration');state['apply_fail']=False
    page.goto(BASE+'account.html#access_token=mock-recovery&refresh_token=do-not-store&type=recovery',wait_until='networkidle');page.wait_for_selector('[name=confirm]');assert '#' not in page.url;assert page.evaluate('() => sessionStorage.getItem("ehe.auth")') is None;assert 'qa@example.invalid' in page.locator('.accountIntro').inner_text()
    state['api_fail']=True;fill_passwords();submit();expect(page.locator('#accountError')).not_to_be_empty();expect(page.locator('#accountStatus')).to_be_empty();state['api_fail']=False;mark('Recovery token checked server-side and not stored; failed password writes never show success')
    submit();expect(page.locator('h1')).to_have_text('Account updated');assert any(x['method']=='PUT' and x['auth']=='Bearer mock-recovery' for x in calls);assert any('/logout?scope=global' in x['url'] for x in calls);mark('Confirmed password update signs out sessions and preserves access roles')
    state['invalid_link']=True;page.goto(BASE+'account.html#access_token=invalid&type=recovery',wait_until='networkidle');has_error('invalid');expect(page.locator('[name=password]')).to_have_count(0);state['invalid_link']=False;mark('Invalid or expired callback cannot display password-update controls')
    page.goto(BASE+'?portal=staff#access_token=mock-recovery&type=recovery',wait_until='networkidle');page.wait_for_selector('[name=confirm]');assert '/account.html' in page.url;assert '#' not in page.url;mark('Root callback safely routes to password-update page, not volunteer management')
    page.goto(BASE+'account.html#access_token=mock-signup&type=signup',wait_until='networkidle');expect(page.locator('h1')).to_have_text('Email verified');expect(page.locator('[name=password]')).to_have_count(0);mark('Signup callback confirms email without admin elevation')
    page.goto(BASE+'?portal=staff&tab=access',wait_until='networkidle');page.locator('#passwordForm [name=email]').fill('qa@example.invalid');page.locator('#passwordForm [name=password]').fill('SyntheticOnly123!');page.locator('#passwordForm [type=submit]').click();page.wait_for_selector('[data-account-review=approve]');no_overflow()
    page.screenshot(path=str(OUT/f'{engine}-{width}-owner.png'),full_page=True)
    page.locator('[data-account-review=approve]').click();page.locator('#accountReviewForm [name=role]').select_option('admin');page.locator('#accountReviewForm [type=submit]').click();expect(page.locator('#modal')).not_to_be_visible()
    decision=[x for x in calls if 'route=owner' in x['url'] and x['body'].get('action')=='approve'][-1];assert decision['body']['data']['role']=='admin';assert decision['auth']=='Bearer mock-session';mark('Owner approval explicitly confirms role through protected endpoint')
    state['can_manage']=False;page.reload(wait_until='networkidle');expect(page.locator('#app')).to_contain_text('Only the portal owner');expect(page.locator('[data-account-review]')).to_have_count(0);mark('Normal admin cannot review accounts from UI')
    assert not errors,errors;mark('No JavaScript errors or horizontal overflow')
    context.close()

try:
    with sync_playwright() as p:
        engines=[('chromium',p.chromium)]
        if os.environ.get('CI'): engines.append(('webkit',p.webkit))
        for name,engine in engines:
            args={'headless':True}
            if not os.environ.get('CI'): args.update(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
            browser=engine.launch(**args)
            try:
                for width in (390,768,1440): suite(browser,name,width)
            finally: browser.close()
finally:
    server.shutdown()
    (OUT/'results.json').write_text(json.dumps({'scope':'Mocked Auth and access APIs; no real credentials, emails, or production writes','checks':results},indent=2))
print(f'{len(results)} checks passed')
