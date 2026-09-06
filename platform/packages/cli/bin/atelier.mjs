#!/usr/bin/env node
import { main } from '../src/index.mjs';

main(process.argv.slice(2)).catch((error) => {
  const payload = {
    ok: false,
    code: error.code ?? 'UNEXPECTED_ERROR',
    message: error.message,
    details: error.details ?? undefined,
  };
  console.error(JSON.stringify(payload, null, 2));
  process.exitCode = 1;
});
