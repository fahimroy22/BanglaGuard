import json
from pathlib import Path

import pytest
from app.domain.services.dataset_research import (
    analyze,
    prepare,
    preview,
    read_csv,
    text_group,
    write_version,
)
from app.schemas.dataset_research import Preparation, ResearchSource


def row(i, text="sample", label="positive", split="train", group=""):
    return {
        "id": f"{split}:{i}",
        "row_number": i,
        "split": split,
        "text": text,
        "label": label,
        "source_label": label,
        "group": group,
    }


def corpus():
    return [
        row(
            i,
            f"উদাহরণ {i}",
            ["positive", "negative", "neutral"][i % 3],
            ["train", "validation", "test"][i // 30],
        )
        for i in range(90)
    ]


def test_exact_overlap_and_conflicts_are_distinct_from_processed_copy():
    records = [
        row(2, "  ভালো  কাজ ", "positive"),
        row(3, "ভালো কাজ", "negative", "test"),
        row(4, "", "neutral"),
    ]
    report, flags = analyze(records, "sentiment")
    assert report["total_rows"] == 3
    assert len(report["conflicts"]) == 1
    assert "overlap" in flags["train:2"]
    assert "conflicts" in flags["test:3"]
    assert "empty_text" in flags["train:4"]
    assert not report["training_ready"]


def test_unseen_evaluation_label_blocks_readiness():
    report, _ = analyze(
        [
            row(2, label="positive"),
            row(3, label="negative"),
            row(4, label="neutral", split="test"),
        ],
        "sentiment",
    )
    assert (
        next(c for c in report["checks"] if c["key"] == "invalid_labels")["count"] == 1
    )


def test_conflict_dedup_requires_explicit_decision():
    records = corpus() + [row(100, "same", "positive"), row(101, "same", "negative")]
    result, changes, errors, _ = prepare(
        records, Preparation(drop_duplicates=True), "sentiment"
    )
    assert len(result) == len(records)
    assert any("conflicting" in e for e in errors)
    decision = {text_group("same"): "negative"}
    result, changes, errors, _ = prepare(
        records, Preparation(drop_duplicates=True, conflicts=decision), "sentiment"
    )
    assert not errors
    assert [(r["text"], r["label"]) for r in result if r["text"] == "same"] == [
        ("same", "negative")
    ]
    assert len(changes) == 2


def test_preservation_keeps_membership_and_does_not_mutate_source():
    records = corpus() + [
        row(100, " repeated ", "positive"),
        row(101, "repeated", "positive", "test"),
    ]
    original = json.dumps(records)
    prepared, changes, errors, _ = prepare(
        records, Preparation(trim_whitespace=True, drop_duplicates=True), "sentiment"
    )
    assert not errors
    assert json.dumps(records) == original
    assert {r["id"]: r["split"] for r in prepared} == {
        r["id"]: r["split"] for r in records
    }
    assert len(changes) == 1


def test_grouped_splitting_is_reproducible_and_keeps_groups_together():
    records = [
        row(i, f"text {i}", ["positive", "negative"][i % 2], "unsplit", str(i // 3))
        for i in range(120)
    ]
    config = Preparation(split_strategy="grouped")
    a, _, errors, _ = prepare(records, config, "sentiment")
    b, _, _, _ = prepare(records, config, "sentiment")
    assert not errors
    assert a == b
    for group in {r["group"] for r in a}:
        assert len({r["split"] for r in a if r["group"] == group}) == 1


def test_stratified_splits_and_small_class_failure():
    result, _, errors, _ = prepare(
        [dict(r, split="unsplit") for r in corpus()],
        Preparation(split_strategy="stratified"),
        "sentiment",
    )
    assert not errors
    assert len(result) == 90
    assert all(
        {r["label"] for r in result if r["split"] == s}
        == {"positive", "negative", "neutral"}
        for s in ["train", "validation", "test"]
    )
    _, _, errors, _ = prepare(
        [row(1), row(2, label="negative")],
        Preparation(split_strategy="stratified"),
        "sentiment",
    )
    assert errors


def test_preview_token_changes_with_data_and_options():
    records = corpus()
    a, _, _ = preview(records, Preparation(), "sentiment")
    b, _, _ = preview(records, Preparation(trim_whitespace=True), "sentiment")
    records[0]["text"] = "changed"
    c, _, _ = preview(records, Preparation(), "sentiment")
    assert len({a["token"], b["token"], c["token"]}) == 3


def test_nonoverlapping_removal_counts_and_report(tmp_path):
    records = corpus() + [row(100, "", ""), row(101, "\ufffd", "positive")]
    config = Preparation(drop_empty=True, drop_replacement=True)
    report, result, changes = preview(records, config, "sentiment")
    assert report["removed_rows"] == 2
    directory = tmp_path / "version"
    write_version(
        directory, records, result, changes, report["report"], config, "parent", {}
    )
    saved = json.loads((directory / "change-report.json").read_text())
    assert len(saved["changes"]) == 2
    assert len(saved["provenance"]) == 90
    assert json.loads((directory / "source-snapshot.json").read_text()) == records
    assert len(read_csv(directory / "processed.csv")[1]) == 90


def test_near_duplicate_search_finds_modified_sentence():
    a = "এই সেবার মান সত্যিই অনেক ভালো এবং আমি খুব আনন্দিত"
    report, flags = analyze([row(2, a), row(3, a + "।")], "sentiment")
    assert report["near_pairs"]
    assert "near_duplicates" in flags["train:2"]
    assert report["near_coverage"]["examined"] == 2


def test_csv_preserves_literal_na_and_rejects_malformed(tmp_path):
    path = tmp_path / "source.csv"
    path.write_text("text,label\nNA,neutral\n", encoding="utf8")
    assert read_csv(path)[1][0]["text"] == "NA"
    path.write_text("text,label\nhello,positive,extra\n")
    with pytest.raises(ValueError):
        read_csv(path)


def test_source_and_split_validation():
    with pytest.raises(ValueError):
        ResearchSource()
    with pytest.raises(ValueError):
        Preparation(train_fraction=0.9, validation_fraction=0.2)


@pytest.fixture
def api_client(monkeypatch, tmp_path):
    import uuid
    from types import SimpleNamespace
    from unittest.mock import AsyncMock

    from app.api.dependencies import get_current_user
    from app.api.v1 import dataset_research as routes
    from app.db.session import get_db_session
    from app.domain.enums import UserRole
    from app.domain.services import platform_policy
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    actor = SimpleNamespace(id=uuid.uuid4(), role=UserRole.RESEARCHER)
    session = SimpleNamespace(
        execute=AsyncMock(),
        rollback=AsyncMock(),
        flush=AsyncMock(),
        refresh=AsyncMock(),
    )
    app = FastAPI()
    app.include_router(routes.router)
    app.dependency_overrides[get_current_user] = lambda: actor
    app.dependency_overrides[get_db_session] = lambda: session
    monkeypatch.setattr(
        platform_policy,
        "load_policy",
        AsyncMock(return_value=platform_policy.PlatformPolicy()),
    )
    monkeypatch.setattr(routes, "UPLOAD_ROOT", tmp_path / "uploads")
    return TestClient(app), actor, routes, session


def upload_csv(client):
    content = "text,label\n" + "".join(
        f"example {i},{['positive', 'negative', 'neutral'][i % 3]}\n" for i in range(90)
    )
    response = client.post(
        "/dataset-research/upload", files=[("files", ("data.csv", content, "text/csv"))]
    )
    assert response.status_code == 200, response.text
    return {
        "upload_id": response.json()["upload_id"],
        "task": "sentiment",
        "text_column": "text",
        "label_column": "label",
    }


def test_upload_ownership_and_default_user_permissions(api_client):
    import uuid

    from app.domain.enums import UserRole

    client, actor, _, _ = api_client
    source = upload_csv(client)
    assert (
        client.post("/dataset-research/analysis", json={"source": source}).status_code
        == 200
    )
    actor.id = uuid.uuid4()
    assert (
        client.post("/dataset-research/analysis", json={"source": source}).status_code
        == 404
    )
    actor.role = UserRole.USER
    assert (
        client.post("/dataset-research/analysis", json={"source": source}).status_code
        == 403
    )
    assert (
        client.post("/dataset-research/preview", json={"source": source}).status_code
        == 403
    )
    assert (
        client.post(
            "/dataset-research/upload",
            files=[("files", ("a.csv", "text,label\nx,positive\n"))],
        ).status_code
        == 403
    )


def test_stale_preview_rejected_before_any_database_write(api_client):
    client, _, _, session = api_client
    source = upload_csv(client)
    body = {"source": source, "preparation": {"split_strategy": "stratified"}}
    response = client.post("/dataset-research/preview", json=body)
    assert response.status_code == 200, response.text
    assert response.json()["can_register"]
    body.update(
        name="Test dataset", version="1", preview_token=response.json()["token"]
    )
    body["preparation"]["seed"] = 43
    response = client.post("/dataset-research/register", json=body)
    assert response.status_code == 409, response.text
    session.execute.assert_not_awaited()
    session.flush.assert_not_awaited()


def test_preview_full_report_and_blocking_errors(api_client):
    client, _, _, _ = api_client
    source = upload_csv(client)
    response = client.post("/dataset-research/preview", json={"source": source})
    assert response.status_code == 200
    assert not response.json()["can_register"]
    response = client.post(
        "/dataset-research/preview-report",
        json={"source": source, "preparation": {"split_strategy": "stratified"}},
    )
    assert response.status_code == 200
    assert len(response.json()["provenance"]) == 90


def test_generated_files_pass_existing_integrity_checks(tmp_path):
    from types import SimpleNamespace

    from app.domain.services.dataset_artifacts import DatasetArtifactService

    records = corpus()
    config = Preparation()
    report, prepared, changes = preview(records, config, "sentiment")
    folder = tmp_path / "research/data/processed/test"
    checksum = write_version(
        folder, records, prepared, changes, report["report"], config, None, {}
    )
    dataset = SimpleNamespace(
        id="test",
        manifest_path=str(folder / "manifest.json"),
        checksum=checksum,
        total_samples=90,
        train_samples=30,
        validation_samples=30,
        test_samples=30,
        label_schema={"labels": ["positive", "negative", "neutral"]},
    )
    result = DatasetArtifactService(root_directory=tmp_path).get_quality_report(
        dataset_version=dataset
    )
    assert result["training_ready"], result


def test_registration_persists_provenance_and_keeps_uploaded_original(
    api_client, monkeypatch, tmp_path
):
    from datetime import datetime, timezone
    from types import SimpleNamespace
    from unittest.mock import AsyncMock, Mock

    client, _actor, routes, session = api_client
    source = upload_csv(client)
    original_path = routes.UPLOAD_ROOT / source["upload_id"] / "0.csv"
    original_bytes = original_path.read_bytes()
    monkeypatch.setattr(routes, "ROOT_DIR", tmp_path)
    monkeypatch.setattr(
        routes,
        "DatasetVersionRepository",
        lambda _: SimpleNamespace(get_by_identity=AsyncMock(return_value=None)),
    )
    audit = AsyncMock()
    monkeypatch.setattr(routes, "AuditService", lambda _: SimpleNamespace(record=audit))
    session.add = Mock()

    async def refresh(record):
        record.created_at = record.updated_at = datetime.now(timezone.utc)

    session.refresh = refresh
    body = {"source": source, "preparation": {"split_strategy": "stratified"}}
    token = client.post("/dataset-research/preview", json=body).json()["token"]
    response = client.post(
        "/dataset-research/register",
        json={
            **body,
            "preview_token": token,
            "name": "Research test",
            "version": "1.0.0",
            "limitations": "Synthetic fixture",
        },
    )
    assert response.status_code == 201, response.text
    assert response.json()["total_samples"] == 90
    assert original_path.read_bytes() == original_bytes
    record = session.add.call_args.args[0]
    report = json.loads(
        Path(record.preprocessing_config["change_report_path"]).read_text()
    )
    assert len(report["provenance"]) == 90
    assert report["metadata"]["limitations"] == "Synthetic fixture"
    assert audit.await_args.kwargs["action"] == "dataset.prepared"
    assert (
        Path(record.manifest_path).parent / "originals/0.csv"
    ).read_bytes() == original_bytes
