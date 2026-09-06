#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { createPublicKey, verify } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const reportPath = process.env.ATELIER_SECURITY_REPORT;
const signaturePath = process.env.ATELIER_SECURITY_SIGNATURE;
const publicKeyPath = process.env.ATELIER_SECURITY_PUBLIC_KEY;
if (!reportPath || !signaturePath || !publicKeyPath) {
  throw new Error(
    'SECURITY_REVIEW_BLOCKED: report, detached signature, and reviewer public key are required',
  );
}
const [bytes, signature, publicKey] = await Promise.all([
  readFile(reportPath),
  readFile(signaturePath),
  readFile(publicKeyPath),
]);
if (!verify(null, bytes, createPublicKey(publicKey), signature))
  throw new Error('SECURITY_REVIEW_SIGNATURE: detached signature is invalid');
const report = JSON.parse(bytes);
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (
  report.commit !== commit ||
  !report.reviewer ||
  report.independent !== true ||
  report.openCritical !== 0 ||
  report.openHigh !== 0
) {
  throw new Error(
    'SECURITY_REVIEW_FAILED: signed review does not approve this exact commit with zero open critical/high findings',
  );
}
process.stdout.write(`${JSON.stringify({ passed: true, commit, reviewer: report.reviewer })}\n`);
