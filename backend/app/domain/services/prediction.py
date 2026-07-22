from time import perf_counter

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.models import Prediction, User
from app.db.repositories.model_version import (
    ModelVersionRepository,
)
from app.db.repositories.prediction import (
    PredictionRepository,
)
from app.domain.enums import PredictionStatus
from app.ml.baseline import run_baseline_prediction
from app.ml.preprocessing import preprocess_text
from app.schemas.prediction import PredictionRequest


class ActiveModelNotFoundError(Exception):
    pass


class PredictionService:
    def __init__(
        self,
        session: AsyncSession,
    ) -> None:
        self.session = session

        self.models = ModelVersionRepository(
            session
        )

        self.predictions = PredictionRepository(
            session
        )

    async def predict(
        self,
        payload: PredictionRequest,
        user: User,
    ) -> Prediction:
        if payload.model_version_id is not None:
            model_version = await self.models.get(
                payload.model_version_id
            )

            if (
                model_version is None
                or model_version.task != payload.task
            ):
                raise ActiveModelNotFoundError

        else:
            model_version = (
                await self.models.get_active_model(
                    payload.task
                )
            )

            if model_version is None:
                raise ActiveModelNotFoundError

        started_at = perf_counter()

        preprocessing_result = preprocess_text(
            payload.text
        )

        baseline_result = run_baseline_prediction(
            preprocessing_result.normalized_text,
            payload.task,
        )

        latency_ms = (
            perf_counter() - started_at
        ) * 1000

        prediction = Prediction(
            user_id=user.id,
            model_version_id=model_version.id,
            task=payload.task,
            status=PredictionStatus.COMPLETED,
            input_text=(
                payload.text
                if settings.store_prediction_text
                else None
            ),
            normalized_text=(
                preprocessing_result.normalized_text
                if settings.store_prediction_text
                else None
            ),
            language_form=(
                preprocessing_result.language_form
            ),
            predicted_label=baseline_result.label,
            confidence=baseline_result.confidence,
            probabilities=baseline_result.probabilities,
            explanation=(
                baseline_result.explanation
                if payload.include_explanation
                else None
            ),
            latency_ms=round(latency_ms, 3),
            error_message=None,
        )

        return await self.predictions.add(
            prediction
        )