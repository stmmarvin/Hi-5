from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .api import router
from .config import settings
from .db import Base, SessionLocal, engine
from .security import CSRF_HEADER, CSRF_VALUE
from .seed import ensure_seeded, purge_old_passages

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        ensure_seeded(db)
        if not settings.simulation_mode:
            purge_old_passages(db)
    yield


app = FastAPI(
    title="Slagboom De Groene Weide",
    lifespan=lifespan,
    # De API-documentatie staat alleen aan tijdens ontwikkeling.
    docs_url=None if settings.production else "/api/docs",
    redoc_url=None,
    openapi_url=None if settings.production else "/api/openapi.json",
)

if settings.cors_origins:
    app.add_middleware(
        CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=True,
        allow_methods=["GET", "POST", "DELETE"], allow_headers=["Content-Type", "X-Requested-With"],
    )


@app.middleware("http")
async def protect(request: Request, call_next):
    # CSRF: wijzigende verzoeken moeten een eigen header meesturen. Een formulier op een
    # andere website kan dat niet, en de sessiecookie is bovendien SameSite=Strict.
    if (request.method not in SAFE_METHODS and request.url.path.startswith("/api/")
            and request.headers.get(CSRF_HEADER) != CSRF_VALUE):
        return JSONResponse({"detail": "Verzoek geweigerd: beveiligingsheader ontbreekt."}, status_code=403)

    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Cache-Control"] = "no-store"
    if not request.url.path.startswith("/api/docs"):
        response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
    if settings.cookie_secure:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


app.include_router(router)
