// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { quote } from './template-shared.mjs';

export function fastApiConfig(install) {
  return `from __future__ import annotations

import base64
import os
from dataclasses import dataclass
from urllib.parse import urlparse

from .contracts import AtelierBridgeError, require


@dataclass(frozen=True)
class AtelierSettings:
    control_origin: str
    tenant_id: str
    project_id: str
    host_token: str
    confirmation_key: bytes
    action_ledger: str
    application_origin: str = ${quote(install.applicationOrigin)}
    environment: str = ${quote(install.environment)}


REQUIRED_ENVIRONMENT = (
    "ATELIER_CONTROL_ORIGIN",
    "ATELIER_TENANT_ID",
    "ATELIER_PROJECT_ID",
    "ATELIER_HOST_TOKEN",
    "ATELIER_CONFIRMATION_KEY",
    "ATELIER_ACTION_LEDGER",
)


def environment_configured() -> bool:
    return all(bool(os.getenv(name)) for name in REQUIRED_ENVIRONMENT)


def load_settings() -> AtelierSettings:
    require(environment_configured(), 500, "ATELIER_CONFIG_REQUIRED", "Configure every server-only Atelier variable")
    origin = os.environ["ATELIER_CONTROL_ORIGIN"].rstrip("/")
    parsed = urlparse(origin)
    local_http = parsed.scheme == "http" and parsed.hostname in {"127.0.0.1", "localhost", "::1"}
    require(parsed.scheme == "https" or local_http, 500, "HOST_ORIGIN", "Use HTTPS for a remote control plane")
    require(not parsed.username and not parsed.password, 500, "HOST_ORIGIN", "URL credentials are forbidden")
    try:
        confirmation_key = base64.b64decode(os.environ["ATELIER_CONFIRMATION_KEY"], validate=True)
    except Exception as cause:
        raise AtelierBridgeError(500, "HOST_KEY", "Confirmation key must be valid base64") from cause
    require(len(confirmation_key) >= 32, 500, "HOST_KEY", "Use an independent >=32-byte host confirmation key")
    return AtelierSettings(
        control_origin=origin,
        tenant_id=os.environ["ATELIER_TENANT_ID"],
        project_id=os.environ["ATELIER_PROJECT_ID"],
        host_token=os.environ["ATELIER_HOST_TOKEN"],
        confirmation_key=confirmation_key,
        action_ledger=os.environ["ATELIER_ACTION_LEDGER"],
    )
`;
}

export function fastApiAuthority() {
  return `from __future__ import annotations

from typing import Any, Awaitable, Callable

from fastapi import Request

from .contracts import AtelierBridgeError


# Fail closed until these adapters use the host application's real session and data layer.
AUTHORITY_CONFIGURED = False


async def get_atelier_subject(_request: Request) -> dict[str, Any]:
    raise AtelierBridgeError(401, "ATELIER_AUTH_REQUIRED", "Map the current request session to {id, role, permissions}")


async def authorize_atelier(**_arguments: Any) -> bool:
    return False


AtelierHandler = Callable[..., Awaitable[Any]]
ATELIER_LOADERS: dict[str, AtelierHandler] = {}
ATELIER_EXECUTORS: dict[str, AtelierHandler] = {}
`;
}
