from fastapi import FastAPI

app = FastAPI(
    title="BanglaGuard API",
    description=(
        "Backend API for Bangla hate-speech detection, "
        "sentiment analysis, research analytics, and feedback."
    ),
    version="0.1.0",
)


@app.get("/")
def root() -> dict[str, str]:
    return {
        "name": "BanglaGuard API",
        "version": "0.1.0",
        "status": "running",
    }


@app.get("/health/live")
def liveness_check() -> dict[str, str]:
    return {"status": "alive"}


@app.get("/health/ready")
def readiness_check() -> dict[str, str]:
    return {"status": "ready"}