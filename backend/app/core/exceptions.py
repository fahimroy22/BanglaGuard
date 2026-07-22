from fastapi import Request
from fastapi.responses import JSONResponse


class BanglaGuardError(Exception):
    """Base application exception."""

    def __init__(
        self,
        message: str,
        error_code: str = "APPLICATION_ERROR",
        status_code: int = 400,
    ) -> None:
        self.message = message
        self.error_code = error_code
        self.status_code = status_code
        super().__init__(message)


async def banglaguard_exception_handler(
    request: Request,
    exc: BanglaGuardError,
) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "error": {
                "code": exc.error_code,
                "message": exc.message,
                "path": request.url.path,
            },
        },
    )