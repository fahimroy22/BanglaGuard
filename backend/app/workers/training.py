"""Run with python -m app.workers.training supervisor (also started by the API)."""

from __future__ import annotations

import asyncio
import fcntl
import json
import os
import signal
import subprocess
import sys
import threading
import time
import uuid
from pathlib import Path

from app.domain.services.training_jobs import JobStore, fingerprint


def failure_action(error):
    text = str(error).lower()
    if "memory" in text:
        return "Reduce batch size or sequence length, or choose CPU, then duplicate the run with those settings."
    if "space" in text or "disk" in text:
        return "Free disk space, then retry the saved configuration."
    if "download" in text or "connection" in text:
        return "Check your network and checkpoint access, then retry."
    if "checkpoint" in text:
        return "Inspect the checkpoint files. Retry from the beginning if no compatible checkpoint remains."
    return "Review the recent logs and preflight checks. Retry unchanged settings, or duplicate the experiment to change them."


async def reconcile(job_id, returncode=None):
    from datetime import datetime, timezone

    from app.db.models import Experiment
    from app.db.session import AsyncSessionLocal
    from app.domain.enums import ExperimentStatus

    store = JobStore()
    job = store.get(job_id)
    async with AsyncSessionLocal() as session:
        experiment = await session.get(Experiment, uuid.UUID(job["experiment_id"]))
        # A completed database commit wins over a late cancellation or worker exit.
        if experiment and experiment.status == ExperimentStatus.COMPLETED:
            store.update(
                job_id,
                state="completed",
                finished=time.time(),
                error=None,
                next_action=None,
            )
            return
        state = "cancelled" if job["cancel_requested"] else "failed"
        message = (
            "Training cancelled by request."
            if state == "cancelled"
            else job.get("error")
            or f"The training worker stopped unexpectedly (exit {returncode})."
        )
        if experiment:
            experiment.status = ExperimentStatus.FAILED
            experiment.completed_at = datetime.now(timezone.utc)
            experiment.results = {
                **(experiment.results or {}),
                "training_failed": True,
                "training_completed": False,
                "error_message": message,
                "job_id": job_id,
                "job_state": state,
            }
            await session.commit()
        store.update(
            job_id,
            state=state,
            finished=time.time(),
            error=message,
            next_action=failure_action(message),
        )


def unlocked(path):
    with path.open("a") as handle:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
            return True
        except BlockingIOError:
            return False


def supervisor():
    store = JobStore()
    runner = asyncio.Runner()
    with (store.root / "supervisor.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return
        # Remains alive while the local platform is used; browser/API restarts do not own it.
        while True:
            try:
                for old in store.list(active=True, limit=10000):
                    if old["state"] != "queued" and unlocked(
                        store.root / f"{old['id']}.lock"
                    ):
                        runner.run(reconcile(old["id"], "interrupted"))
                job = store.claim()
                if not job:
                    time.sleep(2)
                    continue
                if job["cancel_requested"]:
                    runner.run(reconcile(job["id"]))
                    continue
                logpath = store.root / f"{job['id']}.log"
                with logpath.open("ab") as log:
                    child = subprocess.Popen(
                        [
                            sys.executable,
                            "-u",
                            "-m",
                            "app.workers.training",
                            "run",
                            job["id"],
                        ],
                        stdin=subprocess.DEVNULL,
                        stdout=log,
                        stderr=log,
                        close_fds=True,
                        start_new_session=True,
                    )
                    cancel_sent = None
                    while child.poll() is None:
                        current = store.get(job["id"])
                        if current["cancel_requested"]:
                            if cancel_sent is None:
                                os.killpg(child.pid, signal.SIGTERM)
                                cancel_sent = time.monotonic()
                            elif time.monotonic() - cancel_sent > 10:
                                os.killpg(child.pid, signal.SIGKILL)
                        time.sleep(1)
                    runner.run(reconcile(job["id"], child.returncode))
            except Exception as exc:
                print(f"Supervisor recovery: {exc}", flush=True)
                time.sleep(5)


def resource_monitor(store, job_id, stop):
    import psutil

    process = psutil.Process()
    process.cpu_percent()
    while not stop.wait(2):
        try:
            store.update(
                job_id,
                resources={
                    "cpu_percent": process.cpu_percent(),
                    "memory_mb": round(process.memory_info().rss / 1024**2, 1),
                    "system_memory_percent": psutil.virtual_memory().percent,
                },
                heartbeat=time.time(),
            )
            # Covers cancellation after a supervisor restart while this child survives.
            if store.get(job_id)["cancel_requested"]:
                if os.getpid() == os.getpgrp():
                    os.killpg(os.getpgrp(), signal.SIGTERM)
                else:
                    os.kill(os.getpid(), signal.SIGTERM)
        except (OSError, psutil.Error):
            pass


async def run_job(job_id):
    from app.db.models import DatasetVersion, Experiment
    from app.db.session import AsyncSessionLocal
    from app.domain.enums import ExperimentStatus
    from app.domain.services.experiment_research import (
        compatible_checkpoints,
        preflight,
        provenance,
        training_request,
    )
    from starlette.concurrency import run_in_threadpool

    store = JobStore()
    job = store.get(job_id)
    stop = threading.Event()
    monitor = threading.Thread(
        target=resource_monitor, args=(store, job_id, stop), daemon=True
    )
    monitor.start()
    try:
        if (
            job["configuration"].get("model_family")
            == "banglabert_sequence_classification"
        ):
            import torch

            torch.set_num_threads(2)
        async with AsyncSessionLocal() as session:
            experiment = await session.get(Experiment, uuid.UUID(job["experiment_id"]))
            if not experiment:
                raise ValueError("Experiment no longer exists.")
            if (
                experiment.status == ExperimentStatus.COMPLETED
                or experiment.model_version_id
            ):
                raise ValueError("This experiment is already completed or registered.")
            if fingerprint(experiment.configuration) != job["configuration_hash"]:
                raise ValueError(
                    "Configuration changed after queuing; duplicate the experiment and run again."
                )
            config = experiment.configuration
            # Execution services read the saved file. Refuse a changed file as well.
            config_path = (experiment.results or {}).get("configuration_path")
            if (
                not config_path
                or fingerprint(json.loads(Path(config_path).read_text()))
                != job["configuration_hash"]
            ):
                raise ValueError(
                    "Saved configuration file differs from the queued configuration."
                )
            dataset = await session.get(DatasetVersion, experiment.dataset_version_id)
            check = await run_in_threadpool(
                preflight, dataset, training_request(config)
            )
            if not check["ready"]:
                raise ValueError(
                    "; ".join(
                        c["detail"] for c in check["checks"] if c["status"] == "blocked"
                    )
                )
            prov = await run_in_threadpool(provenance, config, check["device"])
            store.update(job_id, provenance=prov)
            checkpoint = None
            if job.get("resume"):
                previous = store.get(job["resume"]["job_id"])
                choices = compatible_checkpoints(experiment, previous)
                if job["resume"]["checkpoint"] not in [c["name"] for c in choices]:
                    raise ValueError("The selected checkpoint is no longer compatible.")
                checkpoint = str(
                    Path(config["output"]["checkpoints"]) / job["resume"]["checkpoint"]
                )
            attempt_dir = store.root / job_id
            attempt_dir.mkdir(exist_ok=True)
            (attempt_dir / "provenance.json").write_text(json.dumps(prov, indent=2))
            (attempt_dir / "previous-results.json").write_text(
                json.dumps(experiment.results or {}, default=str, indent=2)
            )
            experiment.status = ExperimentStatus.PLANNED
            experiment.results = {
                **(experiment.results or {}),
                "provenance": prov,
                "job_id": job_id,
            }
            await session.commit()
            os.environ["BANGLAGUARD_TRAINING_JOB"] = job_id
            if config.get("model_family") == "banglabert_sequence_classification":
                from app.domain.services.transformer_training_execution import (
                    TransformerTrainingExecutionService,
                )
                from app.workers.training_progress import TrainingProgressCallback

                class InstrumentedTransformer(TransformerTrainingExecutionService):
                    def assemble(self, **kwargs):
                        components = super().assemble(**kwargs)
                        components.trainer.add_callback(
                            TrainingProgressCallback(store, job_id, prov)
                        )
                        return components

                    def evaluate_and_generate_predictions(self, **kwargs):
                        store.event(
                            job_id, state="evaluating", progress={"eta_seconds": None}
                        )
                        return super().evaluate_and_generate_predictions(**kwargs)

                    def persist_execution_artifacts(self, **kwargs):
                        store.event(job_id, state="saving")
                        return super().persist_execution_artifacts(**kwargs)

                await InstrumentedTransformer(session).execute(
                    experiment=experiment, resume_from_checkpoint=checkpoint
                )
            else:
                from app.domain.services.classical_training_execution import (
                    ClassicalTrainingExecutionService,
                )

                await ClassicalTrainingExecutionService(session).execute(
                    experiment=experiment
                )
            store.update(job_id, state="completed", finished=time.time())
    except Exception as exc:
        store.update(job_id, error=str(exc)[:4000], next_action=failure_action(exc))
        print(f"Training failed: {exc}", flush=True)
        import traceback

        traceback.print_exc()
    finally:
        stop.set()


if __name__ == "__main__":
    if sys.argv[1] == "supervisor":
        supervisor()
    else:
        job_id = str(uuid.UUID(sys.argv[2]))
        store = JobStore()
        with (store.root / f"{job_id}.lock").open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            asyncio.run(run_job(job_id))
