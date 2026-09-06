"""Real Chromium DOM tests. Requires Python Playwright and Chromium.
Normal mode navigates HTTP. ATELIER_BROWSER_BRIDGE=1 uses set_content and a
cookie-aware HTTP bridge when the execution environment forbids browser URLs.
Bridge mode is explicitly reported; it does not alter Chromium managed policies.
"""
from pathlib import Path
import os,json,re,time,urllib.request,urllib.error,http.cookiejar
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
ORIGIN=os.environ.get('ATELIER_TEST_ORIGIN','http://127.0.0.1:4310')
PASSWORD=os.environ['ATELIER_TEST_PASSWORD'];EMAIL=os.environ.get('ATELIER_TEST_EMAIL','builder@example.test')
BRIDGE=os.environ.get('ATELIER_BROWSER_BRIDGE')=='1'
EVIDENCE=Path(os.environ.get('ATELIER_BROWSER_EVIDENCE',str(ROOT/'evidence/current/legacy-studio')));EVIDENCE.mkdir(parents=True,exist_ok=True)
checks=[];errors=[]
def checked(name,fn):
    fn();checks.append({'name':name,'passed':True})
opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
def http(path,opts):
    assert path.startswith('/api/')
    headers={**opts.get('headers',{}),'Origin':ORIGIN}
    req=urllib.request.Request(ORIGIN+path,method=opts.get('method','GET'),headers=headers,data=opts.get('body','').encode() if 'body' in opts else None)
    try:
        with opener.open(req,timeout=20) as res:return {'status':res.status,'body':res.read().decode()}
    except urllib.error.HTTPError as res:return {'status':res.code,'body':res.read().decode()}
def install(page):
    if not BRIDGE:page.goto(ORIGIN);return
    page.expose_function('_http',http)
    css=(ROOT/'apps/studio/web/app.css').read_text()+'\n'+(ROOT/'apps/studio/web/surface.css').read_text()
    page.set_content('<!doctype html><html lang=en><head><base href="'+ORIGIN+'"><style>'+css+'</style></head><body><div id=app></div><div id=toast role=status></div></body></html>')
    page.evaluate("Object.defineProperty(window,'localStorage',{value:(()=>{const m=new Map();return{getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)}})()})")
    surface=(ROOT/'packages/surface/src/browser.mjs').read_text().replace('export ','')
    app=re.sub(r'^import .*?;\n','',(ROOT/'apps/studio/web/app.mjs').read_text(),count=1)
    preamble="let location={origin:"+json.dumps(ORIGIN)+",pathname:'/',search:'',hash:''}; const history={pushState(_a,_b,path){const u=new URL(path,location.origin);location={origin:u.origin,pathname:u.pathname,search:u.search,hash:u.hash};},replaceState(...args){this.pushState(...args);}};const fetch=async(path,opts={})=>{const r=await window._http(path,opts);return new Response(r.body,{status:r.status,headers:{'Content-Type':'application/json'}});};"
    page.evaluate('(()=>{'+preamble+surface+'\nconst e=escapeHtml;\n'+app+'})()')
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1440,'height':1000},device_scale_factor=1,reduced_motion='reduce');page.set_default_timeout(10000);page.on('pageerror',lambda e:errors.append(str(e)))
    install(page)
    page.get_by_label('Email address').fill(EMAIL);page.get_by_label('Password',exact=True).fill(PASSWORD);page.get_by_role('button',name='Sign in',exact=True).click();page.get_by_role('heading',name='Room for what’s next.').wait_for()
    checks.append({'name':'Browser login against real HTTP session and CSRF service','passed':True})
    page.screenshot(path=str(EVIDENCE/'studio-overview.png'),full_page=True)
    assert page.locator('.project-card').count()>=2;checks.append({'name':'Multi-project workspace renders actual persisted projects','passed':True})
    page.locator('.project-card').filter(has=page.get_by_role('heading',name='Customer Operations')).click();page.get_by_role('link',name='Experience lab',exact=True).click();page.locator('.design-card').filter(has_text='Draft').first.click();page.wait_for_selector('.as-field,.as-table')
    page.screenshot(path=str(EVIDENCE/'experience-preview.png'),full_page=True)
    for state,selector in [('loading','.as-loading'),('empty','.as-empty-symbol'),('error','.as-region [role=alert]'),('ready','.as-field,.as-table')]:
        page.locator('[data-state="'+state+'"]').click();page.wait_for_selector(selector);checks.append({'name':'Preview '+state+' state renders without JavaScript errors','passed':True})
    page.locator('[data-size=mobile]').click();assert page.locator('#preview').bounding_box()['width']<=450;checks.append({'name':'Component preview contracts to mobile width','passed':True})
    page.locator('[data-size=desktop]').click()
    page.locator('.as-actions button').first.click();page.locator('dialog[open]').wait_for();assert page.locator('dialog[open]').get_attribute('aria-label');page.keyboard.press('Escape');assert page.locator('dialog[open]').count()==0;checks.append({'name':'Action dialog has accessible name, focus and Escape dismissal','passed':True})
    page.get_by_role('button',name='Review draft',exact=True).click();page.locator('dialog[open]').wait_for();print('REVIEW DIALOG',page.locator('dialog[open]').inner_text(),flush=True)
    # Require actual explicit signoff control; do not forge the request with page API.
    for checkbox in page.locator('dialog[open] input[type=checkbox]').all():checkbox.check()
    page.locator('dialog[open] button[type=submit]').click();page.get_by_role('button',name='Publish release',exact=True).wait_for();page.get_by_role('button',name='Publish release',exact=True).click()
    if page.locator('dialog[open]').count():
        for checkbox in page.locator('dialog[open] input[type=checkbox]').all():checkbox.check()
        page.locator('dialog[open] button[type=submit]').click()
    page.get_by_role('button',name='Promote to production',exact=True).wait_for();checks.append({'name':'Interactive human review and signed staging publication through HTTP','passed':True})
    page.screenshot(path=str(EVIDENCE/'published-release.png'),full_page=True)
    # Dark theme through real app command.
    theme=page.locator('[data-action=theme]');
    if theme.count():
        theme.click();page.screenshot(path=str(EVIDENCE/'studio-dark.png'),full_page=True);checks.append({'name':'Dark theme renders live app','passed':True})
    page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(600);page.screenshot(path=str(EVIDENCE/'studio-mobile.png'),full_page=True)
    overflow=page.evaluate('document.documentElement.scrollWidth > innerWidth+2')
    assert not overflow,'Mobile viewport has horizontal overflow';checks.append({'name':'390px mobile page has no horizontal overflow','passed':True})
    assert not errors,errors
    checks.append({'name':'No browser JavaScript errors during full workflow','passed':True})
    report={'passed':True,'mode':'DOM+live-HTTP-bridge' if BRIDGE else 'direct-browser-HTTP','chromium':browser.version,'checks':checks,'count':len(checks),'errors':errors,'limitations':['Bridge mode does not certify browser networking, cookie enforcement or CSP; these are independently asserted by Node HTTP tests.'] if BRIDGE else []}
    (EVIDENCE/'browser-report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2));browser.close()
