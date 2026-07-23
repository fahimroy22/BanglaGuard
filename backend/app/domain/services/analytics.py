from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.repositories.analytics import (
    AnalyticsRepository,
)
from app.schemas.analytics import (
    AnalyticsDashboard,
    FeedbackSummary,
    PredictionSummary,
)


class AnalyticsService:
    def __init__(
        self,
        session: AsyncSession,
    ) -> None:
        self.repository = AnalyticsRepository(
            session
        )

    async def get_dashboard(
        self,
        start_at: datetime | None = None,
        end_at: datetime | None = None,
        task: str | None = None,
        daily_limit: int = 30,
    ) -> AnalyticsDashboard:
        overview = (
            await self.repository
            .prediction_overview(
                start_at=start_at,
                end_at=end_at,
                task=task,
            )
        )

        label_distribution = (
            await self.repository
            .label_distribution(
                start_at=start_at,
                end_at=end_at,
                task=task,
            )
        )

        model_usage = (
            await self.repository.model_usage(
                start_at=start_at,
                end_at=end_at,
                task=task,
            )
        )

        feedback = (
            await self.repository
            .feedback_summary()
        )

        daily_predictions = (
            await self.repository
            .daily_predictions(
                start_at=start_at,
                end_at=end_at,
                task=task,
                limit=daily_limit,
            )
        )

        summary = PredictionSummary(
            **overview,
            label_distribution=(
                label_distribution
            ),
            model_usage=model_usage,
            feedback=FeedbackSummary(
                **feedback
            ),
        )

        return AnalyticsDashboard(
            summary=summary,
            daily_predictions=(
                daily_predictions
            ),
        )