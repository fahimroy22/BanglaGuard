from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import require_researcher_or_admin
from app.db.models import (
    DatasetVersion,
    Experiment,
    Feedback,
    ModelVersion,
    Prediction,
    User,
)
from app.db.session import get_db_session
from app.domain.enums import AnalysisTask
from app.domain.services.dataset_export import DatasetExportError, DatasetExportService
from app.domain.services.prediction_research import ResearchStore
from app.domain.services.research_loop import LoopStore, decision, text_key
from app.schemas.dataset_export import DatasetExportCreate, DatasetExportRead

router = APIRouter(
    prefix="/research-loop",
    tags=["Research projects"],
    dependencies=[Depends(require_researcher_or_admin)],
)
Session = Annotated[AsyncSession, Depends(get_db_session)]
Actor = Annotated[User, Depends(require_researcher_or_admin)]


class ProjectInput(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    task: AnalysisTask
    question: str = Field(default="", max_length=3000)
    guidelines: str = Field(min_length=10, max_length=10000)
    threshold: int = Field(default=50, ge=1, le=500)
    members: list[uuid.UUID] = Field(default_factory=list, max_length=50)


class LinkInput(BaseModel):
    kind: Literal["dataset", "experiment", "model", "suite", "feedback", "comparison"]
    resource_id: uuid.UUID
    other_id: uuid.UUID | None = None


class NoteInput(BaseModel):
    title: str = Field(min_length=1, max_length=150)
    body: str = Field(min_length=1, max_length=20000)
    kind: Literal["note", "report"] = "note"


class Assignment(BaseModel):
    feedback_id: uuid.UUID
    reviewers: list[uuid.UUID] = Field(min_length=2, max_length=5)


class Vote(BaseModel):
    label: str | None = Field(default=None, max_length=100)
    note: str = Field(min_length=3, max_length=2000)


class ExportInput(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    version: str = Field(min_length=1, max_length=50)


def project(identifier, actor, owner=False):
    value = LoopStore().get("projects", identifier)
    if not value or (
        str(actor.role) != "admin"
        and str(actor.id) not in [value["owner"], *value["members"]]
    ):
        raise HTTPException(404, "Project not found")
    if owner and str(actor.role) != "admin" and value["owner"] != str(actor.id):
        raise HTTPException(
            403,
            "Only the project owner or an admin can manage assignments and membership",
        )
    return value


async def validate_members(session, ids):
    for identifier in ids:
        user = await session.get(User, identifier)
        if (
            not user
            or not user.is_active
            or str(user.role) not in {"admin", "researcher"}
        ):
            raise HTTPException(422, "Choose active researchers or admins")


@router.get("/reviewers")
async def reviewers(session: Session, actor: Actor):
    users = (await session.scalars(select(User).where(User.is_active.is_(True)))).all()
    return [
        {"id": str(u.id), "name": u.full_name}
        for u in users
        if str(u.role) in {"admin", "researcher"}
    ]


@router.get("/projects")
async def projects(actor: Actor):
    return [
        p
        for p in LoopStore().all("projects")
        if str(actor.role) == "admin" or str(actor.id) in [p["owner"], *p["members"]]
    ]


@router.post("/projects", status_code=201)
async def create_project(payload: ProjectInput, session: Session, actor: Actor):
    await validate_members(session, payload.members)
    return LoopStore().create(
        "projects",
        {
            **payload.model_dump(mode="json"),
            "owner": str(actor.id),
            "links": [],
            "notes": [],
        },
    )


@router.post("/projects/{identifier}/notes")
async def add_note(identifier: uuid.UUID, payload: NoteInput, actor: Actor):
    project(identifier, actor)
    note = {
        **payload.model_dump(),
        "id": str(uuid.uuid4()),
        "by": str(actor.id),
        "at": datetime.now(timezone.utc).isoformat(),
    }
    return LoopStore().change("projects", identifier, lambda p: p["notes"].append(note))


async def resource(session, actor, kind, identifier, task):
    if kind == "suite":
        value = ResearchStore().suite(identifier)
        if not value or (
            value["owner"] != str(actor.id) and str(actor.role) != "admin"
        ):
            raise HTTPException(404, "Only your own saved suites can be linked")
        if value["payload"]["task"] != task:
            raise HTTPException(422, "The test suite has another task")
        return value["name"], "/prediction"
    cls = {
        "dataset": DatasetVersion,
        "experiment": Experiment,
        "model": ModelVersion,
        "comparison": ModelVersion,
        "feedback": Feedback,
    }[kind]
    value = await session.get(cls, identifier)
    if not value:
        raise HTTPException(404, "Resource not found")
    if kind == "feedback":
        prediction = await session.get(Prediction, value.prediction_id)
        actual_task = str(prediction.task)
        name, href = f"Feedback · {str(value.id)[:8]}", "/feedback"
    elif kind == "experiment":
        dataset = await session.get(DatasetVersion, value.dataset_version_id)
        actual_task = str(dataset.task)
        name, href = value.name, f"/experiments/{value.id}"
    else:
        actual_task = str(value.task)
        name = f"{value.name} · v{value.version}"
        href = f"/datasets/{value.id}" if kind == "dataset" else "/models"
    if actual_task != task:
        raise HTTPException(422, "Resources must match the project task")
    return name, href


@router.post("/projects/{identifier}/links")
async def link(
    identifier: uuid.UUID, payload: LinkInput, session: Session, actor: Actor
):
    p = project(identifier, actor)
    name, href = await resource(
        session, actor, payload.kind, payload.resource_id, p["task"]
    )
    if payload.kind == "comparison":
        if not payload.other_id or payload.other_id == payload.resource_id:
            raise HTTPException(422, "Choose two different models")
        other, _ = await resource(session, actor, "model", payload.other_id, p["task"])
        name += " versus " + other
    item = {**payload.model_dump(mode="json"), "name": name, "href": href}

    def add(value):
        if not any(
            l["kind"] == item["kind"]
            and l["resource_id"] == item["resource_id"]
            and l.get("other_id") == item["other_id"]
            for l in value["links"]
        ):
            value["links"].append(item)

    return LoopStore().change("projects", identifier, add)


@router.get("/catalog")
async def catalog(session: Session, actor: Actor, task: AnalysisTask):
    result = []
    for kind, cls in [
        ("dataset", DatasetVersion),
        ("model", ModelVersion),
        ("experiment", Experiment),
    ]:
        rows = (
            await session.scalars(
                select(cls).order_by(cls.created_at.desc()).limit(500)
            )
        ).all()
        for row in rows:
            if kind == "experiment":
                dataset = await session.get(DatasetVersion, row.dataset_version_id)
                matches = dataset and dataset.task == task
            else:
                matches = row.task == task
            if matches:
                result.append({"kind": kind, "id": str(row.id), "name": row.name})
    for suite in ResearchStore().suites(actor.id, str(actor.role) == "admin"):
        if suite["payload"]["task"] == str(task):
            result.append({"kind": "suite", "id": suite["id"], "name": suite["name"]})
    feedback = (
        await session.scalars(
            select(Feedback).order_by(Feedback.created_at.desc()).limit(500)
        )
    ).all()
    for f in feedback:
        prediction = await session.get(Prediction, f.prediction_id)
        if prediction and prediction.task == task:
            result.append(
                {
                    "kind": "feedback",
                    "id": str(f.id),
                    "name": (
                        prediction.input_text
                        or prediction.normalized_text
                        or "Text not retained"
                    )[:120],
                }
            )
    return result


@router.post("/projects/{identifier}/assign")
async def assign(
    identifier: uuid.UUID, payload: Assignment, session: Session, actor: Actor
):
    p = project(identifier, actor, owner=True)
    ids = list(dict.fromkeys(str(i) for i in payload.reviewers))
    if len(ids) < 2 or any(i not in [p["owner"], *p["members"]] for i in ids):
        raise HTTPException(422, "Choose at least two distinct project members")
    await validate_members(session, payload.reviewers)
    feedback = (
        await session.scalars(
            select(Feedback).where(Feedback.id == payload.feedback_id).with_for_update()
        )
    ).first()
    if not feedback:
        raise HTTPException(404, "Feedback not found")
    if str(feedback.user_id) in ids:
        raise HTTPException(
            422, "The feedback author cannot review their own correction"
        )
    prediction = await session.get(Prediction, feedback.prediction_id)
    if str(prediction.task) != p["task"] or not (
        prediction.input_text or prediction.normalized_text
    ):
        raise HTTPException(422, "Feedback needs retained text and the same task")
    if str(feedback.status) != "pending" or LoopStore().get("reviews", feedback.id):
        raise HTTPException(409, "Only unassigned pending feedback can be assigned")
    review = LoopStore().create(
        "reviews",
        {
            "project_id": str(identifier),
            "reviewers": ids,
            "votes": {},
            "resolution": None,
            "guidelines": p["guidelines"],
            "labels": list((prediction.probabilities or {}).keys()),
            "text": prediction.input_text or prediction.normalized_text,
            "prediction_id": str(prediction.id),
        },
        feedback.id,
    )
    await session.commit()
    await link(
        identifier, LinkInput(kind="feedback", resource_id=feedback.id), session, actor
    )
    return review


async def sync_review(session, feedback, review, actor):
    outcome = decision(review)
    feedback.status = (
        "reviewed"
        if outcome["state"] == "accepted"
        else "rejected"
        if outcome["state"] == "rejected"
        else "pending"
    )
    if outcome["state"] in {"accepted", "rejected"}:
        if outcome["label"]:
            feedback.verdict = "incorrect"
            feedback.corrected_label = outcome["label"]
        feedback.reviewed_by_id = actor.id
        feedback.reviewer_note = "Independent review: " + outcome["state"]
        feedback.reviewed_at = datetime.now(timezone.utc)
    await session.commit()


@router.post("/reviews/{identifier}/vote")
async def vote(identifier: uuid.UUID, payload: Vote, session: Session, actor: Actor):
    review = LoopStore().get("reviews", identifier)
    if not review:
        raise HTTPException(404, "Assignment not found")
    project(review["project_id"], actor)
    if payload.label is not None and payload.label not in review["labels"]:
        raise HTTPException(
            422, "Choose one of the recorded labels, or reject the example"
        )
    feedback = (
        await session.scalars(
            select(Feedback).where(Feedback.id == identifier).with_for_update()
        )
    ).first()
    if not feedback:
        raise HTTPException(404, "Feedback not found")
    try:
        updated = LoopStore().vote(
            str(identifier), str(actor.id), payload.label, payload.note
        )
    except PermissionError as exc:
        raise HTTPException(403, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    await sync_review(session, feedback, updated, actor)
    return {"state": decision(updated)["state"]}


@router.post("/reviews/{identifier}/resolve")
async def resolve(identifier: uuid.UUID, payload: Vote, session: Session, actor: Actor):
    if str(actor.role) != "admin":
        raise HTTPException(403, "An admin must adjudicate disagreements")
    review = LoopStore().get("reviews", identifier)
    if not review:
        raise HTTPException(404, "Assignment not found")
    if len(payload.note.strip()) < 10 or (
        payload.label is not None and payload.label not in review["labels"]
    ):
        raise HTTPException(
            422,
            "Choose a valid label and explain the decision in at least 10 characters",
        )
    feedback = (
        await session.scalars(
            select(Feedback).where(Feedback.id == identifier).with_for_update()
        )
    ).first()
    if not feedback:
        raise HTTPException(404, "Feedback not found")
    try:
        updated = LoopStore().resolve(
            str(identifier), str(actor.id), payload.label, payload.note
        )
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    await sync_review(session, feedback, updated, actor)
    return {"state": decision(updated)["state"]}


async def details(identifier, session, actor):
    p = project(identifier, actor)
    reviews = [
        r for r in LoopStore().all("reviews") if r["project_id"] == str(identifier)
    ]
    exports = (await session.scalars(select(DatasetVersion))).all()
    included = {
        fid
        for e in exports
        for fid in (e.preprocessing_config or {}).get("included_feedback_ids", [])
    }
    ready = []
    output = []
    for r in reviews:
        state = decision(r)
        f = await session.get(Feedback, uuid.UUID(r["id"]))
        if (
            state["state"] == "accepted"
            and f
            and str(f.status) == "reviewed"
            and r["id"] not in included
        ):
            ready.append(r)
        traces = [
            {"dataset_id": str(e.id), "name": e.name, "version": e.version}
            for e in exports
            if r["id"]
            in (e.preprocessing_config or {}).get("included_feedback_ids", [])
        ]
        # Hide others' votes until this reviewer has submitted their independent annotation.
        visible = (
            str(actor.role) == "admin"
            or str(actor.id) in r["votes"]
            or state["state"] in {"accepted", "rejected"}
        )
        output.append(
            {
                **r,
                "votes": r["votes"] if visible else {},
                "completed": len(r["votes"]),
                "state": state["state"],
                "final_label": state["label"],
                "sync_required": bool(
                    f
                    and state["state"] in {"accepted", "rejected"}
                    and str(f.status)
                    != ("reviewed" if state["state"] == "accepted" else "rejected")
                ),
                "datasets": traces,
            }
        )
    prior_keys = {
        key
        for e in exports
        for key in (e.preprocessing_config or {}).get("text_fingerprints", [])
    }
    ready = [r for r in ready if text_key(r["text"]) not in prior_keys]
    labels_by_text = {}
    for r in ready:
        labels_by_text.setdefault(text_key(r["text"]), set()).add(decision(r)["label"])
    unique_ready = sum(len(labels) == 1 for labels in labels_by_text.values())
    action = {
        "label": "Link a dataset or collect reviewed feedback",
        "href": "/datasets",
    }
    for item in p["links"]:
        if item["kind"] == "dataset":
            d = await session.get(DatasetVersion, uuid.UUID(item["resource_id"]))
            if d:
                action = {
                    "label": "Check dataset readiness → Create baseline experiment",
                    "href": f"/experiments/new?datasetId={d.id}",
                }
        if item["kind"] == "experiment":
            e = await session.get(Experiment, uuid.UUID(item["resource_id"]))
            if e and str(e.status) == "completed":
                action = {
                    "label": "Training completed → Review errors",
                    "href": f"/experiments/{e.id}",
                }
    for item in p["links"]:
        if item["kind"] == "model":
            m = await session.get(ModelVersion, uuid.UUID(item["resource_id"]))
            if (
                m
                and (m.configuration or {}).get("promotion", {}).get("stage")
                == "evaluated"
            ):
                action = {
                    "label": "Candidate evaluated → Request activation",
                    "href": "/models",
                }
    progress = [
        {
            "id": member,
            "assigned": sum(member in r["reviewers"] for r in reviews),
            "completed": sum(member in r["votes"] for r in reviews),
        }
        for member in dict.fromkeys([p["owner"], *p["members"]])
    ]
    return {
        **p,
        "reviews": output,
        "progress": progress,
        "ready_count": unique_ready,
        "ready_ids": [r["id"] for r in ready],
        "notification": unique_ready >= p["threshold"],
        "next_action": action,
    }


@router.get("/projects/{identifier}")
async def get_project(identifier: uuid.UUID, session: Session, actor: Actor):
    return await details(identifier, session, actor)


@router.get("/notifications")
async def notifications(session: Session, actor: Actor):
    result = []
    for p in await projects(actor):
        detail = await details(p["id"], session, actor)
        if detail["notification"]:
            result.append(
                {
                    "id": p["id"],
                    "name": p["name"],
                    "count": detail["ready_count"],
                    "threshold": p["threshold"],
                }
            )
    return result


@router.post("/projects/{identifier}/dataset")
async def create_dataset(
    identifier: uuid.UUID, payload: ExportInput, session: Session, actor: Actor
):
    p = await details(identifier, session, actor)
    if not p["ready_ids"]:
        raise HTTPException(409, "No unused accepted feedback is ready")
    try:
        export = await DatasetExportService(session).create_export(
            payload=DatasetExportCreate(
                name=payload.name,
                version=payload.version,
                task=p["task"],
                selected_feedback_ids=p["ready_ids"][:500],
                configuration={
                    "research_project_id": str(identifier),
                    "intended_use": "training_pool",
                },
            ),
            created_by_id=actor.id,
        )
    except (DatasetExportError, ValueError) as exc:
        raise HTTPException(409, str(exc)) from exc
    await link(
        identifier,
        LinkInput(kind="dataset", resource_id=export.dataset_version_id),
        session,
        actor,
    )
    return DatasetExportRead.model_validate(export)


@router.post("/reviews/{identifier}/sync")
async def repair_sync(identifier: uuid.UUID, session: Session, actor: Actor):
    review = LoopStore().get("reviews", identifier)
    if not review:
        raise HTTPException(404, "Assignment not found")
    project(review["project_id"], actor)
    if str(actor.role) != "admin" and str(actor.id) not in review["reviewers"]:
        raise HTTPException(
            403, "Only an assigned reviewer or admin can restore a saved decision"
        )
    if decision(review)["state"] not in {"accepted", "rejected"}:
        raise HTTPException(409, "Review is not final")
    feedback = (
        await session.scalars(
            select(Feedback).where(Feedback.id == identifier).with_for_update()
        )
    ).first()
    if not feedback:
        raise HTTPException(404, "Feedback not found")
    await sync_review(session, feedback, review, actor)
    return {"state": decision(review)["state"]}
