#!/usr/bin/env python3
"""Reproducible real-browser acceptance on fresh local services.
Uses an explicitly labelled offline model fixture; backend authorization,
source compilation, durable jobs, confirmation and database writes are real.
"""
import os,sys,json,time,pathlib,tempfile,subprocess,signal,urllib.request,shutil
from playwright.sync_api import sync_playwright,expect
root=pathlib.Path(__file__).resolve().parent.parent
out=pathlib.Path(os.environ.get('ATELIER_BROWSER_OUT',str(root/'evidence/current/integration'))).resolve();out.mkdir(parents=True,exist_ok=True)
data=pathlib.Path(tempfile.mkdtemp(prefix='atelier-browser-'))
env={**os.environ,'ATELIER_DATA_DIR':str(data),'ATELIER_DEMO_PASSWORD':'Integration-Test-Only-2026!x','CONTROL_PORT':'4330','HOST_PORT':'4331','PORT':'4330','ATELIER_ORIGIN':'http://127.0.0.1:4330','ATELIER_ENABLE_EXAMPLES':'true','NODE_ENV':'development'}
checks=[];services=None;service_log=None;browser_diagnostics={'previewResponses':[],'console':[]}

def check(name,fn):
    started=time.monotonic()
    try:
        fn(); checks.append({'name':name,'passed':True,'durationMs':round((time.monotonic()-started)*1000)})
    except Exception as error:
        checks.append({'name':name,'passed':False,'error':str(error)[:2400],'durationMs':round((time.monotonic()-started)*1000)})
        raise

def wait_url(url,seconds=35):
    end=time.time()+seconds
    while time.time()<end:
        try:
            with urllib.request.urlopen(url,timeout=2) as response:
                if response.status==200:return
        except Exception:time.sleep(.25)
    raise RuntimeError('Service did not start: '+url)

try:
    with (out/'seed.log').open('w') as log:
        seed=subprocess.run(['node','scripts/seed-experiences.mjs'],cwd=root,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=240)
    checks.append({'name':'fresh-project-source-seeding','passed':seed.returncode==0,'exitCode':seed.returncode,'log':'seed.log'})
    if seed.returncode:raise RuntimeError('Source seeding failed. See seed.log; no browser pass is claimed.')
    service_log=(out/'services.log').open('w')
    services=subprocess.Popen(['node','apps/agent-demo/server.mjs'],cwd=root,env=env,stdout=service_log,stderr=subprocess.STDOUT,start_new_session=True)
    check('actual-control-and-host-start',lambda:(wait_url('http://127.0.0.1:4330/health'),wait_url('http://127.0.0.1:4331/')))
    with sync_playwright() as p:
        launch={}
        if os.environ.get('CHROMIUM_PATH'):launch['executable_path']=os.environ['CHROMIUM_PATH']
        if os.environ.get('ATELIER_BROWSER_NO_SANDBOX')=='true':launch['args']=['--no-sandbox']
        browser=p.chromium.launch(**launch)
        try:
            page=browser.new_page(viewport={'width':1512,'height':1050},reduced_motion='reduce')
            page.set_default_timeout(20000)
            errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            page.on('console',lambda message:browser_diagnostics['console'].append({'type':message.type,'text':message.text[:1000]}) if message.type in ['error','warning'] else None)
            page.on('response',lambda response:browser_diagnostics['previewResponses'].append({'url':'/preview/[redacted]','status':response.status,'headers':response.headers}) if '/preview/' in response.url else None)
            check('host-application-renders',lambda:(page.goto('http://127.0.0.1:4331/'),expect(page.get_by_role('textbox',name='Message',exact=True)).to_be_visible()))
            def ask_customer():
                page.get_by_role('textbox',name='Message',exact=True).fill('Inspect the current customer risk')
                page.get_by_role('button',name='Send',exact=True).click()
                expect(page.get_by_role('button',name='Load context',exact=True)).to_be_visible(timeout=30000)
            check('durable-agent-proposes-reviewed-read',ask_customer)
            def load_and_open():
                page.get_by_role('button',name='Load context',exact=True).click()
                artifact=page.locator('button.artifact-link').filter(has_text='Customer context').last
                expect(artifact).to_be_visible(timeout=30000);artifact.click()
                expect(page.frame_locator('iframe.atelier-artifact-frame').locator('h1')).to_contain_text('Northstar Retail')
            check('real-host-read-binds-react-artifact',load_and_open)
            def confirm_write():
                page.frame_locator('iframe.atelier-artifact-frame').locator('#intervene').click()
                dialog=page.get_by_role('dialog');expect(dialog).to_be_visible()
                expect(dialog).to_contain_text('intervention.create')
                dialog.get_by_role('button',name='Confirm action',exact=True).click()
                expect(page.locator('#counter')).to_contain_text('1 recorded intervention')
                expect(page.frame_locator('iframe.atelier-artifact-frame').locator('#result')).to_contain_text('Action processed')
            check('confirmed-action-commits-host-transaction',confirm_write)
            def decline_write():
                page.frame_locator('iframe.atelier-artifact-frame').locator('#intervene').click()
                dialog=page.get_by_role('dialog');expect(dialog).to_be_visible();dialog.get_by_role('button',name='Cancel',exact=True).click()
                expect(page.locator('#counter')).to_contain_text('1 recorded intervention')
            check('declined-action-does-not-mutate',decline_write)
            page.screenshot(path=str(out/'host-desktop.png'),full_page=True)
            def reload_persistence():
                page.reload();expect(page.locator('button.artifact-link').filter(has_text='Customer context').last).to_be_visible(timeout=15000)
                expect(page.locator('#counter')).to_contain_text('1 recorded intervention')
            check('conversation-and-host-state-survive-reload',reload_persistence)
            def mobile():
                page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+2'),'Host layout overflows mobile viewport'
                page.screenshot(path=str(out/'host-mobile.png'),full_page=True)
            check('host-mobile-layout',mobile)
            signup=browser.new_page(viewport={'width':1280,'height':900},reduced_motion='reduce');signup.set_default_timeout(15000);signup_errors=[];signup.on('pageerror',lambda e:signup_errors.append(str(e)))
            def studio_signup():
                signup.goto('http://127.0.0.1:4330/signup')
                expect(signup.get_by_role('heading',name='Start your studio.',exact=True)).to_be_visible()
                signup.get_by_role('textbox',name='Your name',exact=True).fill('Signup Operator')
                signup.get_by_role('textbox',name='Work email',exact=True).fill('signup.operator@example.test')
                signup.locator('input[name="password"]').fill('Signup-Test-Only-2026!x')
                signup.get_by_role('button',name='Create account',exact=True).click()
                expect(signup.get_by_role('heading',name='Your first workspace',exact=True)).to_be_visible()
                assert signup.locator('.profile-name').inner_text()=='Signup Operator','Signed-up account did not receive an authenticated Studio session'
            check('studio-self-service-signup-without-verification',studio_signup)
            studio=browser.new_page(viewport={'width':1512,'height':1050},reduced_motion='reduce');studio.set_default_timeout(15000);studio_errors=[];studio.on('pageerror',lambda e:studio_errors.append(str(e)))
            def studio_login():
                studio.goto('http://127.0.0.1:4330/lab')
                studio.get_by_role('textbox',name='Email',exact=True).fill('builder@example.test')
                studio.locator('input[type=password]').fill(env['ATELIER_DEMO_PASSWORD'])
                studio.get_by_role('button',name='Open workspace',exact=True).click()
                expect(studio.get_by_role('button',name='Component Forge',exact=True)).to_be_visible()
            check('real-studio-cookie-and-csrf-flow',studio_login)
            def forge_view():
                expect(studio.locator('.kit-card').first).to_be_visible();studio.screenshot(path=str(out/'studio-forge.png'),full_page=True)
                studio.locator('.kit-card').filter(has_text='Delivery board').first.click()
                expect(studio.frame_locator('iframe.atelier-artifact-frame').locator('h1')).to_contain_text('clear path')
                studio.frame_locator('iframe.atelier-artifact-frame').locator('#move').click()
                expect(studio.frame_locator('iframe.atelier-artifact-frame').locator('#result')).to_contain_text('In progress')
                studio.screenshot(path=str(out/'studio-source-preview.png'),full_page=True)
            check('studio-approved-react-source-preview',forge_view)
            def onboarding_view():
                studio.goto('http://127.0.0.1:4330/')
                expect(studio.get_by_role('heading',name='Room for what’s next.',exact=True)).to_be_visible()
                project_path=studio.locator('.project-card').filter(has_text='Customer Operations').first.get_attribute('href')
                assert project_path and project_path.startswith('/project/'),'Fresh project link is missing'
                studio.goto('http://127.0.0.1:4330'+project_path+'/setup')
                expect(studio.get_by_role('heading',name='Take Atelier from evidence to experiences.',exact=True)).to_be_visible()
                expect(studio.get_by_text('Every status below comes from stored evidence.',exact=False)).to_be_visible()
                expect(studio.get_by_role('heading',name='Design and install an adaptive workspace',exact=True)).to_be_visible()
                expect(studio.get_by_text('Atelier serves a reviewed surface',exact=False)).to_be_visible()
                studio.get_by_role('button',name='Create snippet',exact=True).click()
                dialog=studio.get_by_role('dialog',name='Create browser observer',exact=True);expect(dialog).to_be_visible()
                expect(dialog.get_by_text('Raw bodies are inspected only inside the application page',exact=False)).to_be_visible()
                expect(dialog.get_by_role('checkbox',name='Send locally redacted semantic samples',exact=True)).not_to_be_checked()
                expect(dialog.get_by_role('checkbox',name='Learn the host design contract from marked elements',exact=True)).to_be_checked()
                dialog.locator('input[name="origin"]').fill('http://127.0.0.1:4331')
                dialog.get_by_role('button',name='Create snippet',exact=True).click()
                secret=studio.get_by_role('dialog',name='Paste this before the closing body tag',exact=True);expect(secret).to_be_visible()
                snippet=secret.locator('code.secret').inner_text()
                marker='data-project-key="';start=snippet.index(marker)+len(marker);project_key=snippet[start:snippet.index('"',start)]
                assert project_key.startswith('atl_obs_'),'Observer key was not issued'
                secret.get_by_role('button',name='Close dialog',exact=True).click()
                page.evaluate("""async (key) => {
                  document.body.setAttribute('data-atelier-design-root','');
                  const button=document.querySelector('button');
                  if (button) button.setAttribute('data-atelier-design-role','button');
                  await new Promise((resolve,reject) => {
                    const script=document.createElement('script');
                    script.src='http://127.0.0.1:4330/observe/v1.js';
                    script.dataset.projectKey=key;
                    script.dataset.environment='development';
                    script.dataset.designCapture='true';
                    script.onload=resolve;script.onerror=reject;document.body.append(script);
                  });
                  await new Promise(resolve => setTimeout(resolve,500));
                }""",project_key)
                studio.reload()
                review_design=studio.get_by_role('button',name='Review host design',exact=True);expect(review_design).to_be_enabled(timeout=15000);review_design.click()
                design_dialog=studio.get_by_role('dialog',name='Review host design contract',exact=True);expect(design_dialog).to_be_visible()
                expect(design_dialog.get_by_text('No page text, HTML, form value or user data is present',exact=False)).to_be_visible()
                design_dialog.get_by_role('checkbox',name='I reviewed these host design tokens and approve them for generated surfaces.',exact=True).check()
                design_dialog.get_by_role('button',name='Approve design contract',exact=True).click()
                expect(studio.get_by_text('Approved and version-bound',exact=True)).to_be_visible(timeout=15000)
                studio.locator('[data-action="configure-agent"]').click()
                agent_dialog=studio.get_by_role('dialog',name='Configure project chatbot',exact=True);expect(agent_dialog).to_be_visible()
                expect(agent_dialog.get_by_text('Deep-answer specialists',exact=True)).to_be_visible()
                expect(agent_dialog.locator('input[name="specialists"][value="research"]')).to_be_visible()
                agent_dialog.get_by_role('button',name='Close dialog',exact=True).click()
                studio.get_by_role('button',name='Install hosted UI',exact=True).click()
                install=studio.get_by_role('dialog',name='Install a customer-owned surface',exact=True);expect(install).to_be_visible()
                expect(install.get_by_text('One hosted script',exact=True)).to_be_visible()
                expect(install.locator('input[name="target"]')).to_have_value('hosted-script')
                install.get_by_label('Application origin',exact=True).fill('http://127.0.0.1:4331')
                install.locator('input[name="routePath"]').fill('/atelier-workspace')
                install.get_by_role('button',name='Generate install bundle',exact=True).click()
                ready=studio.get_by_role('dialog',name='Install bundle ready',exact=True);expect(ready).to_be_visible()
                expect(ready.get_by_role('heading',name='Atelier hosted script',exact=True)).to_be_visible()
                expect(ready.get_by_text('Mount the Atelier-hosted route UI with one script',exact=True)).to_be_visible()
                expect(ready.get_by_role('button',name='Copy script',exact=True)).to_be_visible()
                expect(ready.get_by_text('Verification is factual',exact=True)).to_be_visible()
                ready.get_by_role('button',name='Close dialog',exact=True).click()
                studio.set_viewport_size({'width':390,'height':844})
                assert studio.evaluate('document.documentElement.scrollWidth <= innerWidth+2'),'Setup layout overflows mobile viewport'
                studio.screenshot(path=str(out/'studio-onboarding-mobile.png'),full_page=True)
            check('studio-fact-derived-privacy-onboarding',onboarding_view)
            check('no-uncaught-host-javascript-errors',lambda:(_ for _ in ()).throw(AssertionError('; '.join(errors))) if errors else None)
            check('no-uncaught-signup-javascript-errors',lambda:(_ for _ in ()).throw(AssertionError('; '.join(signup_errors))) if signup_errors else None)
            check('no-uncaught-studio-javascript-errors',lambda:(_ for _ in ()).throw(AssertionError('; '.join(studio_errors))) if studio_errors else None)
        finally:browser.close()
except Exception as error:
    if not checks or checks[-1].get('passed'):
        checks.append({'name':'integration-runner','passed':False,'error':str(error)[:2400]})
finally:
    if services:
        try:os.killpg(services.pid,signal.SIGTERM);services.wait(timeout=15)
        except Exception:
            try:os.killpg(services.pid,signal.SIGKILL)
            except Exception:pass
    if service_log:service_log.close()
    # Remove generated demo password from stored logs; no credentials in evidence.
    for log in out.glob('*.log'):
        text=log.read_text(errors='replace').replace(env['ATELIER_DEMO_PASSWORD'],'[REDACTED DEVELOPMENT PASSWORD]')
        log.write_text(text)
    shutil.rmtree(data,ignore_errors=True)
    report={'name':'Fresh local browser and host acceptance','generatedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'passed':bool(checks) and all(x['passed'] for x in checks),'checks':checks,'browserDiagnostics':browser_diagnostics,'liveModelCalled':False,'browserMode':'actual HTTP Chromium, no bridge','limits':['Local demo identity, not customer SSO','Controlled model fixture, not live provider','No independent penetration test or production load certification']}
    (out/'report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report));sys.exit(0 if report['passed'] else 1)
