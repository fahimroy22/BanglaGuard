from fastapi import APIRouter

from app.api.v1.auth import router as auth_router
from app.api.v1.health import router as health_router
from app.api.v1.model_versions import (
    router as model_versions_router,
)
from app.api.v1.users import router as users_router
from app.api.v1.predictions import (
    router as predictions_router,
)
from app.api.v1.datasets import (
    router as datasets_router,
)
from app.api.v1.experiments import (
    router as experiments_router,
)

api_router = APIRouter()

api_router.include_router(health_router)
api_router.include_router(auth_router)
api_router.include_router(users_router)
api_router.include_router(model_versions_router)
api_router.include_router(predictions_router)
api_router.include_router(datasets_router)
api_router.include_router(
    experiments_router
)