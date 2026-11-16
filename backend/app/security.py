"""Wachtwoorden, sessies, rollen, aanmeldlimiet en het auditlog."""
import base64
import hashlib
import hmac
import secrets
import threading
import time
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .models import AuditLog, User

COOKIE_NAME = "gw_session"
CSRF_HEADER = "x-requested-with"
CSRF_VALUE = "groene-weide"

# scrypt-parameters: geheugen ~32 MB per poging, traag genoeg tegen raden.
_N, _R, _P = 2**15, 8, 1


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=_N, r=_R, p=_P, maxmem=2**27, dklen=32)
    return f"scrypt${_N}${_R}${_P}${base64.b64encode(salt).decode()}${base64.b64encode(digest).decode()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _scheme, n, r, p, salt, digest = stored.split("$")
        expected = base64.b64decode(digest)
        actual = hashlib.scrypt(
            password.encode(), salt=base64.b64decode(salt), n=int(n), r=int(r), p=int(p), maxmem=2**27, dklen=len(expected)
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(actual, expected)


# Wordt gecontroleerd als de gebruiker niet bestaat, zodat het antwoord even lang duurt.
DUMMY_HASH = hash_password(secrets.token_urlsafe(16))


def create_token(user: User) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": str(user.id), "role": user.role, "iat": now, "exp": now + timedelta(hours=settings.session_hours)}
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(401, "Niet ingelogd.")
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, "Sessie is verlopen. Log opnieuw in.")
    user = db.get(User, int(payload["sub"]))
    if user is None or not user.is_active:
        raise HTTPException(401, "Niet ingelogd.")
    return user


def require_admin(user: User = Depends(current_user)) -> User:
    if user.role != "beheerder":
        raise HTTPException(403, "Alleen de beheerder mag dit.")
    return user


class RateLimiter:
    """Eenvoudige limiet in het geheugen: maximaal `limit` pogingen per `window` seconden."""

    def __init__(self, limit: int, window: float) -> None:
        self.limit, self.window = limit, window
        self._hits: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        with self._lock:
            hits = [t for t in self._hits.get(key, []) if now - t < self.window]
            if len(hits) >= self.limit:
                self._hits[key] = hits
                return False
            hits.append(now)
            self._hits[key] = hits
            return True

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


login_limiter = RateLimiter(limit=10, window=60)


def client_ip(request: Request) -> str:
    return request.client.host if request.client else ""


def audit(db: Session, request: Request, action: str, detail: str = "", user: User | None = None, username: str = "") -> None:
    db.add(AuditLog(
        user_id=user.id if user else None,
        username=(user.username if user else username)[:40],
        action=action,
        detail=detail[:300],
        ip=client_ip(request),
    ))
