from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


ROOT_DIR = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    app_name: str = "BanglaGuard API"
    app_version: str = "0.2.0"
    app_env: str = "development"
    debug: bool = True

    api_v1_prefix: str = "/api/v1"
    secret_key: str = Field(min_length=8)
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    store_prediction_text: bool = True

    frontend_url: str = "http://localhost:3000"

    database_url: str = (
        "postgresql+asyncpg://banglaguard:"
        "banglaguard_dev_password@localhost:5432/banglaguard"
    )

    redis_url: str = "redis://localhost:6379/0"

    model_storage_path: str = "storage/models"
    upload_storage_path: str = "storage/uploads"
    report_storage_path: str = "storage/reports"

    model_config = SettingsConfigDict(
        env_file=ROOT_DIR / ".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()