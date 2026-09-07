// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

export function fastApiBridge() {
  return `from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from typing import Any
from urllib.parse import quote

import httpx

from .authority import ATELIER_EXECUTORS, ATELIER_LOADERS, authorize_atelier
from .config import AtelierSettings
from .contracts import AtelierBridgeError, canonical_json, reject_unsafe_keys, require, safe_project, sha256, validate_data, verify_signed_bundle
from .ledger import SqliteActionLedger


class FastApiHostBridge:
    def __init__(self, settings: AtelierSettings) -> None:
        self.settings = settings
        self.ledger = SqliteActionLedger(settings.action_ledger)

    @staticmethod
    def identity(subject: dict[str, Any]) -> dict[str, Any]:
        require(bool(subject.get("id")) and bool(subject.get("role")) and isinstance(subject.get("permissions"), list), 401, "HOST_IDENTITY", "The host must supply its authenticated server-side identity")
        return {"subject": str(subject["id"]), "role": str(subject["role"]), "permissions": subject["permissions"]}

    @staticmethod
    def field(arguments: dict[str, Any], name: str) -> str:
        value = arguments.get(name)
        require(isinstance(value, str) and bool(value), 400, "BRIDGE_INPUT_REQUIRED", f"{name} is required")
        return value

    async def resolve(self, subject: dict[str, Any], slot_id: str, context: dict[str, Any] | None = None) -> dict[str, Any]:
        reject_unsafe_keys(context or {})
        url = f"{self.settings.control_origin}/api/tenants/{quote(self.settings.tenant_id, safe='')}/projects/{quote(self.settings.project_id, safe='')}/resolve"
        try:
            async with httpx.AsyncClient(timeout=10, follow_redirects=False) as client:
                response = await client.post(url, headers={"Authorization": f"Bearer {self.settings.host_token}", "Content-Type": "application/json"}, json={**self.identity(subject), "slotId": slot_id, "environment": self.settings.environment})
        except httpx.HTTPError as cause:
            raise AtelierBridgeError(503, "CONTROL_PLANE_UNAVAILABLE", "Could not authorize the current published surface") from cause
        require(response.is_success, 503, "CONTROL_PLANE_UNAVAILABLE", "Could not authorize the current published surface")
        require(len(response.content) <= 12 * 1024 * 1024, 503, "BUNDLE_TOO_LARGE", "Control plane response is oversized")
        try:
            result = response.json()
        except ValueError as cause:
            raise AtelierBridgeError(503, "CONTROL_PLANE_INVALID", "Control plane returned invalid JSON") from cause
        bundle = result.get("bundle")
        if bundle is None:
            return result
        verify_signed_bundle(bundle, result.get("publicKeys") or {})
        require(bundle.get("tenantId") == self.settings.tenant_id and bundle.get("projectId") == self.settings.project_id and bundle.get("slotId") == slot_id and bundle.get("environment") == self.settings.environment, 403, "HOST_SCOPE", "Signed surface belongs to a different tenant, project, environment or slot")
        activation = bundle.get("activation") or {}
        require(not activation.get("role") or activation["role"] == subject["role"], 403, "HOST_ROLE", "The surface is not approved for this role")
        return result

    async def contract(self, subject: dict[str, Any], slot_id: str, release_id: str, capability: str, kind: str, context: dict[str, Any], input_value: Any) -> tuple[dict[str, Any], dict[str, Any]]:
        resolved = await self.resolve(subject, slot_id, context)
        bundle = resolved.get("bundle")
        require(bool(bundle) and bundle.get("releaseId") == release_id, 409, "SURFACE_CHANGED", "This surface changed. Refresh before continuing")
        contracts = bundle.get("dataContracts" if kind == "query" else "actionContracts") or []
        contract = next((item for item in contracts if item.get("id") == capability), None)
        require(bool(contract), 403, "CAPABILITY_DENIED", "This capability is not part of the approved surface")
        require(all(permission in subject["permissions"] for permission in contract.get("requiredPermissions", [])), 403, "HOST_PERMISSION", "The authenticated user lacks a required permission")
        validate_data(input_value, contract.get("inputSchema"))
        allowed = await authorize_atelier(subject=subject, capability=contract, kind=kind, context=context, input=input_value)
        require(allowed, 403, "HOST_AUTHORIZATION", "The host rejected this operation for the selected entity")
        return bundle, contract

    async def load(self, arguments: dict[str, Any], subject: dict[str, Any]) -> Any:
        context, input_value = arguments.get("context") or {}, arguments.get("input") or {}
        slot_id, release_id, capability = self.field(arguments, "slotId"), self.field(arguments, "releaseId"), self.field(arguments, "capability")
        _, contract = await self.contract(subject, slot_id, release_id, capability, "query", context, input_value)
        loader = ATELIER_LOADERS.get(capability)
        require(callable(loader), 501, "LOADER_REQUIRED", "Register a host-owned loader")
        value = await loader(subject=subject, input=input_value, context=context)
        validate_data(value, contract.get("outputSchema"))
        return safe_project(value, contract.get("fields") or [])

    def binding(self, arguments: dict[str, Any], subject: dict[str, Any]) -> dict[str, Any]:
        return {"tenantId": self.settings.tenant_id, "projectId": self.settings.project_id, "environment": self.settings.environment, "subjectId": str(subject["id"]), "slotId": self.field(arguments, "slotId"), "releaseId": self.field(arguments, "releaseId"), "capability": self.field(arguments, "capability"), "inputHash": sha256(arguments.get("input") or {}), "contextHash": sha256(arguments.get("context") or {})}

    def mac(self, payload: str) -> str:
        digest = hmac.new(self.settings.confirmation_key, payload.encode("ascii"), hashlib.sha256).digest()
        return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")

    async def confirm(self, arguments: dict[str, Any], subject: dict[str, Any]) -> dict[str, Any]:
        context, input_value = arguments.get("context") or {}, arguments.get("input") or {}
        slot_id, release_id, capability = self.field(arguments, "slotId"), self.field(arguments, "releaseId"), self.field(arguments, "capability")
        _, contract = await self.contract(subject, slot_id, release_id, capability, "command", context, input_value)
        require(contract.get("securityReviewed") is True, 403, "UNREVIEWED_COMMAND", "This command needs developer review")
        binding = {**self.binding(arguments, subject), "expiresAt": int(time.time() * 1000) + 120_000, "nonce": secrets.token_urlsafe(16)}
        payload = base64.urlsafe_b64encode(canonical_json(binding).encode("utf-8")).rstrip(b"=").decode("ascii")
        return {"ticket": f"{payload}.{self.mac(payload)}", "expiresIn": 120, "risk": contract.get("risk"), "confirmation": contract.get("confirmation")}

    async def dispatch(self, arguments: dict[str, Any], subject: dict[str, Any]) -> dict[str, Any]:
        reject_unsafe_keys(arguments.get("input") or {})
        context, input_value = arguments.get("context") or {}, arguments.get("input") or {}
        slot_id, release_id, capability = self.field(arguments, "slotId"), self.field(arguments, "releaseId"), self.field(arguments, "capability")
        _, contract = await self.contract(subject, slot_id, release_id, capability, "command", context, input_value)
        require(contract.get("securityReviewed") is True, 403, "UNREVIEWED_COMMAND", "This command needs developer review")
        executor = ATELIER_EXECUTORS.get(capability)
        require(callable(executor), 501, "EXECUTOR_REQUIRED", "Register a host-owned executor")
        ticket = str(arguments.get("ticket") or "")
        require(len(ticket) < 12_000 and ticket.count(".") == 1, 400, "CONFIRMATION_INVALID", "Confirmation ticket is invalid")
        payload, signature = ticket.split(".")
        require(hmac.compare_digest(signature, self.mac(payload)), 403, "CONFIRMATION_INVALID", "Confirmation ticket is invalid")
        try:
            parsed = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
        except Exception as cause:
            raise AtelierBridgeError(403, "CONFIRMATION_INVALID", "Malformed confirmation") from cause
        require(parsed.get("expiresAt", 0) >= int(time.time() * 1000), 403, "CONFIRMATION_EXPIRED", "Confirmation expired")
        for key, value in self.binding(arguments, subject).items():
            require(parsed.get(key) == value, 403, "CONFIRMATION_MISMATCH", "The action changed after confirmation")
        scope = sha256({"tenant": self.settings.tenant_id, "project": self.settings.project_id, "subject": subject["id"]})

        async def execute(operation_id: str) -> Any:
            return await executor(subject=subject, input=input_value, context=context, operationId=operation_id)

        return await self.ledger.run(scope, parsed["nonce"], sha256(self.binding(arguments, subject)), execute)
`;
}

export function fastApiRouter(install) {
  return `from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from .authority import AUTHORITY_CONFIGURED, get_atelier_subject
from .bridge import FastApiHostBridge
from .config import environment_configured, load_settings
from .contracts import AtelierBridgeError, reject_unsafe_keys


router = APIRouter(prefix=${JSON.stringify(install.bridgePath)}, tags=["atelier"])
MAX_BODY_BYTES = 100 * 1024


@router.get("/install-health")
async def install_health() -> dict[str, bool]:
    return {"environmentConfigured": environment_configured(), "authorityConfigured": AUTHORITY_CONFIGURED}


async def safe_body(request: Request) -> dict[str, Any]:
    if request.headers.get("origin") != ${JSON.stringify(install.applicationOrigin)}:
        raise AtelierBridgeError(403, "ORIGIN_REQUIRED", "Exact same-origin header required")
    if request.headers.get("content-type", "").split(";", 1)[0].strip().lower() != "application/json":
        raise AtelierBridgeError(415, "JSON_REQUIRED", "Content-Type must be application/json")
    try:
        content_length = int(request.headers.get("content-length", "0"))
    except ValueError as cause:
        raise AtelierBridgeError(400, "CONTENT_LENGTH_INVALID", "Content-Length must be an integer") from cause
    if content_length > MAX_BODY_BYTES:
        raise AtelierBridgeError(413, "BODY_TOO_LARGE", "Request body exceeds 100 KB")
    chunks: list[bytes] = []
    size = 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > MAX_BODY_BYTES:
            raise AtelierBridgeError(413, "BODY_TOO_LARGE", "Request body exceeds 100 KB")
        chunks.append(chunk)
    body = b"".join(chunks)
    try:
        value = json.loads(body)
    except (UnicodeDecodeError, json.JSONDecodeError) as cause:
        raise AtelierBridgeError(400, "INVALID_JSON", "Request must be valid JSON") from cause
    if not isinstance(value, dict):
        raise AtelierBridgeError(400, "INVALID_JSON", "Request must be a safe JSON object")
    reject_unsafe_keys(value)
    return value


@router.post("/{operation}")
async def atelier_operation(operation: str, request: Request) -> JSONResponse:
    try:
        if operation not in {"resolve", "load", "confirm", "dispatch"}:
            raise AtelierBridgeError(404, "NOT_FOUND", "Bridge operation not found")
        body = await safe_body(request)
        subject = await get_atelier_subject(request)
        bridge = FastApiHostBridge(load_settings())
        if operation == "resolve":
            result = await bridge.resolve(subject, body.get("slotId", ""), body.get("context") or {})
        elif operation == "load":
            result = await bridge.load(body, subject)
        elif operation == "confirm":
            result = await bridge.confirm(body, subject)
        else:
            result = await bridge.dispatch(body, subject)
        return JSONResponse(result)
    except AtelierBridgeError as error:
        return JSONResponse({"error": {"code": error.code, "message": error.message}}, status_code=error.status)
    except Exception:
        return JSONResponse({"error": {"code": "ATELIER_BRIDGE_ERROR", "message": "Bridge request failed"}}, status_code=500)
`;
}
