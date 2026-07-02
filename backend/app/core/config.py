import secrets
from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_DIR = Path(__file__).resolve().parents[2]
ENV_PATH = BACKEND_DIR / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(ENV_PATH), env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Financial Forensics AI API"
    app_env: str = "development"
    app_debug: bool = True
    cors_origins: str = "http://localhost:3000,https://myfinance.live,https://www.myfinance.live"
    cors_origin_regex: str = r"^https://.*\.(vercel\.app|onrender\.com)$"

    database_url: str = "sqlite+aiosqlite:///financial_forensics.db"

    fmp_api_key: str = ""
    news_api_key: str = ""
    yahoo_finance_base: str = "https://query1.finance.yahoo.com"

    gemini_api_key: str = ""
    gemini_model: str = "gemini-3-flash-preview"

    cache_ttl_seconds: int = 180

    jwt_secret_key: str = ""
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 30

    # SMTP Configuration
    smtp_server: str = ""
    smtp_port: int = 587
    smtp_email: str = ""
    smtp_password: str = ""

    frontend_url: str = "http://localhost:3000"

    @field_validator("jwt_secret_key")
    @classmethod
    def _require_jwt_secret_in_production(cls, value: str, info) -> str:
        if value:
            return value
        if info.data.get("app_env") == "production":
            raise ValueError(
                "JWT_SECRET_KEY must be set in production — refusing to start with an empty secret."
            )
        # Dev convenience only: ephemeral secret, invalidated on every restart.
        return secrets.token_urlsafe(32)


@lru_cache
def get_settings() -> Settings:
    return Settings()
