from fastapi import APIRouter
from redis.exceptions import RedisError
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.core.redis import redis_client
from app.db.session import AsyncSessionLocal


router = APIRouter(prefix="/health", tags=["Health"])


@router.get("/live")
async def liveness_check() -> dict[str, str]:
    return {
        "status": "alive",
    }


@router.get("/ready")
async def readiness_check() -> dict[str, object]:
    database_status = "unavailable"
    redis_status = "unavailable"

    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
        database_status = "connected"
    except SQLAlchemyError:
        database_status = "unavailable"

    try:
        await redis_client.ping()
        redis_status = "connected"
    except RedisError:
        redis_status = "unavailable"

    ready = (
        database_status == "connected"
        and redis_status == "connected"
    )

    return {
        "status": "ready" if ready else "not_ready",
        "services": {
            "database": database_status,
            "redis": redis_status,
        },
    }