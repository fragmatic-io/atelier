#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (c) 2026 The Atelier Authors
"""Measure the real opaque-origin source sandbox; unavailable Chromium fails."""
import json
import os
import pathlib
import sys

from playwright.sync_api import expect, sync_playwright


def main():
    request = json.loads(pathlib.Path(sys.argv[1]).read_text())
    with sync_playwright() as playwright:
        launch = {}
        if os.environ.get("CHROMIUM_PATH"):
            launch["executable_path"] = os.environ["CHROMIUM_PATH"]
        if os.environ.get("ATELIER_BROWSER_NO_SANDBOX") == "true":
            launch["args"] = ["--no-sandbox"]
        browser = playwright.chromium.launch(**launch)
        try:
            page = browser.new_page(viewport={"width": 980, "height": 720}, reduced_motion="reduce")
            page.set_default_timeout(7000)
            errors, network = [], []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.route("**/*", lambda route: (network.append(route.request.url), route.abort()))
            page.set_content('<!doctype html><html><head><title>Host design verification</title></head><body><iframe title="Source design probe" sandbox="allow-scripts" style="width:950px;height:670px;border:0"></iframe></body></html>')
            page.evaluate("""({html,channel}) => {
                const frame=document.querySelector('iframe');
                window.__ready=false; window.__errors=[];
                addEventListener('message', event => {
                    if(event.source!==frame.contentWindow || event.data?.atelier!==1 || event.data.channel!==channel) return;
                    if(event.data.type==='ready') window.__ready=true;
                    if(event.data.type==='error') window.__errors.push(event.data.payload);
                });
                frame.srcdoc=html;
            }""", {"html": request["html"], "channel": request["channel"]})
            page.wait_for_function("window.__ready===true")
            frame = page.frames[1]
            expect(frame.locator("#context-hash")).to_have_text(request["designContextHash"])
            expect(frame.locator("#context-frozen")).to_have_text("true")
            expect(frame.locator("#context-theme")).to_have_text("dark")
            measurements = frame.locator("#root").evaluate("""root => {
                const base=getComputedStyle(root), button=getComputedStyle(document.querySelector('#increment'));
                return {fontFamily:base.fontFamily,fontSize:base.fontSize,fontWeight:base.fontWeight,
                    lineHeight:base.lineHeight,color:base.color,backgroundColor:base.backgroundColor,
                    buttonBackground:button.backgroundColor,buttonColor:button.color,
                    paddingBlock:button.paddingBlockStart,paddingInline:button.paddingInlineStart,
                    gap:getComputedStyle(document.querySelector('#design-nav')).gap,
                    token:base.getPropertyValue('--primary').trim()};
            }""")
            expected = {
                "fontSize": "17px", "fontWeight": "500", "color": "rgb(236, 240, 250)",
                "backgroundColor": "rgb(17, 25, 27)", "buttonBackground": "rgb(161, 204, 184)",
                "buttonColor": "rgb(17, 34, 26)", "paddingBlock": "11px", "paddingInline": "19px",
                "gap": "23px", "token": "#a1ccb8",
            }
            for name, value in expected.items():
                assert measurements[name] == value, f"Host style changed: {name}: {measurements[name]} != {value}"
            assert "Host Probe" in measurements["fontFamily"], "Approved font family was dropped"
            assert abs(float(measurements["lineHeight"].removesuffix("px")) - 27.2) < 0.01
            expect(frame.locator("#count")).to_have_text("0")
            frame.locator("#increment").click()
            expect(frame.locator("#count")).to_have_text("1")
            expect(frame.locator("#context-frozen")).to_have_text("true")
            assert not errors, errors
            assert not page.evaluate("window.__errors"), "Source sandbox reported runtime errors"
            assert not network, "Source design probe attempted network access"
            assert "connect-src 'none'" in request["csp"]
            assert page.locator("iframe").get_attribute("sandbox") == "allow-scripts"
            print(json.dumps({"passed": True, "browser": browser.version,
                "compiledDigest": request["compiledDigest"], "designContextHash": request["designContextHash"],
                "measurements": measurements, "immutableContext": True, "localInteraction": True,
                "networkRequests": len(network)}))
        finally:
            browser.close()


if __name__ == "__main__":
    main()
