import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.db.models import (
    Feedback,
    ModelVersion,
    Prediction,
    User,
)
from app.db.repositories.base import BaseRepository
from app.domain.services.active_learning import (
    calculate_active_learning_priority,
    calculate_probability_margin,
)


class FeedbackRepository(BaseRepository[Feedback]):
    def __init__(
        self,
        session: AsyncSession,
    ) -> None:
        super().__init__(
            Feedback,
            session,
        )

    async def get_by_prediction_and_user(
        self,
        prediction_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> Feedback | None:
        statement = select(Feedback).where(
            Feedback.prediction_id == prediction_id,
            Feedback.user_id == user_id,
        )

        result = await self.session.scalars(statement)

        return result.first()

    async def list_for_user(
        self,
        user_id: uuid.UUID,
        limit: int = 50,
        offset: int = 0,
    ) -> list[Feedback]:
        statement = (
            select(Feedback)
            .where(Feedback.user_id == user_id)
            .order_by(Feedback.created_at.desc())
            .offset(offset)
            .limit(limit)
        )

        result = await self.session.scalars(statement)

        return list(result.all())

    async def list_for_review(
        self,
        status_value: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[Feedback]:
        statement = select(Feedback)

        if status_value is not None:
            statement = statement.where(Feedback.status == status_value)

        statement = (
            statement.order_by(Feedback.created_at.desc()).offset(offset).limit(limit)
        )

        result = await self.session.scalars(statement)

        return list(result.all())

    async def list_review_items(
        self,
        status_value: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, object]]:
        statement = (
            select(
                Feedback.id,
                Feedback.prediction_id,
                Feedback.user_id,
                Feedback.reviewed_by_id,
                Feedback.verdict,
                Feedback.status,
                Feedback.corrected_label,
                Feedback.comment,
                Feedback.reviewer_note,
                Feedback.reviewed_at,
                Feedback.created_at,
                Feedback.updated_at,
                Prediction.input_text.label("prediction_text"),
                Prediction.normalized_text,
                Prediction.task,
                Prediction.predicted_label,
                Prediction.confidence,
                Prediction.model_version_id,
                ModelVersion.name.label("model_name"),
                ModelVersion.version.label("model_version"),
            )
            .join(
                Prediction,
                Prediction.id == Feedback.prediction_id,
            )
            .join(
                ModelVersion,
                ModelVersion.id == Prediction.model_version_id,
            )
        )

        if status_value is not None:
            statement = statement.where(Feedback.status == status_value)

        statement = (
            statement.order_by(Feedback.created_at.desc()).offset(offset).limit(limit)
        )

        result = await self.session.execute(statement)

        return [dict(row) for row in result.mappings().all()]

    async def list_active_learning_candidates(
        self,
        task_value: str | None = None,
        priority_level: str | None = None,
        limit: int = 50,
        offset: int = 0,
        candidate_pool: int = 1000,
    ) -> list[dict[str, object]]:
        recent_prediction_ids = (
            select(Prediction.id)
            .order_by(Prediction.created_at.desc())
            .limit(candidate_pool)
            .subquery()
        )

        statement = (
            select(
                Prediction,
                ModelVersion,
                Feedback,
            )
            .join(
                recent_prediction_ids,
                recent_prediction_ids.c.id == Prediction.id,
            )
            .join(
                ModelVersion,
                ModelVersion.id == Prediction.model_version_id,
            )
            .outerjoin(
                Feedback,
                Feedback.prediction_id == Prediction.id,
            )
        )

        if task_value is not None:
            statement = statement.where(Prediction.task == task_value)

        result = await self.session.execute(statement)

        grouped: dict[
            uuid.UUID,
            dict[str, object],
        ] = {}

        for (
            prediction,
            model_version,
            feedback,
        ) in result.all():
            candidate = grouped.get(prediction.id)

            if candidate is None:
                candidate = {
                    "prediction": prediction,
                    "model_version": model_version,
                    "feedback_items": [],
                }

                grouped[prediction.id] = candidate

            if feedback is not None:
                feedback_items = candidate["feedback_items"]

                if isinstance(
                    feedback_items,
                    list,
                ):
                    feedback_items.append(feedback)

        candidates: list[dict[str, object]] = []

        for candidate in grouped.values():
            prediction = candidate["prediction"]

            model_version = candidate["model_version"]

            feedback_items = candidate["feedback_items"]

            if not isinstance(
                feedback_items,
                list,
            ):
                feedback_items = []

            verdict_values = [
                getattr(
                    item.verdict,
                    "value",
                    str(item.verdict).lower(),
                )
                for item in feedback_items
            ]

            status_values = [
                getattr(
                    item.status,
                    "value",
                    str(item.status).lower(),
                )
                for item in feedback_items
            ]

            correct_count = verdict_values.count("correct")

            incorrect_count = verdict_values.count("incorrect")

            unsure_count = verdict_values.count("unsure")

            pending_count = status_values.count("pending")

            reviewed_count = status_values.count("reviewed")

            rejected_count = status_values.count("rejected")

            (
                priority_score,
                calculated_level,
                selection_reasons,
            ) = calculate_active_learning_priority(
                confidence=(prediction.confidence),
                probabilities=(prediction.probabilities),
                correct_count=(correct_count),
                incorrect_count=(incorrect_count),
                unsure_count=(unsure_count),
                pending_count=(pending_count),
                reviewed_count=(reviewed_count),
                rejected_count=(rejected_count),
            )

            if priority_level is not None and calculated_level != priority_level:
                continue

            task_name = getattr(
                prediction.task,
                "value",
                str(prediction.task).lower(),
            )

            status_name = getattr(
                prediction.status,
                "value",
                str(prediction.status).lower(),
            )

            candidates.append(
                {
                    "prediction_id": (prediction.id),
                    "user_id": (prediction.user_id),
                    "task": task_name,
                    "status": status_name,
                    "prediction_text": (prediction.input_text),
                    "normalized_text": (prediction.normalized_text),
                    "predicted_label": (prediction.predicted_label),
                    "confidence": (prediction.confidence),
                    "probabilities": (prediction.probabilities),
                    "model_version_id": (model_version.id),
                    "model_name": (model_version.name),
                    "model_version": (model_version.version),
                    "priority_score": (priority_score),
                    "priority_level": (calculated_level),
                    "selection_reasons": (selection_reasons),
                    "probability_margin": (
                        calculate_probability_margin(prediction.probabilities)
                    ),
                    "feedback": {
                        "total": len(feedback_items),
                        "correct": (correct_count),
                        "incorrect": (incorrect_count),
                        "unsure": (unsure_count),
                        "pending": (pending_count),
                        "reviewed": (reviewed_count),
                        "rejected": (rejected_count),
                    },
                    "created_at": (prediction.created_at),
                }
            )

        candidates.sort(
            key=lambda item: (
                float(item["priority_score"]),
                str(item["created_at"]),
            ),
            reverse=True,
        )

        return candidates[offset : offset + limit]

    async def list_dataset_builder_items(
        self,
        task_value: str | None = None,
        status_value: str | None = None,
        final_label: str | None = None,
        reviewer_id: uuid.UUID | None = None,
        model_version_id: uuid.UUID | None = None,
        reviewed_from: object | None = None,
        reviewed_to: object | None = None,
        ready_only: bool = False,
        feedback_ids: list[uuid.UUID] | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> dict[str, object]:
        reviewer = aliased(User)

        statement = (
            select(
                Feedback.id.label("feedback_id"),
                Feedback.prediction_id,
                Feedback.user_id.label("feedback_user_id"),
                Feedback.reviewed_by_id,
                Feedback.verdict,
                Feedback.status.label("feedback_status"),
                Feedback.corrected_label,
                Feedback.comment.label("user_comment"),
                Feedback.reviewer_note,
                Feedback.reviewed_at,
                Feedback.created_at.label("feedback_created_at"),
                Prediction.input_text.label("text"),
                Prediction.normalized_text,
                Prediction.task,
                Prediction.predicted_label,
                Prediction.confidence,
                Prediction.probabilities,
                Prediction.created_at.label("prediction_created_at"),
                Prediction.model_version_id,
                ModelVersion.name.label("model_name"),
                ModelVersion.version.label("model_version"),
                reviewer.full_name.label("reviewer_name"),
                reviewer.email.label("reviewer_email"),
            )
            .join(
                Prediction,
                Prediction.id == Feedback.prediction_id,
            )
            .join(
                ModelVersion,
                ModelVersion.id == Prediction.model_version_id,
            )
            .outerjoin(
                reviewer,
                reviewer.id == Feedback.reviewed_by_id,
            )
        )

        if feedback_ids is not None:
            if not feedback_ids:
                return {
                    "items": [],
                    "summary": {
                        "total_records": 0,
                        "dataset_ready": 0,
                        "needs_review": 0,
                        "correct": 0,
                        "incorrect": 0,
                        "unsure": 0,
                        "reviewed": 0,
                        "pending": 0,
                        "rejected": 0,
                        "unique_labels": [],
                        "unique_reviewers": 0,
                        "average_confidence": None,
                        "duplicate_texts": 0,
                    },
                }

            statement = statement.where(Feedback.id.in_(feedback_ids))

        if task_value is not None:
            statement = statement.where(Prediction.task == task_value)

        if status_value is not None:
            statement = statement.where(Feedback.status == status_value)

        if reviewer_id is not None:
            statement = statement.where(Feedback.reviewed_by_id == reviewer_id)

        if model_version_id is not None:
            statement = statement.where(Prediction.model_version_id == model_version_id)

        if reviewed_from is not None:
            statement = statement.where(Feedback.reviewed_at >= reviewed_from)

        if reviewed_to is not None:
            statement = statement.where(Feedback.reviewed_at <= reviewed_to)

        statement = statement.order_by(
            Feedback.reviewed_at.desc().nulls_last(),
            Feedback.created_at.desc(),
        )

        result = await self.session.execute(statement)

        prepared_items: list[dict[str, object]] = []

        for row in result.mappings().all():
            item = dict(row)

            verdict_value = getattr(
                item["verdict"],
                "value",
                str(item["verdict"]).lower(),
            )

            status_name = getattr(
                item["feedback_status"],
                "value",
                str(item["feedback_status"]).lower(),
            )

            task_name = getattr(
                item["task"],
                "value",
                str(item["task"]).lower(),
            )

            predicted_label = str(item["predicted_label"])

            corrected_label_value = item["corrected_label"]

            final_label_value: str | None

            if verdict_value == "correct":
                final_label_value = predicted_label
            elif verdict_value == "incorrect" and corrected_label_value:
                final_label_value = str(corrected_label_value)
            else:
                final_label_value = None

            readiness_reasons: list[str] = []

            text_value = item["text"] or item["normalized_text"]

            if status_name != "reviewed":
                readiness_reasons.append("feedback_not_reviewed")

            if verdict_value == "unsure":
                readiness_reasons.append("uncertain_verdict")

            if verdict_value == "incorrect" and not corrected_label_value:
                readiness_reasons.append("missing_corrected_label")

            if not final_label_value:
                readiness_reasons.append("missing_final_label")

            if not text_value:
                readiness_reasons.append("missing_text")

            if item["reviewed_by_id"] is None:
                readiness_reasons.append("missing_reviewer")

            is_dataset_ready = len(readiness_reasons) == 0

            if ready_only and not is_dataset_ready:
                continue

            if final_label is not None and final_label_value != final_label:
                continue

            item["verdict"] = verdict_value

            item["feedback_status"] = status_name

            item["task"] = task_name

            item["final_label"] = final_label_value

            item["is_dataset_ready"] = is_dataset_ready

            item["readiness_reasons"] = readiness_reasons

            prepared_items.append(item)

        total_records = len(prepared_items)

        dataset_ready = sum(1 for item in prepared_items if item["is_dataset_ready"])

        confidence_values = [float(item["confidence"]) for item in prepared_items]

        final_labels = sorted(
            {str(item["final_label"]) for item in prepared_items if item["final_label"]}
        )

        reviewer_ids = {
            item["reviewed_by_id"] for item in prepared_items if item["reviewed_by_id"]
        }

        normalized_text_counts: dict[
            str,
            int,
        ] = {}

        for item in prepared_items:
            text_value = str(item["normalized_text"] or item["text"] or "").strip()

            if not text_value:
                continue

            normalized_text_counts[text_value] = (
                normalized_text_counts.get(
                    text_value,
                    0,
                )
                + 1
            )

        duplicate_texts = sum(
            count - 1 for count in normalized_text_counts.values() if count > 1
        )

        summary = {
            "total_records": (total_records),
            "dataset_ready": (dataset_ready),
            "needs_review": (total_records - dataset_ready),
            "correct": sum(
                1 for item in prepared_items if item["verdict"] == "correct"
            ),
            "incorrect": sum(
                1 for item in prepared_items if item["verdict"] == "incorrect"
            ),
            "unsure": sum(1 for item in prepared_items if item["verdict"] == "unsure"),
            "reviewed": sum(
                1 for item in prepared_items if item["feedback_status"] == "reviewed"
            ),
            "pending": sum(
                1 for item in prepared_items if item["feedback_status"] == "pending"
            ),
            "rejected": sum(
                1 for item in prepared_items if item["feedback_status"] == "rejected"
            ),
            "unique_labels": (final_labels),
            "unique_reviewers": len(reviewer_ids),
            "average_confidence": (
                round(
                    sum(confidence_values) / len(confidence_values),
                    6,
                )
                if confidence_values
                else None
            ),
            "duplicate_texts": (duplicate_texts),
        }

        paginated_items = prepared_items[offset : offset + limit]

        return {
            "items": paginated_items,
            "summary": summary,
        }
