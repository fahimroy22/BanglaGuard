from __future__ import annotations

from time import perf_counter
from starlette.concurrency import run_in_threadpool

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
from app.ml.classical_model import (
    ModelArtifactError,
    predict_with_classical_model,
)
from app.ml.preprocessing import preprocess_text
from app.ml.transformer_model import (
    TransformerArtifactError,
    predict_with_transformer,
)
from app.schemas.prediction import (
    BatchPredictionRequest,
    BatchPredictionResponse,
    BatchPredictionResultItem,
    PredictionRequest,
)


class ActiveModelNotFoundError(Exception):
    pass


class PredictionService:
    def __init__(
        self,
        session: AsyncSession,
    ) -> None:
        self.session = session
        self.models = ModelVersionRepository(session)
        self.predictions = PredictionRepository(session)

    async def predict(
        self,
        payload: PredictionRequest,
        user: User,
    ) -> Prediction:
        if payload.model_version_id is not None:
            model_version = await self.models.get(payload.model_version_id)

            if (
                model_version is None
                or model_version.task != payload.task
                or model_version.is_archived
            ):
                raise ActiveModelNotFoundError

        else:
            model_version = await self.models.get_active_model(payload.task)

            if model_version is None:
                raise ActiveModelNotFoundError

        if str(user.role) == "user" and str(model_version.status) != "active":
            raise ActiveModelNotFoundError(
                "Regular users can run production models only."
            )
        prediction_result, preprocessing_result, runtime = await run_in_threadpool(
            infer_for_model, model_version, payload
        )
        runtime["model_selection"] = (
            "selected_for_request" if payload.model_version_id else "production_default"
        )
        runtime["model_name"] = model_version.name
        runtime["model_version"] = model_version.version
        if not settings.store_prediction_text:
            runtime.pop("normalized_text", None)
            runtime.pop("model_input_preview", None)
        latency_ms = runtime["total_ms"]

        prediction = Prediction(
            user_id=user.id,
            model_version_id=model_version.id,
            task=payload.task,
            status=PredictionStatus.COMPLETED,
            input_text=(payload.text if settings.store_prediction_text else None),
            normalized_text=(
                preprocessing_result.normalized_text
                if settings.store_prediction_text
                else None
            ),
            language_form=(preprocessing_result.language_form),
            predicted_label=prediction_result.label,
            confidence=prediction_result.confidence,
            probabilities=prediction_result.probabilities,
            explanation=(
                {
                    **(
                        prediction_result.explanation
                        if payload.include_explanation
                        else {}
                    ),
                    "runtime": runtime,
                }
            ),
            latency_ms=round(latency_ms, 3),
            error_message=None,
        )

        return await self.predictions.add(prediction)

    @staticmethod
    def _get_transformer_max_length(
        configuration: object,
    ) -> int:
        default_max_length = 128

        if not isinstance(
            configuration,
            dict,
        ):
            return default_max_length

        training_configuration = configuration.get("training_configuration")

        if not isinstance(
            training_configuration,
            dict,
        ):
            return default_max_length

        model_configuration = training_configuration.get("model")

        if not isinstance(
            model_configuration,
            dict,
        ):
            return default_max_length

        max_length = model_configuration.get("max_sequence_length")

        if isinstance(max_length, int) and 16 <= max_length <= 512:
            return max_length

        return default_max_length

    async def predict_batch(
        self,
        payload: BatchPredictionRequest,
        user: User,
    ) -> BatchPredictionResponse:
        started_at = perf_counter()

        results: list[BatchPredictionResultItem] = []

        errors: list[dict[str, str | int | None]] = []

        selected_model_version_id = payload.model_version_id

        for index, item in enumerate(payload.items):
            try:
                single_request = PredictionRequest(
                    text=item.text,
                    task=payload.task,
                    model_version_id=selected_model_version_id,
                    include_explanation=(payload.include_explanation),
                )

                prediction = await self.predict(
                    payload=single_request,
                    user=user,
                )

                if selected_model_version_id is None:
                    selected_model_version_id = prediction.model_version_id

                results.append(
                    BatchPredictionResultItem(
                        client_reference=(item.client_reference),
                        prediction=prediction,
                    )
                )

            except (ActiveModelNotFoundError, RuntimeError, ValueError) as exc:
                errors.append(
                    {
                        "index": index,
                        "client_reference": (item.client_reference),
                        "error": str(exc),
                    }
                )

        processing_time_ms = (perf_counter() - started_at) * 1000

        if selected_model_version_id is None:
            raise ActiveModelNotFoundError

        return BatchPredictionResponse(
            task=payload.task,
            model_version_id=(selected_model_version_id),
            total_items=len(payload.items),
            completed_items=len(results),
            failed_items=len(errors),
            processing_time_ms=round(
                processing_time_ms,
                3,
            ),
            results=results,
            errors=errors,
        )


def infer_for_model(model_version, payload):
    """Run outside the event loop; never store research-suite predictions in user history."""
    started_at = perf_counter()
    preprocessing_result = preprocess_text(payload.text)

    if model_version.architecture in {
        "tfidf_logistic_regression",
        "tfidf_linear_svm",
    }:
        try:
            prediction_result = predict_with_classical_model(
                artifact_path=(model_version.artifact_path),
                text=(preprocessing_result.normalized_text),
                include_explanation=payload.include_explanation,
            )

        except ModelArtifactError as exc:
            raise RuntimeError(str(exc)) from exc

    elif model_version.architecture in {
        "banglabert_sequence_classification",
        "transformer_sequence_classification",
    }:
        try:
            prediction_result = predict_with_transformer(
                artifact_path=(model_version.artifact_path),
                tokenizer_path=(model_version.tokenizer_path),
                text=(preprocessing_result.normalized_text),
                include_explanation=payload.include_explanation,
                max_length=(
                    PredictionService._get_transformer_max_length(
                        model_version.configuration,
                    )
                ),
            )

        except TransformerArtifactError as exc:
            raise RuntimeError(str(exc)) from exc

    else:
        prediction_result = run_baseline_prediction(
            preprocessing_result.normalized_text,
            payload.task,
        )

    runtime = dict(prediction_result.explanation.get("runtime") or {})
    probabilities = sorted(prediction_result.probabilities.values(), reverse=True)
    margin = probabilities[0] - probabilities[1] if len(probabilities) > 1 else None
    runtime.update(
        total_ms=(perf_counter() - started_at) * 1000,
        needs_review=prediction_result.confidence < 0.60
        or margin is None
        or margin < 0.15,
        review_threshold={
            "confidence_below": 0.60,
            "margin_below": 0.15,
            "policy": "review-v1",
        },
        margin=margin,
        normalized_text=runtime.get(
            "normalized_text", preprocessing_result.normalized_text
        ),
    )
    return prediction_result, preprocessing_result, runtime
