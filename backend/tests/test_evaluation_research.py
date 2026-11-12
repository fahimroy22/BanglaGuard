import json
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock

import numpy as np
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sklearn.metrics import f1_score

from app.api.dependencies import get_current_user
from app.api.v1 import evaluation, model_promotion as promotion
from app.db.session import get_db_session
from app.domain.enums import UserRole
from app.domain.services import evaluation_research as research


def evidence(tmp_path):
    return research.save_evidence(
        tmp_path,
        "validation",
        ["good", "bad", "mixed", "bad again"],
        ["p", "n", "n", "n"],
        ["p", "p", "n", "n"],
        ["n", "p"],
        [[0.1, 0.9], [0.2, 0.8], [0.7, 0.3], [0.6, 0.4]],
        {
            "dataset_version_id": "d",
            "dataset": {"label_schema": {"n": "negative", "p": "positive"}},
        },
    )


def test_row_evidence_confusion_confidence_and_intervals(tmp_path):
    e = evidence(tmp_path)
    assert e["rows"][1]["correct"] is False
    assert e["rows"][1]["probabilities"] == {"n": 0.2, "p": 0.8}
    s = research.summarize(e)
    assert s["matrix"] == [[2, 1], [0, 1]]
    assert s["accuracy"] == 0.75
    assert s["macro_f1"] == pytest.approx(
        f1_score(["p", "n", "n", "n"], ["p", "p", "n", "n"], average="macro")
    )
    assert s["accuracy_interval"][0] < 0.75 < s["accuracy_interval"][1]
    assert s["confidence_count"] == 4
    assert sum(b["count"] for b in s["confidence_bins"]) == 4
    assert research.summarize(e)["macro_f1_interval"] == s["macro_f1_interval"]
    assert research.compatibility(e, e)["comparable"]
    other = {**e, "evaluation_hash": "changed"}
    assert not research.compatibility(e, other)["comparable"]
    assert not research.compatibility({**e, "evaluation_hash": None}, e)["comparable"]


def test_missing_probabilities_are_not_zero_confidence(tmp_path):
    e = research.save_evidence(tmp_path, "test", ["x"], ["n"], ["n"], ["n"], None, {})
    s = research.summarize(e)
    assert s["confidence_count"] == 0
    assert s["expected_calibration_error"] is None
    assert e["rows"][0]["confidence"] is None


def test_evidence_refuses_path_escape(tmp_path, monkeypatch):
    monkeypatch.setattr(research, "ROOT_DIR", tmp_path)
    with pytest.raises(ValueError):
        research.allowed(tmp_path / "outside.json")


def test_legacy_rows_never_guess_text_alignment(tmp_path, monkeypatch):
    monkeypatch.setattr(research, "ROOT_DIR", tmp_path)
    workspace = tmp_path / "storage" / "e"
    (workspace / "predictions").mkdir(parents=True)
    (workspace / "predictions" / "test_predictions.jsonl").write_text(
        json.dumps(
            {
                "label_id": 0,
                "label": "n",
                "predicted_id": 0,
                "predicted_label": "n",
                "probabilities": [1],
            }
        )
        + "\n"
    )
    e = research.load_evidence(
        SimpleNamespace(results={"workspace": str(workspace)}, configuration={}), "test"
    )
    assert e["rows"][0]["text"] is None
    assert e["evaluation_hash"] is None


@pytest.mark.asyncio
async def test_example_filters_and_report(tmp_path, monkeypatch):
    e = evidence(tmp_path)
    exp = SimpleNamespace(
        name="Test",
        configuration={"seed": 42},
        results={"provenance": {"device": "cpu"}},
    )
    monkeypatch.setattr(evaluation, "evidence_for", AsyncMock(return_value=(exp, e)))
    result = await evaluation.examples(
        uuid.uuid4(),
        None,
        None,
        split="validation",
        actual="n",
        predicted="p",
        outcome="incorrect",
        minimum_confidence=0.5,
        maximum_confidence=1,
        minimum_length=0,
        maximum_length=None,
        source=None,
        offset=0,
        limit=25,
    )
    assert result["total"] == 1
    assert result["rows"][0]["text"] == "bad"
    response = await evaluation.report(uuid.uuid4(), None, None)
    import io, zipfile

    with zipfile.ZipFile(io.BytesIO(response.body)) as archive:
        assert {
            "metrics.json",
            "configuration.json",
            "provenance.json",
            "evaluation_examples.json",
            "README.txt",
        } == set(archive.namelist())


def test_admin_route_rejects_researcher():
    app = FastAPI()
    app.include_router(promotion.router)
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
        role=UserRole.RESEARCHER, id=uuid.uuid4()
    )

    async def session():
        yield None

    app.dependency_overrides[get_db_session] = session
    response = TestClient(app).post(
        f"/model-promotion/{uuid.uuid4()}/decision",
        json={"action": "activate", "reason": "Reason for test activation"},
    )
    assert response.status_code == 403


def model():
    return SimpleNamespace(
        id=uuid.uuid4(),
        name="Candidate",
        version="1",
        task="sentiment",
        status="draft",
        is_archived=False,
        configuration={},
        metrics={"accuracy": 0.8},
        artifact_path="model",
        tokenizer_path=None,
        architecture="tfidf_logistic_regression",
    )


@pytest.mark.asyncio
async def test_promotion_requires_review_request_approval_and_reason(monkeypatch, tmp_path):
    monkeypatch.setenv("BANGLAGUARD_RESEARCH_ROOT", str(tmp_path))
    monkeypatch.setattr(promotion, "require_regression", lambda *args: {"passed": True, "id": str(uuid.uuid4())})
    m = model()
    user = SimpleNamespace(id=uuid.uuid4())
    session = SimpleNamespace(flush=AsyncMock(), commit=AsyncMock())
    monkeypatch.setattr(promotion, "locked_model", AsyncMock(return_value=m))
    monkeypatch.setattr(
        promotion,
        "origin",
        AsyncMock(
            return_value=SimpleNamespace(
                id=uuid.uuid4(),
                dataset_version_id=uuid.uuid4(),
                status="completed",
                results={},
            )
        ),
    )
    monkeypatch.setattr(
        promotion, "AuditService", lambda _: SimpleNamespace(record=AsyncMock())
    )

    class Repo:
        def __init__(self, _):
            pass

        async def get_active_model(self, _):
            return None

        async def activate(self, _):
            m.status = "active"
            return m

    monkeypatch.setattr(promotion, "ModelVersionRepository", Repo)
    monkeypatch.setattr(
        promotion,
        "ModelActivationService",
        lambda: SimpleNamespace(validate=lambda _: None),
    )

    async def action(name, ack=False):
        return await promotion.apply(
            m.id,
            promotion.Decision(
                action=name,
                reason="Reviewed important examples and limitations",
                acknowledge_limitations=ack,
            ),
            session,
            user,
            None,
        )

    with pytest.raises(HTTPException):
        await action("activate")
    with pytest.raises(HTTPException):
        await action("approve")
    await action("evaluate")
    assert promotion.lifecycle(m) == "evaluated"
    await action("request")
    with pytest.raises(HTTPException):
        await action("approve")
    await action("approve", True)
    assert promotion.lifecycle(m) == "approved"
    await action("activate")
    assert promotion.lifecycle(m) == "active"
    assert [h["action"] for h in promotion.record(m)["history"]] == [
        "evaluate",
        "request",
        "approve",
        "activate",
    ]


@pytest.mark.asyncio
async def test_stale_approval_cannot_activate(monkeypatch):
    monkeypatch.setattr(promotion, "require_regression", lambda *args: {"passed": True, "id": str(uuid.uuid4())})
    m = model()
    m.configuration = {
        "promotion": {
            "stage": "approved",
            "approval": {"fingerprint": "stale", "active_id": None},
        }
    }
    monkeypatch.setattr(promotion, "locked_model", AsyncMock(return_value=m))
    monkeypatch.setattr(
        promotion,
        "ModelVersionRepository",
        lambda _: SimpleNamespace(get_active_model=AsyncMock(return_value=None)),
    )
    with pytest.raises(HTTPException) as exc:
        await promotion.apply(
            m.id,
            promotion.Decision(action="activate", reason="Please activate this model"),
            None,
            SimpleNamespace(id=uuid.uuid4()),
            None,
        )
    assert exc.value.status_code == 409


def test_seed_configuration_keeps_training_settings():
    assert research.seed_configuration(
        {"random_seed": 1, "training": {"lr": 0.1}}
    ) == research.seed_configuration({"random_seed": 2, "training": {"lr": 0.1}})
    assert research.seed_configuration(
        {"training": {"lr": 0.1}}
    ) != research.seed_configuration({"training": {"lr": 0.2}})


@pytest.mark.asyncio
async def test_rollback_requires_previous_active_and_records_reason(monkeypatch):
    current, previous = model(), model()
    current.status = "active"
    current.configuration = {"promotion": {"previous_active_id": str(previous.id)}}
    session = SimpleNamespace(
        flush=AsyncMock(),
        commit=AsyncMock(),
        scalars=AsyncMock(return_value=SimpleNamespace(first=lambda: previous)),
    )
    monkeypatch.setattr(promotion, "locked_model", AsyncMock(return_value=current))
    monkeypatch.setattr(promotion, "origin", AsyncMock(return_value=None))
    audit = AsyncMock()
    monkeypatch.setattr(
        promotion, "AuditService", lambda _: SimpleNamespace(record=audit)
    )
    monkeypatch.setattr(
        promotion,
        "ModelActivationService",
        lambda: SimpleNamespace(validate=lambda _: None),
    )

    class Repo:
        def __init__(self, _):
            pass

        async def get_active_model(self, _):
            return current

        async def activate(self, identifier):
            assert identifier == previous.id
            current.status = "retired"
            previous.status = "active"

    monkeypatch.setattr(promotion, "ModelVersionRepository", Repo)
    result = await promotion.apply(
        current.id,
        promotion.Decision(
            action="rollback", reason="Errors observed in important examples"
        ),
        session,
        SimpleNamespace(id=uuid.uuid4()),
        None,
    )
    assert result["id"] == str(previous.id)
    assert previous.status == "active"
    assert promotion.record(previous)["previous_active_id"] == str(current.id)
    assert promotion.record(current)["history"][-1]["action"] == "rollback"
    assert "artifact_path" not in audit.call_args.kwargs["details"]


def test_transformer_saves_immutable_example_text(tmp_path, monkeypatch):
    from app.domain.services.transformer_training_execution import (
        TransformerTrainingExecutionService,
    )

    service = TransformerTrainingExecutionService(None)
    fake = SimpleNamespace(
        split="validation",
        labels=["negative"],
        predicted_labels=["positive"],
        probabilities=[[0.2, 0.8]],
    )

    def evaluate(**kwargs):
        return SimpleNamespace(**{**vars(fake), "split": kwargs["split_name"]})

    monkeypatch.setattr(service, "_evaluate_split", evaluate)
    components = SimpleNamespace(
        configuration={"dataset_version_id": "d"},
        datasets=SimpleNamespace(
            validation=None,
            test=None,
            id_to_label={0: "negative", 1: "positive"},
            evidence_texts={"validation": ["bad"], "test": ["bad"]},
            evidence_sources={"validation": ["reviews"], "test": ["reviews"]},
        ),
        paths={"workspace": tmp_path, "training_log": tmp_path / "log"},
        trainer=None,
    )
    service.evaluate_and_generate_predictions(components=components)
    saved = json.loads((tmp_path / "metrics" / "test_evidence.json").read_text())
    assert saved["rows"][0]["text"] == "bad"
    assert saved["rows"][0]["source"] == "reviews"
    assert saved["rows"][0]["probabilities"]["positive"] == 0.8
