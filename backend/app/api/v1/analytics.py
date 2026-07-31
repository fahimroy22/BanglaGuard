from __future__ import annotations

import csv
import io
import json
import zipfile
from datetime import (
    datetime,
    timezone,
)

from fastapi import (
    APIRouter,
    Depends,
    Query,
)
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import (
    require_researcher_or_admin,
)
from app.db.models import User
from app.db.repositories.analytics import (
    AnalyticsRepository,
)
from app.db.session import get_db_session
from app.domain.services.analytics import (
    AnalyticsService,
)
from app.schemas.analytics import (
    AnalyticsDashboard,
    ModelComparisonItem,
)



def _csv_text(
    fieldnames: list[str],
    rows: list[dict],
) -> str:
    output = io.StringIO()

    writer = csv.DictWriter(
        output,
        fieldnames=fieldnames,
        extrasaction="ignore",
    )

    writer.writeheader()
    writer.writerows(rows)

    return output.getvalue()


def _serialize_configuration_value(
    value: object,
) -> str:
    if value is None:
        return ""

    if isinstance(
        value,
        (dict, list),
    ):
        return json.dumps(
            value,
            ensure_ascii=False,
        )

    if isinstance(value, bool):
        return (
            "true"
            if value
            else "false"
        )

    return str(value)


def _build_research_export_files(
    rows: list[dict],
) -> dict[str, str]:
    model_summary_rows: list[
        dict
    ] = []

    evaluation_rows: list[
        dict
    ] = []

    classification_rows: list[
        dict
    ] = []

    confusion_rows: list[
        dict
    ] = []

    configuration_rows: list[
        dict
    ] = []

    warnings: list[str] = []

    for row in rows:
        model_name = str(
            row.get(
                "model_name",
                "",
            )
        )

        model_version = str(
            row.get(
                "model_version",
                "",
            )
        )

        model_summary_rows.append(
            {
                "model_version_id": (
                    row.get(
                        "model_version_id"
                    )
                ),
                "model_name": model_name,
                "model_version": (
                    model_version
                ),
                "task": row.get("task"),
                "architecture": (
                    row.get(
                        "architecture"
                    )
                ),
                "status": row.get(
                    "status"
                ),
                "prediction_count": (
                    row.get(
                        "prediction_count"
                    )
                ),
                "average_confidence": (
                    row.get(
                        "average_confidence"
                    )
                ),
                "average_latency_ms": (
                    row.get(
                        "average_latency_ms"
                    )
                ),
                "feedback_count": (
                    row.get(
                        "feedback_count"
                    )
                ),
                "correct_feedback": (
                    row.get(
                        "correct_feedback"
                    )
                ),
                "incorrect_feedback": (
                    row.get(
                        "incorrect_feedback"
                    )
                ),
                "observed_feedback_accuracy": (
                    row.get(
                        "observed_feedback_accuracy"
                    )
                ),
            }
        )

        metrics = row.get(
            "registered_metrics"
        )

        if not isinstance(
            metrics,
            dict,
        ):
            metrics = {}

        warning = metrics.get(
            "warning"
        )

        if isinstance(
            warning,
            str,
        ) and warning.strip():
            warnings.append(
                (
                    f"{model_name} "
                    f"v{model_version}: "
                    f"{warning.strip()}"
                )
            )

        evaluation_rows.append(
            {
                "model_name": model_name,
                "model_version": (
                    model_version
                ),
                "task": row.get("task"),
                "evaluation_split": (
                    metrics.get(
                        "evaluation_split"
                    )
                ),
                "accuracy": metrics.get(
                    "accuracy"
                ),
                "macro_precision": (
                    metrics.get(
                        "macro_precision"
                    )
                ),
                "macro_recall": (
                    metrics.get(
                        "macro_recall"
                    )
                ),
                "macro_f1": metrics.get(
                    "macro_f1"
                ),
                "weighted_f1": (
                    metrics.get(
                        "weighted_f1"
                    )
                ),
                "validation_accuracy": (
                    metrics.get(
                        "validation_accuracy"
                    )
                ),
                "validation_macro_f1": (
                    metrics.get(
                        "validation_macro_f1"
                    )
                ),
                "train_loss": (
                    metrics.get(
                        "train_loss"
                    )
                ),
                "validation_loss": (
                    metrics.get(
                        "validation_loss"
                    )
                ),
                "test_loss": (
                    metrics.get(
                        "test_loss"
                    )
                ),
                "training_runtime_seconds": (
                    metrics.get(
                        "training_runtime_seconds"
                    )
                ),
                "training_samples": (
                    metrics.get(
                        "training_samples"
                    )
                ),
                "validation_samples": (
                    metrics.get(
                        "validation_samples"
                    )
                ),
                "evaluation_samples": (
                    metrics.get(
                        "evaluation_samples"
                    )
                ),
                "warning": warning,
            }
        )

        report = metrics.get(
            "classification_report"
        )

        if isinstance(report, dict):
            ignored_report_keys = {
                "accuracy",
                "macro avg",
                "weighted avg",
                "micro avg",
                "samples avg",
            }

            for (
                class_label,
                values,
            ) in report.items():
                if (
                    class_label
                    in ignored_report_keys
                    or not isinstance(
                        values,
                        dict,
                    )
                ):
                    continue

                classification_rows.append(
                    {
                        "model_name": (
                            model_name
                        ),
                        "model_version": (
                            model_version
                        ),
                        "task": row.get(
                            "task"
                        ),
                        "class_label": (
                            class_label
                        ),
                        "precision": (
                            values.get(
                                "precision"
                            )
                        ),
                        "recall": (
                            values.get(
                                "recall"
                            )
                        ),
                        "f1_score": (
                            values.get(
                                "f1-score",
                                values.get(
                                    "f1_score"
                                ),
                            )
                        ),
                        "support": (
                            values.get(
                                "support"
                            )
                        ),
                    }
                )

        matrix = metrics.get(
            "confusion_matrix"
        )

        labels = metrics.get(
            "confusion_matrix_labels"
        )

        if isinstance(
            matrix,
            list,
        ):
            if not (
                isinstance(
                    labels,
                    list,
                )
                and all(
                    isinstance(
                        item,
                        str,
                    )
                    for item in labels
                )
            ):
                labels = [
                    f"class_{index + 1}"
                    for index in range(
                        len(matrix)
                    )
                ]

            for (
                row_index,
                matrix_row,
            ) in enumerate(matrix):
                if not isinstance(
                    matrix_row,
                    list,
                ):
                    continue

                for (
                    column_index,
                    count,
                ) in enumerate(
                    matrix_row
                ):
                    actual_label = (
                        labels[row_index]
                        if row_index
                        < len(labels)
                        else (
                            f"class_"
                            f"{row_index + 1}"
                        )
                    )

                    predicted_label = (
                        labels[
                            column_index
                        ]
                        if column_index
                        < len(labels)
                        else (
                            f"class_"
                            f"{column_index + 1}"
                        )
                    )

                    confusion_rows.append(
                        {
                            "model_name": (
                                model_name
                            ),
                            "model_version": (
                                model_version
                            ),
                            "task": row.get(
                                "task"
                            ),
                            "actual_label": (
                                actual_label
                            ),
                            "predicted_label": (
                                predicted_label
                            ),
                            "count": count,
                        }
                    )

        configuration = row.get(
            "registered_configuration"
        )

        if isinstance(
            configuration,
            dict,
        ):
            for (
                key,
                value,
            ) in configuration.items():
                configuration_rows.append(
                    {
                        "model_name": (
                            model_name
                        ),
                        "model_version": (
                            model_version
                        ),
                        "task": row.get(
                            "task"
                        ),
                        "configuration_key": (
                            key
                        ),
                        "configuration_value": (
                            _serialize_configuration_value(
                                value
                            )
                        ),
                    }
                )

    generated_at = datetime.now(
        timezone.utc
    ).isoformat()

    readme_lines = [
        "BanglaGuard Research Analytics Export",
        "=====================================",
        "",
        f"Generated at: {generated_at}",
        "",
        "Files",
        "-----",
        "",
        "model-summary.csv",
        "  Production usage, confidence, latency, status, and feedback evidence.",
        "",
        "evaluation-metrics.csv",
        "  Registered test and validation metrics for each model version.",
        "",
        "classification-report.csv",
        "  Per-class precision, recall, F1 score, and support.",
        "",
        "confusion-matrix.csv",
        "  Confusion-matrix cells in long-table format.",
        "",
        "training-configuration.csv",
        "  Reproducibility and training configuration metadata.",
        "",
        "Research interpretation",
        "-----------------------",
        "",
        "Production analytics and registered evaluation metrics represent different evidence.",
        "Production confidence is not the same as test-set accuracy.",
        "Human feedback accuracy is only available when reviewers have submitted feedback.",
        "",
        "Validity warning",
        "----------------",
        "",
        "Development smoke-test results based on very small validation or test splits",
        "must not be presented as final, generalizable, or publishable model performance.",
    ]

    if warnings:
        readme_lines.extend(
            [
                "",
                "Registered model warnings",
                "-------------------------",
                "",
                *[
                    f"- {warning}"
                    for warning in warnings
                ],
            ]
        )

    files = {
        "model-summary.csv": _csv_text(
            [
                "model_version_id",
                "model_name",
                "model_version",
                "task",
                "architecture",
                "status",
                "prediction_count",
                "average_confidence",
                "average_latency_ms",
                "feedback_count",
                "correct_feedback",
                "incorrect_feedback",
                "observed_feedback_accuracy",
            ],
            model_summary_rows,
        ),
        "evaluation-metrics.csv": _csv_text(
            [
                "model_name",
                "model_version",
                "task",
                "evaluation_split",
                "accuracy",
                "macro_precision",
                "macro_recall",
                "macro_f1",
                "weighted_f1",
                "validation_accuracy",
                "validation_macro_f1",
                "train_loss",
                "validation_loss",
                "test_loss",
                "training_runtime_seconds",
                "training_samples",
                "validation_samples",
                "evaluation_samples",
                "warning",
            ],
            evaluation_rows,
        ),
        "classification-report.csv": _csv_text(
            [
                "model_name",
                "model_version",
                "task",
                "class_label",
                "precision",
                "recall",
                "f1_score",
                "support",
            ],
            classification_rows,
        ),
        "confusion-matrix.csv": _csv_text(
            [
                "model_name",
                "model_version",
                "task",
                "actual_label",
                "predicted_label",
                "count",
            ],
            confusion_rows,
        ),
        "training-configuration.csv": _csv_text(
            [
                "model_name",
                "model_version",
                "task",
                "configuration_key",
                "configuration_value",
            ],
            configuration_rows,
        ),
        "README.txt": "\n".join(
            readme_lines
        ),
    }

    return files


router = APIRouter(
    prefix="/analytics",
    tags=["Analytics"],
)


@router.get(
    "/dashboard",
    response_model=AnalyticsDashboard,
)
async def get_analytics_dashboard(
    start_at: datetime | None = Query(
        default=None
    ),
    end_at: datetime | None = Query(
        default=None
    ),
    task: str | None = Query(
        default=None
    ),
    daily_limit: int = Query(
        default=30,
        ge=1,
        le=365,
    ),
    current_user: User = Depends(
        require_researcher_or_admin
    ),
    session: AsyncSession = Depends(
        get_db_session
    ),
) -> AnalyticsDashboard:
    service = AnalyticsService(session)

    return await service.get_dashboard(
        start_at=start_at,
        end_at=end_at,
        task=task,
        daily_limit=daily_limit,
    )


@router.get(
    "/models/compare",
    response_model=list[ModelComparisonItem],
)
async def compare_models(
    current_user: User = Depends(
        require_researcher_or_admin
    ),
    session: AsyncSession = Depends(
        get_db_session
    ),
) -> list[dict]:
    repository = AnalyticsRepository(
        session
    )

    return await repository.model_comparison()


@router.get(
    "/reports/model-comparison.csv",
)
async def export_model_comparison_csv(
    current_user: User = Depends(
        require_researcher_or_admin
    ),
    session: AsyncSession = Depends(
        get_db_session
    ),
) -> StreamingResponse:
    repository = AnalyticsRepository(
        session
    )

    rows = await repository.model_comparison()

    output = io.StringIO()

    fieldnames = [
        "model_version_id",
        "model_name",
        "model_version",
        "task",
        "architecture",
        "status",
        "prediction_count",
        "average_confidence",
        "average_latency_ms",
        "feedback_count",
        "correct_feedback",
        "incorrect_feedback",
        "observed_feedback_accuracy",
    ]

    writer = csv.DictWriter(
        output,
        fieldnames=fieldnames,
        extrasaction="ignore",
    )

    writer.writeheader()
    writer.writerows(rows)

    output.seek(0)

    headers = {
        "Content-Disposition": (
            "attachment; "
            "filename=model-comparison.csv"
        )
    }

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers=headers,
    )

@router.get(
    "/reports/research-analytics.zip",
)
async def export_research_analytics_zip(
    current_user: User = Depends(
        require_researcher_or_admin
    ),
    session: AsyncSession = Depends(
        get_db_session
    ),
) -> StreamingResponse:
    repository = AnalyticsRepository(
        session
    )

    rows = await repository.model_comparison()

    export_files = (
        _build_research_export_files(
            rows
        )
    )

    zip_buffer = io.BytesIO()

    with zipfile.ZipFile(
        zip_buffer,
        mode="w",
        compression=zipfile.ZIP_DEFLATED,
    ) as archive:
        for (
            filename,
            content,
        ) in export_files.items():
            archive.writestr(
                filename,
                content.encode("utf-8"),
            )

    zip_buffer.seek(0)

    date_stamp = datetime.now(
        timezone.utc
    ).strftime("%Y-%m-%d")

    filename = (
        "banglaguard-research-analytics-"
        f"{date_stamp}.zip"
    )

    headers = {
        "Content-Disposition": (
            "attachment; "
            f'filename="{filename}"'
        )
    }

    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers=headers,
    )

