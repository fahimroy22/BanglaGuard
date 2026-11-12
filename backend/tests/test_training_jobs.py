import concurrent.futures
import json
import os
import subprocess
import sys
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from app.api.v1 import experiment_jobs as api
from app.domain.enums import ExperimentStatus
from app.domain.services.experiment_research import (
    compatible_checkpoints,
    training_request,
)
from app.domain.services.training_jobs import JobStore, fingerprint
from fastapi import FastAPI
from fastapi.testclient import TestClient


def test_durable_exclusive_queue(tmp_path):
    store = JobStore(tmp_path)

    def enqueue(_):
        try:
            return store.enqueue("experiment", "researcher", {})
        except ValueError:
            return None

    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        jobs = list(pool.map(enqueue, range(5)))
    assert sum(j is not None for j in jobs) == 1
    job = JobStore(tmp_path).claim()
    assert job["state"] == "preparing"
    assert store.claim() is None
    store.update(job["id"], state="completed")
    store.event(job["id"], state="training", progress={"step": 1})
    assert store.get(job["id"])["state"] == "completed"
    assert store.enqueue("experiment", "researcher", {})["state"] == "queued"


def test_progress_cancel_and_notifications(tmp_path):
    store = JobStore(tmp_path)
    job = store.enqueue("e", "u", {})
    store.event(
        job["id"],
        state="training",
        progress={"step": 2, "total_steps": 10},
        metrics={"loss": 0.4},
    )
    store.cancel(job["id"])
    assert store.get(job["id"])["cancel_requested"]
    store.update(job["id"], state="cancelled")
    assert store.list(owner="u", unread=True)[0]["history"][0]["loss"] == 0.4
    store.acknowledge(job["id"], "someone-else")
    assert store.list(owner="u", unread=True)
    store.acknowledge(job["id"], "u")
    assert not store.list(owner="u", unread=True)
    with pytest.raises(ValueError):
        store.cancel(job["id"])


def test_queue_survives_separate_process(tmp_path):
    store = JobStore(tmp_path)
    job = store.enqueue("e", "u", {})
    env = {**os.environ, "BANGLAGUARD_JOB_ROOT": str(tmp_path)}
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            'from app.domain.services.training_jobs import JobStore; print(JobStore().claim()["id"])',
        ],
        env=env,
        capture_output=True,
        text=True,
        check=True,
    )
    assert result.stdout.strip() == job["id"]
    assert store.get(job["id"])["state"] == "preparing"


def test_named_presets_are_private(tmp_path):
    store = JobStore(tmp_path)
    store.save_preset("u", "baseline", {"seed": 42})
    assert not store.presets("other")
    assert store.presets("u")[0]["payload"] == {"seed": 42}
    with pytest.raises(ValueError):
        store.save_preset("u", "baseline", {})


def test_research_fields_survive_validation():
    request = training_request(
        {
            "dataset_version_id": str(uuid.uuid4()),
            "experiment_name": "Baseline",
            "research_question": "Does cleaning help?",
            "research_notes": "Use validation.",
        }
    )
    assert request.model_dump()["research_question"] == "Does cleaning help?"


@pytest.mark.asyncio
async def test_submission_returns_without_training(tmp_path, monkeypatch):
    store = JobStore(tmp_path)
    monkeypatch.setattr(api, "JobStore", lambda: store)
    wake = []
    monkeypatch.setattr(api, "wake_worker", lambda: wake.append(True))
    config = {
        "dataset_version_id": str(uuid.uuid4()),
        "experiment_name": "Baseline",
        "output": {"workspace": "test"},
    }
    exp = SimpleNamespace(
        id=uuid.uuid4(),
        status=ExperimentStatus.PLANNED,
        configuration=config,
        model_version_id=None,
        results={"configuration_path": "saved.json"},
    )
    job = await api.queue_experiment(exp, SimpleNamespace(id="u"), None)
    assert job["state"] == "queued" and wake == [True]
    assert "configuration" not in job
    with pytest.raises(Exception) as error:
        await api.queue_experiment(exp, SimpleNamespace(id="u"), None)
    assert error.value.status_code == 409


def test_nonowner_cannot_cancel(tmp_path, monkeypatch):
    store = JobStore(tmp_path)
    job = store.enqueue("e", "owner", {})
    monkeypatch.setattr(api, "JobStore", lambda: store)
    with pytest.raises(Exception) as error:
        api.permitted_job(
            job["id"], SimpleNamespace(id="other", role="researcher"), True
        )
    assert error.value.status_code == 403
    assert (
        api.permitted_job(job["id"], SimpleNamespace(id="other", role="admin"), True)[
            "id"
        ]
        == job["id"]
    )


@pytest.mark.asyncio
async def test_reconcile_interruption_and_late_cancel(tmp_path, monkeypatch):
    from app.db import session as sessions
    from app.workers import training

    store = JobStore(tmp_path)
    job = store.enqueue(str(uuid.uuid4()), "u", {})
    store.claim()
    experiment = SimpleNamespace(
        status=ExperimentStatus.RUNNING, results={}, completed_at=None
    )
    session = AsyncMock()
    session.get.return_value = experiment
    session.__aenter__.return_value = session
    monkeypatch.setattr(sessions, "AsyncSessionLocal", lambda: session)
    monkeypatch.setattr(training, "JobStore", lambda: store)
    await training.reconcile(job["id"], "interrupted")
    assert store.get(job["id"])["state"] == "failed"
    assert experiment.status == ExperimentStatus.FAILED
    other = store.enqueue(job["experiment_id"], "u", {})
    store.claim()
    store.cancel(other["id"])
    experiment.status = ExperimentStatus.COMPLETED
    await training.reconcile(other["id"], 0)
    assert store.get(other["id"])["state"] == "completed"


def test_resume_rejects_changed_configuration(tmp_path):
    exp = SimpleNamespace(
        id=uuid.uuid4(),
        configuration={
            "model_family": "banglabert_sequence_classification",
            "random_seed": 43,
        },
    )
    job = {
        "configuration": {"model_family": "banglabert_sequence_classification"},
        "configuration_hash": fingerprint({}),
    }
    assert compatible_checkpoints(exp, job) == []


def test_api_permissions_and_job_detail(tmp_path, monkeypatch):
    store = JobStore(tmp_path)
    job = store.enqueue(str(uuid.uuid4()), "u", {})
    monkeypatch.setattr(api, "JobStore", lambda: store)
    app = FastAPI()
    app.include_router(api.router)
    # Override the permission dependency, leaving the endpoint/control authorization real.
    viewer_dep = api.Viewer.__metadata__[0].dependency
    app.dependency_overrides[viewer_dep] = lambda: SimpleNamespace(
        id="u", role="researcher"
    )
    session = AsyncMock()
    session.get.return_value = None
    app.dependency_overrides[api.get_db_session] = lambda: session
    client = TestClient(app)
    response = client.get(f"/experiment-research/jobs/{job['id']}")
    assert response.status_code == 200
    assert response.json()["checkpoints"] == []
    assert response.json()["can_control"]


@pytest.mark.asyncio
async def test_worker_runs_real_classical_pipeline(tmp_path, monkeypatch):
    from app.db import session as sessions
    from app.db.models import Experiment
    from app.domain.services import classical_training_execution as classical
    from app.domain.services import experiment_research as research
    from app.workers import training
    from tests.test_classical_training_execution import create_experiment_workspace

    experiment, workspace = create_experiment_workspace(tmp_path)
    monkeypatch.setenv("BANGLAGUARD_JOB_ROOT", str(tmp_path / "jobs"))
    monkeypatch.setenv("BANGLAGUARD_TRAINING_JOB", "")
    store = JobStore()
    job = store.enqueue(experiment.id, "researcher", experiment.configuration)
    store.claim()
    session = AsyncMock()
    session.get.side_effect = lambda model, identifier: (
        experiment
        if model is Experiment
        else SimpleNamespace(id=experiment.dataset_version_id)
    )
    session.__aenter__.return_value = session
    monkeypatch.setattr(sessions, "AsyncSessionLocal", lambda: session)
    monkeypatch.setattr(
        research,
        "preflight",
        lambda *args: {"ready": True, "device": "cpu", "checks": []},
    )
    original = classical.ClassicalTrainingExecutionService
    monkeypatch.setattr(
        classical,
        "ClassicalTrainingExecutionService",
        lambda session: original(session, root_directory=tmp_path),
    )
    await training.run_job(job["id"])
    result = store.get(job["id"])
    assert result["state"] == "completed", result["error"]
    assert (workspace / "artifacts" / "model.joblib").is_file()
    assert (workspace / "metrics" / "test_metrics.json").is_file()
    assert result["provenance"]["seed"] == 42
    assert len(result["provenance"]["dataset_file_sha256"]) == 3
    assert result["provenance"]["packages"]["scikit-learn"]
    assert "Training" in (store.root / f"{job['id']}.log").read_text()


def test_complete_checkpoint_and_dataset_changes(tmp_path, monkeypatch):
    import importlib.metadata

    from app.domain.services import experiment_research as research

    monkeypatch.setattr(research, "ROOT_DIR", tmp_path)
    eid = uuid.uuid4()
    root = tmp_path / "storage" / "experiments" / str(eid) / "checkpoints"
    path = root / "checkpoint-10"
    path.mkdir(parents=True)
    data = tmp_path / "train.csv"
    data.write_text("text,label\nexample,positive\n")
    config = {
        "model_family": "banglabert_sequence_classification",
        "output": {"checkpoints": str(root)},
        "dataset": {"artifact_paths": {"train": str(data)}},
    }
    experiment = SimpleNamespace(id=eid, configuration=config)
    prov = {
        "configuration_sha256": fingerprint(config),
        "dataset_file_sha256": research.dataset_hashes(config),
        "packages": {
            n: importlib.metadata.version(n) for n in ("torch", "transformers")
        },
        "step": 10,
    }
    job = {
        "configuration": config,
        "configuration_hash": fingerprint(config),
        "provenance": prov,
    }
    for name in ("optimizer.pt", "scheduler.pt", "rng_state.pth", "model.safetensors"):
        (path / name).write_bytes(b"test-fixture")
    (path / "trainer_state.json").write_text(
        json.dumps({"global_step": 10, "epoch": 1})
    )
    assert compatible_checkpoints(experiment, job) == []
    (path / "banglaguard-resume.json").write_text(json.dumps(prov))
    assert compatible_checkpoints(experiment, job)[0]["step"] == 10
    data.write_text("text,label\ndifferent,positive\n")
    assert compatible_checkpoints(experiment, job) == []


def test_transformer_progress_and_checkpoint_marker(tmp_path):
    from app.workers.training_progress import TrainingProgressCallback

    store = JobStore(tmp_path / "jobs")
    job = store.enqueue("e", "u", {})
    callback = TrainingProgressCallback(
        store, job["id"], {"configuration_sha256": "frozen"}
    )
    args = SimpleNamespace(num_train_epochs=3, output_dir=str(tmp_path))
    state = SimpleNamespace(global_step=10, max_steps=100, epoch=0.3)
    callback.on_train_begin(args, state, None)
    callback.on_step_end(args, state, None)
    assert store.get(job["id"])["progress"]["eta_seconds"] is None
    state.global_step = 16
    callback.on_step_end(args, state, None)
    callback.on_log(
        args, state, None, logs={"loss": 0.5, "eval_macro_f1": 0.7, "bad": float("nan")}
    )
    result = store.get(job["id"])
    assert result["progress"]["eta_seconds"] >= 0
    assert result["history"][0]["eval_macro_f1"] == 0.7
    assert "bad" not in result["history"][0]
    directory = tmp_path / "checkpoint-16"
    directory.mkdir()
    callback.on_save(args, state, None)
    marker = json.loads((directory / "banglaguard-resume.json").read_text())
    assert marker["step"] == 16 and marker["configuration_sha256"] == "frozen"


def test_progress_endpoint_responsive_while_worker_process_runs(tmp_path, monkeypatch):
    import time

    from tests.test_classical_training_execution import create_experiment_workspace

    exp, workspace = create_experiment_workspace(tmp_path)
    store = JobStore(tmp_path / "jobs")
    job = store.enqueue(exp.id, "u", exp.configuration)
    store.claim()
    script = r"""
import asyncio,json,os,time,uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock
from app.db import session as sessions
from app.db.models import Experiment
from app.domain.enums import ExperimentStatus
from app.domain.services import experiment_research as research
from app.domain.services import classical_training_execution as classical
from app.workers.training import run_job
root=Path(os.environ['TEST_WORKER_ROOT']);config_path=Path(os.environ['TEST_CONFIG'])
config=json.loads(config_path.read_text());workspace=config_path.parent
exp=SimpleNamespace(id=uuid.UUID(config['experiment_id']),name='test',description=None,status=ExperimentStatus.PLANNED,dataset_version_id=uuid.UUID(config['dataset_version_id']),model_version_id=None,random_seed=42,code_version='test',configuration=config,results={'workspace':str(workspace),'configuration_path':str(config_path),'metadata_path':str(workspace/'metadata.json')},started_at=None,completed_at=None)
session=AsyncMock();session.__aenter__.return_value=session
session.get.side_effect=lambda model,identifier:exp if model is Experiment else SimpleNamespace(id=exp.dataset_version_id)
sessions.AsyncSessionLocal=lambda:session
research.preflight=lambda *a:{'ready':True,'checks':[],'device':'cpu'}
original=classical.ClassicalTrainingExecutionService
class SlowTestService(original):
 def _build_pipeline(self,configuration):
  (root/'fitting-started').write_text('ready')
  time.sleep(3)
  return super()._build_pipeline(configuration)
classical.ClassicalTrainingExecutionService=lambda session:SlowTestService(session,root_directory=root)
asyncio.run(run_job(os.environ['TEST_JOB_ID']))
"""
    env = {
        **os.environ,
        "BANGLAGUARD_JOB_ROOT": str(store.root),
        "TEST_WORKER_ROOT": str(tmp_path),
        "TEST_CONFIG": str(workspace / "configuration.json"),
        "TEST_JOB_ID": job["id"],
    }
    child = subprocess.Popen(
        [sys.executable, "-c", script],
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        deadline = time.monotonic() + 15
        while (
            not (tmp_path / "fitting-started").exists() and time.monotonic() < deadline
        ):
            if child.poll() is not None:
                pytest.fail("Synthetic worker exited before fitting.")
            time.sleep(0.05)
        assert (tmp_path / "fitting-started").exists()
        monkeypatch.setattr(api, "JobStore", lambda: store)
        app = FastAPI()
        app.include_router(api.router)
        app.dependency_overrides[api.Viewer.__metadata__[0].dependency] = lambda: (
            SimpleNamespace(id="u", role="researcher")
        )
        session = AsyncMock()
        session.get.return_value = None
        app.dependency_overrides[api.get_db_session] = lambda: session
        start = time.monotonic()
        with TestClient(app) as client:
            response = client.get(f"/experiment-research/jobs/{job['id']}")
            assert response.status_code == 200
            assert response.json()["state"] == "preparing"
        assert time.monotonic() - start < 2
        assert child.poll() is None
        child.wait(timeout=15)
        assert store.get(job["id"])["state"] == "completed"
        # A new page connection sees the same persistent attempt and final artifact.
        with TestClient(app) as client:
            assert (
                client.get(f"/experiment-research/jobs/{job['id']}").json()["state"]
                == "completed"
            )
        assert (workspace / "artifacts" / "model.joblib").exists()
    finally:
        if child.poll() is None:
            child.terminate()
            child.wait(timeout=5)


def test_queued_cancellation_does_not_wait_for_running_job(tmp_path):
    store = JobStore(tmp_path)
    running = store.enqueue("running", "u", {})
    store.claim()
    queued = store.enqueue("queued", "u", {})
    cancelled = store.cancel(queued["id"])
    assert cancelled["state"] == "cancelled"
    assert cancelled["finished"] is not None
    assert store.get(running["id"])["state"] == "preparing"
    store.update(running["id"], state="completed")
    assert store.claim() is None
    assert store.enqueue("queued", "u", {})["state"] == "queued"
