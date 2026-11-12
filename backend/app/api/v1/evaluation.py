from __future__ import annotations

import io
import json
import uuid
import zipfile
from typing import Annotated, Literal

import numpy as np
from app.api.dependencies import require_researcher_or_admin
from app.db.models import Experiment, User
from app.db.session import get_db_session
from app.domain.services.evaluation_research import (
    compatibility,
    load_evidence,
    seed_configuration,
    summarize,
)
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

router = APIRouter(prefix="/evaluation", tags=["Research evaluation"])
Session = Annotated[AsyncSession, Depends(get_db_session)]
Researcher = Annotated[User, Depends(require_researcher_or_admin)]
Split = Literal["validation", "test"]


async def evidence_for(session, experiment_id, split):
    experiment = await session.get(Experiment, experiment_id)
    if experiment is None:
        raise HTTPException(404, "Experiment not found")
    try:
        evidence = await run_in_threadpool(load_evidence, experiment, split)
    except (ValueError, OSError, KeyError) as exc:
        raise HTTPException(
            409, "Saved evaluation evidence could not be read."
        ) from exc
    if not evidence or not evidence["rows"]:
        raise HTTPException(
            409,
            "This run has no saved row-level evaluation evidence. Duplicate and train it to capture error examples.",
        )
    evidence["dataset_version_id"] = str(experiment.dataset_version_id)
    return experiment, evidence


@router.get("/{experiment_id}/summary")
async def summary(
    experiment_id: uuid.UUID,
    session: Session,
    user: Researcher,
    split: Split = "validation",
):
    _, evidence = await evidence_for(session, experiment_id, split)
    return dict(
        await run_in_threadpool(summarize, evidence),
        warning=evidence.get("warning"),
        split=split,
        sources=sorted({r["source"] for r in evidence["rows"]}),
    )


@router.get("/{experiment_id}/examples")
async def examples(
    experiment_id: uuid.UUID,
    session: Session,
    user: Researcher,
    split: Split = "validation",
    actual: str | None = None,
    predicted: str | None = None,
    outcome: Literal["all", "correct", "incorrect"] = "incorrect",
    minimum_confidence: float = Query(0, ge=0, le=1),
    maximum_confidence: float = Query(1, ge=0, le=1),
    minimum_length: int = Query(0, ge=0),
    maximum_length: int | None = Query(None, ge=0),
    source: str | None = None,
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
):
    _, evidence = await evidence_for(session, experiment_id, split)

    def matches(r):
        return (
            (not actual or r["actual"] == actual)
            and (not predicted or r["predicted"] == predicted)
            and (outcome == "all" or r["correct"] == (outcome == "correct"))
            and (not source or r["source"] == source)
            and (
                (minimum_confidence == 0 and maximum_confidence == 1)
                or (
                    r["confidence"] is not None
                    and minimum_confidence <= r["confidence"] <= maximum_confidence
                )
            )
            and (
                (minimum_length == 0 and maximum_length is None)
                or (
                    r["length"] is not None
                    and r["length"] >= minimum_length
                    and (maximum_length is None or r["length"] <= maximum_length)
                )
            )
        )

    rows = [r for r in evidence["rows"] if matches(r)]
    return {"total": len(rows), "offset": offset, "rows": rows[offset : offset + limit]}


@router.get("/{experiment_id}/comparison")
async def comparison(
    experiment_id: uuid.UUID,
    other: uuid.UUID,
    session: Session,
    user: Researcher,
    split: Split = "validation",
):
    left, le = await evidence_for(session, experiment_id, split)
    right, re = await evidence_for(session, other, split)
    return dict(
        **compatibility(le, re),
        left={"name": left.name, "summary": await run_in_threadpool(summarize, le)},
        right={"name": right.name, "summary": await run_in_threadpool(summarize, re)},
    )


@router.get("/{experiment_id}/seeds")
async def seeds(
    experiment_id: uuid.UUID,
    session: Session,
    user: Researcher,
    split: Split = "validation",
):
    experiment, evidence = await evidence_for(session, experiment_id, split)
    candidates = (
        await session.scalars(
            select(Experiment)
            .where(Experiment.dataset_version_id == experiment.dataset_version_id)
            .order_by(Experiment.created_at)
        )
    ).all()
    runs, seen = [], set()
    for candidate in candidates:
        if (
            candidate.random_seed is None
            or candidate.random_seed in seen
            or seed_configuration(candidate.configuration or {})
            != seed_configuration(experiment.configuration or {})
        ):
            continue
        other = await run_in_threadpool(load_evidence, candidate, split)
        if not other:
            continue
        other["dataset_version_id"] = str(candidate.dataset_version_id)
        if not compatibility(evidence, other)["comparable"]:
            continue
        metrics = await run_in_threadpool(summarize, other)
        seen.add(candidate.random_seed)
        runs.append(
            {
                "id": str(candidate.id),
                "name": candidate.name,
                "seed": candidate.random_seed,
                "accuracy": metrics["accuracy"],
                "macro_f1": metrics["macro_f1"],
            }
        )
    return {
        "runs": runs,
        "count": len(runs),
        "mean_macro_f1": float(np.mean([r["macro_f1"] for r in runs]))
        if runs
        else None,
        "standard_deviation": float(np.std([r["macro_f1"] for r in runs], ddof=1))
        if len(runs) > 1
        else None,
        "method": "Same configuration excluding seed and identity metadata; identical evaluation examples and labels. Earliest saved run per distinct seed. Sample standard deviation requires at least two seeds.",
    }


@router.get("/{experiment_id}/report")
async def report(
    experiment_id: uuid.UUID,
    session: Session,
    user: Researcher,
    split: Split = "validation",
):
    experiment, evidence = await evidence_for(session, experiment_id, split)

    def build():
        result = io.BytesIO()
        with zipfile.ZipFile(result, "w", zipfile.ZIP_DEFLATED) as archive:
            for name, value in {
                "metrics": summarize(evidence),
                "configuration": experiment.configuration,
                "provenance": (experiment.results or {}).get("provenance"),
                "evaluation_examples": evidence,
            }.items():
                archive.writestr(
                    f"{name}.json",
                    json.dumps(value, ensure_ascii=False, indent=2, default=str),
                )
            archive.writestr(
                "README.txt",
                f"Experiment: {experiment.name}\nSplit: {split}\nUse validation to select configurations. Reserve test data for final evaluation.\nIntervals assume independent examples and do not establish superiority.\nMissing legacy evidence is represented explicitly. Export includes dataset text; handle according to its license.\n",
            )
        return result.getvalue()

    return Response(
        await run_in_threadpool(build),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="research-{experiment_id}-{split}.zip"'
        },
    )


@router.post("/{experiment_id}/examples/{row_id}/explanation")
async def explanation(
    experiment_id: uuid.UUID,
    row_id: int,
    session: Session,
    user: Researcher,
    split: Split = "validation",
):
    from app.domain.services.evaluation_research import allowed

    experiment, evidence = await evidence_for(session, experiment_id, split)
    if row_id < 0 or row_id >= len(evidence["rows"]):
        raise HTTPException(404, "Example not found")
    row = evidence["rows"][row_id]
    if not row["text"]:
        raise HTTPException(409, "This legacy example has no saved text snapshot.")
    artifact = (experiment.results or {}).get("artifact_path")
    if not artifact:
        raise HTTPException(409, "The experiment model artifact is unavailable.")
    try:
        artifact = str(allowed(artifact))
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    configuration = experiment.configuration or {}

    def run():
        if configuration.get("model_family") == "banglabert_sequence_classification":
            from app.ml.transformer_model import predict_with_transformer

            result = predict_with_transformer(
                artifact_path=artifact,
                tokenizer_path=artifact,
                text=row["text"],
                max_length=configuration.get("model", {}).get(
                    "max_sequence_length", 128
                ),
            )
        else:
            from app.ml.classical_model import predict_with_classical_model

            result = predict_with_classical_model(
                artifact_path=artifact, text=row["text"]
            )
        return {
            "predicted": result.label,
            "probabilities": result.probabilities,
            "explanation": result.explanation,
            "matches_saved_prediction": result.label == row["predicted"],
            "note": "Fresh explanation from this experiment's saved model artifact. Attribution scores are not probabilities. This does not modify evaluation results or prediction history.",
        }

    try:
        return await run_in_threadpool(run)
    except Exception as exc:
        raise HTTPException(
            409,
            "Explanation could not be generated from this experiment's saved artifact.",
        ) from exc
