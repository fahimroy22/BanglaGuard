from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Annotated, Literal

from app.api.dependencies import require_admin, require_researcher_or_admin
from app.db.models import Experiment, ModelVersion, User
from app.db.repositories.model_version import ModelVersionRepository
from app.db.session import get_db_session
from app.domain.services.audit import AuditService
from app.domain.services.evaluation_research import compatibility, digest, load_evidence
from app.domain.services.model_activation import (
    ModelActivationError,
    ModelActivationService,
)
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

router = APIRouter(prefix="/model-promotion", tags=["Model promotion"])
Session = Annotated[AsyncSession, Depends(get_db_session)]
Researcher = Annotated[User, Depends(require_researcher_or_admin)]
Admin = Annotated[User, Depends(require_admin)]


class Decision(BaseModel):
    action: Literal["evaluate", "request", "approve", "reject", "activate", "rollback"]
    reason: str = Field(min_length=10, max_length=5000)
    acknowledge_limitations: bool = False
    acknowledge_regressions: bool = False
    regression_run_id: uuid.UUID | None = None


def record(model):
    return dict((model.configuration or {}).get("promotion") or {})


def fingerprint(model):
    return digest(
        {
            "configuration": {
                k: v for k, v in (model.configuration or {}).items() if k != "promotion"
            },
            "metrics": model.metrics,
            "artifact_path": model.artifact_path,
            "tokenizer_path": model.tokenizer_path,
        }
    )


def lifecycle(model):
    if model.is_archived:
        return "archived"
    if str(model.status) == "active":
        return "active"
    return record(model).get("stage", "registered candidate")


def regression_snapshot(identifier):
    from app.domain.services.prediction_research import ResearchStore

    run = ResearchStore().run(identifier) if identifier else None
    return (
        {k: v for k, v in run.items() if k not in {"rows", "suite_snapshot"}}
        if run
        else None
    )


def require_regression(identifier, model, active, user=None):
    from app.domain.services.prediction_research import (
        ResearchStore,
        fingerprint as suite_fingerprint,
    )

    store = ResearchStore()
    run = store.run(identifier) if identifier else None
    if not run or run["model_id"] != str(model.id):
        raise HTTPException(
            409,
            "Run a saved test suite on this candidate before requesting activation.",
        )
    if user and run["owner"] != str(user.id) and str(user.role) != "admin":
        raise HTTPException(403, "Use a regression run from your own account.")
    suite = store.suite(run["suite_id"])
    if (
        not suite
        or suite["version"] != run["suite_version"]
        or suite_fingerprint(suite["payload"]) != run["suite_hash"]
    ):
        raise HTTPException(
            409, "The test suite changed. Run the regression check again."
        )
    if (
        run["model_fingerprint"] != fingerprint(model)
        or run["baseline_id"] != (str(active.id) if active else None)
        or run["baseline_fingerprint"] != (fingerprint(active) if active else None)
    ):
        raise HTTPException(
            409,
            "The candidate or production baseline changed. Run the regression check again.",
        )
    if run["errors"]:
        raise HTTPException(
            409,
            "Resolve test-suite execution errors and rerun before requesting activation.",
        )
    return run


async def origin(session, model):
    return (
        await session.scalars(
            select(Experiment)
            .where(Experiment.model_version_id == model.id)
            .order_by(Experiment.created_at)
        )
    ).first()


async def card(session, model):
    experiment = await origin(session, model)
    saved = record(model)
    return {
        "id": str(model.id),
        "name": model.name,
        "version": model.version,
        "task": str(model.task),
        "stage": lifecycle(model),
        "architecture": model.architecture,
        "configuration": {
            k: v for k, v in (model.configuration or {}).items() if k != "promotion"
        },
        "metrics": model.metrics or {},
        "experiment_id": str(experiment.id) if experiment else None,
        "dataset_id": str(experiment.dataset_version_id) if experiment else None,
        "provenance": (experiment.results or {}).get("provenance")
        if experiment
        else None,
        "promotion": saved,
        "regression": regression_snapshot(saved.get("regression_run_id")),
        "limitations": [
            "Aggregate scores do not establish reliability on every example.",
            "Review class-specific errors and confidence before activation.",
        ]
        + ([] if experiment else ["Originating experiment is unavailable."]),
        "intended_use": f"Research {model.task} classification; review important examples before deployment.",
    }


async def compare(session, model, active):
    if not active:
        return {
            "comparable": False,
            "concerns": [
                "No current active model; review candidate evidence independently."
            ],
        }
    left, right = await origin(session, model), await origin(session, active)
    if not left or not right:
        return {"comparable": False, "concerns": ["Originating experiment is missing"]}
    le, re = (
        await run_in_threadpool(load_evidence, left, "test"),
        await run_in_threadpool(load_evidence, right, "test"),
    )
    if not le or not re:
        return {
            "comparable": False,
            "concerns": ["Row-level comparison evidence is missing"],
        }
    le["dataset_version_id"], re["dataset_version_id"] = (
        str(left.dataset_version_id),
        str(right.dataset_version_id),
    )
    return compatibility(le, re)


@router.get("/{model_id}")
async def review(model_id: uuid.UUID, session: Session, user: Researcher):
    model = await session.get(ModelVersion, model_id)
    if model is None:
        raise HTTPException(404, "Model not found")
    active = await ModelVersionRepository(session).get_active_model(model.task)
    return {
        "candidate": await card(session, model),
        "active": await card(session, active) if active else None,
        "comparison": await compare(session, model, active),
    }


async def locked_model(session, model_id):
    model = await session.get(ModelVersion, model_id)
    if model is None:
        raise HTTPException(404, "Model not found")
    # Serialize lifecycle changes for this task, before taking any row locks.
    await session.execute(
        text("SELECT pg_advisory_xact_lock(hashtext(:key))"),
        {"key": f"model-promotion:{model.task}"},
    )
    return (
        await session.scalars(
            select(ModelVersion)
            .where(ModelVersion.id == model_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).one()


async def apply(model_id, payload, session, user, request):
    model = await locked_model(session, model_id)
    if model.is_archived:
        raise HTTPException(409, "Restore the model before requesting promotion.")
    saved = record(model)
    stage = lifecycle(model)
    if not payload.reason.strip() or len(payload.reason.strip()) < 10:
        raise HTTPException(422, "Explain your decision in at least 10 characters.")
    active = await ModelVersionRepository(session).get_active_model(model.task)
    target = model
    if payload.action == "evaluate":
        if stage in {"active", "approved"}:
            raise HTTPException(409, "This model has already been promoted.")
        experiment = await origin(session, model)
        metrics = model.metrics or {}
        if (
            not experiment
            or not metrics
            or not any(
                isinstance(metrics.get(k), (int, float))
                for k in ("accuracy", "macro_f1")
            )
        ):
            raise HTTPException(
                409,
                "A completed originating experiment and saved evaluation metrics are required.",
            )
        if str(experiment.status) != "completed":
            raise HTTPException(409, "The originating experiment has not completed.")
        saved.update(
            stage="evaluated",
            evaluation_fingerprint=fingerprint(model),
            limitations=payload.reason,
            request=None,
            approval=None,
        )
    elif payload.action == "request":
        if stage != "evaluated" or saved.get("evaluation_fingerprint") != fingerprint(
            model
        ):
            raise HTTPException(
                409, "Review evaluation evidence before requesting activation."
            )
        run = require_regression(payload.regression_run_id, model, active, user)
        saved["regression_run_id"] = run["id"]
        saved.update(
            request={
                "user_id": str(user.id),
                "notes": payload.reason,
                "created": datetime.now(timezone.utc).isoformat(),
            },
            approval=None,
        )
    elif payload.action == "approve":
        if (
            stage != "evaluated"
            or not saved.get("request")
            or saved.get("evaluation_fingerprint") != fingerprint(model)
        ):
            raise HTTPException(
                409,
                "A current evaluated candidate and activation request are required.",
            )
        run = require_regression(saved.get("regression_run_id"), model, active)
        if not run["passed"] and not payload.acknowledge_regressions:
            raise HTTPException(
                409,
                "Review failed examples and regressions, acknowledge them, and explain the approval decision.",
            )
        comparison = await compare(session, model, active)
        if not comparison["comparable"] and not payload.acknowledge_limitations:
            raise HTTPException(
                409,
                "Acknowledge the comparison limitations and explain why approval is justified.",
            )
        saved.update(
            stage="approved",
            approval={
                "user_id": str(user.id),
                "reason": payload.reason,
                "fingerprint": fingerprint(model),
                "active_id": str(active.id) if active else None,
                "comparison": comparison,
            },
        )
    elif payload.action == "reject":
        if not saved.get("request"):
            raise HTTPException(409, "No activation request to reject.")
        saved.update(stage="evaluated", request=None, approval=None)
    elif payload.action == "activate":
        require_regression(saved.get("regression_run_id"), model, active)
        approval = saved.get("approval") or {}
        if stage != "approved" or approval.get("fingerprint") != fingerprint(model):
            raise HTTPException(409, "Current admin approval is required.")
        if approval.get("active_id") != (str(active.id) if active else None):
            raise HTTPException(
                409, "The active model changed. Request a new review before activation."
            )
        saved.update(
            previous_active_id=str(active.id) if active else None,
            stage="approved",
            activation_reason=payload.reason,
        )
    elif payload.action == "rollback":
        if stage != "active" or not saved.get("previous_active_id"):
            raise HTTPException(
                409, "This active model has no recorded previous active version."
            )
        target = (
            await session.scalars(
                select(ModelVersion)
                .where(ModelVersion.id == uuid.UUID(saved["previous_active_id"]))
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        ).first()
        if target is None or target.task != model.task or target.is_archived:
            raise HTTPException(
                409,
                "Restore the previous version before rollback; it must belong to the same task.",
            )
        saved.update(rollback_reason=payload.reason)
    if payload.action in {"activate", "rollback"}:
        try:
            await run_in_threadpool(ModelActivationService().validate, target)
        except (ValueError, RuntimeError, ModelActivationError) as exc:
            raise HTTPException(409, str(exc)) from exc
    history = list(saved.get("history") or [])
    history.append(
        {
            "action": payload.action,
            "reason": payload.reason,
            "user_id": str(user.id),
            "at": datetime.now(timezone.utc).isoformat(),
            "target_id": str(target.id),
        }
    )
    saved["history"] = history
    model.configuration = {**(model.configuration or {}), "promotion": saved}
    if target.id != model.id:
        target_saved = record(target)
        target_saved.update(
            stage="approved",
            previous_active_id=str(model.id),
            activation_reason=payload.reason,
        )
        target_saved["history"] = [*(target_saved.get("history") or []), history[-1]]
        target.configuration = {
            **(target.configuration or {}),
            "promotion": target_saved,
        }
    await session.flush()
    if payload.action in {"activate", "rollback"}:
        await ModelVersionRepository(session).activate(target.id)
    else:
        await session.commit()
    await AuditService(session).record(
        request=request,
        user_id=user.id,
        action=f"model_promotion.{payload.action}",
        resource_type="model_version",
        resource_id=str(model.id),
        details=history[-1],
    )
    return await card(session, target)


@router.post("/{model_id}/request")
async def researcher_decision(
    model_id: uuid.UUID,
    payload: Decision,
    session: Session,
    user: Researcher,
    request: Request,
):
    if payload.action not in {"evaluate", "request"}:
        raise HTTPException(403, "This action requires admin access.")
    return await apply(model_id, payload, session, user, request)


@router.post("/{model_id}/decision")
async def admin_decision(
    model_id: uuid.UUID,
    payload: Decision,
    session: Session,
    user: Admin,
    request: Request,
):
    return await apply(model_id, payload, session, user, request)


@router.get("/{model_id}/compare/{other_id}")
async def compare_models(
    model_id: uuid.UUID, other_id: uuid.UUID, session: Session, user: Researcher
):
    model, other = (
        await session.get(ModelVersion, model_id),
        await session.get(ModelVersion, other_id),
    )
    if not model or not other:
        raise HTTPException(404, "Model not found")
    result = await compare(session, model, other)
    if model.task != other.task:
        result["comparable"] = False
        result["concerns"].append("Different analysis tasks")
    return result
