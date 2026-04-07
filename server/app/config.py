from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    supabase_url: str
    supabase_secret_key: str
    openai_api_key: str
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://10.0.0.54:3000",
        "https://dormdrop.app",
        "https://www.dormdrop.app",
    ]

    @property
    def supabase_jwks_url(self) -> str:
        return f"{self.supabase_url}/auth/v1/.well-known/jwks.json"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
