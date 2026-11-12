"""Durable project membership and independent annotation decisions, single-host store."""

import hashlib
import json
import os
import sqlite3
import time
import unicodedata
import uuid
from pathlib import Path

from app.core.config import ROOT_DIR


def text_key(text):
    value = " ".join(unicodedata.normalize("NFC", text or "").split()).casefold()
    return hashlib.sha256(value.encode()).hexdigest()


def decision(review):
    if review.get("resolution"):
        return review["resolution"]
    votes = review["votes"]
    if len(votes) < len(review["reviewers"]):
        return {"state": "assigned", "label": None}
    labels = {v["label"] for v in votes.values()}
    if len(labels) != 1:
        return {"state": "disagreement", "label": None}
    label = next(iter(labels))
    return {"state": "accepted" if label else "rejected", "label": label}


class LoopStore:
    def __init__(self):
        root = Path(
            os.environ.get(
                "BANGLAGUARD_LOOP_ROOT", ROOT_DIR / "storage" / "research-loop"
            )
        )
        root.mkdir(parents=True, exist_ok=True)
        self.path = root / "loop.sqlite3"
        with self.connect() as db:
            db.executescript(
                "CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY, payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS reviews(id TEXT PRIMARY KEY, payload TEXT NOT NULL);"
            )

    def connect(self):
        return sqlite3.connect(self.path, timeout=10)

    def get(self, table, identifier):
        assert table in {"projects", "reviews"}
        with self.connect() as db:
            row = db.execute(
                f"SELECT payload FROM {table} WHERE id=?", (str(identifier),)
            ).fetchone()
        return json.loads(row[0]) if row else None

    def all(self, table):
        assert table in {"projects", "reviews"}
        with self.connect() as db:
            return [
                json.loads(r[0]) for r in db.execute(f"SELECT payload FROM {table}")
            ]

    def create(self, table, payload, identifier=None):
        identifier = str(identifier or uuid.uuid4())
        payload = {**payload, "id": identifier, "version": 1, "created": time.time()}
        with self.connect() as db:
            db.execute(
                f"INSERT INTO {table} VALUES(?,?)", (identifier, json.dumps(payload))
            )
        return payload

    def change(self, table, identifier, transform):
        assert table in {"projects", "reviews"}
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute(
                f"SELECT payload FROM {table} WHERE id=?", (str(identifier),)
            ).fetchone()
            if not row:
                raise ValueError("Record not found")
            value = json.loads(row[0])
            transform(value)
            value["version"] += 1
            db.execute(
                f"UPDATE {table} SET payload=? WHERE id=?",
                (json.dumps(value), str(identifier)),
            )
        return value

    def vote(self, identifier, actor, label, note):
        def update(value):
            if actor not in value["reviewers"]:
                raise PermissionError(
                    "Only assigned reviewers can annotate this record"
                )
            if decision(value)["state"] in {"accepted", "rejected"}:
                raise ValueError(
                    "Finalized reviews are immutable; collect a new correction instead"
                )
            value["votes"][actor] = {"label": label, "note": note, "at": time.time()}

        return self.change("reviews", identifier, update)

    def resolve(self, identifier, actor, label, reason):
        def update(value):
            if decision(value)["state"] != "disagreement":
                raise ValueError(
                    "All assigned reviewers must vote before resolving a disagreement"
                )
            value["resolution"] = {
                "state": "accepted" if label else "rejected",
                "label": label,
                "by": actor,
                "reason": reason,
                "at": time.time(),
            }

        return self.change("reviews", identifier, update)


def filter_export(items, prior_keys=None):
    """Exclude every conflicting-label group; keep one representative of exact duplicates."""
    prior_keys = prior_keys or set()
    groups = {}
    for item in items:
        groups.setdefault(
            text_key(item.get("text") or item.get("normalized_text")), []
        ).append(item)
    kept, skipped = [], []
    for key, group in groups.items():
        conflict = len({r["final_label"] for r in group}) > 1
        for index, item in enumerate(group):
            reason = (
                "conflicting_labels"
                if conflict
                else "already_in_dataset"
                if key in prior_keys
                else "duplicate_text"
                if index
                else None
            )
            if reason:
                skipped.append({**item, "readiness_reasons": [reason]})
            else:
                kept.append(item)
    return kept, skipped
