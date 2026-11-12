import uuid
from types import SimpleNamespace

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.api.dependencies import get_current_user
from app.api.v1 import research_loop as api
from app.db.session import get_db_session
from app.domain.enums import UserRole
from app.domain.services.research_loop import (
    LoopStore,
    decision,
    filter_export,
    text_key,
)


@pytest.fixture
def store(tmp_path, monkeypatch):
    monkeypatch.setenv("BANGLAGUARD_LOOP_ROOT", str(tmp_path))
    return LoopStore()


def assignment(store):
    return store.create(
        "reviews", {"reviewers": ["a", "b"], "votes": {}, "resolution": None}
    )


def test_independent_votes_disagreement_and_immutable_adjudication(store):
    r = assignment(store)
    with pytest.raises(PermissionError):
        store.vote(r["id"], "outsider", "positive", "reason")
    assert (
        decision(store.vote(r["id"], "a", "positive", "reason"))["state"] == "assigned"
    )
    with pytest.raises(ValueError):
        store.resolve(r["id"], "admin", "positive", "reason")
    assert (
        decision(store.vote(r["id"], "b", "negative", "reason"))["state"]
        == "disagreement"
    )
    result = store.resolve(r["id"], "admin", "negative", "Adjudicated with guidelines")
    assert decision(result) == result["resolution"]
    assert result["votes"]["a"]["label"] == "positive"
    with pytest.raises(ValueError):
        store.vote(r["id"], "a", "negative", "change")
    assert LoopStore().get("reviews", r["id"])["resolution"]["label"] == "negative"


def test_unanimous_rejection_and_acceptance(store):
    for label, state in [(None, "rejected"), ("neutral", "accepted")]:
        r = assignment(store)
        store.vote(r["id"], "a", label, "reason")
        assert decision(store.vote(r["id"], "b", label, "reason"))["state"] == state


def test_duplicate_filter_excludes_conflicts_and_prior_dataset_rows():
    rows = [
        {"feedback_id": str(i), "text": t, "final_label": l}
        for i, (t, l) in enumerate(
            [
                ("Hello world", "positive"),
                (" hello   WORLD ", "positive"),
                ("bad", "negative"),
                ("bad", "positive"),
                ("existing", "neutral"),
                ("ভালো", "positive"),
            ]
        )
    ]
    kept, skipped = filter_export(rows, {text_key("existing")})
    assert [r["text"] for r in kept] == ["Hello world", "ভালো"]
    assert len(skipped) == 4
    assert sum(r["readiness_reasons"] == ["conflicting_labels"] for r in skipped) == 2


def test_project_membership_and_owner_authorization(store):
    p = store.create("projects", {"owner": "owner", "members": ["member"]})
    assert (
        api.project(p["id"], SimpleNamespace(id="member", role="researcher"))["id"]
        == p["id"]
    )
    with pytest.raises(HTTPException) as e:
        api.project(p["id"], SimpleNamespace(id="stranger", role="researcher"))
    assert e.value.status_code == 404
    with pytest.raises(HTTPException) as e:
        api.project(
            p["id"], SimpleNamespace(id="member", role="researcher"), owner=True
        )
    assert e.value.status_code == 403
    assert api.project(p["id"], SimpleNamespace(id="admin", role="admin"), owner=True)


def test_regular_users_cannot_access_research_routes():
    app = FastAPI()
    app.include_router(api.router)
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
        id=uuid.uuid4(), role=UserRole.USER
    )
    app.dependency_overrides[get_db_session] = lambda: None
    client = TestClient(app)
    for url in [
        "/research-loop/projects",
        "/research-loop/reviewers",
        "/research-loop/notifications",
        "/research-loop/catalog?task=sentiment",
    ]:
        assert client.get(url).status_code == 403


@pytest.mark.asyncio
async def test_researcher_cannot_adjudicate(store):
    with pytest.raises(HTTPException) as e:
        await api.resolve(
            uuid.uuid4(),
            api.Vote(label="negative", note="A reason"),
            None,
            SimpleNamespace(role="researcher"),
        )
    assert e.value.status_code == 403


@pytest.mark.asyncio
async def test_export_writes_deduplicated_lineage_and_unsplit_csv(
    tmp_path, monkeypatch, store
):
    import json
    from unittest.mock import AsyncMock

    from app.db.models import DatasetVersion
    from app.domain.services import dataset_export as exports
    from app.schemas.dataset_export import DatasetExportCreate

    monkeypatch.setattr(exports, "ROOT_DIR", tmp_path)
    ids = [uuid.uuid4(), uuid.uuid4()]
    items = [
        {
            "feedback_id": identifier,
            "task": "sentiment",
            "text": "ভালো",
            "final_label": "positive",
            "is_dataset_ready": True,
        }
        for identifier in ids
    ]
    added = []

    class Session:
        bind = None
        commit = AsyncMock()
        refresh = AsyncMock()
        rollback = AsyncMock()

        def add(self, value):
            if value.id is None:
                value.id = uuid.uuid4()
            added.append(value)

        async def flush(self):
            pass

        async def scalars(self, _):
            return SimpleNamespace(all=list)

    service = exports.DatasetExportService(Session())
    service.feedback_repository = SimpleNamespace(
        list_dataset_builder_items=AsyncMock(return_value={"items": items})
    )
    result = await service.create_export(
        payload=DatasetExportCreate(
            name="New feedback",
            version="1.0",
            task="sentiment",
            selected_feedback_ids=ids,
        ),
        created_by_id=uuid.uuid4(),
    )
    assert result.exported_records == 1
    assert result.skipped_records == 1
    dataset = next(x for x in added if isinstance(x, DatasetVersion))
    assert dataset.test_samples == dataset.validation_samples == 0
    assert dataset.preprocessing_config["included_feedback_ids"] == [str(ids[0])]
    manifest = json.loads(__import__("pathlib").Path(result.manifest_path).read_text())
    assert manifest["included_feedback_ids"] == [str(ids[0])]
    assert manifest["configuration"]["duplicate_check"]["skipped"][0]["reasons"] == [
        "duplicate_text"
    ]
    assert __import__("pathlib").Path(manifest["files"]["processed"]).exists()
