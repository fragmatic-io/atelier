// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

function bounded(value, limit) {
  return value == null ? null : String(value).slice(0, limit);
}

export function describeExecError(error, limit = 1500) {
  return {
    message: bounded(error?.message ?? error, limit),
    code: error?.code ?? null,
    signal: error?.signal ?? null,
    killed: Boolean(error?.killed),
    timedOut: Boolean(error?.killed),
    stdout: bounded(error?.stdout, limit),
    stderr: bounded(error?.stderr, limit),
  };
}
