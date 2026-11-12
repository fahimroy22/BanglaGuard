"""Account-owned test suites and immutable regression evidence for local deployment."""

import csv
import hashlib
import io
import json
import os
import sqlite3
import time
import uuid
from pathlib import Path

from app.core.config import ROOT_DIR


def fingerprint(value):
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, ensure_ascii=False, default=str).encode()
    ).hexdigest()


class ResearchStore:
    def __init__(self, root=None):
        self.root = Path(
            root
            or os.environ.get(
                "BANGLAGUARD_RESEARCH_ROOT",
                ROOT_DIR / "storage" / "prediction-research",
            )
        )
        self.root.mkdir(parents=True, exist_ok=True)
        self.path = self.root / "research.sqlite3"
        with self.connect() as db:
            db.executescript("""
            CREATE TABLE IF NOT EXISTS suites(id TEXT PRIMARY KEY,owner TEXT NOT NULL,name TEXT NOT NULL,version INTEGER NOT NULL,payload TEXT NOT NULL,updated REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY,owner TEXT NOT NULL,model_id TEXT NOT NULL,suite_id TEXT NOT NULL,created REAL NOT NULL,payload TEXT NOT NULL);
            CREATE INDEX IF NOT EXISTS runs_model ON runs(model_id,created);
            """)

    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        return db

    def suites(self, owner, admin=False):
        with self.connect() as db:
            rows = db.execute(
                "SELECT * FROM suites WHERE (? OR owner=?) ORDER BY updated DESC",
                (admin, str(owner)),
            ).fetchall()
            return [{**dict(r), "payload": json.loads(r["payload"])} for r in rows]

    def suite(self, identifier):
        with self.connect() as db:
            r = db.execute(
                "SELECT * FROM suites WHERE id=?", (str(identifier),)
            ).fetchone()
            return {**dict(r), "payload": json.loads(r["payload"])} if r else None

    def save(self, owner, payload, identifier=None, version=None, admin=False):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            old = (
                db.execute(
                    "SELECT * FROM suites WHERE id=?", (str(identifier),)
                ).fetchone()
                if identifier
                else None
            )
            if identifier and not old:
                raise ValueError("Suite not found")
            if old and old["owner"] != str(owner) and not admin:
                raise PermissionError("This suite belongs to another account")
            if old and old["version"] != version:
                raise ValueError("Suite changed. Reload before saving.")
            identifier = str(identifier or uuid.uuid4())
            db.execute(
                "INSERT OR REPLACE INTO suites VALUES(?,?,?,?,?,?)",
                (
                    identifier,
                    old["owner"] if old else str(owner),
                    payload["name"],
                    old["version"] + 1 if old else 1,
                    json.dumps(payload, ensure_ascii=False),
                    time.time(),
                ),
            )
        return self.suite(identifier)

    def save_run(self, owner, model_id, suite, result):
        identifier = str(uuid.uuid4())
        created = time.time()
        value = {
            **result,
            "id": identifier,
            "owner": str(owner),
            "model_id": str(model_id),
            "suite_id": suite["id"],
            "suite_version": suite["version"],
            "suite_hash": fingerprint(suite["payload"]),
            "suite_snapshot": suite["payload"],
            "created": created,
        }
        with self.connect() as db:
            db.execute(
                "INSERT INTO runs VALUES(?,?,?,?,?,?)",
                (
                    identifier,
                    str(owner),
                    str(model_id),
                    suite["id"],
                    created,
                    json.dumps(value, ensure_ascii=False),
                ),
            )
        return value

    def runs(self, owner, admin=False, model_id=None):
        with self.connect() as db:
            rows = db.execute(
                "SELECT payload FROM runs WHERE (? OR owner=?) AND (? IS NULL OR model_id=?) ORDER BY created DESC LIMIT 100",
                (
                    admin,
                    str(owner),
                    str(model_id) if model_id else None,
                    str(model_id) if model_id else None,
                ),
            ).fetchall()
            return [json.loads(r[0]) for r in rows]

    def run(self, identifier):
        with self.connect() as db:
            r = db.execute(
                "SELECT payload FROM runs WHERE id=?", (str(identifier),)
            ).fetchone()
            return json.loads(r[0]) if r else None


def parse_csv(content, column=None):
    if len(content) > 2 * 1024 * 1024:
        raise ValueError("CSV must be at most 2 MB.")
    try:
        reader = csv.DictReader(io.StringIO(content.decode("utf-8-sig")))
        columns = reader.fieldnames or []
        if not columns or len(columns) != len(set(columns)):
            raise ValueError("CSV needs unique column headers.")
        if len(columns) > 100:
            raise ValueError("CSV has too many columns (maximum 100).")
        rows = []
        for row in reader:
            if None in row:
                raise ValueError("A CSV row has more fields than its header.")
            rows.append(row)
            if len(rows) > 50:
                raise ValueError("Use at most 50 rows per CSV batch.")
        if not rows:
            raise ValueError("CSV has no data rows.")
        if column and column not in columns:
            raise ValueError("Select a valid text column.")
        return columns, rows
    except (UnicodeDecodeError, csv.Error) as exc:
        raise ValueError("Upload a valid UTF-8 CSV file.") from exc


def csv_export(columns, rows):
    def safe(value):
        value = str(value if value is not None else "")
        return (
            "'" + value
            if value.startswith(("\t", "\r", "\n")) or value.lstrip().startswith(("=", "+", "-", "@"))
            else value
        )

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([safe(c) for c in columns])
    for row in rows:
        writer.writerow([safe(row.get(c, "")) for c in columns])
    return output.getvalue().encode("utf-8-sig")
