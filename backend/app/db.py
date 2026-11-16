from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import StaticPool

from .config import settings

_url = settings.database_url
_kwargs: dict = {"pool_pre_ping": True}
if _url.startswith("sqlite"):
    # SQLite wordt alleen door de tests gebruikt; de applicatie draait op PostgreSQL.
    _kwargs = {"connect_args": {"check_same_thread": False}}
    if _url in ("sqlite://", "sqlite:///:memory:"):
        _kwargs["poolclass"] = StaticPool

engine = create_engine(_url, **_kwargs)

if _url.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def _foreign_keys_on(connection, _record):
        connection.execute("PRAGMA foreign_keys=ON")

SessionLocal = sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    with SessionLocal() as db:
        yield db
