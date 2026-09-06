#!/usr/bin/env python3
import json,sys,pathlib,time,os
from playwright.sync_api import sync_playwright,expect
folder=pathlib.Path(sys.argv[1]);request=json.loads((folder/'input.json').read_text());checks=[]
with sync_playwright() as p:
 launch={}
 if os.environ.get('CHROMIUM_PATH'):launch['executable_path']=os.environ['CHROMIUM_PATH']
 if os.environ.get('ATELIER_BROWSER_NO_SANDBOX')=='true':launch['args']=['--no-sandbox']
 browser=p.chromium.launch(**launch)
 try:
  for case in request['runs']:
   page=browser.new_page(viewport={'width':case['width'],'height':850},reduced_motion='reduce');page.set_default_timeout(7000);errors=[];network=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('http://**/*',lambda r:(network.append(r.request.url),r.abort()));page.route('https://**/*',lambda r:(network.append(r.request.url),r.abort()));tasks=0;started=time.monotonic()
   try:
    page.set_content('<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0"><iframe title="Tested component" sandbox="allow-scripts" style="border:0;width:100vw;height:850px"></iframe></body></html>')
    page.evaluate('''({html,channel})=>{const frame=document.querySelector('iframe');window.__ready=false;window.__errors=[];window.__calls=[];addEventListener('message',e=>{if(e.source!==frame.contentWindow||e.data?.atelier!==1||e.data.channel!==channel)return;if(e.data.type==='ready')window.__ready=true;if(e.data.type==='error')window.__errors.push(e.data.payload);if(e.data.type==='action'){window.__calls.push(e.data.payload);frame.contentWindow.postMessage({atelier:1,channel,type:'action-result',payload:{requestId:e.data.payload.requestId,result:{id:'fixture-operation',status:'created'}}},'*');}});frame.srcdoc=html;}''',{'html':(folder/case['file']).read_text(),'channel':case['channel']})
    page.wait_for_function('window.__ready===true');frame=page.frame_locator('iframe');expect(frame.locator('#root')).not_to_be_empty()
    if case['state']!='ready':expect(frame.locator('[data-state="'+case['state']+'"]').first).to_be_visible()
    for task in case['tasks']:
     for step in task['steps']:
      node=frame.locator(step['selector']).first
      if step['op']=='click':node.click()
      elif step['op']=='fill':node.fill(step['value'])
      elif step['op']=='select':node.select_option(step['value'])
      elif step['op']=='press':node.press(step['value'])
      else:raise ValueError('Unsupported acceptance step')
     expect(frame.locator(task['expect']['selector']).first).to_contain_text(task['expect']['text']);tasks+=1
    overflow=frame.locator('html').evaluate('(e)=>e.scrollWidth>innerWidth+2');assert not overflow,'Horizontal viewport overflow'
    unnamed=frame.locator('button').evaluate_all("nodes=>nodes.filter(n=>!n.textContent.trim()&&!n.getAttribute('aria-label')&&!n.getAttribute('aria-labelledby')).length");assert not unnamed,'Button without an accessible name'
    assert not network,'Unexpected external network request';assert not page.evaluate('window.__errors'),'Component runtime error';assert not errors,'Uncaught browser error'
    checks.append({'name':case['name'],'passed':True,'tasks':tasks,'durationMs':round((time.monotonic()-started)*1000)})
   except Exception as e:checks.append({'name':case['name'],'passed':False,'tasks':tasks,'error':str(e)[:2000],'runtimeErrors':page.evaluate('window.__errors||[]')})
   finally:
    if request.get('evidenceDir'):
     out=pathlib.Path(request['evidenceDir']);out.mkdir(parents=True,exist_ok=True);page.screenshot(path=str(out/(case['name']+'.png')),full_page=True)
    page.close()
 finally:browser.close()
print(json.dumps({'digest':request['digest'],'passed':all(x['passed'] for x in checks),'checks':checks,'runner':'chromium-sandboxed-react-v1','hostActions':'declared tool responses are explicit fixtures, not real business writes','independentSecurityCertification':False}))
