from fastapi import APIRouter, status
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.core.redis import redis_client
from app.db.session import AsyncSessionLocal


router = APIRouter(
    prefix="/health",
    tags=["Health"],
)


@router.get("/live")
async def liveness_check() -> dict[str, str]:
    return {
        "status": "alive",
    }


@router.get("/ready")
async def readiness_check() -> JSONResponse:
    database_status = "unavailable"
    redis_status = "unavailable"

    try:
        async with AsyncSessionLocal() as session:
            await session.execute(
                text("SELECT 1")
            )

        database_status = "connected"

    except Exception:
        database_status = "unavailable"

    try:
        redis_available = await redis_client.ping()

        if redis_available:
            redis_status = "connected"

    except Exception:
        redis_status = "unavailable"

    is_ready = (
        database_status == "connected"
        and redis_status == "connected"
    )

    return JSONResponse(
        status_code=(
            status.HTTP_200_OK
            if is_ready
            else status.HTTP_503_SERVICE_UNAVAILABLE
        ),
        content={
            "status": (
                "ready"
                if is_ready
                else "not_ready"
            ),
            "services": {
                "database": database_status,
                "redis": redis_status,
            },
        },
    )