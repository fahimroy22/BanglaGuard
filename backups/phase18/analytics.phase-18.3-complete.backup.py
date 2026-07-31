from __future__ import annotations

import csv
import io
from datetime import datetime

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