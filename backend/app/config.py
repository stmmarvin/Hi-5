"""Instellingen uit omgevingsvariabelen (lokaal uit backend/.env)."""
import os
import secrets
from pathlib import Path

from dotenv import load_dotenv

_BACKEND = Path(__file__).resolve().parent.parent
load_dotenv(_BACKEND / ".env")
load_dotenv(_BACKEND.parent / ".env")  # gedeeld met docker-compose


def _database_url() -> str:
    if os.getenv("DATABASE_URL"):
        return os.environ["DATABASE_URL"]
    from urllib.parse import quote
    user = os.getenv("POSTGRES_USER", "groeneweide")
    password = quote(os.getenv("POSTGRES_PASSWORD", ""), safe="")
    # 127.0.0.1 en niet "localhost": dat probeert op Windows eerst IPv6 en wacht dan lang.
    host = os.getenv("POSTGRES_HOST", "127.0.0.1")
    port = os.getenv("POSTGRES_PORT", "5432")
    name = os.getenv("POSTGRES_DB", "groeneweide")
    return f"postgresql+psycopg://{user}:{password}@{host}:{port}/{name}"


def _bool(name: str, default: bool) -> bool:
    return os.getenv(name, str(default)).strip().lower() in ("1", "true", "yes", "ja")


class Settings:
    def __init__(self) -> None:
        self.env = os.getenv("APP_ENV", "development")
        self.production = self.env == "production"

        self.secret_key = os.getenv("SECRET_KEY", "")
        if self.production and len(self.secret_key) < 32:
            raise RuntimeError("SECRET_KEY ontbreekt of is korter dan 32 tekens. Stel hem in voor productie.")
        if not self.secret_key:
            # Alleen voor ontwikkeling: sessies vervallen bij elke herstart.
            self.secret_key = secrets.token_urlsafe(48)

        self.database_url = _database_url()
        self.cors_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]
        self.cookie_secure = _bool("COOKIE_SECURE", self.production)
        # In simulatiemodus bepaalt de simulatie de tijd en mag het logboek worden gereset.
        self.simulation_mode = _bool("SIMULATION_MODE", True)
        self.session_hours = int(os.getenv("SESSION_HOURS", "8"))
        self.retention_days = int(os.getenv("RETENTION_DAYS", "28"))


settings = Settings()
