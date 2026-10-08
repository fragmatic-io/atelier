#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (c) 2026 The Atelier Authors
"""Return artifact-bound browser evidence from a network-disabled sandbox.

Independent scenario calls must match the pre-generation oracle exactly. Image
bytes leave the read-only container through its bounded stdout protocol.
"""
import base64
import hashlib
import importlib.metadata
import json
import os
import pathlib
import sys
import time

from playwright.sync_api import sync_playwright, expect


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


HOST_FRAME = """({html, channel, expectedCalls}) => {
  const frame = document.querySelector('iframe');
  window.__ready = false; window.__errors = []; window.__calls = [];
  const canonical = v => JSON.stringify(v, (_, x) => x && typeof x === 'object' && !Array.isArray(x)
    ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x);
  addEventListener('message', e => {
    if (e.source !== frame.contentWindow || e.data?.atelier !== 1 || e.data.channel !== channel) return;
    if (e.data.type === 'ready') window.__ready = true;
    if (e.data.type === 'error') window.__errors.push(e.data.payload);
    if (e.data.type !== 'action') return;
    const request = e.data.payload, index = window.__calls.length;
    window.__calls.push({capabilityId: request.capabilityId, input: request.input});
    let outcome;
    if (expectedCalls === null) outcome = {result: {id: 'fixture-operation', status: 'created'}};
    else {
      const expected = expectedCalls[index];
      if (!expected || expected.capabilityId !== request.capabilityId || canonical(expected.input) !== canonical(request.input)) {
        window.__errors.push({message: 'Action does not match the independent scenario contract', index});
        outcome = {error: 'Unexpected action or action inputs'};
      } else outcome = expected.outcome === 'error' ? {error: expected.error} : {result: expected.result};
    }
    frame.contentWindow.postMessage({atelier: 1, channel, type: 'action-result',
      payload: {requestId: request.requestId, ...outcome}}, '*');
  });
  frame.srcdoc = html;
}"""


def run_steps(frame, steps):
    for step in steps:
        node = frame.locator(step["selector"])
        # A reviewed selector must be unambiguous; first() hides duplicate controls.
        expect(node).to_have_count(1)
        operation = step["op"]
        if operation == "click":
            node.click()
        elif operation == "fill":
            node.fill(step["value"])
        elif operation == "select":
            node.select_option(step["value"])
        elif operation == "press":
            node.press(step["value"])
        else:
            raise ValueError("Unsupported acceptance step")


def run_assertions(frame, assertions):
    for item in assertions:
        node = frame.locator(item["selector"])
        kind = item["kind"]
        if kind == "count":
            expect(node).to_have_count(item["count"])
            continue
        expect(node).to_have_count(1)
        if kind == "text":
            expect(node).to_contain_text(item["text"])
        elif kind == "visible":
            expect(node).to_be_visible()
        elif kind == "hidden":
            expect(node).not_to_be_visible()
        elif kind == "value":
            expect(node).to_have_value(item["value"])
        elif kind == "disabled":
            expect(node).to_be_disabled()
        elif kind == "enabled":
            expect(node).to_be_enabled()
        else:
            raise ValueError("Unsupported independent assertion")


def audit(frame, axe_source):
    measurements = frame.locator("html").evaluate("""e => ({
      viewportWidth: innerWidth, viewportHeight: innerHeight,
      contentWidth: e.scrollWidth, contentHeight: e.scrollHeight,
      horizontalOverflow: e.scrollWidth > innerWidth + 2,
      unnamedButtons: [...document.querySelectorAll('button,[role=button]')].filter(n =>
        !n.textContent.trim() && !n.getAttribute('aria-label') && !n.getAttribute('aria-labelledby')).length,
      positiveTabindex: [...document.querySelectorAll('[tabindex]')].filter(n => Number(n.getAttribute('tabindex')) > 0).length
    })""")
    assert not measurements["horizontalOverflow"], "Horizontal viewport overflow"
    assert not measurements["unnamedButtons"], "Button without an accessible name"
    assert not measurements["positiveTabindex"], "Positive tabindex disrupts document focus order"
    accessibility = {"engine": "native-smoke", "violations": [], "incomplete": [], "fullConformanceClaim": False}
    if axe_source:
        if not frame.evaluate("typeof axe !== 'undefined'"):
            frame.evaluate(axe_source)
        accessibility = frame.evaluate("""async () => {
          const report = await axe.run(document, {runOnly: {type: 'tag', values: ['wcag2a','wcag2aa','wcag21aa','wcag22aa']}});
          const project = items => items.map(x => ({id:x.id, impact:x.impact,
            description:x.description, helpUrl:x.helpUrl,
            nodes:x.nodes.slice(0,12).map(n => ({target:n.target, failureSummary:n.failureSummary}))}));
          return {engine:'axe-core', version:axe.version, violations:project(report.violations),
            incomplete:project(report.incomplete), passes:report.passes.length, fullConformanceClaim:false};
        }""")
    return measurements, accessibility


def audit_phase(check, frame, axe_source, phase):
    measurements, accessibility = audit(frame, axe_source)
    check.setdefault("layoutPhases", []).append({"phase": phase, **measurements})
    check["layout"] = measurements
    phases = check.get("accessibility", {}).get("phases", [])
    phases.append({"phase": phase, **accessibility})
    check["accessibility"] = {
        "engine": accessibility["engine"],
        "version": accessibility.get("version"),
        "phases": phases,
        "violations": [{**item, "phase": report["phase"]} for report in phases for item in report["violations"]],
        "incomplete": [{**item, "phase": report["phase"]} for report in phases for item in report["incomplete"]],
        "fullConformanceClaim": False,
    }


def main():
    folder = pathlib.Path(sys.argv[1])
    request = json.loads((folder / "input.json").read_text())
    assert request.get("protocol") == 2, "Unsupported certification protocol; rebuild the certifier image"
    checks, captures = [], []
    total_capture_bytes = 0
    axe_source = None
    if request.get("axeHash"):
        axe_bytes = (folder / "axe.min.js").read_bytes()
        assert sha256(axe_bytes) == request["axeHash"], "Accessibility engine hash differs"
        axe_source = axe_bytes.decode("utf-8")

    def capture(page, case, phase):
        nonlocal total_capture_bytes
        raw = page.screenshot(type="jpeg", quality=78, full_page=False, animations="disabled")
        assert len(raw) <= 1024 * 1024, "Screenshot exceeds 1 MB"
        total_capture_bytes += len(raw)
        assert total_capture_bytes <= 8 * 1024 * 1024, "Screenshot evidence exceeds 8 MB"
        captures.append({
            "name": case["name"], "phase": phase, "width": case["width"],
            "height": case.get("height", 850), "theme": case["theme"],
            "state": case["state"], "direction": case["direction"],
            "capture": "viewport", "sha256": sha256(raw), "bytes": len(raw),
            "dataUrl": "data:image/jpeg;base64," + base64.b64encode(raw).decode("ascii"),
        })

    with sync_playwright() as playwright:
        launch = {}
        if os.environ.get("CHROMIUM_PATH"):
            launch["executable_path"] = os.environ["CHROMIUM_PATH"]
        if os.environ.get("ATELIER_BROWSER_NO_SANDBOX") == "true":
            launch["args"] = ["--no-sandbox"]
        browser = playwright.chromium.launch(**launch)
        browser_version = browser.version
        try:
            for case in request["runs"]:
                page = browser.new_page(viewport={"width": case["width"], "height": case.get("height", 850)}, reduced_motion="reduce")
                page.set_default_timeout(7000)
                errors, network = [], []
                page.on("pageerror", lambda error: errors.append(str(error)))
                page.route("http://**/*", lambda route: (network.append(route.request.url), route.abort()))
                page.route("https://**/*", lambda route: (network.append(route.request.url), route.abort()))
                completed_tasks = 0
                started = time.monotonic()
                check = {"name": case["name"], "passed": False, "tasks": 0, "independentScenario": bool(case.get("scenario"))}
                try:
                    page.set_content('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Component certification</title></head><body style="margin:0"><iframe title="Tested component" sandbox="allow-scripts" style="border:0;width:100vw;height:100vh"></iframe></body></html>')
                    scenario = case.get("scenario")
                    page.evaluate(HOST_FRAME, {
                        "html": (folder / case["file"]).read_text(), "channel": case["channel"],
                        "expectedCalls": scenario["calls"] if scenario else None,
                    })
                    page.wait_for_function("window.__ready === true")
                    frame = page.frames[1]
                    expect(frame.locator("#root")).not_to_be_empty()
                    check["readyMs"] = round((time.monotonic() - started) * 1000)
                    if case["state"] != "ready":
                        expect(frame.locator('[data-state="' + case['state'] + '"]').first).to_be_visible()
                    capture(page, case, "initial")
                    # Inspect controls before an interaction can hide/remove them.
                    audit_phase(check, frame, axe_source, "initial")
                    if scenario:
                        run_steps(frame, scenario["steps"])
                        run_assertions(frame, scenario["assertions"])
                        actual_calls = page.evaluate("window.__calls")
                        expected_calls = [{"capabilityId": item["capabilityId"], "input": item["input"]} for item in scenario["calls"]]
                        assert canonical(actual_calls) == canonical(expected_calls), "Action sequence or exact inputs differ from the independent oracle"
                        check["assertions"] = len(scenario["assertions"])
                        check["verifiedCalls"] = len(expected_calls)
                        completed_tasks = 1
                    else:
                        for task in case.get("tasks", []):
                            run_steps(frame, task["steps"])
                            expect(frame.locator(task["expect"]["selector"]).first).to_contain_text(task["expect"]["text"])
                            completed_tasks += 1
                    if scenario or completed_tasks:
                        capture(page, case, "complete")
                        audit_phase(check, frame, axe_source, "complete")
                    violations = check["accessibility"]["violations"]
                    assert not violations, "Accessibility violations: " + ", ".join(item["id"] for item in violations)
                    assert not network, "Unexpected external network request"
                    assert not page.evaluate("window.__errors"), "Component runtime/action contract error"
                    assert not errors, "Uncaught browser error"
                    check["passed"] = True
                except Exception as error:
                    check["error"] = str(error)[:2000]
                    check["runtimeErrors"] = page.evaluate("window.__errors || []")
                    if not any(item["name"] == case["name"] for item in captures):
                        capture(page, case, "failure")
                finally:
                    check["tasks"] = completed_tasks
                    check["durationMs"] = round((time.monotonic() - started) * 1000)
                    checks.append(check)
                    page.close()
        finally:
            browser.close()
    print(json.dumps({
        "protocol": 2, "digest": request["digest"], "designContextHash": request.get("designContextHash"),
        "qualityContractHash": request.get("qualityContractHash"), "profile": request["profile"],
        "passed": all(item["passed"] for item in checks), "checks": checks, "captures": captures,
        "runner": "chromium-sandboxed-react-v2", "runnerHash": sha256(pathlib.Path(__file__).read_bytes()),
        "browserVersion": browser_version, "playwrightVersion": importlib.metadata.version("playwright"),
        "axeHash": request.get("axeHash"),
        "hostActions": "Ordered scenario calls use exact explicit fixtures; no real business writes run.",
        "independentSecurityCertification": False,
    }, separators=(",", ":")))


if __name__ == "__main__":
    main()
