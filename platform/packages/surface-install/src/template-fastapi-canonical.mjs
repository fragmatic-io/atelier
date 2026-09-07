// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

export function fastApiCanonical() {
  return `from __future__ import annotations

import hashlib
import json
import math
from decimal import Decimal
from typing import Any


def _js_number(value: float) -> str:
    if not math.isfinite(value):
        return "null"
    if value == 0:
        return "0"
    absolute = abs(value)
    shortest = repr(value).lower()
    if 1e-6 <= absolute < 1e21:
        if "e" in shortest:
            return format(Decimal(shortest), "f")
        return shortest[:-2] if shortest.endswith(".0") else shortest
    mantissa, exponent = shortest.split("e") if "e" in shortest else (shortest, "0")
    exponent_value = int(exponent)
    sign = "+" if exponent_value >= 0 else "-"
    return f"{mantissa}e{sign}{abs(exponent_value)}"


def _encode(value: Any) -> str:
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        return _js_number(value)
    if isinstance(value, list):
        return "[" + ",".join(_encode(child) for child in value) + "]"
    if isinstance(value, dict):
        return "{" + ",".join(
            json.dumps(str(key), ensure_ascii=False) + ":" + _encode(value[key])
            for key in sorted(value)
        ) + "}"
    raise TypeError(f"Unsupported canonical JSON value: {type(value).__name__}")


def canonical_json(value: Any) -> str:
    return _encode(value)


def sha256(value: Any) -> str:
    encoded = value if isinstance(value, str) else canonical_json(value)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()
`;
}
