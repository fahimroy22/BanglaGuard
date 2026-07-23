from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from sqlalchemy import (
    Text,
    and_,
    case,
    cast,
    func,
    select,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    Feedback,
    ModelVersion,
    Prediction,
)
from app.domain.enums import PredictionStatus


class AnalyticsRepository:
    def __init__(
        self,
        session: AsyncSession,
    ) -> None:
        self.session = session

    @staticmethod
    def _prediction_filters(
        start_at: datetime | None,
        end_at: datetime | None,
        task: str | None,
    ) -> list[Any]:
        filters: list[Any] = []

        if start_at is not None:
            filters.append(
                Prediction.created_at >= start_at
            )

        if end_at is not None:
            filters.append(
                Prediction.created_at <= end_at
            )

        if task is not None:
            filters.append(
                Prediction.task == task
            )

        return filters

    @staticmethod
    def _optional_float(
        value: Any,
        digits: int | None = None,
    ) -> float | None:
        if value is None:
            return None

        converted = float(value)

        if digits is not None:
            return round(converted, digits)

        return converted

    async def prediction_overview(
        self,
        start_at: datetime | None = None,
        end_at: datetime | None = None,
        task: str | None = None,
    ) -> dict[str, Any]:
        filters = self._prediction_filters(
            start_at=start_at,
            end_at=end_at,
            task=task,
        )

        statement = select(
            func.count(
                Prediction.id
            ).label(
                "total_predictions"
            ),
            func.count(
                case(
                    (
                        Prediction.status
                        == PredictionStatus.COMPLETED,
                        1,
                    )
                )
            ).label(
                "completed_predictions"
            ),
            func.count(
                case(
                    (
                        Prediction.status
                        == PredictionStatus.FAILED,
                        1,
                    )
                )
            ).label(
                "failed_predictions"
            ),
            func.avg(
                Prediction.confidence
            ).label(
                "average_confidence"
            ),
            func.avg(
                Prediction.latency_ms
            ).label(
                "average_latency_ms"
            ),
            func.min(
                Prediction.confidence
            ).label(
                "minimum_confidence"
            ),
            func.max(
                Prediction.confidence
            ).label(
                "maximum_confidence"
            ),
        )

        if filters:
            statement = statement.where(
                and_(*filters)
            )

        result = await self.session.execute(
            statement
        )

        row = result.one()

        return {
            "total_predictions": int(
                row.total_predictions or 0
            ),
            "completed_predictions": int(
                row.completed_predictions or 0
            ),
            "failed_predictions": int(
                row.failed_predictions or 0
            ),
            "average_confidence": (
                self._optional_float(
                    row.average_confidence,
                    digits=6,
                )
            ),
            "average_latency_ms": (
                self._optional_float(
                    row.average_latency_ms,
                    digits=3,
                )
            ),
            "minimum_confidence": (
                self._optional_float(
                    row.minimum_confidence,
                    digits=6,
                )
            ),
            "maximum_confidence": (
                self._optional_float(
                    row.maximum_confidence,
                    digits=6,
                )
            ),
        }

    async def label_distribution(
        self,
        start_at: datetime | None = None,
        end_at: datetime | None = None,
        task: str | None = None,
    ) -> list[dict[str, Any]]:
        filters = self._prediction_filters(
            start_at=start_at,
            end_at=end_at,
            task=task,
        )

        filters.append(
            Prediction.predicted_label.is_not(
                None
            )
        )

        statement = (
            select(
                Prediction.predicted_label.label(
                    "label"
                ),
                func.count(
                    Prediction.id
                ).label(
                    "count"
                ),
            )
            .where(
                and_(*filters)
            )
            .group_by(
                Prediction.predicted_label
            )
            .order_by(
                func.count(
                    Prediction.id
                ).desc()
            )
        )

        result = await self.session.execute(
            statement
        )

        rows = result.all()

        total = sum(
            int(row.count or 0)
            for row in rows
        )

        return [
            {
                "label": str(row.label),
                "count": int(
                    row.count or 0
                ),
                "percentage": round(
                    (
                        int(row.count or 0)
                        / total
                        * 100
                    )
                    if total > 0
                    else 0.0,
                    2,
                ),
            }
            for row in rows
        ]

    async def model_usage(
        self,
        start_at: datetime | None = None,
        end_at: datetime | None = None,
        task: str | None = None,
    ) -> list[dict[str, Any]]:
        filters = self._prediction_filters(
            start_at=start_at,
            end_at=end_at,
            task=task,
        )

        statement = (
            select(
                ModelVersion.id.label(
                    "model_version_id"
                ),
                ModelVersion.name.label(
                    "model_name"
                ),
                ModelVersion.architecture.label(
                    "architecture"
                ),
                func.count(
                    Prediction.id
                ).label(
                    "prediction_count"
                ),
                func.avg(
                    Prediction.confidence
                ).label(
                    "average_confidence"
                ),
                func.avg(
                    Prediction.latency_ms
                ).label(
                    "average_latency_ms"
                ),
            )
            .join(
                Prediction,
                Prediction.model_version_id
                == ModelVersion.id,
            )
        )

        if filters:
            statement = statement.where(
                and_(*filters)
            )

        statement = (
            statement
            .group_by(
                ModelVersion.id,
                ModelVersion.name,
                ModelVersion.architecture,
            )
            .order_by(
                func.count(
                    Prediction.id
                ).desc()
            )
        )

        result = await self.session.execute(
            statement
        )

        return [
            {
                "model_version_id": str(
                    row.model_version_id
                ),
                "model_name": row.model_name,
                "architecture": (
                    row.architecture
                ),
                "prediction_count": int(
                    row.prediction_count or 0
                ),
                "average_confidence": (
                    self._optional_float(
                        row.average_confidence,
                        digits=6,
                    )
                ),
                "average_latency_ms": (
                    self._optional_float(
                        row.average_latency_ms,
                        digits=3,
                    )
                ),
            }
            for row in result.all()
        ]

    async def daily_predictions(
        self,
        start_at: datetime | None = None,
        end_at: datetime | None = None,
        task: str | None = None,
        limit: int = 30,
    ) -> list[dict[str, Any]]:
        filters = self._prediction_filters(
            start_at=start_at,
            end_at=end_at,
            task=task,
        )

        prediction_date = func.date(
            Prediction.created_at
        )

        statement = select(
            prediction_date.label(
                "date"
            ),
            func.count(
                Prediction.id
            ).label(
                "prediction_count"
            ),
            func.avg(
                Prediction.confidence
            ).label(
                "average_confidence"
            ),
            func.avg(
                Prediction.latency_ms
            ).label(
                "average_latency_ms"
            ),
        )

        if filters:
            statement = statement.where(
                and_(*filters)
            )

        statement = (
            statement
            .group_by(
                prediction_date
            )
            .order_by(
                prediction_date.desc()
            )
            .limit(limit)
        )

        result = await self.session.execute(
            statement
        )

        rows = list(
            reversed(
                result.all()
            )
        )

        return [
            {
                "date": row.date,
                "prediction_count": int(
                    row.prediction_count or 0
                ),
                "average_confidence": (
                    self._optional_float(
                        row.average_confidence,
                        digits=6,
                    )
                ),
                "average_latency_ms": (
                    self._optional_float(
                        row.average_latency_ms,
                        digits=3,
                    )
                ),
            }
            for row in rows
        ]

    async def feedback_summary(
        self,
    ) -> dict[str, Any]:
        # The actual Feedback model uses `verdict`,
        # not `feedback_type`.
        #
        # Casting and lowercasing makes this work
        # whether PostgreSQL stores enum values as
        # CORRECT/INCORRECT or as lowercase strings.
        verdict_text = func.lower(
            cast(
                Feedback.verdict,
                Text,
            )
        )

        status_text = func.lower(
            cast(
                Feedback.status,
                Text,
            )
        )

        statement = select(
            func.count(
                Feedback.id
            ).label(
                "total_feedback"
            ),
            func.count(
                case(
                    (
                        verdict_text == "correct",
                        1,
                    )
                )
            ).label(
                "correct"
            ),
            func.count(
                case(
                    (
                        verdict_text
                        == "incorrect",
                        1,
                    )
                )
            ).label(
                "incorrect"
            ),
            func.count(
                case(
                    (
                        verdict_text
                        == "uncertain",
                        1,
                    )
                )
            ).label(
                "uncertain"
            ),
            func.count(
                case(
                    (
                        status_text == "pending",
                        1,
                    )
                )
            ).label(
                "pending"
            ),
            func.count(
                case(
                    (
                        status_text == "reviewed",
                        1,
                    )
                )
            ).label(
                "reviewed"
            ),
            func.count(
                case(
                    (
                        status_text == "accepted",
                        1,
                    )
                )
            ).label(
                "accepted"
            ),
            func.count(
                case(
                    (
                        status_text == "rejected",
                        1,
                    )
                )
            ).label(
                "rejected"
            ),
        )

        result = await self.session.execute(
            statement
        )

        row = result.one()

        correct = int(
            row.correct or 0
        )

        incorrect = int(
            row.incorrect or 0
        )

        evaluated = (
            correct + incorrect
        )

        agreement_rate = (
            correct
            / evaluated
            * 100
            if evaluated > 0
            else None
        )

        return {
            "total_feedback": int(
                row.total_feedback or 0
            ),
            "correct": correct,
            "incorrect": incorrect,
            "uncertain": int(
                row.uncertain or 0
            ),
            "pending": int(
                row.pending or 0
            ),
            "reviewed": int(
                row.reviewed or 0
            ),
            "accepted": int(
                row.accepted or 0
            ),
            "rejected": int(
                row.rejected or 0
            ),
            "agreement_rate": (
                round(
                    agreement_rate,
                    2,
                )
                if agreement_rate
                is not None
                else None
            ),
        }

    async def model_comparison(
        self,
    ) -> list[dict[str, Any]]:
        # PostgreSQL JSON columns cannot safely be
        # grouped directly. Cast metrics to text.
        metrics_as_text = cast(
            ModelVersion.metrics,
            Text,
        )

        verdict_text = func.lower(
            cast(
                Feedback.verdict,
                Text,
            )
        )

        statement = (
            select(
                ModelVersion.id.label(
                    "model_version_id"
                ),
                ModelVersion.name.label(
                    "model_name"
                ),
                ModelVersion.version.label(
                    "model_version"
                ),
                ModelVersion.architecture.label(
                    "architecture"
                ),
                ModelVersion.status.label(
                    "status"
                ),
                metrics_as_text.label(
                    "registered_metrics_json"
                ),
                func.count(
                    func.distinct(
                        Prediction.id
                    )
                ).label(
                    "prediction_count"
                ),
                func.avg(
                    Prediction.confidence
                ).label(
                    "average_confidence"
                ),
                func.avg(
                    Prediction.latency_ms
                ).label(
                    "average_latency_ms"
                ),
                func.count(
                    func.distinct(
                        Feedback.id
                    )
                ).label(
                    "feedback_count"
                ),
                func.count(
                    func.distinct(
                        case(
                            (
                                verdict_text
                                == "correct",
                                Feedback.id,
                            )
                        )
                    )
                ).label(
                    "correct_feedback"
                ),
                func.count(
                    func.distinct(
                        case(
                            (
                                verdict_text
                                == "incorrect",
                                Feedback.id,
                            )
                        )
                    )
                ).label(
                    "incorrect_feedback"
                ),
            )
            .outerjoin(
                Prediction,
                Prediction.model_version_id
                == ModelVersion.id,
            )
            .outerjoin(
                Feedback,
                Feedback.prediction_id
                == Prediction.id,
            )
            .group_by(
                ModelVersion.id,
                ModelVersion.name,
                ModelVersion.version,
                ModelVersion.architecture,
                ModelVersion.status,
                metrics_as_text,
            )
            .order_by(
                func.count(
                    func.distinct(
                        Prediction.id
                    )
                ).desc(),
                ModelVersion.created_at.desc(),
            )
        )

        result = await self.session.execute(
            statement
        )

        items: list[dict[str, Any]] = []

        for row in result.all():
            correct = int(
                row.correct_feedback or 0
            )

            incorrect = int(
                row.incorrect_feedback or 0
            )

            evaluated = (
                correct + incorrect
            )

            observed_accuracy = (
                correct
                / evaluated
                * 100
                if evaluated > 0
                else None
            )

            registered_metrics: dict[
                str,
                Any,
            ] = {}

            if row.registered_metrics_json:
                try:
                    decoded_metrics = json.loads(
                        row.registered_metrics_json
                    )

                    if isinstance(
                        decoded_metrics,
                        dict,
                    ):
                        registered_metrics = (
                            decoded_metrics
                        )

                except (
                    json.JSONDecodeError,
                    TypeError,
                ):
                    registered_metrics = {}

            status_value = row.status

            if hasattr(
                status_value,
                "value",
            ):
                status_value = (
                    status_value.value
                )

            items.append(
                {
                    "model_version_id": str(
                        row.model_version_id
                    ),
                    "model_name": (
                        row.model_name
                    ),
                    "model_version": (
                        row.model_version
                    ),
                    "architecture": (
                        row.architecture
                    ),
                    "status": str(
                        status_value
                    ),
                    "prediction_count": int(
                        row.prediction_count or 0
                    ),
                    "average_confidence": (
                        self._optional_float(
                            row.average_confidence,
                            digits=6,
                        )
                    ),
                    "average_latency_ms": (
                        self._optional_float(
                            row.average_latency_ms,
                            digits=3,
                        )
                    ),
                    "feedback_count": int(
                        row.feedback_count or 0
                    ),
                    "correct_feedback": (
                        correct
                    ),
                    "incorrect_feedback": (
                        incorrect
                    ),
                    "observed_feedback_accuracy": (
                        round(
                            observed_accuracy,
                            2,
                        )
                        if observed_accuracy
                        is not None
                        else None
                    ),
                    "registered_metrics": (
                        registered_metrics
                    ),
                }
            )

        return items