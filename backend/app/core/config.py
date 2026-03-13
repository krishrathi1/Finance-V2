from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Financial Forensics AI API"
    app_env: str = "development"
    app_debug: bool = True

    database_url: str = "sqlite+aiosqlite:///financial_forensics.db"
    redis_url: str = "redis://localhost:6379/0"

    fmp_api_key: str = ""
    news_api_key: str = ""
    yahoo_finance_base: str = "https://query1.finance.yahoo.com"

    gemini_api_key: str = ""
    gemini_model: str = "gemini-1.5-flash"

    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_endpoint: str = "https://files.massive.com"
    s3_bucket: str = "flatfiles"

    cache_ttl_seconds: int = 180


@lru_cache
def get_settings() -> Settings:
    return Settings()
