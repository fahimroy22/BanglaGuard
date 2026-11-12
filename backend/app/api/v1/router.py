from fastapi import APIRouter

from app.api.v1.analytics import (
    router as analytics_router,
)
from app.api.v1.audit_logs import (
    router as audit_logs_router,
)
from app.api.v1.auth import router as auth_router
from app.api.v1.datasets import (
    router as datasets_router,
)
from app.api.v1.experiments import (
    router as experiments_router,
)
from app.api.v1.feedback import (
    router as feedback_router,
)
from app.api.v1.health import router as health_router
from app.api.v1.model_versions import (
    router as model_versions_router,
)
from app.api.v1.predictions import (
    router as predictions_router,
)
from app.api.v1.users import router as users_router

api_router = APIRouter()

api_router.include_router(health_router)
api_router.include_router(auth_router)
api_router.include_router(users_router)
api_router.include_router(model_versions_router)
api_router.include_router(predictions_router)
api_router.include_router(datasets_router)
api_router.include_router(experiments_router)
api_router.include_router(feedback_router)
api_router.include_router(analytics_router)
api_router.include_router(audit_logs_router)
from app.api.v1.admin import router as admin_router

api_router.include_router(admin_router)

from app.api.v1.dataset_research import router as dataset_research_router

api_router.include_router(dataset_research_router)

from app.api.v1.experiment_jobs import router as experiment_jobs_router

api_router.include_router(experiment_jobs_router)

from app.api.v1.evaluation import router as evaluation_router
from app.api.v1.model_promotion import router as model_promotion_router

api_router.include_router(evaluation_router)
api_router.include_router(model_promotion_router)

from app.api.v1.prediction_research import router as prediction_research_router

api_router.include_router(prediction_research_router)

from app.api.v1.research_loop import router as research_loop_router

api_router.include_router(research_loop_router)
