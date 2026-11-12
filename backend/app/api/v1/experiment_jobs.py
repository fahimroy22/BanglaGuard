from __future__ import annotations

import uuid
from typing import Annotated

from app.db.models import DatasetVersion, Experiment, User
from app.db.session import get_db_session
from app.domain.enums import ExperimentStatus
from app.domain.services.audit import AuditService
from app.domain.services.experiment_research import (
    compatible_checkpoints,
    duplicate_payload,
    preflight,
    training_request,
)
from app.domain.services.platform_policy import require_permission
from app.domain.services.training_jobs import JobStore, public_job, wake_worker
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

router = APIRouter(prefix="/experiment-research", tags=["Experiment research"])
Viewer = Annotated[User, Depends(require_permission("research_view"))]
Editor = Annotated[User, Depends(require_permission("experiment_create"))]
Trainer = Annotated[User, Depends(require_permission("training_execute"))]
Session = Annotated[AsyncSession, Depends(get_db_session)]


class ConfigRequest(BaseModel):
    configuration: dict


class PresetRequest(ConfigRequest):
    name: str = Field(min_length=2, max_length=100)
    model_config = ConfigDict(str_strip_whitespace=True)


class StartRequest(BaseModel):
    checkpoint: str | None = Field(default=None, pattern=r"^checkpoint-\d+$")
    previous_job_id: uuid.UUID | None = None


class ResearchNotes(BaseModel):
    question: str = Field(default="", max_length=3000)
    notes: str = Field(default="", max_length=10000)


def permitted_job(job_id, user, control=False):
    job = JobStore().get(job_id)
    if not job:
        raise HTTPException(404, "Training job not found.")
    if control and job["owner"] != str(user.id) and str(user.role) != "admin":
        raise HTTPException(
            403, "Only the researcher who started this job or an admin may control it."
        )
    return job


async def queue_experiment(experiment, user, session, options=None):
    options = options or StartRequest()
    if experiment.model_version_id or experiment.status == ExperimentStatus.COMPLETED:
        raise HTTPException(409, "Duplicate a completed experiment to start a new run.")
    store = JobStore()
    if store.list(experiment_id=experiment.id, active=True):
        raise HTTPException(409, "This experiment already has an active training job.")
    if experiment.status == ExperimentStatus.RUNNING:
        raise HTTPException(
            409,
            "An older training process may still be running. Finish that run before starting a background job.",
        )
    resume = None
    if options.checkpoint:
        previous = permitted_job(options.previous_job_id, user, True)
        if previous["experiment_id"] != str(experiment.id) or previous["state"] not in (
            "failed",
            "cancelled",
        ):
            raise HTTPException(
                409, "Resume requires a failed or cancelled attempt of this experiment."
            )
        choices = await run_in_threadpool(compatible_checkpoints, experiment, previous)
        if options.checkpoint not in [c["name"] for c in choices]:
            raise HTTPException(
                409,
                "Checkpoint is incomplete or incompatible with this configuration and dataset.",
            )
        resume = {"job_id": previous["id"], "checkpoint": options.checkpoint}
    config = experiment.configuration or {}
    try:
        training_request(config)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    if not config.get("output") or not (experiment.results or {}).get(
        "configuration_path"
    ):
        raise HTTPException(409, "Prepare this experiment workspace before training.")
    try:
        job = store.enqueue(experiment.id, user.id, config, resume=resume)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    try:
        wake_worker()
    except OSError as exc:
        store.update(
            job["id"],
            state="failed",
            error=f"Could not start the training worker: {exc}",
            next_action="Start the worker using the backend training-worker command, then retry.",
        )
        raise HTTPException(
            503,
            "The training worker could not start. The failed attempt is available in the progress page.",
        ) from exc
    return public_job(job)


@router.post("/preflight")
async def check_preflight(payload: ConfigRequest, user: Editor, session: Session):
    try:
        config = training_request(payload.configuration)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    dataset = await session.get(DatasetVersion, config.dataset_version_id)
    if not dataset:
        raise HTTPException(404, "Dataset not found.")
    return await run_in_threadpool(preflight, dataset, config)


@router.get("/presets")
async def list_presets(user: Editor):
    return JobStore().presets(user.id)


@router.post("/presets", status_code=201)
async def save_preset(payload: PresetRequest, user: Editor):
    try:
        config = training_request(payload.configuration).model_dump(mode="json")
        JobStore().save_preset(user.id, payload.name, config)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    return {"saved": True}


@router.get("/jobs")
async def jobs(user: Viewer, experiment_id: uuid.UUID | None = None):
    store = JobStore()
    result = store.list(experiment_id=experiment_id, owner=None if experiment_id else user.id)
    if any(job["state"] not in ("completed", "failed", "cancelled") for job in result):
        await run_in_threadpool(wake_worker)
    return [public_job(job) for job in result]


@router.get("/notifications")
async def notifications(user: Viewer):
    return [public_job(j) for j in JobStore().list(owner=user.id, unread=True)]


@router.post("/jobs/{job_id}/acknowledge")
async def acknowledge(job_id: uuid.UUID, user: Viewer):
    JobStore().acknowledge(job_id, user.id)
    return {"acknowledged": True}


@router.get("/jobs/{job_id}")
async def job_details(job_id: uuid.UUID, user: Viewer, session: Session):
    job = permitted_job(job_id, user)
    experiment = await session.get(Experiment, uuid.UUID(job["experiment_id"]))
    log = JobStore().root / f"{job_id}.log"
    tail = ""
    if log.exists():
        with log.open("rb") as handle:
            handle.seek(max(0, log.stat().st_size - 20000))
            tail = handle.read().decode("utf-8", errors="replace")
    choices = (
        await run_in_threadpool(compatible_checkpoints, experiment, job)
        if experiment and job["state"] in ("failed", "cancelled")
        else []
    )
    return dict(
        public_job(job),
        logs=tail,
        checkpoints=choices,
        can_control=job["owner"] == str(user.id) or str(user.role) == "admin",
    )


@router.post("/jobs/{job_id}/cancel")
async def cancel(job_id: uuid.UUID, user: Trainer, request: Request, session: Session):
    job = permitted_job(job_id, user, True)
    try:
        result = JobStore().cancel(job_id)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    wake_worker()
    await AuditService(session).record(
        request=request,
        action="experiment.training_cancel_requested",
        user_id=user.id,
        resource_type="experiment",
        resource_id=job["experiment_id"],
        details={"job_id": str(job_id)},
    )
    return public_job(result)


@router.post("/{experiment_id}/jobs", status_code=202)
async def start_job(
    experiment_id: uuid.UUID,
    payload: StartRequest,
    user: Trainer,
    request: Request,
    session: Session,
):
    experiment = await session.get(Experiment, experiment_id)
    if not experiment:
        raise HTTPException(404, "Experiment not found.")
    # Retry controls are restricted to the previous job owner/admin.
    previous = JobStore().list(experiment_id=experiment_id, limit=1)
    if previous:
        permitted_job(previous[0]["id"], user, True)
    job = await queue_experiment(experiment, user, session, payload)
    await AuditService(session).record(
        request=request,
        action="experiment.training_queued",
        user_id=user.id,
        resource_type="experiment",
        resource_id=str(experiment_id),
        details={"job_id": job["id"], "resume": job["resume"]},
    )
    return job


@router.get("/{experiment_id}/duplicate")
async def duplicate(experiment_id: uuid.UUID, user: Editor, session: Session):
    experiment = await session.get(Experiment, experiment_id)
    if not experiment:
        raise HTTPException(404, "Experiment not found.")
    return {
        "payload": duplicate_payload(experiment),
        "research": (experiment.results or {}).get("research", {}),
        "name": experiment.name,
    }


@router.patch("/{experiment_id}/research")
async def notes(
    experiment_id: uuid.UUID, payload: ResearchNotes, user: Editor, session: Session
):
    experiment = await session.get(Experiment, experiment_id)
    if not experiment:
        raise HTTPException(404, "Experiment not found.")
    if experiment.status != ExperimentStatus.PLANNED or JobStore().list(
        experiment_id=experiment_id, active=True
    ):
        raise HTTPException(
            409,
            "Research notes are fixed once training starts; duplicate the experiment to revise them.",
        )
    experiment.results = {
        **(experiment.results or {}),
        "research": payload.model_dump(),
    }
    await session.commit()
    return payload
