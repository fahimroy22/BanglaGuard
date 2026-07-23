from functools import lru_cache
from pathlib import Path
from typing import Any

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


ROOT_DIR = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    app_name: str = "BanglaGuard API"
    app_version: str = "0.2.0"
    app_env: str = "development"
    debug: bool = True

    api_v1_prefix: str = "/api/v1"

    secret_key: str = Field(
        min_length=8,
    )

    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    store_prediction_text: bool = True

    frontend_url: str = "http://localhost:3000"

    cors_origins: list[str] = [
        "http://localhost",
        "http://127.0.0.1",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    database_url: str = (
        "postgresql+asyncpg://banglaguard:"
        "banglaguard_dev_password@localhost:5432/"
        "banglaguard"
    )

    redis_url: str = "redis://localhost:6379/0"

    model_storage_path: str = "storage/models"
    upload_storage_path: str = "storage/uploads"
    report_storage_path: str = "storage/reports"

    @field_validator(
        "cors_origins",
        mode="before",
    )
    @classmethod
    def parse_cors_origins(
        cls,
        value: Any,
    ) -> list[str]:
        """
        Accept CORS origins as either:

        CORS_ORIGINS=http://localhost:3000,http://localhost

        or as a JSON-style list.
        """
        if value is None or value == "":
            return []

        if isinstance(value, str):
            value = value.strip()

            if value.startswith("["):
                import json

                parsed_value = json.loads(value)

                if not isinstance(parsed_value, list):
                    raise ValueError(
                        "CORS_ORIGINS must be a list"
                    )

                return [
                    str(origin).strip()
                    for origin in parsed_value
                    if str(origin).strip()
                ]

            return [
                origin.strip()
                for origin in value.split(",")
                if origin.strip()
            ]

        if isinstance(value, (list, tuple, set)):
            return [
                str(origin).strip()
                for origin in value
                if str(origin).strip()
            ]

        raise ValueError(
            "CORS_ORIGINS must be a comma-separated "
            "string or a list"
        )

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