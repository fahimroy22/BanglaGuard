from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.exception_handlers import (
    register_exception_handlers,
)
from app.core.exceptions import (
    BanglaGuardError,
    banglaguard_exception_handler,
)
from app.core.rate_limit import limiter
from app.core.redis import close_redis
from app.core.middleware import (
    RequestContextMiddleware,
)


@asynccontextmanager
async def lifespan(
    app: FastAPI,
) -> AsyncIterator[None]:
    yield
    await close_redis()


app = FastAPI(
    title=settings.app_name,
    description=(
        "Backend API for Bangla hate-speech detection, "
        "sentiment analysis, research analytics, and feedback."
    ),
    version=settings.app_version,
    debug=settings.debug,
    lifespan=lifespan,
)

app.state.limiter = limiter


# Request context and request ID middleware
app.add_middleware(
    RequestContextMiddleware,
)


# Restricted CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=[
        "GET",
        "POST",
        "PUT",
        "PATCH",
        "DELETE",
        "OPTIONS",
    ],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "X-Request-ID",
    ],
)


# Rate-limit exception handler
app.add_exception_handler(
    RateLimitExceeded,
    _rate_limit_exceeded_handler,
)


# Application-specific exception handler
app.add_exception_handler(
    BanglaGuardError,
    banglaguard_exception_handler,
)


# Register the remaining global exception handlers
register_exception_handlers(app)


# API routes
app.include_router(
    api_router,
    prefix=settings.api_v1_prefix,
)


@app.get(
    "/",
    tags=["Root"],
)
async def root() -> dict[str, str]:
    return {
        "name": settings.app_name,
        "version": settings.app_version,
        "environment": settings.app_env,
        "status": "running",
    }