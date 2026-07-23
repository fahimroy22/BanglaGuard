import logging
import uuid

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.core.config import settings


logger = logging.getLogger(__name__)


def register_exception_handlers(
    app: FastAPI,
) -> None:
    @app.exception_handler(Exception)
    async def unhandled_exception_handler(
        request: Request,
        exc: Exception,
    ) -> JSONResponse:
        error_id = str(uuid.uuid4())

        logger.exception(
            "Unhandled application error",
            extra={
                "error_id": error_id,
                "path": request.url.path,
                "method": request.method,
            },
        )

        if settings.debug:
            detail = str(exc)
        else:
            detail = (
                "An unexpected server error occurred. "
                f"Reference: {error_id}"
            )

        return JSONResponse(
            status_code=500,
            content={
                "detail": detail,
                "error_id": error_id,
            },
        )