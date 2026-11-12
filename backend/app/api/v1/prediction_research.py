from __future__ import annotations

import json
import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.api.dependencies import require_researcher_or_admin
from app.api.v1.model_promotion import fingerprint as model_fingerprint
from app.db.models import ModelVersion, User
from app.db.repositories.model_version import ModelVersionRepository
from app.db.session import get_db_session
from app.domain.enums import AnalysisTask
from app.domain.services.platform_policy import require_permission
from app.domain.services.prediction import (
    ActiveModelNotFoundError,
    PredictionService,
    infer_for_model,
)
from app.domain.services.prediction_research import ResearchStore, csv_export, parse_csv
from app.schemas.prediction import PredictionRead, PredictionRequest

router = APIRouter(
    prefix="/prediction-research",
    tags=["Prediction research"],
    dependencies=[Depends(require_permission("prediction_run"))],
)
Session = Annotated[AsyncSession, Depends(get_db_session)]
Researcher = Annotated[User, Depends(require_researcher_or_admin)]
Predictor = Annotated[User, Depends(require_permission("prediction_run"))]


class Comparison(BaseModel):
    text: str = Field(min_length=1, max_length=5000)
    task: AnalysisTask
    model_ids: list[uuid.UUID] = Field(min_length=2, max_length=2)
    include_explanation: bool = False


class Case(BaseModel):
    text: str = Field(min_length=1, max_length=5000)
    expected_label: str = Field(min_length=1, max_length=100)
    category: Literal["positive", "negative", "neutral", "difficult", "other"] = (
        "difficult"
    )
    note: str = Field(default="", max_length=1000)


class Suite(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    task: AnalysisTask
    cases: list[Case] = Field(min_length=1, max_length=50)
    version: int | None = None


class RunRequest(BaseModel):
    model_id: uuid.UUID


def owned_suite(identifier, user):
    suite = ResearchStore().suite(identifier)
    if not suite or (suite["owner"] != str(user.id) and str(user.role) != "admin"):
        raise HTTPException(404, "Test suite not found")
    return suite


async def selected_model(session, identifier, task, user):
    repository = ModelVersionRepository(session)
    model = (
        await repository.get(identifier)
        if identifier
        else await repository.get_active_model(task)
    )
    if not model or model.is_archived or model.task != task:
        raise HTTPException(409, "Choose an available model for this task.")
    if str(user.role) == "user" and str(model.status) != "active":
        raise HTTPException(403, "Regular users can use production models only.")
    return model


@router.post("/compare")
async def compare(payload: Comparison, session: Session, user: Researcher):
    if payload.model_ids[0] == payload.model_ids[1]:
        raise HTTPException(422, "Select two different models.")
    for identifier in payload.model_ids:
        await selected_model(session, identifier, payload.task, user)
    results = []
    try:
        for identifier in payload.model_ids:
            prediction = await PredictionService(session).predict(
                PredictionRequest(
                    text=payload.text,
                    task=payload.task,
                    model_version_id=identifier,
                    include_explanation=payload.include_explanation,
                ),
                user,
            )
            results.append(
                PredictionRead.model_validate(prediction).model_dump(mode="json")
            )
    except (ActiveModelNotFoundError, RuntimeError, ValueError) as exc:
        raise HTTPException(409, str(exc)) from exc
    label_sets = [set(r.get("probabilities") or {}) for r in results]
    return {
        "results": results,
        "compatible_labels": bool(label_sets[0]) and label_sets[0] == label_sets[1],
        "note": "Same input and task. Model label definitions and preprocessing may differ; compare those before interpreting differences.",
    }


@router.post("/csv/preview")
async def preview_csv(user: Predictor, file: UploadFile = File(...)):
    try:
        columns, rows = parse_csv(await file.read(2 * 1024 * 1024 + 1))
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    finally:
        await file.close()
    return {
        "columns": columns,
        "count": len(rows),
        "preview": rows[:3],
        "maximum_rows": 50,
    }


@router.post("/csv/predict")
async def predict_csv(
    session: Session,
    user: Predictor,
    file: UploadFile = File(...),
    text_column: str = Form(...),
    task: AnalysisTask = Form(...),
    model_id: uuid.UUID | None = Form(None),
    include_explanation: bool = Form(False),
):
    try:
        columns, rows = parse_csv(await file.read(2 * 1024 * 1024 + 1), text_column)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    finally:
        await file.close()
    model = await selected_model(session, model_id, task, user)
    output = []
    extra = [
        "bg_row",
        "bg_model_id",
        "bg_prediction_id",
        "bg_prediction",
        "bg_confidence",
        "bg_needs_review",
        "bg_probabilities",
        "bg_prediction_ms",
        "bg_explanation_ms",
        "bg_error",
    ]
    if set(columns) & set(extra):
        raise HTTPException(
            422,
            "CSV contains reserved bg_ output columns. Rename them before uploading.",
        )
    for index, row in enumerate(rows):
        item = {**row, "bg_row": index + 1, "bg_model_id": str(model.id)}
        value = row.get(text_column) or ""
        if not value.strip() or len(value) > 5000:
            item["bg_error"] = "Text must contain 1–5,000 characters."
        else:
            try:
                pred = await PredictionService(session).predict(
                    PredictionRequest(
                        text=value,
                        task=task,
                        model_version_id=model.id,
                        include_explanation=include_explanation,
                    ),
                    user,
                )
                runtime = (pred.explanation or {}).get("runtime", {})
                item.update(
                    bg_prediction_id=str(pred.id),
                    bg_prediction=pred.predicted_label,
                    bg_confidence=pred.confidence,
                    bg_needs_review=runtime.get("needs_review"),
                    bg_probabilities=json.dumps(pred.probabilities, ensure_ascii=False),
                    bg_prediction_ms=runtime.get("prediction_ms"),
                    bg_explanation_ms=runtime.get("explanation_ms"),
                    bg_error="",
                )
            except (ActiveModelNotFoundError, RuntimeError, ValueError) as exc:
                item["bg_error"] = str(exc)
        output.append(item)
    return Response(
        csv_export(columns + extra, output),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="batch-predictions.csv"'},
    )


@router.get("/suites")
async def suites(user: Researcher):
    return ResearchStore().suites(user.id, str(user.role) == "admin")


@router.post("/suites", status_code=201)
async def save_suite(payload: Suite, user: Researcher):
    return ResearchStore().save(
        user.id, payload.model_dump(mode="json", exclude={"version"})
    )


@router.put("/suites/{suite_id}")
async def update_suite(suite_id: uuid.UUID, payload: Suite, user: Researcher):
    owned_suite(suite_id, user)
    try:
        return ResearchStore().save(
            user.id,
            payload.model_dump(mode="json", exclude={"version"}),
            suite_id,
            payload.version,
            str(user.role) == "admin",
        )
    except (ValueError, PermissionError) as exc:
        raise HTTPException(409, str(exc)) from exc


@router.get("/runs")
async def runs(user: Researcher, model_id: uuid.UUID | None = None):
    return ResearchStore().runs(user.id, str(user.role) == "admin", model_id)


@router.post("/suites/{suite_id}/run")
async def run_suite(
    suite_id: uuid.UUID, payload: RunRequest, session: Session, user: Researcher
):
    suite = owned_suite(suite_id, user)
    task = AnalysisTask(suite["payload"]["task"])
    model = await selected_model(session, payload.model_id, task, user)
    baseline = await ModelVersionRepository(session).get_active_model(task)
    signature = model_fingerprint(model)
    baseline_signature = model_fingerprint(baseline) if baseline else None

    def execute():
        rows = []
        for case in suite["payload"]["cases"]:
            row = {
                **case,
                "correct": False,
                "baseline_correct": None,
                "regression": False,
                "error": None,
            }
            try:
                request = PredictionRequest(
                    text=case["text"], task=task, include_explanation=False
                )
                prediction, _, runtime = infer_for_model(model, request)
                if case["expected_label"] not in prediction.probabilities:
                    raise ValueError("Expected label is not in the model label set.")
                row.update(
                    predicted=prediction.label,
                    confidence=prediction.confidence,
                    probabilities=prediction.probabilities,
                    correct=prediction.label == case["expected_label"],
                    needs_review=runtime["needs_review"],
                    prediction_ms=runtime.get("prediction_ms"),
                )
                if baseline:
                    old = (
                        prediction
                        if baseline.id == model.id
                        else infer_for_model(baseline, request)[0]
                    )
                    if set(old.probabilities) != set(prediction.probabilities):
                        raise ValueError("Candidate and production label sets differ.")
                    row.update(
                        baseline_predicted=old.label,
                        baseline_correct=old.label == case["expected_label"],
                    )
                    row["regression"] = row["baseline_correct"] and not row["correct"]
            except (RuntimeError, ValueError) as exc:
                row["error"] = str(exc)
            rows.append(row)
        return {
            "model_fingerprint": signature,
            "model_name": model.name,
            "baseline_id": str(baseline.id) if baseline else None,
            "baseline_fingerprint": baseline_signature,
            "rows": rows,
            "correct": sum(r["correct"] and not r["error"] for r in rows),
            "total": len(rows),
            "errors": sum(bool(r["error"]) for r in rows),
            "regressions": sum(r["regression"] for r in rows),
            "passed": all(r["correct"] and not r["error"] for r in rows),
        }

    result = await run_in_threadpool(execute)
    return ResearchStore().save_run(user.id, model.id, suite, result)
