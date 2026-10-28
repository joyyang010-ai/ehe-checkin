"""Read-only published-site checks. Never submit attendance, credentials, or email requests."""
import hashlib, json, os, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'ux-live-report';OUT.mkdir(exist_ok=True)
BASE='https://joyyang010-ai.github.io/ehe-checkin/'
FILES=['index.html','volunteer.html','account.html','assets/ux-flow.js','assets/ux-flow.css','assets/account-ux.js','assets/entry.js','assets/config.js']
def fetch(path):
 req=urllib.request.Request(BASE+path+'?verify='+os.getenv('GITHUB_SHA','local')+'&t='+str(int(time.time())),headers={'Cache-Control':'no-cache','User-Agent':'EHE-read-only-release-verification'})
 with urllib.request.urlopen(req,timeout=20) as r:return r.read()
matched=False
for attempt in range(18):
 try:
  matched=all(hashlib.sha256(fetch(p)).digest()==hashlib.sha256((ROOT/'docs'/p).read_bytes()).digest() for p in FILES)
 except (urllib.error.URLError,TimeoutError):matched=False
 if matched:break
 time.sleep(10)
assert matched,'Published assets do not yet match this commit; do not call deployment verified'
results=[{'test':'Published HTML and task-flow assets exactly match this commit','passed':True}]
with sync_playwright() as p:
 for engine in ['chromium','webkit']:
  browser=getattr(p,engine).launch()
  for width in [390,1440]:
   ctx=browser.new_context(viewport={'width':width,'height':900});page=ctx.new_page();page.set_default_timeout(20000);errors=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   # The live browser may fetch the public catalog, but cannot make any non-read action.
   def guard(route):
    q=route.request
    if q.method in ['GET','HEAD','OPTIONS']:route.continue_();return
    try:body=q.post_data_json or {}
    except:body={}
    if q.method=='POST' and 'route=catalog' in q.url:route.continue_();return
    raise AssertionError('Unexpected write or authentication request during read-only test')
   ctx.route('https://dcfyhkjecchogrdatgcg.supabase.co/**',guard)
   page.goto(BASE+'?portal=staff&tab=learners',wait_until='networkidle');expect(page.locator('#passwordForm')).to_be_visible();expect(page.locator('#learnerRows')).to_have_count(0)
   expect(page.locator('a[href$="/account.html?mode=forgot"]')).to_have_count(1)
   results.append({'engine':engine,'width':width,'test':'Published staff link requires sign-in; no roster shown','passed':True})
   page.goto(BASE+'volunteer.html',wait_until='networkidle');expect(page.locator('#quickVisitForm')).to_be_visible();assert not page.locator('#quickVisitForm [name=event_id]').evaluate('(el)=>el.required');expect(page.locator('#quickVisitForm [name=name]')).to_have_value('');expect(page.locator('#quickVisitForm [name=email]')).to_have_value('')
   assert page.evaluate('()=>document.documentElement.scrollWidth<=innerWidth+2')
   assert page.locator('.visitSubmit').bounding_box()['y'] < page.locator('details:has(.volunteerAgreements)').bounding_box()['y']
   page.screenshot(path=str(OUT/f'{engine}-{width}-live-volunteer.png'),full_page=True)
   results.append({'engine':engine,'width':width,'test':'Published volunteer form loads directly with optional event, blank identity, no overflow','passed':True})
   page.goto(BASE+'?portal=manage',wait_until='networkidle');expect(page.locator('.uxBookingHelp')).to_be_visible();expect(page.locator('#emailForm')).to_have_count(0)
   results.append({'engine':engine,'width':width,'test':'Published booking-help fallback replaces disabled sign-in form','passed':True})
   page.goto(BASE+'account.html?mode=forgot&lang=zh',wait_until='networkidle');expect(page.locator('html')).to_have_attribute('lang','zh-Hant');expect(page.locator('#accountForm')).to_be_visible();page.locator('[data-account-language=en]').click();expect(page.locator('h1')).to_have_text('Forgot password?')
   assert page.evaluate('()=>document.documentElement.scrollWidth<=innerWidth+2');assert not errors,errors
   results.append({'engine':engine,'width':width,'test':'Published account page switches language; no JavaScript errors','passed':True})
   ctx.close()
  browser.close()
(OUT/'results.json').write_text(json.dumps({'commit':os.getenv('GITHUB_SHA'),'production_writes':False,'real_authentication_test':False,'real_email_test':False,'checks':results},indent=2))
print(json.dumps({'passed':len(results),'production_writes':False,'real_email_test':False}))
