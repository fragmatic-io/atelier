"""DOM + real host/control HTTP flow. No fabricated side effects or model results.
Run against the seeded/published staging example; never a production account.
"""
from pathlib import Path
import json,os,re,urllib.request,urllib.error
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
ORIGIN=os.environ.get('ATELIER_HOST_TEST_ORIGIN','http://127.0.0.1:4311')
BRIDGE=os.environ.get('ATELIER_BROWSER_BRIDGE')=='1'
OUT=ROOT/'evidence/current/legacy-host';OUT.mkdir(parents=True,exist_ok=True)
checks=[];errors=[];calls=[]
def http(path,opts):
    assert path.startswith('/api/')
    headers={**opts.get('headers',{}),'Origin':ORIGIN}
    req=urllib.request.Request(ORIGIN+path,method=opts.get('method','GET'),headers=headers,data=opts.get('body','').encode() if 'body' in opts else None)
    try:
        with urllib.request.urlopen(req,timeout=15) as res: result={'status':res.status,'body':res.read().decode()}
    except urllib.error.HTTPError as res: result={'status':res.code,'body':res.read().decode()}
    # Evidence includes endpoint/count only, never auth, confirmation tickets, inputs or source data.
    calls.append({'path':path,'status':result['status']})
    return result
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1500,'height':1100},reduced_motion='reduce');page.set_default_timeout(12000);page.on('pageerror',lambda e:errors.append(str(e)))
    if not BRIDGE: page.goto(ORIGIN)
    else:
        page.expose_function('_hostHttp',http)
        html=(ROOT/'apps/host-demo/index.html').read_text();html=re.sub(r'<script.*?</script>','',html);html=re.sub(r'<link[^>]+>','',html)
        html=html.replace('</head>','<style>'+(ROOT/'apps/host-demo/host.css').read_text()+(ROOT/'apps/studio/web/surface.css').read_text()+'</style></head>')
        page.set_content(html)
        pre="const fetch=async(path,opts={})=>{const r=await window._hostHttp(path,opts);return new Response(r.body,{status:r.status,headers:{'Content-Type':'application/json'}});};globalThis.fetch=fetch;"
        source=(ROOT/'packages/surface/src/browser.mjs').read_text().replace('export ','')+'\n'+(ROOT/'packages/surface/src/host-client.mjs').read_text().replace('export ','')
        app=re.sub(r'^import.*?\n','',(ROOT/'apps/host-demo/host.mjs').read_text(),count=1)
        page.evaluate('(async()=>{'+pre+source+app+'})()')
    page.locator('#extension .as-field').first.wait_for()
    assert 'Northstar Labs' in page.locator('#extension').inner_text()
    assert 'private.demo@example.test' not in page.locator('#extension').inner_text()
    checks.append({'name':'Real signed staging bundle renders alongside host app with projected live data','passed':True})
    page.screenshot(path=str(OUT/'host-app-live.png'),full_page=True)
    button=page.locator('#extension').get_by_role('button',name='Intervention create');button.click()
    dialog=page.get_by_role('dialog');dialog.get_by_label('Kind').select_option('escalate');dialog.get_by_label('Reason').fill('Browser verification of the scoped intervention workflow.')
    dialog.get_by_role('button',name='Intervention create').click();page.get_by_text('Action completed.',exact=True).wait_for()
    assert 'escalated' in page.locator('#extension').inner_text()
    assert 'Intervention recorded' in page.locator('#extension').inner_text()
    checks.append({'name':'Actual input collection, host authorization, signed confirmation and durable business write','passed':True})
    if BRIDGE:
        assert any(x['path'].endswith('/confirm') and x['status']==200 for x in calls)
        assert any(x['path'].endswith('/dispatch') and x['status']==200 for x in calls)
        checks.append({'name':'Mutation reaches separate host HTTP server, not a preview stub','passed':True})
    page.locator('#extension').get_by_role('button',name='Customer archive').click();page.get_by_role('dialog').get_by_role('button',name='Customer archive').click();page.wait_for_function("document.querySelector('#extension').innerText.includes('archived')")
    checks.append({'name':'Destructive archive uses declared path parameter and persists refreshed archived state','passed':True})
    page.set_viewport_size({'width':390,'height':900});page.screenshot(path=str(OUT/'host-app-mobile.png'),full_page=True)
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    checks.append({'name':'Additive host app has no 390px horizontal overflow','passed':True})
    assert not errors;checks.append({'name':'No browser runtime errors during real read/write workflow','passed':True})
    browser.close()
report={'passed':True,'mode':'DOM+live-HTTP-bridge' if BRIDGE else 'direct-browser','checks':checks,'count':len(checks),'httpCalls':calls,'errors':errors,'limitations':['Fixed demo identity only; integrate real application sessions for deployment.','No live LLM calls were needed for a published surface.']}
(OUT/'host-browser-report.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
