"""Durable, single-host job queue. SQLite stores jobs; PostgreSQL stores experiments."""

from __future__ import annotations

import hashlib
import json
import os
import sqlite3
import subprocess
import sys
import time
import uuid
from contextlib import contextmanager
from pathlib import Path

from app.core.config import ROOT_DIR

ACTIVE = ("queued", "preparing", "training", "evaluating", "saving")
TERMINAL = ("completed", "failed", "cancelled")


def fingerprint(value):
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, default=str).encode()
    ).hexdigest()


class JobStore:
    def __init__(self, root: Path | None = None):
        self.root = root or Path(
            os.environ.get(
                "BANGLAGUARD_JOB_ROOT", str(ROOT_DIR / "storage" / "training-jobs")
            )
        )
        self.root.mkdir(parents=True, exist_ok=True)
        self.path = self.root / "queue.sqlite3"
        with self.connect() as db:
            db.executescript("""
            CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY, experiment_id TEXT NOT NULL, owner TEXT NOT NULL,
                state TEXT NOT NULL, created REAL NOT NULL, data TEXT NOT NULL,
                acknowledged INTEGER NOT NULL DEFAULT 0
            );
            CREATE UNIQUE INDEX IF NOT EXISTS one_active_experiment ON jobs(experiment_id)
                WHERE state IN ('queued','preparing','training','evaluating','saving');
            CREATE TABLE IF NOT EXISTS presets (id TEXT PRIMARY KEY, owner TEXT NOT NULL, name TEXT NOT NULL, payload TEXT NOT NULL, UNIQUE(owner,name));
            """)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def get(self, job_id):
        with self.connect() as db:
            row = db.execute(
                "SELECT data FROM jobs WHERE id=?", (str(job_id),)
            ).fetchone()
            return json.loads(row["data"]) if row else None

    def list(
        self, *, experiment_id=None, owner=None, active=False, unread=False, limit=50
    ):
        clauses, args = [], []
        if experiment_id:
            clauses.append("experiment_id=?")
            args.append(str(experiment_id))
        if owner:
            clauses.append("owner=?")
            args.append(str(owner))
        if active:
            clauses.append(
                "state IN ('queued','preparing','training','evaluating','saving')"
            )
        if unread:
            clauses.append(
                "acknowledged=0 AND state IN ('completed','failed','cancelled')"
            )
        where = " WHERE " + " AND ".join(clauses) if clauses else ""
        with self.connect() as db:
            return [
                json.loads(r["data"])
                for r in db.execute(
                    "SELECT data FROM jobs" + where + " ORDER BY created DESC LIMIT ?",
                    [*args, limit],
                )
            ]

    def enqueue(self, experiment_id, owner, configuration, *, resume=None):
        now = time.time()
        job = {
            "id": str(uuid.uuid4()),
            "experiment_id": str(experiment_id),
            "owner": str(owner),
            "state": "queued",
            "created": now,
            "updated": now,
            "started": None,
            "finished": None,
            "configuration": configuration,
            "configuration_hash": fingerprint(configuration),
            "resume": resume,
            "cancel_requested": False,
            "progress": {},
            "history": [],
            "resources": {},
            "error": None,
            "next_action": None,
            "provenance": {},
            "name": configuration.get("experiment_name", "Experiment"),
        }
        with self.connect() as db:
            try:
                db.execute(
                    "INSERT INTO jobs(id,experiment_id,owner,state,created,data) VALUES(?,?,?,?,?,?)",
                    (
                        job["id"],
                        job["experiment_id"],
                        job["owner"],
                        "queued",
                        now,
                        json.dumps(job),
                    ),
                )
            except sqlite3.IntegrityError as exc:
                raise ValueError(
                    "This experiment already has an active training job."
                ) from exc
        return job

    def update(self, job_id, **changes):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute(
                "SELECT data FROM jobs WHERE id=?", (str(job_id),)
            ).fetchone()
            if not row:
                raise ValueError("Training job not found.")
            job = json.loads(row["data"])
            # Terminal jobs cannot be resurrected by a delayed progress callback.
            if job["state"] in TERMINAL:
                return job
            job.update(changes, updated=time.time())
            db.execute(
                "UPDATE jobs SET state=?,data=? WHERE id=?",
                (job["state"], json.dumps(job, default=str), job["id"]),
            )
            return job

    def event(self, job_id, *, state=None, progress=None, metrics=None):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute(
                "SELECT data FROM jobs WHERE id=?", (str(job_id),)
            ).fetchone()
            if not row:
                return
            job = json.loads(row["data"])
            if job["state"] in TERMINAL:
                return
            if state and state != job["state"]:
                with (self.root / f"{job_id}.log").open("a") as log:
                    log.write(f"[{time.strftime('%H:%M:%S')}] {state.capitalize()}\n")
                job["state"] = state
            job["progress"].update(progress or {})
            if metrics:
                job["history"].append(dict(metrics, recorded=time.time()))
                job["history"] = job["history"][-2000:]
            job["updated"] = time.time()
            db.execute(
                "UPDATE jobs SET state=?,data=? WHERE id=?",
                (job["state"], json.dumps(job, default=str), job["id"]),
            )

    def claim(self):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            if db.execute(
                "SELECT 1 FROM jobs WHERE state IN ('preparing','training','evaluating','saving')"
            ).fetchone():
                return None
            row = db.execute(
                "SELECT data FROM jobs WHERE state='queued' ORDER BY created LIMIT 1"
            ).fetchone()
            if not row:
                return None
            job = json.loads(row["data"])
            job.update(state="preparing", started=time.time(), updated=time.time())
            db.execute(
                "UPDATE jobs SET state=?,data=? WHERE id=?",
                ("preparing", json.dumps(job), job["id"]),
            )
            return job

    def cancel(self, job_id):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT data FROM jobs WHERE id=?", (str(job_id),)).fetchone()
            job = json.loads(row["data"]) if row else None
            if not job or job["state"] not in ACTIVE:
                raise ValueError("Only active jobs can be cancelled.")
            job.update(cancel_requested=True, updated=time.time())
            # A queued job has not changed the experiment or started a process.
            # Cancel atomically with claiming, without waiting behind another run.
            if job["state"] == "queued":
                job.update(state="cancelled", finished=time.time())
            db.execute(
                "UPDATE jobs SET state=?,data=? WHERE id=?",
                (job["state"], json.dumps(job), str(job_id)),
            )
            return job

    def acknowledge(self, job_id, owner):
        with self.connect() as db:
            db.execute(
                "UPDATE jobs SET acknowledged=1 WHERE id=? AND owner=?",
                (str(job_id), str(owner)),
            )

    def presets(self, owner):
        with self.connect() as db:
            return [
                {"id": r["id"], "name": r["name"], "payload": json.loads(r["payload"])}
                for r in db.execute(
                    "SELECT * FROM presets WHERE owner=? ORDER BY name", (str(owner),)
                )
            ]

    def save_preset(self, owner, name, payload):
        with self.connect() as db:
            try:
                db.execute(
                    "INSERT INTO presets VALUES(?,?,?,?)",
                    (str(uuid.uuid4()), str(owner), name, json.dumps(payload)),
                )
            except sqlite3.IntegrityError as exc:
                raise ValueError("You already have a preset with that name.") from exc


def wake_worker():
    """A detached supervisor owns its own lock; duplicate launches exit harmlessly."""
    store = JobStore()
    import fcntl

    with (store.root / "supervisor.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return
        # Unlock before spawn. The child obtains and holds the lock for its lifetime.
    env = dict(
        os.environ,
        OMP_NUM_THREADS="2",
        MKL_NUM_THREADS="2",
        OPENBLAS_NUM_THREADS="2",
        TOKENIZERS_PARALLELISM="false",
    )
    with (store.root / "supervisor.log").open("ab") as log:
        subprocess.Popen(
            [sys.executable, "-u", "-m", "app.workers.training", "supervisor"],
            cwd=ROOT_DIR / "backend",
            env=env,
            stdin=subprocess.DEVNULL,
            stdout=log,
            stderr=log,
            start_new_session=True,
            close_fds=True,
        )


def public_job(job):
    if not job:
        return None
    return {k: v for k, v in job.items() if k not in ("configuration",)}
