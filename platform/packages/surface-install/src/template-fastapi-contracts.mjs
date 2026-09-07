// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

export function fastApiContracts() {
  return `from __future__ import annotations

import base64
from typing import Any

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from jsonschema import Draft202012Validator

from .canonical import canonical_json, sha256


class AtelierBridgeError(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def require(condition: bool, status: int, code: str, message: str) -> None:
    if not condition:
        raise AtelierBridgeError(status, code, message)


def reject_unsafe_keys(value: Any, depth: int = 0) -> None:
    require(depth <= 40, 400, "INVALID_JSON", "Request is too deeply nested")
    if isinstance(value, list):
        for child in value:
            reject_unsafe_keys(child, depth + 1)
    elif isinstance(value, dict):
        for key, child in value.items():
            require(key not in {"__proto__", "prototype", "constructor"}, 400, "INVALID_JSON", "Request contains an unsafe key")
            reject_unsafe_keys(child, depth + 1)


def _base64url(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def verify_signed_bundle(bundle: dict[str, Any], public_keys: dict[str, str]) -> None:
    signature = bundle.get("signature") or {}
    require(signature.get("algorithm") == "Ed25519", 503, "BUNDLE_UNSIGNED", "Published surface has no supported signature")
    key = public_keys.get(str(signature.get("keyId", "")))
    require(bool(key), 503, "UNKNOWN_SIGNING_KEY", "Published surface uses an unknown signing key")
    unsigned = {name: value for name, value in bundle.items() if name != "signature"}
    require(sha256(unsigned) == signature.get("payloadHash"), 503, "BUNDLE_HASH_MISMATCH", "Published surface payload hash does not match")
    loaded = serialization.load_pem_public_key(key.encode("utf-8"))
    require(isinstance(loaded, Ed25519PublicKey), 503, "BUNDLE_KEY_INVALID", "Published surface signing key is invalid")
    try:
        loaded.verify(_base64url(str(signature.get("value", ""))), canonical_json(unsigned).encode("utf-8"))
    except Exception as cause:
        raise AtelierBridgeError(503, "BUNDLE_SIGNATURE_INVALID", "Published surface signature verification failed") from cause


def validate_data(value: Any, schema: Any) -> None:
    try:
        Draft202012Validator(schema or {}).validate(value)
    except Exception as cause:
        raise AtelierBridgeError(400, "SCHEMA_INVALID", "Data does not match the approved capability contract") from cause


def safe_project(value: Any, fields: list[str]) -> dict[str, Any] | list[Any]:
    if isinstance(value, list):
        return [safe_project(child, fields) for child in value[:1000]]
    if not isinstance(value, dict):
        return {}
    output: dict[str, Any] = {}
    for field in fields:
        parts = field.split(".")
        if any(part in {"__proto__", "prototype", "constructor"} for part in parts):
            continue
        source: Any = value
        for part in parts:
            if not isinstance(source, dict) or part not in source:
                break
            source = source[part]
        else:
            target = output
            for part in parts[:-1]:
                target = target.setdefault(part, {})
            target[parts[-1]] = source
    return output
`;
}
