// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

export function fastApiLedger() {
  return `from __future__ import annotations

import json
import os
import re
import sqlite3
from pathlib import Path
from typing import Any, Awaitable, Callable

from .contracts import require, sha256


class SqliteActionLedger:
    def __init__(self, path: str) -> None:
        ledger_path = Path(path).expanduser().resolve()
        ledger_path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.path = str(ledger_path)
        with self._connect() as database:
            database.executescript("""PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS host_actions(scope TEXT NOT NULL,id TEXT NOT NULL,input_hash TEXT NOT NULL,status TEXT NOT NULL,result TEXT,created_at INTEGER NOT NULL,PRIMARY KEY(scope,id)) STRICT;""")
        os.chmod(ledger_path, 0o600)

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, timeout=5, isolation_level=None)
        connection.row_factory = sqlite3.Row
        return connection

    async def run(self, scope: str, key: str, payload_hash: str, execute: Callable[[str], Awaitable[Any]]) -> dict[str, Any]:
        require(bool(re.fullmatch(r"[A-Za-z0-9_-]{16,160}", key)), 400, "IDEMPOTENCY_REQUIRED", "Use a stable random idempotency key for each intentional action")
        with self._connect() as database:
            database.execute("BEGIN IMMEDIATE")
            old = database.execute("SELECT * FROM host_actions WHERE scope=? AND id=?", (scope, key)).fetchone()
            if old is None:
                database.execute("INSERT INTO host_actions VALUES(?,?,?,?,?,unixepoch())", (scope, key, payload_hash, "pending", None))
            database.execute("COMMIT")
        if old is not None:
            require(old["input_hash"] == payload_hash, 409, "IDEMPOTENCY_CONFLICT", "This key was used for a different action")
            require(old["status"] == "succeeded", 409, "ACTION_UNCERTAIN", "This action is in progress or its outcome is uncertain. Reconcile with the system of record; do not automatically retry.")
            return {"result": json.loads(old["result"]), "replayed": True}
        try:
            result = await execute(sha256({"scope": scope, "key": key}))
            encoded = json.dumps(result, ensure_ascii=False, separators=(",", ":"))
            require(len(encoded.encode("utf-8")) <= 256 * 1024, 500, "EXECUTOR_RESULT_SIZE", "Action result exceeds the ledger limit")
            with self._connect() as database:
                database.execute("UPDATE host_actions SET status='succeeded', result=? WHERE scope=? AND id=?", (encoded, scope, key))
            return {"result": result, "replayed": False}
        except Exception:
            with self._connect() as database:
                database.execute("UPDATE host_actions SET status='uncertain' WHERE scope=? AND id=?", (scope, key))
            raise

    def reconcile(self, scope: str, key: str, result: Any) -> bool:
        encoded = json.dumps(result, ensure_ascii=False, separators=(",", ":"))
        require(len(encoded.encode("utf-8")) <= 256 * 1024, 400, "RESULT_INVALID", "A bounded serializable result is required")
        with self._connect() as database:
            changed = database.execute("UPDATE host_actions SET status='succeeded', result=? WHERE scope=? AND id=? AND status IN ('pending','uncertain')", (encoded, scope, key)).rowcount
        return changed == 1
`;
}
